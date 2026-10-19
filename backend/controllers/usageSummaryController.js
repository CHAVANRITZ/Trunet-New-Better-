import mongoose from "mongoose";
import StockUsage from "../models/StockUsage.js";
import StockRequest from "../models/StockRequest.js";
import StockTransfer from "../models/StockTransfer.js";
import StockClosing from "../models/StockClosing.js";
import DamageReturn from "../models/DamageReturn.js";
import ReplacementRecord from "../models/ReplacementRecord.js";
import ReturnRecord from "../models/ReturnRecord.js";
import CenterReturn from "../models/CenterReturn.js";
import Center from "../models/Center.js";
import Product from "../models/Product.js";

/* ============================================================================
 * INDENT USAGE SUMMARY  -  LEDGER BASED
 * ----------------------------------------------------------------------------
 * Closing is NEVER read from live CenterStock. It is always computed as
 *
 *     closing = opening + inflow columns - outflow columns
 *
 * and opening itself is built from the very same event list (everything that
 * happened before the report start), so  opening + movements == closing  holds
 * by construction for every row.
 *
 * When stock really moves (matches the stock services/models):
 *   Stock request   -> center gains stock only on RECEIPT (Completed, or a
 *                      partial receipt that was credited). Confirmed/Shipped
 *                      do NOT touch center stock.
 *   Stock transfer  -> source reserves stock at Confirm (released again on
 *                      Reject/Incomplete), destination gains only on Completed.
 *   Stock usage     -> available stock drops when the usage is saved
 *                      (completed). "Damage Return" usages are reserved while
 *                      pending and also count.
 *   Return record   -> serial goes back to available (completed only).
 *   Center return  -> stock leaves the center to the reseller when the return
 *                      is created (any status), counted under Transfer Given.
 *   Damage return doc / Replacement record -> net ZERO on available stock
 *                      (consumed -> damage_pending, old serial back +1 / new
 *                      serial out -1). Shown for information, not in closing.
 * ========================================================================== */

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------
const INFLOW_FIELDS = ["purchase", "transferReceive", "return"];

const OUTFLOW_FIELDS = [
  "distributed",
  "transferGiven",
  "usage",
  "nc",
  "convert",
  "shifting",
  "buildingUsage",
  "buildingDamage",
  "other",
  "repair",
  "damage",
  "stolenCenter",
  "stolenField",
];

// Shown in the report but they do not change available stock.
const INFO_FIELDS = ["replaceReturn", "replaceDamage"];

const MOVEMENT_FIELDS = [...INFLOW_FIELDS, ...OUTFLOW_FIELDS, ...INFO_FIELDS];

// ---------------------------------------------------------------------------
// Timezone handling (default IST, +05:30). Override with
// REPORT_TZ_OFFSET_MINUTES; empty / invalid values fall back to IST.
// ---------------------------------------------------------------------------
const TZ_OFFSET_MINUTES = (() => {
  const raw = process.env.REPORT_TZ_OFFSET_MINUTES;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return 330;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 330;
})();

const OFFSET_MS = TZ_OFFSET_MINUTES * 60 * 1000;

const startOfDayTZ = (y, m, d) =>
  new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - OFFSET_MS);

const endOfDayTZ = (y, m, d) =>
  new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - OFFSET_MS);

const endOfDayTZOf = (date) => {
  const shifted = new Date(new Date(date).getTime() + OFFSET_MS);
  return endOfDayTZ(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate()
  );
};

class ReportInputError extends Error {}

// Accepts DD-MM-YYYY or YYYY-MM-DD. Returns {y, m, d} or null.
const parseDateParts = (value) => {
  if (!value || typeof value !== "string") return null;

  const text = value.trim();
  let y;
  let m;
  let d;

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else {
    match = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!match) return null;
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
  }

  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    return null;
  }

  return { y, m, d };
};

