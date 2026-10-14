  import mongoose from "mongoose";
  import StockUsage from "../models/StockUsage.js";
  import StockRequest from "../models/StockRequest.js";
  import StockTransfer from "../models/StockTransfer.js";
  import StockClosing from "../models/StockClosing.js";
  import DamageReturn from "../models/DamageReturn.js";
  import ReplacementRecord from "../models/ReplacementRecord.js";
  import Center from "../models/Center.js";
  import ReturnRecord from "../models/ReturnRecord.js";
  import OutletStock from "../models/OutletStock.js";
  import CenterStock from "../models/CenterStock.js";
  import Product from "../models/Product.js";
  // ============================================================
  // MOVEMENT FIELDS - Excludes opening and closing
  // ============================================================
  // 'usage' (sum of nc..stolenField) and 'replaceReturn' (already added into 'return') are
  // excluded so they are not counted twice in the summary totals.
  const MOVEMENT_FIELDS = [
    'purchase', 'distributed', 'transferReceive',
    'transferGiven', 'nc', 'convert', 'shifting', 'buildingUsage', 'buildingDamage',
    'other', 'return', 'repair', 'damage', 'replaceDamage', 'stolenCenter', 'stolenField'
  ];

  // ============================================================
  // LIVE CLOSING: make "closing" identical to the Available Stock report
  // ------------------------------------------------------------
  // Available Stock (availableReportController -> getAllAvailableProductsWithStock) shows
  // effectiveAvailableQuantity from OutletStock (Outlets) or CenterStock (Centers).
  // The same figure is returned here, so both reports always agree.
  //  - Period includes today  -> closing = live stock (exact match with Available Stock)
  //  - Period fully in past   -> closing = live stock rolled back by net movement AFTER period end
  //  - Products that have live stock but no movement in the period are added as rows
  // ============================================================
const getLiveAvailableStock = async (center, productIds) => {
  try {
    // 1. Validate inputs
    if (!center?._id || !mongoose.Types.ObjectId.isValid(String(center._id))) {
      throw new Error("Invalid center information");
    }

    if (!center.centerType) {
      throw new Error("Center type is missing");
    }

    if (
      productIds !== null &&
      productIds !== undefined &&
      !Array.isArray(productIds)
    ) {
      throw new Error("productIds must be an array, null, or undefined");
    }

    const ids = productIds
      ? productIds.map((id) => {
          if (!mongoose.Types.ObjectId.isValid(String(id))) {
            throw new Error(`Invalid product ID: ${id}`);
          }

          return new mongoose.Types.ObjectId(String(id));
        })
      : null;

    const live = new Map();

    if (ids && ids.length === 0) {
      return live;
    }

    // 2. Outlet stock
    if (center.centerType === "Outlet") {
      const filter = {
        outlet: new mongoose.Types.ObjectId(String(center._id)),
      };

      if (ids) {
        filter.product = { $in: ids };
      }

      const docs = await OutletStock.find(filter)
        .select("product availableQuantity serialNumbers")
        .lean();

      if (docs.length === 0) {
        return live;
      }

      // Fetch all product tracking settings in one query
      const outletProductIds = [
        ...new Set(
          docs
            .filter((doc) => doc.product)
            .map((doc) => String(doc.product))
        ),
      ];

      const products = await Product.find({
        _id: { $in: outletProductIds },
      })
        .select("_id trackSerialNumber")
        .lean();

      const trackingMap = new Map(
        products.map((product) => [
          String(product._id),
          product.trackSerialNumber,
        ])
      );

      for (const doc of docs) {
        if (!doc.product) continue;

        const productKey = String(doc.product);
        const serialNumbers = Array.isArray(doc.serialNumbers)
          ? doc.serialNumbers
          : [];

        const availableQuantity =
          trackingMap.get(productKey) === "Yes"
            ? serialNumbers.filter(
                (serial) => serial.status === "available"
              ).length
            : Math.max(0, Number(doc.availableQuantity) || 0);

        live.set(productKey, availableQuantity);
      }
    } else {
      // 3. Center stock
      const match = {
        center: new mongoose.Types.ObjectId(String(center._id)),
      };

      if (ids) {
        match.product = { $in: ids };
      }

      const docs = await CenterStock.aggregate([
        { $match: match },
        {
          $addFields: {
            serials: { $ifNull: ["$serialNumbers", []] },
          },
        },
        {
          $addFields: {
            availableSerialsCount: {
              $size: {
                $filter: {
                  input: "$serials",
                  as: "serial",
                  cond: { $eq: ["$$serial.status", "available"] },
                },
              },
            },
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "product",
            foreignField: "_id",
            as: "productDetails",
          },
        },
        {
          $unwind: {
            path: "$productDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: "$product",
            availableQuantity: {
              $sum: { $ifNull: ["$availableQuantity", 0] },
            },
            availableSerialsCount: {
              $sum: "$availableSerialsCount",
            },
            trackSerialNumber: {
              $first: "$productDetails.trackSerialNumber",
            },
          },
        },
        {
          $project: {
            effective: {
              $cond: [
                { $eq: ["$trackSerialNumber", "Yes"] },
                "$availableSerialsCount",
                { $max: [0, "$availableQuantity"] },
              ],
            },
          },
        },
      ]);

      for (const doc of docs) {
        if (doc._id) {
          live.set(
            String(doc._id),
            Math.max(0, Number(doc.effective) || 0)
          );
        }
      }
    }

    return live;
  } catch (error) {
    console.error("Error in getLiveAvailableStock:", error);
    throw error;
  }
};

