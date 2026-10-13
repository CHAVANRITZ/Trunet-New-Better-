
import mongoose from "mongoose";

import Invoice from "../models/Invoice.js";
import StockRequest from "../models/StockRequest.js";
import Product from "../models/Product.js";
import Reseller from "../models/Reseller.js";
import { ApiError } from "../utils/ApiError.js";

const INVOICE_PERMISSION_MODULE = "Indent";

const getIndentPermissions = (req) => {
  const role = req.user?.role;

  const modulePermissions = role?.permissions?.find(
    (item) => item.module === INVOICE_PERMISSION_MODULE
  );

  const permissions = modulePermissions?.permissions || [];

  return {
    isSuperAdmin: role?.isSuperAdmin === true,
    canManage: permissions.includes("manage_indent"),
    allCenters: permissions.includes("indent_all_center"),
    ownCenter: permissions.includes("indent_own_center"),
    centerId:
      req.selectedCenterId ||
      req.user?.selectedCenterId ||
      req.user?.fullUser?.center ||
      null,
  };
};

const requireAuthenticatedUser = (req) => {
  if (!req.user?.id) {
    throw new ApiError(401, "Authentication required.");
  }
};

const requireManagePermission = (req) => {
  requireAuthenticatedUser(req);

  const access = getIndentPermissions(req);

  if (!access.isSuperAdmin && !access.canManage) {
    throw new ApiError(403, "manage_indent permission required.");
  }

  if (
    !access.isSuperAdmin &&
    !access.allCenters &&
    (!access.ownCenter || !access.centerId)
  ) {
    throw new ApiError(
      403,
      "You need indent_own_center or indent_all_center permission."
    );
  }

  return access;
};

const sameId = (first, second) => {
  if (!first || !second) return false;

  const firstId = first._id || first;
  const secondId = second._id || second;

  return String(firstId) === String(secondId);
};

const canAccessCenter = (center, access) => {
  if (access.isSuperAdmin || access.allCenters) {
    return true;
  }

  if (!access.ownCenter || !access.centerId || !center) {
    return false;
  }

  return sameId(center, access.centerId);
};

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return replacements[character];
  });

const money = (value) => Number(value || 0).toFixed(2);

const roundMoney = (value) =>
  Number(Number(value || 0).toFixed(2));

const getProductDocument = async (productReference, session) => {
  if (!productReference) return null;

  if (
    typeof productReference === "object" &&
    productReference.productTitle
  ) {
    return productReference;
  }

  if (!mongoose.isValidObjectId(productReference)) {
    return null;
  }

  return Product.findById(productReference).session(session).lean();
};