const getDateRange = (startDate, endDate, month, year) => {
  if (startDate && endDate) {
    const s = parseDateParts(startDate);
    const e = parseDateParts(endDate);

    if (!s || !e) {
      throw new ReportInputError(
        `Invalid date format. Expected DD-MM-YYYY, got startDate="${startDate}", endDate="${endDate}"`
      );
    }

    const start = startOfDayTZ(s.y, s.m, s.d);
    const end = endOfDayTZ(e.y, e.m, e.d);

    if (start > end) {
      throw new ReportInputError("startDate cannot be after endDate");
    }

    return { startDate: start, endDate: end };
  }

  let y;
  let m;

  if (month && year) {
    m = parseInt(month, 10);
    y = parseInt(year, 10);

    if (!m || m < 1 || m > 12 || !y) {
      throw new ReportInputError(
        `Invalid month/year: month=${month}, year=${year}`
      );
    }
  } else {
    const nowShifted = new Date(Date.now() + OFFSET_MS);
    y = nowShifted.getUTCFullYear();
    m = nowShifted.getUTCMonth() + 1;
  }

  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();

  return {
    startDate: startOfDayTZ(y, m, 1),
    endDate: endOfDayTZ(y, m, lastDay),
  };
};

// ---------------------------------------------------------------------------
// Access control: which centers may this user see?
// ---------------------------------------------------------------------------
const getTargetCenters = async (requestedCenterId, user) => {
  if (!user) {
    throw new Error("Authentication required");
  }

  const isSuperAdmin =
    user.isSuperAdmin === true ||
    user.fullUser?.isSuperAdmin === true ||
    user.role?.isSuperAdmin === true;

  const assignedCenter =
    user.selectedCenterId ||
    user.fullUser?.center?._id ||
    user.fullUser?.center ||
    user.center?._id ||
    user.center ||
    null;

  const centerFields = "centerName centerCode centerType";

  if (requestedCenterId === "all") {
    if (!isSuperAdmin) {
      throw new Error(
        "Access denied: all-center usage summary requires explicit authorization"
      );
    }
    return Center.find({}).select(centerFields).lean();
  }

  if (!isSuperAdmin) {
    if (!assignedCenter) {
      throw new Error("User is not associated with a center");
    }

    const assignedCenterId = String(assignedCenter);

    if (requestedCenterId && String(requestedCenterId) !== assignedCenterId) {
      throw new Error("Access denied to the requested center");
    }

    const center = await Center.findById(assignedCenterId)
      .select(centerFields)
      .lean();

    return center ? [center] : [];
  }

  if (requestedCenterId) {
    if (!mongoose.Types.ObjectId.isValid(requestedCenterId)) {
      throw new Error("Invalid center ID");
    }

    const center = await Center.findById(requestedCenterId)
      .select(centerFields)
      .lean();

    return center ? [center] : [];
  }

  return Center.find({}).select(centerFields).lean();
};

// ---------------------------------------------------------------------------
// Usage type -> report column
// ---------------------------------------------------------------------------
const usageField = (usageType, connectionType) => {
  switch (usageType) {
    case "Customer":
      switch (connectionType) {
        case "NC":
          return "nc";
        case "Convert":
          return "convert";
        case "Shifting":
          return "shifting";
        case "Repair":
          return "repair";
        default:
          return "usage";
      }
    case "Building":
    case "Control Room":
      return "buildingUsage";
    case "Building to Building":
      return "shifting";
    case "Damage":
    case "Damage Return":
      return "damage";
    case "Stolen from Center":
      return "stolenCenter";
    case "Stolen from Field":
      return "stolenField";
    case "Other":
      return "other";
    default:
      return "usage";
  }
};

// ---------------------------------------------------------------------------
// <ledger-core>  (pure functions, no database access)
// ---------------------------------------------------------------------------
const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const createEmptyRow = (productName, productId) => ({
  productName: productName || "Unknown Product",
  productId,
  opening: 0,
  purchase: 0,
  distributed: 0,
  transferReceive: 0,
  replaceReturn: 0,
  usage: 0,
  transferGiven: 0,
  nc: 0,
  convert: 0,
  shifting: 0,
  buildingUsage: 0,
  buildingDamage: 0,
  other: 0,
  return: 0,
  repair: 0,
  damage: 0,
  replaceDamage: 0,
  stolenCenter: 0,
  stolenField: 0,
  closing: 0,
  closingDate: null,
  closingSource: "ledger",
  openingAdjustment: 0,
  center: null,
});

const signedQuantity = (field, qty) => {
  if (INFLOW_FIELDS.includes(field)) return qty;
  if (OUTFLOW_FIELDS.includes(field)) return -qty;
  return 0;
};

const dayKey = (date) =>
  Math.floor((new Date(date).getTime() + OFFSET_MS) / 86400000);