const applyLiveClosing = async (rows, center, dateRange, productId) => {
  if (
    !center?._id ||
    !dateRange?.startDate ||
    !dateRange?.endDate
  ) {
    throw new Error(
      "applyLiveClosing requires center and valid date range"
    );
  }

  const startDate = new Date(dateRange.startDate);
  const endDate = new Date(dateRange.endDate);
  const now = new Date();

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    startDate > endDate
  ) {
    throw new Error("Invalid date range for closing stock");
  }

  // Only use live stock for a report that includes the current time.
  // Historical reports must retain their ledger closing until all
  // post-period stock movements are verified.
  const includesNow = startDate <= now && endDate >= now;

  if (!includesNow) {
    return rows;
  }

  const live = await getLiveAvailableStock(
    center,
    productId ? [productId] : null
  );

  const rowIds = new Set();

  for (const row of rows) {
    const pid = String(row.productId);

    if (productId && pid !== String(productId)) {
      continue;
    }

    rowIds.add(pid);

    const ledgerClosing = Number(row.closing) || 0;
    const liveClosing = Number(live.get(pid) || 0);

    row.ledgerClosing = ledgerClosing;
    row.closingAdjustment = liveClosing - ledgerClosing;
    row.closing = liveClosing;
    row.closingSource = "live_stock";
  }

  // Add live-stock products missing from the ledger summary.
  const missing = [...live.entries()].filter(([pid, qty]) =>
    !rowIds.has(String(pid)) &&
    (!productId || String(pid) === String(productId)) &&
    Number(qty) > 0
  );

  if (missing.length) {
    const products = await mongoose
      .model("Product")
      .find({
        _id: { $in: missing.map(([pid]) => pid) }
      })
      .select("productTitle")
      .lean();

    const nameMap = new Map(
      products.map(p => [String(p._id), p.productTitle])
    );

    for (const [pid, quantity] of missing) {
      const qty = Number(quantity) || 0;
      const row = createEmptyProductSummary(
        nameMap.get(String(pid)) || "Unknown Product"
      );

      row.productId = String(pid);
      row.opening = qty;
      row.closing = qty;
      row.ledgerClosing = 0;
      row.closingAdjustment = qty;
      row.closingSource = "live_stock";

      row.center = {
        id: center._id,
        name: center.centerName,
        code: center.centerCode,
        type: center.centerType
      };

      rows.push(row);
    }
  }

  return rows;
};

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
        limit = 100
      } = req.query;


  const fullUser = req.user?.fullUser;

  const user = {
    ...fullUser,
    ...req.user,
    id: req.user?.id ?? fullUser?._id?.toString(),
    center: fullUser?.center ?? req.user?.center ?? null,
    selectedCenterId: req.selectedCenterId ?? null,
  };


  let dateRange = getDateRange(startDate, endDate, month, year);



  let targetCenters = await getTargetCenters(
    centerId,
    user,
    req.authorizationContext
  );

      if (!targetCenters || targetCenters.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Center information not found"
        });
      }

      console.log(`Processing data for ${targetCenters.length} centers, productId: ${productId}`);

      const allCenterData = [];

      for (const center of targetCenters) {
        console.log(`Processing center: ${center.centerName} (${center._id})`);

        const [
          stockRequests,
          stockTransfers,
          stockUsages,
          damageReturns,
          replacementRecords,
          stockClosings,
          returnRecords,
          openingStock
        ] = await Promise.all([
          getStockRequestData(center._id, dateRange, productId),
          getStockTransferData(center._id, dateRange, productId),
          getStockUsageData(center._id, dateRange, productId),
          getDamageReturnData(center._id, dateRange, productId),
          getReplacementRecordData(center._id, dateRange, productId),
          getStockClosingData(center._id, dateRange, productId),
          getReturnRecordData(center._id, dateRange, productId),
          getOpeningStockData(center._id, dateRange.startDate, productId)
        ]);

        const usageSummary = processUsageSummary({
          stockRequests,
          stockTransfers,
          stockUsages,
          damageReturns,
          replacementRecords,
          stockClosings,
          returnRecords,
          openingStock
        }, center._id, center, productId);

        await applyLiveClosing(usageSummary, center, dateRange, productId);

        allCenterData.push(...usageSummary);
      }

      const currentPage = parseInt(page);
      const pageSize = parseInt(limit);
      const startIndex = (currentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      const paginatedData = allCenterData.slice(startIndex, endIndex);
      const totalRecords = allCenterData.length;
      const totalPages = Math.ceil(totalRecords / pageSize);

      // Prepare filters response
      const filters = {
        dateRange: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        },
        productId,
        month: month || 'current',
        year: year || new Date().getFullYear()
      };
      if (targetCenters.length === 1) {
        filters.center = {
          id: targetCenters[0]._id,
          name: targetCenters[0].centerName,
          code: targetCenters[0].centerCode,
          type: targetCenters[0].centerType
        };
      } else {
        filters.center = {
          id: 'all',
          name: 'All Centers',
          code: 'ALL',
          type: 'Multiple'
        };
      }

      res.json({
        success: true,
        data: paginatedData,
        pagination: {
          currentPage,
          pageSize,
          totalRecords,
          totalPages,
          hasNextPage: currentPage < totalPages,
          hasPrevPage: currentPage > 1
        },
        summary: generateSummaryStats(allCenterData),
        filters,
        metadata: {
          generatedAt: new Date(),
          recordCount: paginatedData.length,
          totalQuantity: paginatedData.reduce((sum, item) => sum + getTotalQuantity(item), 0),
          centersProcessed: targetCenters.length
        }
      });

} catch (error) {
  console.error("Get usage summary error:", error);

  const message = error.message || "Failed to generate usage summary";

  if (message === "Authentication required") {
    return res.status(401).json({
      success: false,
      message
    });
  }

  if (
    message.startsWith("Access denied") ||
    message === "User is not associated with a center"
  ) {
    return res.status(403).json({
      success: false,
      message
    });
  }

  if (message === "Invalid center ID") {
    return res.status(400).json({
      success: false,
      message
    });
  }

  return res.status(500).json({
    success: false,
    message: "Failed to generate usage summary"
  });
}
  };

  const getReturnRecordData = async (centerId, dateRange, productId) => {
    console.log(`Fetching return records for center: ${centerId}, date range: ${dateRange.startDate} to ${dateRange.endDate}, product: ${productId}`);

    const matchStage = {
      center: new mongoose.Types.ObjectId(centerId),
      status: "completed",
      date: {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate
      }
    };

    if (productId) {
      matchStage['items.product'] = new mongoose.Types.ObjectId(productId);
    }

    const results = await ReturnRecord.aggregate([
      { $match: matchStage },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "productInfo"
        }
      },
      {
        $lookup: {
          from: "centers",
          localField: "center",
          foreignField: "_id",
          as: "centerInfo"
        }
      },
      {
        $lookup: {
          from: "stockusages",
          localField: "originalUsageId",
          foreignField: "_id",
          as: "originalUsage"
        }
      },
      {
        $project: {
          _id: 1,
          date: 1,
          type: "Return",
          usageType: 1,
          center: { $arrayElemAt: ["$centerInfo", 0] },
          product: "$items.product",
          productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
          quantity: "$items.quantity",
          serialNumber: "$items.serialNumber",
          originalUsageType: { $arrayElemAt: ["$originalUsage.usageType", 0] },
          originalConnectionType: { $arrayElemAt: ["$originalUsage.connectionType", 0] },
          remark: 1,
          status: 1
        }
      }
    ]);

    console.log(`Found ${results.length} return records`);
    results.forEach((record, index) => {
      console.log(`Return record ${index + 1}: Product=${record.productName}, Qty=${record.quantity}, Type=${record.type}`);
    });

    return results;
  };