const buildInvoiceProducts = async (
  inputProducts,
  stockRequests,
  session
) => {
  const stockProducts = [];

  for (const request of stockRequests) {
    for (const stockProduct of request.products || []) {
      stockProducts.push(stockProduct);
    }
  }

  /*
   * If invoiceData.products is provided, use its quantities and rates.
   * Otherwise, derive product lines from the linked stock requests.
   */
  const requestedProducts =
    Array.isArray(inputProducts) && inputProducts.length
      ? inputProducts
      : stockProducts.map((stockProduct) => ({
          productId:
            stockProduct.product?._id || stockProduct.product,
          productTitle: stockProduct.product?.productTitle,
          hsnCode: stockProduct.product?.hsnCode,
          quantity:
            stockProduct.approvedQuantity ??
            stockProduct.receivedQuantity ??
            stockProduct.quantity ??
            0,
          outletQty:
            stockProduct.approvedQuantity ??
            stockProduct.receivedQuantity ??
            stockProduct.quantity ??
            0,
          damageRepairQty: 0,
          centerReturnQty: 0,
          outletRate: stockProduct.product?.salePrice,
          repairRate: 0,
          centerReturnRate: 0,
        }));

  const invoiceProducts = [];

  for (const input of requestedProducts) {
    let matchingStockProduct = null;

    if (input.productId) {
      matchingStockProduct = stockProducts.find((item) =>
        sameId(item.product, input.productId)
      );
    }

    const productReference =
      input.productId || matchingStockProduct?.product;

    const productDocument = await getProductDocument(
      productReference,
      session
    );

    const productTitle =
      input.productTitle || productDocument?.productTitle;

    if (!productTitle && !productReference) {
      throw new ApiError(
        400,
        "Every invoice product must have a product ID or product title."
      );
    }

    const quantity = Number(input.quantity ?? 0);
    const outletQty = Number(input.outletQty ?? quantity);
    const damageRepairQty = Number(input.damageRepairQty ?? 0);
    const centerReturnQty = Number(input.centerReturnQty ?? 0);

    const outletRate = Number(
      input.outletRate ?? productDocument?.salePrice ?? 0
    );

    const repairRate = Number(input.repairRate ?? 0);
    const centerReturnRate = Number(input.centerReturnRate ?? 0);

    const numericValues = [
      quantity,
      outletQty,
      damageRepairQty,
      centerReturnQty,
      outletRate,
      repairRate,
      centerReturnRate,
    ];

    if (
      numericValues.some(
        (value) => !Number.isFinite(value) || value < 0
      )
    ) {
      throw new ApiError(
        400,
        `Invalid quantity or rate for product ${productTitle || productReference}.`
      );
    }

    const outletAmount = roundMoney(outletQty * outletRate);
    const damageRepairAmount = roundMoney(
      damageRepairQty * repairRate
    );
    const centerReturnAmount = roundMoney(
      centerReturnQty * centerReturnRate
    );

    invoiceProducts.push({
      productId: productReference || undefined,
      productTitle: productTitle || "",
      hsnCode: input.hsnCode || productDocument?.hsnCode || "",
      quantity:
        quantity || outletQty + damageRepairQty + centerReturnQty,
      outletQty,
      damageRepairQty,
      centerReturnQty,
      outletRate,
      repairRate,
      centerReturnRate,
      outletAmount,
      damageRepairAmount,
      centerReturnAmount,
      totalAmount: roundMoney(
        outletAmount + damageRepairAmount + centerReturnAmount
      ),
      unit: input.unit || "Nos",
    });
  }

  return invoiceProducts;
};

const buildHsnSummary = (products, cgstRate = 9, sgstRate = 9) => {
  const summary = new Map();

  for (const product of products) {
    const hsnCode = product.hsnCode || "";

    if (!summary.has(hsnCode)) {
      summary.set(hsnCode, {
        hsnCode,
        taxableValue: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        totalTax: 0,
      });
    }

    const entry = summary.get(hsnCode);
    const taxableValue = Number(product.totalAmount || 0);
    const cgstAmount = roundMoney(
      taxableValue * (cgstRate / 100)
    );
    const sgstAmount = roundMoney(
      taxableValue * (sgstRate / 100)
    );

    entry.taxableValue += taxableValue;
    entry.cgstAmount += cgstAmount;
    entry.sgstAmount += sgstAmount;
    entry.totalTax += cgstAmount + sgstAmount;
  }

  return Array.from(summary.values()).map((entry) => ({
    ...entry,
    taxableValue: roundMoney(entry.taxableValue),
    cgstAmount: roundMoney(entry.cgstAmount),
    sgstAmount: roundMoney(entry.sgstAmount),
    totalTax: roundMoney(entry.totalTax),
  }));
};