/**
 * events   : [{ pid, date, field, qty }]  stock movements AND info rows
 * baseline : Map<pid, qty>  approved snapshot quantity (or empty)
 * start    : Date           report start; events before it build the opening
 * end      : Date           report end;   events after it are ignored
 *
 * floorOpening: replay pre-start events in date order. If stock would drop
 * below zero, some inflow has no record (CSV import, repair return, manual
 * correction). The missing amount is added to the opening and exposed in
 * row.openingAdjustment instead of showing negative stock.
 */
const assembleRows = ({
  events,
  baseline,
  start,
  end,
  productFilter,
  floorOpening = true,
}) => {
  const pre = new Map();
  const rows = new Map();

  const ensureRow = (pid) => {
    if (!rows.has(pid)) rows.set(pid, createEmptyRow(null, pid));
    return rows.get(pid);
  };

  for (const event of events) {
    const pid = String(event.pid);
    const when = new Date(event.date).getTime();
    const qty = toNumber(event.qty);

    if (productFilter && pid !== String(productFilter)) continue;
    if (!qty) continue;
    if (when > end.getTime()) continue;

    if (when < start.getTime()) {
      if (!pre.has(pid)) pre.set(pid, []);
      pre.get(pid).push({ ...event, qty });
      continue;
    }

    ensureRow(pid)[event.field] += qty;
  }

  const openingByPid = new Map();
  const adjustmentByPid = new Map();
  const pids = new Set([...pre.keys(), ...(baseline ? baseline.keys() : [])]);

  for (const pid of pids) {
    let balance = toNumber(baseline?.get(pid));
    let adjustment = 0;

    const list = (pre.get(pid) || []).sort((a, b) => {
      const byDay = dayKey(a.date) - dayKey(b.date);
      if (byDay !== 0) return byDay;
      // Same day: inflows first so same-day receipt + usage never goes negative.
      return signedQuantity(b.field, 1) - signedQuantity(a.field, 1);
    });

    for (const event of list) {
      balance += signedQuantity(event.field, event.qty);

      if (floorOpening && balance < 0) {
        adjustment += -balance;
        balance = 0;
      }
    }

    openingByPid.set(pid, balance);
    adjustmentByPid.set(pid, adjustment);
  }

  for (const [pid, qty] of openingByPid) {
    if (qty !== 0 || (productFilter && pid === String(productFilter))) {
      ensureRow(pid);
    }
  }

  if (productFilter) ensureRow(String(productFilter));

  const result = [];

  for (const [pid, row] of rows) {
    row.opening = openingByPid.get(pid) || 0;
    row.openingAdjustment = adjustmentByPid.get(pid) || 0;

    row.closing =
      row.opening +
      INFLOW_FIELDS.reduce((sum, key) => sum + row[key], 0) -
      OUTFLOW_FIELDS.reduce((sum, key) => sum + row[key], 0);

    const hasActivity =
      row.opening !== 0 ||
      MOVEMENT_FIELDS.some((key) => row[key] !== 0) ||
      (productFilter && pid === String(productFilter));

    if (hasActivity) result.push(row);
  }

  return result;
};
// </ledger-core>

// ---------------------------------------------------------------------------
// Data access: every query returns plain events { pid, date, field, qty }
// ---------------------------------------------------------------------------
const oid = (value) => new mongoose.Types.ObjectId(String(value));

const dateWindow = (field, lower, upper) => {
  const condition = { $lte: upper };
  if (lower) condition.$gt = lower;
  return { [field]: condition };
};

const receiptDateExpr = {
  $ifNull: [
    "$receivingInfo.receivedAt",
    { $ifNull: ["$completionInfo.completedOn", "$date"] },
  ],
};

const receivedQtyExpr = (path = "$products") => ({
  $ifNull: [
    `${path}.receivedQuantity`,
    { $ifNull: [`${path}.approvedQuantity`, `${path}.quantity`] },
  ],
});

const approvedQtyExpr = (path = "$products") => ({
  $ifNull: [`${path}.approvedQuantity`, `${path}.quantity`],
});