const getTargetCenters = async (requestedCenterId, user) => {
  if (!user) {
    throw new Error("Authentication required");
  }

  // Support both user-level and role-level Super Admin flags.
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

  console.log("CENTER ACCESS DIAGNOSTIC", {
    userId: user.id || user._id,
    userLevelFlag: user.isSuperAdmin,
    fullUserFlag: user.fullUser?.isSuperAdmin,
    roleFlag: user.role?.isSuperAdmin,
    isSuperAdmin,
    requestedCenterId,
    assignedCenter: assignedCenter ? String(assignedCenter) : null,
  });

  // All-center access is restricted to Super Admin.
  if (requestedCenterId === "all") {
    if (!isSuperAdmin) {
      throw new Error(
        "Access denied: all-center usage summary requires explicit authorization"
      );
    }

    return Center.find({})
      .select("centerName centerCode centerType")
      .lean();
  }

  // Ordinary users may access only their assigned center.
  if (!isSuperAdmin) {
    if (!assignedCenter) {
      throw new Error("User is not associated with a center");
    }

    const assignedCenterId = String(assignedCenter);

    if (
      requestedCenterId &&
      String(requestedCenterId) !== assignedCenterId
    ) {
      throw new Error("Access denied to the requested center");
    }

    const center = await Center.findById(assignedCenterId)
      .select("centerName centerCode centerType")
      .lean();

    return center ? [center] : [];
  }

  // Super Admin may request a specific center.
  if (requestedCenterId) {
    if (!mongoose.Types.ObjectId.isValid(requestedCenterId)) {
      throw new Error("Invalid center ID");
    }

    const center = await Center.findById(requestedCenterId)
      .select("centerName centerCode centerType")
      .lean();

    return center ? [center] : [];
  }

  // Super Admin without a center filter may view all centers.
  return Center.find({})
    .select("centerName centerCode centerType")
    .lean();
};


// Helper: Parse DD-MM-YYYY string into a proper Date object
function parseDDMMYYYY(dateStr) {
  if (!dateStr) return null;

  // Check if it's already a valid ISO date string like YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
  }

  // Try DD-MM-YYYY format (this is the format your API uses)
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;

  const [day, month, year] = parts.map(Number);

  if (!day || !month || !year || day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);

  // Guard against JS auto-correcting invalid dates (e.g., 31-02-2026 -> March 3)
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }

  return parsed;
}

const getDateRange = (startDate, endDate, month, year) => {
  let start, end;

  if (startDate && endDate) {
    start = parseDDMMYYYY(startDate);
    end = parseDDMMYYYY(endDate);

    if (!start || !end) {
      throw new Error(`Invalid date format. Expected DD-MM-YYYY, got startDate="${startDate}", endDate="${endDate}"`);
    }

    if (start > end) {
      throw new Error("startDate cannot be after endDate");
    }

    // Include the entire end day (23:59:59.999)
    end.setHours(23, 59, 59, 999);
  } else if (month && year) {
    const m = parseInt(month);
    const y = parseInt(year);

    if (!m || m < 1 || m > 12 || !y) {
      throw new Error(`Invalid month/year: month=${month}, year=${year}`);
    }

    start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    end = new Date(y, m, 0, 23, 59, 59, 999);
  } else {
    // Default: current month
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  return { startDate: start, endDate: end };
};

const getStockRequestData = async (centerId, dateRange, productId) => {
  const matchStage = {
    $or: [
      { center: new mongoose.Types.ObjectId(centerId) },
      { warehouse: new mongoose.Types.ObjectId(centerId) }
    ],
    status: { $in: ["Completed", "Confirmed", "Shipped"] },
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };

  if (productId) {
    matchStage['products.product'] = new mongoose.Types.ObjectId(productId);
  }

  const results = await StockRequest.aggregate([
    { $match: matchStage },
    { $unwind: "$products" },
    {
      $lookup: {
        from: "products",
        localField: "products.product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "warehouse",
        foreignField: "_id",
        as: "warehouseInfo"
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        orderNumber: 1,
        type: "Purchase",
        center: { $arrayElemAt: ["$centerInfo", 0] },
        warehouse: { $arrayElemAt: ["$warehouseInfo", 0] },
        product: "$products.product",
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        // Must match getOpeningStockData: received -> approved -> requested.
        // $ifNull (not $cond) so an explicit 0 (e.g. approvedQuantity: 0) stays 0.
        quantity: {
          $ifNull: [
            "$products.receivedQuantity",
            { $ifNull: ["$products.approvedQuantity", "$products.quantity"] }
          ]
        },
        approvedQuantity: "$products.approvedQuantity",
        receivedQuantity: "$products.receivedQuantity",
        status: 1
      }
    }
  ]);

  console.log(`[StockRequest] Found ${results.length} records`);
  results.forEach(r => {
    console.log(`  - ${r.productName}: ${r.quantity} (approved: ${r.approvedQuantity}, received: ${r.receivedQuantity})`);
  });

  return results;
};

const getStockTransferData = async (centerId, dateRange, productId) => {
  try {
    if (!centerId || !dateRange?.startDate || !dateRange?.endDate) {
      throw new Error(
        "centerId, startDate, and endDate are required for stock transfers"
      );
    }

    const centerObjectId = new mongoose.Types.ObjectId(centerId);

    const matchStage = {
      $or: [
        { fromCenter: centerObjectId },
        { toCenter: centerObjectId }
      ],
      status: { $in: ["Completed", "Shipped", "Confirmed"] },
      date: {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate
      }
    };

    if (productId) {
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw new Error("Invalid productId");
      }

      matchStage["products.product"] =
        new mongoose.Types.ObjectId(productId);
    }

    const results = await StockTransfer.aggregate([
      { $match: matchStage },

      { $unwind: "$products" },

      ...(productId
        ? [
            {
              $match: {
                "products.product": new mongoose.Types.ObjectId(productId)
              }
            }
          ]
        : []),

      {
        $lookup: {
          from: "products",
          localField: "products.product",
          foreignField: "_id",
          as: "productInfo"
        }
      },
      {
        $lookup: {
          from: "centers",
          localField: "fromCenter",
          foreignField: "_id",
          as: "fromCenterInfo"
        }
      },
      {
        $lookup: {
          from: "centers",
          localField: "toCenter",
          foreignField: "_id",
          as: "toCenterInfo"
        }
      },

      {
        $project: {
          _id: 1,
          date: 1,
          transferNumber: 1,

          type: {
            $cond: [
              { $eq: ["$fromCenter", centerObjectId] },
              "Transfer Given",
              "Transfer Receive"
            ]
          },

          fromCenter: {
            $let: {
              vars: {
                center: { $arrayElemAt: ["$fromCenterInfo", 0] }
              },
              in: {
                _id: "$$center._id",
                name: "$$center.name",
                code: "$$center.code"
              }
            }
          },

          toCenter: {
            $let: {
              vars: {
                center: { $arrayElemAt: ["$toCenterInfo", 0] }
              },
              in: {
                _id: "$$center._id",
                name: "$$center.name",
                code: "$$center.code"
              }
            }
          },

          product: "$products.product",
          productName: {
            $arrayElemAt: ["$productInfo.productTitle", 0]
          },

          approvedQuantity: "$products.approvedQuantity",
          receivedQuantity: "$products.receivedQuantity",
          status: 1,

          quantity: {
            $cond: [
              { $eq: ["$fromCenter", centerObjectId] },

              // Outgoing transfer: quantity given
              {
                $ifNull: [
                  "$products.approvedQuantity",
                  { $ifNull: ["$products.quantity", 0] }
                ]
              },

              // Incoming transfer: quantity actually received
              {
                $ifNull: [
                  "$products.receivedQuantity",
                  {
                    $ifNull: [
                      "$products.approvedQuantity",
                      { $ifNull: ["$products.quantity", 0] }
                    ]
                  }
                ]
              }
            ]
          }
        }
      },

      { $sort: { date: 1, _id: 1 } }
    ]);

    console.log(
      `[StockTransfer] Center: ${centerId}, Product: ${productId || "All"}, Records: ${results.length}`
    );

    results.forEach((record) => {
      console.log(
        `  - ${record.productName || "Unknown Product"}: ` +
        `${record.quantity} (${record.type}, Status: ${record.status})`
      );
    });

    return results;
  } catch (error) {
    console.error("[StockTransfer] Error:", error.message);
    throw error;
  }
};