const generateInvoiceHtml = ({
  invoiceNumber,
  invoiceDate,
  reseller,
  centerNames,
  products,
  totalOutletAmount,
  totalDamageRepairAmount,
  totalCenterReturnAmount,
  totalBeforeTax,
  cgst,
  sgst,
  roundOff,
  totalAmount,
  hsnSummary,
  metadata,
}) => {
  const productRows = products
    .map(
      (product, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(product.productTitle)}</td>
          <td>${escapeHtml(product.hsnCode)}</td>
          <td>${product.quantity}</td>
          <td>${money(product.outletRate)}</td>
          <td>${escapeHtml(product.unit)}</td>
          <td>${money(product.totalAmount)}</td>
        </tr>
      `
    )
    .join("");

  const hsnRows = hsnSummary
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.hsnCode)}</td>
          <td>${money(item.taxableValue)}</td>
          <td>${money(item.cgstAmount)}</td>
          <td>${money(item.sgstAmount)}</td>
          <td>${money(item.totalTax)}</td>
        </tr>
      `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Invoice ${escapeHtml(invoiceNumber)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; }
          h2 { text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #333; padding: 8px; text-align: left; }
          .amount { text-align: right; }
        </style>
      </head>
      <body>
        <h2>Tax Invoice</h2>

        <p><strong>Invoice No:</strong> ${escapeHtml(invoiceNumber)}</p>
        <p><strong>Date:</strong> ${escapeHtml(
          new Date(invoiceDate).toLocaleDateString("en-IN")
        )}</p>
        <p><strong>Reseller:</strong> ${escapeHtml(reseller?.businessName)}</p>
        <p><strong>GSTIN:</strong> ${escapeHtml(reseller?.gstNumber)}</p>
        <p><strong>Address:</strong> ${escapeHtml(reseller?.address1)}</p>
        <p><strong>Centers:</strong> ${escapeHtml(centerNames)}</p>
        <p><strong>Delivery Note:</strong> ${escapeHtml(metadata.deliveryNote)}</p>
        <p><strong>Mode of Payment:</strong> ${escapeHtml(metadata.modeOfPayment)}</p>
        <p><strong>Reference No:</strong> ${escapeHtml(metadata.referenceNo)}</p>
        <p><strong>Buyer Order No:</strong> ${escapeHtml(metadata.buyerOrderNo)}</p>
        <p><strong>Dispatched Through:</strong> ${escapeHtml(metadata.dispatchedThrough)}</p>
        <p><strong>Destination:</strong> ${escapeHtml(metadata.destination)}</p>
        <p><strong>Terms of Delivery:</strong> ${escapeHtml(metadata.termsOfDelivery)}</p>

        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Product</th>
              <th>HSN</th>
              <th>Quantity</th>
              <th>Rate</th>
              <th>Unit</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>${productRows}</tbody>
        </table>

        <table>
          <tbody>
            <tr><td>Outlet Amount</td><td class="amount">${money(totalOutletAmount)}</td></tr>
            <tr><td>Damage Repair Amount</td><td class="amount">${money(totalDamageRepairAmount)}</td></tr>
            <tr><td>Center Return Amount</td><td class="amount">${money(totalCenterReturnAmount)}</td></tr>
            <tr><td>Total Before Tax</td><td class="amount">${money(totalBeforeTax)}</td></tr>
            <tr><td>CGST</td><td class="amount">${money(cgst)}</td></tr>
            <tr><td>SGST</td><td class="amount">${money(sgst)}</td></tr>
            <tr><td>Round Off</td><td class="amount">${money(roundOff)}</td></tr>
            <tr><th>Total Amount</th><th class="amount">${money(totalAmount)}</th></tr>
          </tbody>
        </table>

        <h3>HSN Summary</h3>
        <table>
          <thead>
            <tr>
              <th>HSN</th>
              <th>Taxable Value</th>
              <th>CGST</th>
              <th>SGST</th>
              <th>Total Tax</th>
            </tr>
          </thead>
          <tbody>${hsnRows}</tbody>
        </table>
      </body>
    </html>
  `;
};

const populateInvoice = (query) =>
  query
    .populate(
      "reseller",
      "businessName gstNumber address1 address2 city state"
    )
    .populate("centers", "centerName centerCode")
    .populate(
      "stockRequestIds",
      "orderNumber challanNo date center status invoiceInfo"
    )
    .populate("products.productId", "productTitle hsnCode productCode")
    .populate("createdBy", "fullName email")
    .populate(
      "cancellationDetails.cancelledBy",
      "fullName email"
    );

const validateInvoiceCenterAccess = (stockRequests, access) => {
  for (const request of stockRequests) {
    if (!canAccessCenter(request.center, access)) {
      throw new ApiError(
        403,
        `Access denied for stock request ${request._id}.`
      );
    }
  }
};

const getResellerIdFromCenter = (center) =>
  center?.reseller?._id || center?.reseller || null;

export const createInvoice = async (req) => {
  const access = requireManagePermission(req);

  const {
    stockRequestIds,
    invoiceNumber,
    invoiceDate,
    invoiceData = {},
  } = req.body;

  if (!Array.isArray(stockRequestIds) || stockRequestIds.length === 0) {
    throw new ApiError(400, "Stock request IDs are required.");
  }

  if (!invoiceNumber?.trim()) {
    throw new ApiError(400, "Invoice number is required.");
  }

  if (!stockRequestIds.every((id) => mongoose.isValidObjectId(id))) {
    throw new ApiError(400, "One or more stock request IDs are invalid.");
  }

  const uniqueIds = [...new Set(stockRequestIds.map(String))];

  if (uniqueIds.length !== stockRequestIds.length) {
    throw new ApiError(400, "Duplicate stock request IDs are not allowed.");
  }

  const date = invoiceDate ? new Date(invoiceDate) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, "Invalid invoice date.");
  }

  const session = await mongoose.startSession();
  let createdInvoiceId;

  try {
    await session.withTransaction(async () => {
      const stockRequests = await StockRequest.find({
        _id: { $in: uniqueIds },
      })
        .session(session)
        .populate(
          "center",
          "_id centerName centerCode reseller"
        )
        .populate(
          "products.product",
          "_id productTitle hsnCode salePrice productPrice"
        );

      if (stockRequests.length !== uniqueIds.length) {
        throw new ApiError(404, "One or more stock requests were not found.");
      }

      validateInvoiceCenterAccess(stockRequests, access);

      for (const request of stockRequests) {
        if (request.status !== "Completed") {
          throw new ApiError(
            400,
            `Stock request ${request.orderNumber} must be Completed.`
          );
        }

        if (
          request.invoiceInfo?.invoiceRaised ||
          request.invoiceInfo?.invoiceCancelled
        ) {
          throw new ApiError(
            409,
            `Stock request ${request.orderNumber} is already invoiced or cancelled.`
          );
        }
      }

      const resellerId = getResellerIdFromCenter(
        stockRequests[0].center
      );

      if (!resellerId) {
        throw new ApiError(
          400,
          "The selected stock requests do not have a reseller."
        );
      }

      for (const request of stockRequests) {
        if (
          !sameId(
            getResellerIdFromCenter(request.center),
            resellerId
          )
        ) {
          throw new ApiError(
            400,
            "All stock requests must belong to the same reseller."
          );
        }
      }

      const centers = [
        ...new Map(
          stockRequests.map((request) => [
            String(request.center._id),
            request.center._id,
          ])
        ).values(),
      ];

      const centerNames = [
        ...new Set(
          stockRequests
            .map((request) => request.center?.centerName)
            .filter(Boolean)
        ),
      ].join(", ");

      const reseller = await Reseller.findById(resellerId)
        .session(session)
        .lean();

      if (!reseller) {
        throw new ApiError(404, "Reseller not found.");
      }

      const products = await buildInvoiceProducts(
        invoiceData.products,
        stockRequests,
        session
      );

      if (!products.length) {
        throw new ApiError(
          400,
          "At least one invoice product is required."
        );
      }

      const totalOutletAmount = roundMoney(
        products.reduce((sum, product) => sum + product.outletAmount, 0)
      );

      const totalDamageRepairAmount = roundMoney(
        products.reduce(
          (sum, product) => sum + product.damageRepairAmount,
          0
        )
      );

      const totalCenterReturnAmount = roundMoney(
        products.reduce(
          (sum, product) => sum + product.centerReturnAmount,
          0
        )
      );

      const totalBeforeTax = roundMoney(
        totalOutletAmount +
          totalDamageRepairAmount +
          totalCenterReturnAmount
      );

      /*
       * Uses the same 9% CGST + 9% SGST calculation as the previous
       * service implementation. Confirm the applicable tax rate for
       * your business before production use.
       */
      const cgst = roundMoney(totalBeforeTax * 0.09);
      const sgst = roundMoney(totalBeforeTax * 0.09);

      const unroundedTotal = totalBeforeTax + cgst + sgst;
      const totalAmount = roundMoney(Math.round(unroundedTotal));
      const roundOff = roundMoney(totalAmount - unroundedTotal);

      const hsnSummary = buildHsnSummary(products);
      const metadata = invoiceData.metadata || {};

      const invoiceHtml = generateInvoiceHtml({
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: date,
        reseller,
        centerNames,
        products,
        totalOutletAmount,
        totalDamageRepairAmount,
        totalCenterReturnAmount,
        totalBeforeTax,
        cgst,
        sgst,
        roundOff,
        totalAmount,
        hsnSummary,
        metadata,
      });

      const invoice = new Invoice({
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: date,
        stockRequestIds: stockRequests.map((request) => request._id),
        reseller: resellerId,
        centers,
        products,
        totalOutletAmount,
        totalDamageRepairAmount,
        totalCenterReturnAmount,
        totalBeforeTax,
        cgst,
        sgst,
        roundOff,
        totalAmount,
        metadata,
        hsnSummary,
        invoiceHtml,
        status: "generated",
        createdBy: req.user.id,
        createdAt: new Date(),
      });

      await invoice.save({ session });

      const now = new Date();

      const updateResult = await StockRequest.updateMany(
        {
          _id: { $in: uniqueIds },
          status: "Completed",
          "invoiceInfo.invoiceRaised": { $ne: true },
          "invoiceInfo.invoiceCancelled": { $ne: true },
        },
        {
          $set: {
            "invoiceInfo.invoiceRaised": true,
            "invoiceInfo.invoiceNumber": invoiceNumber.trim(),
            "invoiceInfo.invoiceDate": date,
            "invoiceInfo.invoiceRaisedAt": now,
            "invoiceInfo.invoiceRaisedBy": req.user.id,
            updatedBy: req.user.id,
          },
        },
        { session }
      );

      if (updateResult.matchedCount !== uniqueIds.length) {
        throw new ApiError(
          409,
          "One or more stock requests changed during invoice creation. The transaction has been rolled back."
        );
      }

      createdInvoiceId = invoice._id;
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new ApiError(409, "Invoice number already exists.");
    }

    throw error;
  } finally {
    await session.endSession();
  }

  const savedInvoice = await populateInvoice(
    Invoice.findById(createdInvoiceId)
  );

  if (!savedInvoice) {
    throw new ApiError(
      500,
      "Invoice was created but could not be retrieved."
    );
  }

  return {
    statusCode: 201,
    success: true,
    message: "Invoice created successfully.",
    data: savedInvoice,
  };
};

export const getInvoiceById = async (req) => {
  requireAuthenticatedUser(req);

  const access = getIndentPermissions(req);
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, "Invalid invoice ID.");
  }

  const invoice = await populateInvoice(Invoice.findById(id));

  if (!invoice) {
    throw new ApiError(404, "Invoice not found.");
  }

  if (!access.isSuperAdmin && !access.allCenters) {
    if (!access.ownCenter || !access.centerId) {
      throw new ApiError(403, "Access denied to this invoice.");
    }

    const hasAccess = (invoice.centers || []).some((center) =>
      canAccessCenter(center, access)
    );

    if (!hasAccess) {
      throw new ApiError(403, "Access denied to this invoice.");
    }
  }

  return {
    statusCode: 200,
    success: true,
    data: invoice,
  };
};

export const getAllInvoices = async (req) => {
  requireAuthenticatedUser(req);

  const access = getIndentPermissions(req);

  const {
    page = "1",
    limit = "100",
    startDate,
    endDate,
    resellerId,
    center,
    centerId,
    status,
    cancelWithCreditNote,
    invoiceNumber,
    sortBy = "invoiceDate",
    sortOrder = "desc",
  } = req.query;

  const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const pageSize = Math.min(
    500,
    Math.max(1, Number.parseInt(limit, 10) || 100)
  );

  const filter = {};

  if (startDate || endDate) {
    filter.invoiceDate = {};

    if (startDate) {
      const start = new Date(startDate);

      if (Number.isNaN(start.getTime())) {
        throw new ApiError(400, "Invalid start date.");
      }

      start.setHours(0, 0, 0, 0);
      filter.invoiceDate.$gte = start;
    }

    if (endDate) {
      const end = new Date(endDate);

      if (Number.isNaN(end.getTime())) {
        throw new ApiError(400, "Invalid end date.");
      }

      end.setHours(23, 59, 59, 999);
      filter.invoiceDate.$lte = end;
    }
  }

  if (resellerId) {
    if (!mongoose.isValidObjectId(resellerId)) {
      throw new ApiError(400, "Invalid reseller ID.");
    }

    filter.reseller = resellerId;
  }

  const requestedCenterFilter = center || centerId;

  if (requestedCenterFilter) {
    const centerIds = requestedCenterFilter
      .split(",")
      .map((id) => id.trim());

    if (!centerIds.every((id) => mongoose.isValidObjectId(id))) {
      throw new ApiError(400, "Invalid center ID.");
    }

    filter.centers = { $in: centerIds };
  }

  if (invoiceNumber?.trim()) {
    const escapedInvoiceNumber = invoiceNumber.trim().replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    filter.invoiceNumber = {
      $regex: escapedInvoiceNumber,
      $options: "i",
    };
  }

  if (status === "active") {
    filter.status = { $ne: "cancelled" };
  } else if (status) {
    if (!["generated", "sent", "paid", "cancelled"].includes(status)) {
      throw new ApiError(400, "Invalid invoice status.");
    }

    filter.status = status;
  }

  if (cancelWithCreditNote !== undefined) {
    if (!["true", "false"].includes(cancelWithCreditNote)) {
      throw new ApiError(
        400,
        "cancelWithCreditNote must be true or false."
      );
    }

    filter["cancellationDetails.cancelWithCreditNote"] =
      cancelWithCreditNote === "true";

    if (!filter.status) {
      filter.status = "cancelled";
    }
  }

  if (!access.isSuperAdmin && !access.allCenters) {
    if (!access.ownCenter || !access.centerId) {
      throw new ApiError(
        403,
        "You do not have access to invoice records."
      );
    }

    const selectedCenterId =
      access.centerId._id || access.centerId;

    if (filter.centers?.$in) {
      const requestedIds = filter.centers.$in;

      if (!requestedIds.some((id) => sameId(id, selectedCenterId))) {
        throw new ApiError(
          403,
          "You cannot view invoices for the selected center."
        );
      }
    }

    filter.centers = { $in: [selectedCenterId] };
  }

  const allowedSortFields = [
    "invoiceDate",
    "invoiceNumber",
    "createdAt",
    "totalAmount",
    "status",
  ];

  if (!allowedSortFields.includes(sortBy)) {
    throw new ApiError(400, "Invalid invoice sort field.");
  }

  if (!["asc", "desc"].includes(sortOrder)) {
    throw new ApiError(400, "sortOrder must be asc or desc.");
  }

  const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

  const [totalItems, invoices, amountAggregation] = await Promise.all([
    Invoice.countDocuments(filter),
    populateInvoice(
      Invoice.find(filter)
        .sort(sort)
        .skip((currentPage - 1) * pageSize)
        .limit(pageSize)
    ),
    Invoice.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmount" },
        },
      },
    ]),
  ]);

  const totalPages = Math.ceil(totalItems / pageSize);

  return {
    statusCode: 200,
    success: true,
    data: invoices,
    pagination: {
      currentPage,
      totalPages,
      totalItems,
      itemsPerPage: pageSize,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    },
    summary: {
      totalInvoices: totalItems,
      totalAmount: roundMoney(amountAggregation[0]?.totalAmount || 0),
    },
  };
};

export const cancelInvoice = async (req) => {
  const access = requireManagePermission(req);

  const { invoiceId } = req.params;
  const { cancelReason, cancelWithCreditNote } = req.body;

  if (!mongoose.isValidObjectId(invoiceId)) {
    throw new ApiError(400, "Invalid invoice ID.");
  }

  if (!cancelReason?.trim()) {
    throw new ApiError(400, "Cancellation reason is required.");
  }

  if (typeof cancelWithCreditNote !== "boolean") {
    throw new ApiError(
      400,
      "cancelWithCreditNote must be a boolean."
    );
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const invoice = await Invoice.findById(invoiceId).session(session);

      if (!invoice) {
        throw new ApiError(404, "Invoice not found.");
      }

      if (invoice.status === "cancelled") {
        throw new ApiError(409, "Invoice is already cancelled.");
      }

      const stockRequests = await StockRequest.find({
        _id: { $in: invoice.stockRequestIds },
      })
        .session(session)
        .populate("center", "_id centerName centerCode");

      if (stockRequests.length !== invoice.stockRequestIds.length) {
        throw new ApiError(
          409,
          "Some linked stock requests are missing. Cancellation was not completed."
        );
      }

      validateInvoiceCenterAccess(stockRequests, access);

      for (const request of stockRequests) {
        if (
          request.invoiceInfo?.invoiceNumber &&
          request.invoiceInfo.invoiceNumber !== invoice.invoiceNumber
        ) {
          throw new ApiError(
            409,
            `Stock request ${request._id} is linked to a different invoice.`
          );
        }

        if (!request.invoiceInfo?.invoiceRaised) {
          throw new ApiError(
            409,
            `Stock request ${request._id} is not currently marked as invoiced.`
          );
        }
      }

      const now = new Date();

      invoice.status = "cancelled";
      invoice.cancellationDetails = {
        cancelledAt: now,
        cancelledBy: req.user.id,
        cancelReason: cancelReason.trim(),
        cancelWithCreditNote,
      };
      invoice.updatedAt = now;

      await invoice.save({ session });

      const updateResult = await StockRequest.updateMany(
        {
          _id: { $in: invoice.stockRequestIds },
          "invoiceInfo.invoiceRaised": true,
          "invoiceInfo.invoiceNumber": invoice.invoiceNumber,
        },
        {
          $set: {
            "invoiceInfo.invoiceRaised": false,
            "invoiceInfo.invoiceCancelled": true,
            "invoiceInfo.invoiceCancelledAt": now,
            "invoiceInfo.invoiceCancelledBy": req.user.id,
            "invoiceInfo.invoiceCancellationReason": cancelReason.trim(),
            updatedBy: req.user.id,
          },
        },
        { session }
      );

      if (updateResult.matchedCount !== invoice.stockRequestIds.length) {
        throw new ApiError(
          409,
          "Linked stock requests could not all be updated. Cancellation was rolled back."
        );
      }
    });
  } finally {
    await session.endSession();
  }

  const cancelledInvoice = await populateInvoice(
    Invoice.findById(invoiceId)
  );

  return {
    statusCode: 200,
    success: true,
    message: "Invoice cancelled successfully.",
    data: {
      invoice: cancelledInvoice,
      creditNoteGenerated: false,
      creditNoteRequested: cancelWithCreditNote,
    },
  };
};