const fetchRequestEvents = async (centerId, productId, lower, upper) => {
  const rows = await StockRequest.aggregate([
    {
      $match: {
        $or: [{ center: centerId }, { warehouse: centerId }],
        // Stock reaches the center only on receipt.
        $and: [
          {
            $or: [
              { status: "Completed" },
              { status: "Incompleted", stockTransferStatus: "completed" },
            ],
          },
        ],
      },
    },
    { $addFields: { effDate: receiptDateExpr } },
    { $match: dateWindow("effDate", lower, upper) },
    { $unwind: "$products" },
    ...(productId ? [{ $match: { "products.product": productId } }] : []),
    {
      $project: {
        pid: "$products.product",
        date: "$effDate",
        qty: receivedQtyExpr(),
        isReceiver: { $eq: ["$center", centerId] },
      },
    },
  ]);

  return rows.map((r) => ({
    pid: String(r.pid),
    date: r.date,
    qty: toNumber(r.qty),
    field: r.isReceiver ? "purchase" : "distributed",
  }));
};

const fetchTransferEvents = async (centerId, productId, lower, upper) => {
  const rows = await StockTransfer.aggregate([
    {
      $match: {
        $or: [{ fromCenter: centerId }, { toCenter: centerId }],
        status: { $in: ["Confirmed", "Shipped", "Completed"] },
      },
    },
    {
      $addFields: {
        isFrom: { $eq: ["$fromCenter", centerId] },
        receiptDate: receiptDateExpr,
      },
    },
    // Destination gains stock only when the transfer is Completed.
    { $match: { $or: [{ isFrom: true }, { status: "Completed" }] } },
    {
      $addFields: {
        effDate: { $cond: ["$isFrom", "$date", "$receiptDate"] },
      },
    },
    { $match: dateWindow("effDate", lower, upper) },
    { $unwind: "$products" },
    ...(productId ? [{ $match: { "products.product": productId } }] : []),
    {
      $project: {
        pid: "$products.product",
        date: "$effDate",
        isFrom: 1,
        qty: {
          $cond: [
            "$isFrom",
            {
              // Source: reserved approved qty at Confirm; once Completed the
              // un-received part is released, so net = received qty.
              $cond: [
                { $eq: ["$status", "Completed"] },
                receivedQtyExpr(),
                approvedQtyExpr(),
              ],
            },
            receivedQtyExpr(),
          ],
        },
      },
    },
  ]);

  return rows.map((r) => ({
    pid: String(r.pid),
    date: r.date,
    qty: toNumber(r.qty),
    field: r.isFrom ? "transferGiven" : "transferReceive",
  }));
};

const fetchUsageEvents = async (centerId, productId, lower, upper) => {
  const rows = await StockUsage.aggregate([
    {
      $match: {
        center: centerId,
        $or: [
          { status: "completed" },
          // Damage Return reserves stock while pending.
          { status: "pending", usageType: "Damage Return" },
        ],
        ...dateWindow("date", lower, upper),
      },
    },
    { $unwind: "$items" },
    ...(productId ? [{ $match: { "items.product": productId } }] : []),
    {
      $project: {
        pid: "$items.product",
        date: 1,
        qty: "$items.quantity",
        usageType: 1,
        connectionType: 1,
      },
    },
  ]);

  return rows.map((r) => ({
    pid: String(r.pid),
    date: r.date,
    qty: toNumber(r.qty),
    field: usageField(r.usageType, r.connectionType),
  }));
};

const fetchReturnEvents = async (centerId, productId, lower, upper) => {
  const rows = await ReturnRecord.aggregate([
    {
      $match: {
        center: centerId,
        status: "completed",
        ...dateWindow("date", lower, upper),
      },
    },
    { $unwind: "$items" },
    ...(productId ? [{ $match: { "items.product": productId } }] : []),
    { $project: { pid: "$items.product", date: 1, qty: "$items.quantity" } },
  ]);

  return rows.map((r) => ({
    pid: String(r.pid),
    date: r.date,
    qty: toNumber(r.qty),
    field: "return",
  }));
};

const fetchCenterReturnEvents = async (centerId, productId, lower, upper) => {
  const rows = await CenterReturn.aggregate([
    { $match: { center: centerId, ...dateWindow("returnDate", lower, upper) } },
    { $unwind: "$products" },
    ...(productId ? [{ $match: { "products.product": productId } }] : []),
    {
      $project: {
        pid: "$products.product",
        date: "$returnDate",
        qty: "$products.quantity",
      },
    },
  ]);

  return rows.map((r) => ({
    pid: String(r.pid),
    date: r.date,
    qty: toNumber(r.qty),
    field: "transferGiven",
  }));
};