const getStockUsageData = async (centerId, dateRange, productId) => {
  try {
    // 1. Validate inputs
    if (!mongoose.Types.ObjectId.isValid(centerId)) {
      throw new Error("Invalid center ID");
    }

    if (
      productId &&
      !mongoose.Types.ObjectId.isValid(productId)
    ) {
      throw new Error("Invalid product ID");
    }

    if (
      !dateRange?.startDate ||
      !dateRange?.endDate ||
      Number.isNaN(new Date(dateRange.startDate).getTime()) ||
      Number.isNaN(new Date(dateRange.endDate).getTime()) ||
      new Date(dateRange.startDate) > new Date(dateRange.endDate)
    ) {
      throw new Error("Invalid usage date range");
    }

    const centerObjectId = new mongoose.Types.ObjectId(centerId);
    const productObjectId = productId
      ? new mongoose.Types.ObjectId(productId)
      : null;

    // 2. Match completed transactions only.
    // Pending transactions must not affect stock until completed.
    const matchStage = {
      $or: [
        { center: centerObjectId },
        { toCenter: centerObjectId }
      ],
      status: "completed",
      date: {
        $gte: new Date(dateRange.startDate),
        $lte: new Date(dateRange.endDate)
      }
    };

    console.log(
      `[StockUsage] Center: ${centerId}, ` +
      `Range: ${dateRange.startDate} - ${dateRange.endDate}`
    );

    // 3. Aggregate usage records
    const pipeline = [
      { $match: matchStage },
      { $unwind: "$items" }
    ];

    // Filter individual items after unwind
    if (productObjectId) {
      pipeline.push({
        $match: {
          "items.product": productObjectId
        }
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "productInfo"
        }
      },
      {
        $lookup: {
          from: "centers",
          localField: "center",
          foreignField: "_id",
          as: "centerInfo"
        }
      },
      {
        $lookup: {
          from: "centers",
          localField: "toCenter",
          foreignField: "_id",
          as: "toCenterInfo"
        }
      },
      {
        $addFields: {
          centerData: {
            $cond: {
              if: { $eq: ["$center", centerObjectId] },
              then: { $arrayElemAt: ["$centerInfo", 0] },
              else: { $arrayElemAt: ["$toCenterInfo", 0] }
            }
          },
          isToCenter: {
            $eq: ["$toCenter", centerObjectId]
          }
        }
      },
      {
        $project: {
          _id: 1,
          date: 1,
          usageType: 1,
          type: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$usageType", "Customer"] },
                  then: "Usage"
                },
                {
                  case: { $eq: ["$usageType", "Building"] },
                  then: "Building Usage"
                },
                {
                  case: {
                    $eq: ["$usageType", "Building to Building"]
                  },
                  then: "Shifting"
                },
                {
                  case: { $eq: ["$usageType", "Control Room"] },
                  then: "Building Usage"
                },
                {
                  case: { $eq: ["$usageType", "Damage"] },
                  then: "Damage"
                },
                {
                  case: {
                    $eq: ["$usageType", "Stolen from Center"]
                  },
                  then: "Stolen Center"
                },
                {
                  case: {
                    $eq: ["$usageType", "Stolen from Field"]
                  },
                  then: "Stolen Field"
                },
                {
                  case: { $eq: ["$usageType", "Other"] },
                  then: "Other"
                }
              ],
              default: "Usage"
            }
          },
          connectionType: 1,
          center: "$centerData",
          product: "$items.product",
          productName: {
            $arrayElemAt: ["$productInfo.productTitle", 0]
          },
          quantity: "$items.quantity",
          serialNumbers: "$items.serialNumbers",
          remark: 1,
          customer: 1,
          fromBuilding: 1,
          toBuilding: 1,
          fromControlRoom: 1,
          isToCenter: 1
        }
      }
    );

    const usageData = await StockUsage.aggregate(pipeline);

    // 4. Map customer connection types to summary transaction types
    const connectionTypeMap = {
      NC: "NC",
      Convert: "Convert",
      Shifting: "Shifting",
      Repair: "Repair"
    };

    for (const item of usageData) {
      if (
        item.usageType === "Customer" &&
        item.connectionType &&
        connectionTypeMap[item.connectionType]
      ) {
        item.type = connectionTypeMap[item.connectionType];
      }
    }

    console.log(
      `[StockUsage] Found ${usageData.length} completed usage items for center ${centerId}`
    );

    return usageData;
  } catch (error) {
    console.error("Error in getStockUsageData:", error);
    throw error;
  }
};

const getDamageReturnData = async (centerId, dateRange, productId) => {
  const matchStage = {
    $or: [
      { center: new mongoose.Types.ObjectId(centerId) },
      { toCenter: new mongoose.Types.ObjectId(centerId) }
    ],
    status: { $in: ["approved", "pending", "replaced"] },
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };
  if (productId) {
    matchStage.product = new mongoose.Types.ObjectId(productId);
  }

  return await DamageReturn.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "toCenter",
        foreignField: "_id",
        as: "toCenterInfo"
      }
    },
    {
      $addFields: {
        centerData: {
          $cond: {
            if: { $eq: ["$center", new mongoose.Types.ObjectId(centerId)] },
            then: { $arrayElemAt: ["$centerInfo", 0] },
            else: { $arrayElemAt: ["$toCenterInfo", 0] }
          }
        }
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        type: "Replace Return",
        center: "$centerData",
        product: 1,
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        quantity: 1,
        serialNumber: 1,
        status: 1,
        remark: 1
      }
    }
  ]);
};

const getReplacementRecordData = async (centerId, dateRange, productId) => {
  const matchStage = {
    center: new mongoose.Types.ObjectId(centerId),
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };
  if (productId) {
    matchStage.product = new mongoose.Types.ObjectId(productId);
  }

  return await ReplacementRecord.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        type: "Replace Damage",
        center: { $arrayElemAt: ["$centerInfo", 0] },
        product: 1,
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        qty: 1,
        oldSerialNumber: 1,
        newSerialNumber: 1,
        statusReason: 1
      }
    }
  ]);
};


const getStockClosingData = async (centerId, dateRange, productId) => {
  if (!mongoose.Types.ObjectId.isValid(centerId)) {
    throw new Error("Invalid center ID");
  }

  if (
    productId &&
    !mongoose.Types.ObjectId.isValid(productId)
  ) {
    throw new Error("Invalid product ID");
  }

  const centerObjectId = new mongoose.Types.ObjectId(centerId);

  const matchStage = {
    status: "Approved",
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    },
    $or: [
      { center: centerObjectId },
      { closingCenter: centerObjectId }
    ]
  };

  const pipeline = [
    { $match: matchStage },

    // Latest closing date first.
    // For duplicate dates, latest creation wins.
    // _id is a deterministic final tie-breaker.
    {
      $sort: {
        date: -1,
        createdAt: -1,
        _id: -1
      }
    },

    // Select the latest snapshot document,
    // not the latest document independently per product.
    { $limit: 1 },

    { $unwind: "$products" }
  ];

  if (productId) {
    pipeline.push({
      $match: {
        "products.product": new mongoose.Types.ObjectId(productId)
      }
    });
  }

  pipeline.push(
    {
      $lookup: {
        from: "products",
        localField: "products.product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "closingCenter",
        foreignField: "_id",
        as: "closingCenterInfo"
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        type: { $literal: "Closing" },
        center: {
          $arrayElemAt: ["$centerInfo", 0]
        },
        closingCenter: {
          $arrayElemAt: ["$closingCenterInfo", 0]
        },
        product: "$products.product",
        productName: {
          $arrayElemAt: ["$productInfo.productTitle", 0]
        },
        productQty: "$products.productQty",
        damageQty: "$products.damageQty",
        status: 1,
        createdAt: 1
      }
    }
  );

  return StockClosing.aggregate(pipeline);
};