// Informational columns - do not change available stock.
const fetchInfoEvents = async (centerId, productId, lower, upper) => {
  const [damageReturns, replacements] = await Promise.all([
    DamageReturn.aggregate([
      {
        $match: {
          $or: [{ center: centerId }, { toCenter: centerId }],
          status: { $in: ["approved", "pending", "replaced"] },
          ...(productId ? { product: productId } : {}),
          ...dateWindow("date", lower, upper),
        },
      },
      { $project: { pid: "$product", date: 1, qty: "$quantity" } },
    ]),
    ReplacementRecord.aggregate([
      {
        $match: {
          center: centerId,
          ...(productId ? { product: productId } : {}),
          ...dateWindow("date", lower, upper),
        },
      },
      { $project: { pid: "$product", date: 1, qty: "$qty" } },
    ]),
  ]);

  return [
    ...damageReturns.map((r) => ({
      pid: String(r.pid),
      date: r.date,
      qty: toNumber(r.qty) || 1,
      field: "replaceReturn",
    })),
    ...replacements.map((r) => ({
      pid: String(r.pid),
      date: r.date,
      qty: toNumber(r.qty) || 1,
      field: "replaceDamage",
    })),
  ];
};

// Latest approved physical closing strictly before the report start.
// Treated as the stock at the END of that (IST) day.
const getBaseline = async (centerId, start, productId) => {
  const snapshot = await StockClosing.findOne({
    status: "Approved",
    date: { $lt: start },
    $or: [{ center: centerId }, { closingCenter: centerId }],
  })
    .sort({ date: -1, createdAt: -1, _id: -1 })
    .select("date products")
    .lean();

  if (!snapshot) return { baseline: new Map(), after: null };

  const baseline = new Map();

  for (const item of snapshot.products || []) {
    const pid = String(item.product);
    if (productId && pid !== String(productId)) continue;
    baseline.set(pid, toNumber(item.productQty));
  }

  return { baseline, after: endOfDayTZOf(snapshot.date) };
};

const tag = (list, source) => list.map((event) => ({ ...event, source }));

const buildCenterSummary = async (center, dateRange, productId, debug = false) => {
  const centerId = oid(center._id);
  const productObjectId = productId ? oid(productId) : null;

  const { baseline, after } = await getBaseline(
    centerId,
    dateRange.startDate,
    productId
  );

  const lower = after;
  const upper = dateRange.endDate;

  const [requests, transfers, usages, returns, centerReturns, info] =
    await Promise.all([
      fetchRequestEvents(centerId, productObjectId, lower, upper),
      fetchTransferEvents(centerId, productObjectId, lower, upper),
      fetchUsageEvents(centerId, productObjectId, lower, upper),
      fetchReturnEvents(centerId, productObjectId, lower, upper),
      fetchCenterReturnEvents(centerId, productObjectId, lower, upper),
      fetchInfoEvents(centerId, productObjectId, lower, upper),
    ]);

  const events = [
    ...tag(requests, "stockRequest"),
    ...tag(transfers, "stockTransfer"),
    ...tag(usages, "stockUsage"),
    ...tag(returns, "returnRecord"),
    ...tag(centerReturns, "centerReturn"),
    ...tag(info, "damageReturn/replacement (info only)"),
  ];

  const floorOpening = process.env.USAGE_SUMMARY_FLOOR_OPENING !== "false";

  const rows = assembleRows({
    events,
    baseline,
    start: dateRange.startDate,
    end: dateRange.endDate,
    productFilter: productId || null,
    floorOpening,
  });

  const debugInfo =
    debug && productId
      ? {
          center: center.centerName,
          snapshotBaseline: Object.fromEntries(baseline),
          eventsAfter: lower,
          events: events
            .filter((e) => String(e.pid) === String(productId))
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map((e) => ({
              date: e.date,
              source: e.source,
              column: e.field,
              qty: e.qty,
              effect: signedQuantity(e.field, e.qty),
              period:
                new Date(e.date) < dateRange.startDate ? "before start" : "in range",
            })),
        }
      : null;

  if (rows.length === 0) return { rows, debugInfo };

  const products = await Product.find({
    _id: { $in: rows.map((r) => oid(r.productId)) },
  })
    .select("productTitle")
    .lean();

  const names = new Map(products.map((p) => [String(p._id), p.productTitle]));

  const centerInfo = {
    id: center._id,
    name: center.centerName,
    code: center.centerCode,
    type: center.centerType,
  };

  for (const row of rows) {
    row.productName = names.get(String(row.productId)) || "Unknown Product";
    row.center = centerInfo;
  }

  return { rows, debugInfo };
};

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
const getTotalQuantity = (item) =>
  MOVEMENT_FIELDS.reduce((sum, key) => sum + (Number(item[key]) || 0), 0);