const getOpeningStockData = async (centerId, startDate, productId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(centerId)) {
      throw new Error("Invalid center ID");
    }

    if (
      productId &&
      !mongoose.Types.ObjectId.isValid(productId)
    ) {
      throw new Error("Invalid product ID");
    }

    const currentStartDate = new Date(startDate);

    if (Number.isNaN(currentStartDate.getTime())) {
      throw new Error("Invalid opening stock start date");
    }

    const centerObjectId = new mongoose.Types.ObjectId(centerId);
    const productObjectId = productId
      ? new mongoose.Types.ObjectId(productId)
      : null;

    const productFilter = productObjectId
      ? { "products.product": productObjectId }
      : {};

    const itemProductFilter = productObjectId
      ? { "items.product": productObjectId }
      : {};

    const directProductFilter = productObjectId
      ? { product: productObjectId }
      : {};

    console.log(
      `[Opening Stock] Center: ${centerId}, Start: ${currentStartDate.toISOString()}`
    );

    // Find the latest approved snapshot strictly before the report start.
    const previousClosings = await StockClosing.aggregate([
      {
        $match: {
          status: "Approved",
          date: { $lt: currentStartDate },
          $or: [
            { center: centerObjectId },
            { closingCenter: centerObjectId }
          ]
        }
      },
      {
        $sort: {
          date: -1,
          createdAt: -1,
          _id: -1
        }
      },
      { $limit: 1 },
      { $unwind: "$products" },
      ...(productObjectId
        ? [
            {
              $match: {
                "products.product": productObjectId
              }
            }
          ]
        : []),
      {
        $project: {
          product: "$products.product",
          productQty: {
            $ifNull: ["$products.productQty", 0]
          },
          damageQty: {
            $ifNull: ["$products.damageQty", 0]
          },
          date: 1,
          createdAt: 1
        }
      }
    ]);

    // If a snapshot exists, use it as the baseline.
    // Do not also add all historical transactions before that snapshot.
    if (previousClosings.length > 0) {
      const snapshotDate = previousClosings[0].date;
      const baseline = new Map();

      for (const item of previousClosings) {
        const pid = String(item.product);

        baseline.set(pid, {
          quantity: Number(item.productQty) || 0,
          damageQty: Number(item.damageQty) || 0
        });
      }

      const snapshotProductIds = [...baseline.keys()];

      // Include requested product even if absent from the snapshot.
      if (productObjectId && !baseline.has(String(productObjectId))) {
        baseline.set(String(productObjectId), {
          quantity: 0,
          damageQty: 0
        });
      }

      /*
       * Movements after the snapshot and before the report start:
       * inbound stock and returns increase stock;
       * outbound transfers, usage and damage decrease usable stock.
       *
       * The transaction status and quantity fields below follow
       * the conventions from the existing implementation.
       */
      const [
        purchases,
        transfersIn,
        transfersOut,
        usages,
        returns,
        damages
      ] = await Promise.all([
        StockRequest.aggregate([
          {
            $match: {
              $or: [
                { center: centerObjectId },
                { warehouse: centerObjectId }
              ],
              status: { $in: ["Completed", "Confirmed", "Shipped"] },
              date: {
                $gte: snapshotDate,
                $lt: currentStartDate
              }
            }
          },
          { $unwind: "$products" },
          { $match: productFilter },
          {
            $group: {
              _id: "$products.product",
              total: {
                $sum: {
                  $ifNull: [
                    "$products.receivedQuantity",
                    {
                      $ifNull: [
                        "$products.approvedQuantity",
                        "$products.quantity"
                      ]
                    }
                  ]
                }
              }
            }
          }
        ]),

        StockTransfer.aggregate([
          {
            $match: {
              toCenter: centerObjectId,
              status: "Completed",
              date: {
                $gte: snapshotDate,
                $lt: currentStartDate
              }
            }
          },
          { $unwind: "$products" },
          { $match: productFilter },
          {
            $group: {
              _id: "$products.product",
              total: {
                $sum: {
                  $ifNull: [
                    "$products.receivedQuantity",
                    {
                      $ifNull: [
                        "$products.approvedQuantity",
                        "$products.quantity"
                      ]
                    }
                  ]
                }
              }
            }
          }
        ]),

        StockTransfer.aggregate([
          {
            $match: {
              fromCenter: centerObjectId,
              status: "Completed",
              date: {
                $gte: snapshotDate,
                $lt: currentStartDate
              }
            }
          },
          { $unwind: "$products" },
          { $match: productFilter },
          {
            $group: {
              _id: "$products.product",
              total: {
                $sum: {
                  $ifNull: [
                    "$products.approvedQuantity",
                    "$products.quantity"
                  ]
                }
              }
            }
          }
        ]),

        StockUsage.aggregate([
          {
            $match: {
              center: centerObjectId,
              status: "completed",
              date: {
                $gte: snapshotDate,
                $lt: currentStartDate
              }
            }
          },
          { $unwind: "$items" },
          { $match: itemProductFilter },
          {
            $group: {
              _id: "$items.product",
              total: { $sum: "$items.quantity" }
            }
          }
        ]),

        ReturnRecord.aggregate([
          {
            $match: {
              center: centerObjectId,
              status: "completed",
              date: {
                $gte: snapshotDate,
                $lt: currentStartDate
              }
            }
          },
          { $unwind: "$items" },
          { $match: itemProductFilter },
          {
            $group: {
              _id: "$items.product",
              total: { $sum: "$items.quantity" }
            }
          }
        ]),

        DamageReturn.aggregate([
          {
            $match: {
              $or: [
                { center: centerObjectId },
                { toCenter: centerObjectId }
              ],
              status: { $in: ["approved", "pending", "replaced"] },
              date: {
                $gte: snapshotDate,
                $lt: currentStartDate
              }
            }
          },
          { $match: directProductFilter },
          {
            $group: {
              _id: "$product",
              total: { $sum: "$quantity" }
            }
          }
        ])
      ]);

      const toMap = (records) =>
        new Map(
          records.map((record) => [
            String(record._id),
            Number(record.total) || 0
          ])
        );

      const purchaseMap = toMap(purchases);
      const transferInMap = toMap(transfersIn);
      const transferOutMap = toMap(transfersOut);
      const usageMap = toMap(usages);
      const returnMap = toMap(returns);
      const damageMap = toMap(damages);

      const allProductIds = new Set([
        ...snapshotProductIds,
        ...purchases.map((r) => String(r._id)),
        ...transfersIn.map((r) => String(r._id)),
        ...transfersOut.map((r) => String(r._id)),
        ...usages.map((r) => String(r._id)),
        ...returns.map((r) => String(r._id)),
        ...damages.map((r) => String(r._id))
      ]);

      if (productObjectId) {
        allProductIds.add(String(productObjectId));
      }

      const ids = [...allProductIds].map(
        (id) => new mongoose.Types.ObjectId(id)
      );

      const products = await mongoose
        .model("Product")
        .find({ _id: { $in: ids } })
        .select("productTitle")
        .lean();

      const nameMap = new Map(
        products.map((p) => [
          String(p._id),
          p.productTitle || "Unknown Product"
        ])
      );

      const openingData = [];

      for (const pid of allProductIds) {
        const base = baseline.get(pid) || {
          quantity: 0,
          damageQty: 0
        };

        const openingQuantity =
          base.quantity +
          (purchaseMap.get(pid) || 0) +
          (transferInMap.get(pid) || 0) +
          (returnMap.get(pid) || 0) -
          (transferOutMap.get(pid) || 0) -
          (usageMap.get(pid) || 0) -
          (damageMap.get(pid) || 0);

        openingData.push({
          product: new mongoose.Types.ObjectId(pid),
          productName: nameMap.get(pid) || "Unknown Product",
          quantity: Math.max(0, openingQuantity),
          damageQty: base.damageQty,
          stockType: "Previous Approved Closing + Subsequent Movements",
          date: currentStartDate,
          baselineDate: snapshotDate
        });
      }

      console.log(
        `[Opening Stock] Using approved snapshot dated ${snapshotDate.toISOString()}`
      );

      return openingData;
    }

    // No previous approved snapshot: use the existing historical fallback.
    const [
      purchases,
      transfersIn,
      transfersOut,
      usages,
      returns,
      damages
    ] = await Promise.all([
      StockRequest.aggregate([
        {
          $match: {
            $or: [
              { center: centerObjectId },
              { warehouse: centerObjectId }
            ],
            status: { $in: ["Completed", "Confirmed", "Shipped"] },
            date: { $lt: currentStartDate }
          }
        },
        { $unwind: "$products" },
        { $match: productFilter },
        {
          $group: {
            _id: "$products.product",
            total: {
              $sum: {
                $ifNull: [
                  "$products.receivedQuantity",
                  {
                    $ifNull: [
                      "$products.approvedQuantity",
                      "$products.quantity"
                    ]
                  }
                ]
              }
            }
          }
        }
      ]),

      StockTransfer.aggregate([
        {
          $match: {
            toCenter: centerObjectId,
            status: "Completed",
            date: { $lt: currentStartDate }
          }
        },
        { $unwind: "$products" },
        { $match: productFilter },
        {
          $group: {
            _id: "$products.product",
            total: {
              $sum: {
                $ifNull: [
                  "$products.receivedQuantity",
                  {
                    $ifNull: [
                      "$products.approvedQuantity",
                      "$products.quantity"
                    ]
                  }
                ]
              }
            }
          }
        }
      ]),

      StockTransfer.aggregate([
        {
          $match: {
            fromCenter: centerObjectId,
            status: "Completed",
            date: { $lt: currentStartDate }
          }
        },
        { $unwind: "$products" },
        { $match: productFilter },
        {
          $group: {
            _id: "$products.product",
            total: {
              $sum: {
                $ifNull: [
                  "$products.approvedQuantity",
                  "$products.quantity"
                ]
              }
            }
          }
        }
      ]),

      StockUsage.aggregate([
        {
          $match: {
            center: centerObjectId,
            status: "completed",
            date: { $lt: currentStartDate }
          }
        },
        { $unwind: "$items" },
        { $match: itemProductFilter },
        {
          $group: {
            _id: "$items.product",
            total: { $sum: "$items.quantity" }
          }
        }
      ]),

      ReturnRecord.aggregate([
        {
          $match: {
            center: centerObjectId,
            status: "completed",
            date: { $lt: currentStartDate }
          }
        },
        { $unwind: "$items" },
        { $match: itemProductFilter },
        {
          $group: {
            _id: "$items.product",
            total: { $sum: "$items.quantity" }
          }
        }
      ]),

      DamageReturn.aggregate([
        {
          $match: {
            $or: [
              { center: centerObjectId },
              { toCenter: centerObjectId }
            ],
            status: { $in: ["approved", "pending", "replaced"] },
            date: { $lt: currentStartDate }
          }
        },
        { $match: directProductFilter },
        {
          $group: {
            _id: "$product",
            total: { $sum: "$quantity" }
          }
        }
      ])
    ]);

    const allProducts = new Set();

    for (const records of [
      purchases,
      transfersIn,
      transfersOut,
      usages,
      returns,
      damages
    ]) {
      for (const record of records) {
        if (record._id) {
          allProducts.add(String(record._id));
        }
      }
    }

    if (productObjectId) {
      allProducts.add(String(productObjectId));
    }

    if (allProducts.size === 0) {
      return [];
    }

    const toTotalMap = (records) =>
      new Map(
        records.map((record) => [
          String(record._id),
          Number(record.total) || 0
        ])
      );

    const purchaseMap = toTotalMap(purchases);
    const transferInMap = toTotalMap(transfersIn);
    const transferOutMap = toTotalMap(transfersOut);
    const usageMap = toTotalMap(usages);
    const returnMap = toTotalMap(returns);
    const damageMap = toTotalMap(damages);

    const productIds = [...allProducts].map(
      (id) => new mongoose.Types.ObjectId(id)
    );

    const products = await mongoose
      .model("Product")
      .find({ _id: { $in: productIds } })
      .select("productTitle")
      .lean();

    const productNameMap = new Map(
      products.map((product) => [
        String(product._id),
        product.productTitle || "Unknown Product"
      ])
    );

    const openingData = [];

    for (const pid of allProducts) {
      const rawOpeningStock =
        (purchaseMap.get(pid) || 0) +
        (transferInMap.get(pid) || 0) +
        (returnMap.get(pid) || 0) -
        (transferOutMap.get(pid) || 0) -
        (usageMap.get(pid) || 0) -
        (damageMap.get(pid) || 0);

      if (rawOpeningStock !== 0 || productId) {
        openingData.push({
          product: new mongoose.Types.ObjectId(pid),
          productName: productNameMap.get(pid) || "Unknown Product",
          quantity: Math.max(0, rawOpeningStock),
          stockType: "Calculated from All Previous Transactions",
          date: currentStartDate
        });
      }
    }

    console.log(
      `[Opening Stock] Returning ${openingData.length} products for center ${centerId}`
    );

    return openingData;
  } catch (error) {
    console.error("Error in getOpeningStockData:", error);
    throw error;
  }
};


// NOTE: getPreviousMonthClosingStock is currently unused (kept from original file).
// Get previous month's closing stock from Summary calculations
const getPreviousMonthClosingStock = async (centerId, previousMonthStart, previousMonthEnd, productId) => {
  try {
    // 1. Get purchases in previous month
    const purchases = await StockRequest.aggregate([
      {
        $match: {
          $or: [
            { center: new mongoose.Types.ObjectId(centerId) },
            { warehouse: new mongoose.Types.ObjectId(centerId) }
          ],
          status: { $in: ["Completed", "Confirmed", "Shipped"] },
          date: { $gte: previousMonthStart, $lte: previousMonthEnd }
        }
      },
      { $unwind: "$products" },
      {
        $match: productId ? { 'products.product': new mongoose.Types.ObjectId(productId) } : {}
      },
      {
        $group: {
          _id: '$products.product',
          totalQuantity: {
            $sum: {
              $ifNull: [
                '$products.receivedQuantity',
                { $ifNull: ['$products.approvedQuantity', '$products.quantity'] }
              ]
            }
          }
        }
      }
    ]);

    // 2. Get transfers IN during previous month
    const transfersIn = await StockTransfer.aggregate([
      {
        $match: {
          toCenter: new mongoose.Types.ObjectId(centerId),
          status: 'Completed',
          date: { $gte: previousMonthStart, $lte: previousMonthEnd }
        }
      },
      { $unwind: "$products" },
      {
        $match: productId ? { 'products.product': new mongoose.Types.ObjectId(productId) } : {}
      },
      {
        $group: {
          _id: '$products.product',
          totalQuantity: {
            $sum: {
              $ifNull: [
                '$products.receivedQuantity',
                { $ifNull: ['$products.approvedQuantity', '$products.quantity'] }
              ]
            }
          }
        }
      }
    ]);

    // 3. Get transfers OUT during previous month
    const transfersOut = await StockTransfer.aggregate([
      {
        $match: {
          fromCenter: new mongoose.Types.ObjectId(centerId),
          status: 'Completed',
          date: { $gte: previousMonthStart, $lte: previousMonthEnd }
        }
      },
      { $unwind: "$products" },
      {
        $match: productId ? { 'products.product': new mongoose.Types.ObjectId(productId) } : {}
      },
      {
        $group: {
          _id: '$products.product',
          totalQuantity: {
            $sum: {
              $ifNull: ['$products.approvedQuantity', '$products.quantity']
            }
          }
        }
      }
    ]);

    // 4. Get usages during previous month
    const usages = await StockUsage.aggregate([
      {
        $match: {
          center: new mongoose.Types.ObjectId(centerId),
          status: "completed",
          date: { $gte: previousMonthStart, $lte: previousMonthEnd }
        }
      },
      { $unwind: "$items" },
      {
        $match: productId ? { 'items.product': new mongoose.Types.ObjectId(productId) } : {}
      },
      {
        $group: {
          _id: '$items.product',
          totalQuantity: { $sum: '$items.quantity' }
        }
      }
    ]);

    // 5. Get opening stock for previous month using the fixed function
    const previousMonthOpening = await getOpeningStockData(centerId, previousMonthStart, productId);

    // Build closing stock map starting from previous month's opening
    const closingStockMap = new Map();

    previousMonthOpening.forEach(item => {
      closingStockMap.set(item.product.toString(), item.quantity);
    });

    // Add purchases
    purchases.forEach(p => {
      const current = closingStockMap.get(p._id.toString()) || 0;
      closingStockMap.set(p._id.toString(), current + p.totalQuantity);
    });

    // Add transfers in
    transfersIn.forEach(t => {
      const current = closingStockMap.get(t._id.toString()) || 0;
      closingStockMap.set(t._id.toString(), current + t.totalQuantity);
    });

    // Subtract transfers out
    transfersOut.forEach(t => {
      const current = closingStockMap.get(t._id.toString()) || 0;
      closingStockMap.set(t._id.toString(), current - t.totalQuantity);
    });

    // Subtract usages
    usages.forEach(u => {
      const current = closingStockMap.get(u._id.toString()) || 0;
      closingStockMap.set(u._id.toString(), current - u.totalQuantity);
    });

    // Convert map to result array
    const result = [];
    const ProductModel = mongoose.model('Product');

    for (const [prodId, quantity] of closingStockMap) {
      if (quantity <= 0 && !productId) continue;
      if (productId && prodId !== productId) continue;

      let productName = 'Unknown Product';
      try {
        const productDoc = await ProductModel.findById(prodId);
        if (productDoc?.productTitle) {
          productName = productDoc.productTitle;
        }
      } catch (err) {
        console.error(`Error fetching product name for ${prodId}:`, err);
      }

      console.log(`📦 Previous month closing stock for ${productName}: ${Math.max(0, quantity)}`);

      result.push({
        product: new mongoose.Types.ObjectId(prodId),
        productName: productName,
        quantity: Math.max(0, quantity),
        stockType: "Calculated from Previous Month Transactions",
        date: previousMonthEnd
      });
    }

    return result;

  } catch (error) {
    console.error("Error calculating previous month closing stock:", error);
    return [];
  }
};