const generateSummaryStats = (rows) => ({
  totalProducts: rows.length,
  totalTransactions: rows.reduce(
    (count, row) =>
      count + MOVEMENT_FIELDS.filter((key) => (Number(row[key]) || 0) !== 0).length,
    0
  ),
  totalQuantity: rows.reduce((sum, row) => sum + getTotalQuantity(row), 0),
  totals: {
    opening: rows.reduce((sum, row) => sum + row.opening, 0),
    closing: rows.reduce((sum, row) => sum + row.closing, 0),
    openingAdjustment: rows.reduce((sum, row) => sum + (row.openingAdjustment || 0), 0),
  },
  centers: [...new Set(rows.map((row) => row.center?.name).filter(Boolean))],
});

const CLIENT_ERRORS_400 = [
  "Invalid center ID",
  "Invalid product ID",
  "Invalid month/year",
  "Invalid date format",
  "startDate cannot be after endDate",
];

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const getUsageSummary = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      centerId,
      productId,
      month,
      year,
      page = 1,
      limit = 100,
      debug,
    } = req.query;

    if (productId && !mongoose.Types.ObjectId.isValid(productId)) {
      throw new ReportInputError("Invalid product ID");
    }

    const fullUser = req.user?.fullUser;

    const user = {
      ...fullUser,
      ...req.user,
      id: req.user?.id ?? fullUser?._id?.toString(),
      center: fullUser?.center ?? req.user?.center ?? null,
      selectedCenterId: req.selectedCenterId ?? null,
    };

    const dateRange = getDateRange(startDate, endDate, month, year);

    const targetCenters = await getTargetCenters(centerId, user);

    if (!targetCenters || targetCenters.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Center information not found",
      });
    }

    const allRows = [];
    const debugOutput = [];

    for (const center of targetCenters) {
      const { rows, debugInfo } = await buildCenterSummary(
        center,
        dateRange,
        productId,
        debug === "1" || debug === "true"
      );
      allRows.push(...rows);
      if (debugInfo) debugOutput.push(debugInfo);
    }

    allRows.sort(
      (a, b) =>
        String(a.center?.name || "").localeCompare(String(b.center?.name || "")) ||
        String(a.productName).localeCompare(String(b.productName))
    );

    const currentPage = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);
    const startIndex = (currentPage - 1) * pageSize;

    const paginatedData = allRows.slice(startIndex, startIndex + pageSize);
    const totalRecords = allRows.length;
    const totalPages = Math.ceil(totalRecords / pageSize);

    const filters = {
      dateRange: {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      },
      productId,
      month: month || "current",
      year: year || new Date(Date.now() + OFFSET_MS).getUTCFullYear(),
      center:
        targetCenters.length === 1
          ? {
              id: targetCenters[0]._id,
              name: targetCenters[0].centerName,
              code: targetCenters[0].centerCode,
              type: targetCenters[0].centerType,
            }
          : { id: "all", name: "All Centers", code: "ALL", type: "Multiple" },
    };

    return res.json({
      success: true,
      data: paginatedData,
      pagination: {
        currentPage,
        pageSize,
        totalRecords,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },
      summary: generateSummaryStats(allRows),
      filters,
      metadata: {
        generatedAt: new Date(),
        recordCount: paginatedData.length,
        totalQuantity: paginatedData.reduce(
          (sum, item) => sum + getTotalQuantity(item),
          0
        ),
        centersProcessed: targetCenters.length,
      },
      ...(debugOutput.length ? { debug: debugOutput } : {}),
    });
  } catch (error) {
    console.error("Get usage summary error:", error);

    const message = error?.message || "";

    if (message === "Authentication required") {
      return res.status(401).json({ success: false, message });
    }

    if (
      message.startsWith("Access denied") ||
      message === "User is not associated with a center"
    ) {
      return res.status(403).json({ success: false, message });
    }

    if (
      error instanceof ReportInputError ||
      CLIENT_ERRORS_400.some((prefix) => message.startsWith(prefix))
    ) {
      return res.status(400).json({ success: false, message });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to generate usage summary",
    });
  }
};