const processUsageSummary = (data, centerId, centerDetails, productId) => {
  const filterProductId = productId ? String(productId) : null;

  const allData = [
    ...(data.stockRequests || []),
    ...(data.stockTransfers || []),
    ...(data.stockUsages || []),
    ...(data.damageReturns || []),
    ...(data.replacementRecords || []),
    ...(data.stockClosings || []),
    ...(data.returnRecords || [])
  ];

  const groupedData = {};

  const setCenter = (item) => {
    if (!item.center && centerDetails) {
      item.center = {
        id: centerId,
        name: centerDetails.centerName,
        code: centerDetails.centerCode,
        type: centerDetails.centerType
      };
    }
  };

  const getProductId = (item) => {
    const value = item?.product?._id ?? item?.product;
    return value == null ? null : String(value);
  };

  const getQuantity = (item) => {
    const value = Number(
      item?.quantity ?? item?.qty ?? item?.productQty ?? 0
    );

    return Number.isFinite(value) ? value : 0;
  };

  // Process opening stock.
  for (const item of data.openingStock || []) {
    const pid = getProductId(item);

    if (!pid || (filterProductId && pid !== filterProductId)) {
      continue;
    }

    if (!groupedData[pid]) {
      groupedData[pid] = createEmptyProductSummary(
        item.productName || "Unknown Product"
      );

      groupedData[pid].productId = pid;
    }

    groupedData[pid].opening = Number(item.quantity) || 0;
    setCenter(groupedData[pid]);
  }

  // Process transactions and the selected closing snapshot.
  for (const item of allData) {
    const pid = getProductId(item);

    if (!pid || (filterProductId && pid !== filterProductId)) {
      continue;
    }

    const quantity = getQuantity(item);
    const type = item.type;

    if (!groupedData[pid]) {
      groupedData[pid] = createEmptyProductSummary(
        item.productName || "Unknown Product"
      );

      groupedData[pid].productId = pid;
      groupedData[pid].opening = 0;
    }

    const summary = groupedData[pid];
    setCenter(summary);

    // Closing is a snapshot, not a stock movement.
    // Do not add closing snapshots to one another.
    if (type === "Closing") {
      summary.closing =
        quantity + (Number(item.damageQty) || 0);

      summary.closingDate = item.date;
      summary.closingSource = "approved_snapshot";

      continue;
    }

    // Process regular stock movements.
    switch (type) {
      case "Purchase":
        summary.purchase += quantity;
        break;

      case "Transfer Receive":
        summary.transferReceive += quantity;
        break;

      case "Transfer Given":
        summary.transferGiven += quantity;
        break;

      case "Usage":
        summary.usage += quantity;
        break;

      case "NC":
        summary.nc += quantity;
        break;

      case "Convert":
        summary.convert += quantity;
        break;

      case "Shifting":
        summary.shifting += quantity;
        break;

      case "Building Usage":
        summary.buildingUsage += quantity;
        break;

      case "Damage":
        summary.damage += quantity;
        break;

      case "Return":
        summary.return += quantity;
        break;

      case "Replace Return":
        summary.replaceReturn += quantity;
        break;

      case "Replace Damage":
        summary.replaceDamage += quantity;
        break;

      case "Stolen Center":
        summary.stolenCenter += quantity;
        break;

      case "Stolen Field":
        summary.stolenField += quantity;
        break;

      case "Other":
        summary.other += quantity;
        break;

      case "Repair":
        summary.repair += quantity;
        break;

      default:
        console.warn(
          `Unknown transaction type "${type}" for product ${pid}`
        );
    }
  }

  return Object.values(groupedData).map((item) => {
    setCenter(item);
    return item;
  });
};

const createEmptyProductSummary = (productName) => ({
  productName,
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
  closingSource: null,
  center: null,
  productId: null,

  calculateUsageAndClosing() {
    const totalUsage =
      (Number(this.usage) || 0) +
      (Number(this.nc) || 0) +
      (Number(this.convert) || 0) +
      (Number(this.shifting) || 0) +
      (Number(this.buildingUsage) || 0) +
      (Number(this.buildingDamage) || 0) +
      (Number(this.other) || 0) +
      (Number(this.repair) || 0) +
      (Number(this.stolenCenter) || 0) +
      (Number(this.stolenField) || 0);

    const calculatedClosing =
      (Number(this.opening) || 0) +
      (Number(this.purchase) || 0) +
      (Number(this.transferReceive) || 0) +
      (Number(this.return) || 0) -
      (Number(this.transferGiven) || 0) -
      totalUsage -
      (Number(this.replaceDamage) || 0) -
      (Number(this.damage) || 0);

    // Never overwrite an approved snapshot with a calculated balance.
    if (this.closingSource !== "approved_snapshot") {
      this.closing = calculatedClosing;
    }

    return this.closing;
  }
});



const generateSummaryStats = (usageSummary) => {
  const movementFields = [
    "purchase",
    "distributed",
    "transferReceive",
    "replaceReturn",
    "usage",
    "transferGiven",
    "nc",
    "convert",
    "shifting",
    "buildingUsage",
    "buildingDamage",
    "other",
    "return",
    "repair",
    "damage",
    "replaceDamage",
    "stolenCenter",
    "stolenField"
  ];

  const totalQuantity = (product) =>
    movementFields.reduce(
      (sum, key) => sum + (Number(product[key]) || 0),
      0
    );

  const totalTransactions = usageSummary.reduce(
    (count, product) =>
      count +
      movementFields.filter(
        (key) => (Number(product[key]) || 0) !== 0
      ).length,
    0
  );

  return {
    totalProducts: usageSummary.length,
    totalTransactions,
    totalQuantity: usageSummary.reduce(
      (sum, product) => sum + totalQuantity(product),
      0
    ),
    centers: [
      ...new Set(
        usageSummary
          .map((item) => item.center?.name)
          .filter(Boolean)
      )
    ]
  };
};


const getTotalQuantity = (item) => {
  return MOVEMENT_FIELDS.reduce((sum, key) => sum + (item[key] || 0), 0);
};