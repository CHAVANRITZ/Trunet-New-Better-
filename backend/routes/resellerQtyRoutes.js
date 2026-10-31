import StockRequest from "../models/StockRequest.js";
import Center from "../models/Center.js";
import mongoose from "mongoose";
import * as XLSX from "xlsx";

const checkStockRequestPermissions = (req, requiredPermissions = []) => {
  const permissions = req.user?.role?.permissions || [];
  const indentModule = permissions.find(
    (item) => item.module === "Indent"
  );

  const modulePermissions = Array.isArray(indentModule?.permissions)
    ? indentModule.permissions
    : [];

  const permissionMap = {
    manage_indent: modulePermissions.includes("manage_indent"),
    indent_all_center: modulePermissions.includes("indent_all_center"),
    indent_own_center: modulePermissions.includes("indent_own_center"),
    delete_indent_all_center: modulePermissions.includes(
      "delete_indent_all_center"
    ),
    delete_indent_own_center: modulePermissions.includes(
      "delete_indent_own_center"
    ),
    stock_transfer_approve_from_outlet: modulePermissions.includes(
      "stock_transfer_approve_from_outlet"
    ),
    complete_indent: modulePermissions.includes("complete_indent"),
  };

  return {
    hasAccess: requiredPermissions.some(
      (permission) => permissionMap[permission]
    ),
    permissions: permissionMap,
    userCenter:
      req.selectedCenterId ||
      req.user?.fullUser?.center?._id ||
      req.user?.fullUser?.center ||
      null,
  };
};

const parseDate = (value, endOfDay = false) => {
  if (!value) return null;

  let date;

  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);

  if (match) {
    const [, day, month, year] = match;
    date = new Date(Number(year), Number(month) - 1, Number(day));

    if (
      date.getFullYear() !== Number(year) ||
      date.getMonth() !== Number(month) - 1 ||
      date.getDate() !== Number(day)
    ) {
      return null;
    }
  } else {
    // Accept ISO dates as well.
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return null;

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
};

const parsePositiveInteger = (value, fallback, maximum = 500) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) return fallback;

  return Math.min(parsed, maximum);
};

export const getResellerForwardedQty = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkStockRequestPermissions(req, [
        "indent_all_center",
        "indent_own_center",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Required Indent permissions are missing.",
      });
    }

    const {
      startDate,
      endDate,
      resellerId,
      center: centerId,
      product: productId,
      search,
    } = req.query;

    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 50);
    const isExport = req.query.export === "true";

    if (isExport && !startDate && !endDate) {
      return res.status(400).json({
        success: false,
        message:
          "Provide startDate and/or endDate when exporting to Excel.",
      });
    }

    for (const [name, value] of [
      ["resellerId", resellerId],
      ["center", centerId],
      ["product", productId],
    ]) {
      if (value && !mongoose.isValidObjectId(value)) {
        return res.status(400).json({
          success: false,
          message: `Invalid ${name}.`,
        });
      }
    }

    const dateFilter = {};

    if (startDate) {
      const start = parseDate(startDate);

      if (!start) {
        return res.status(400).json({
          success: false,
          message: "Invalid startDate. Use DD-MM-YYYY or an ISO date.",
        });
      }

      dateFilter.$gte = start;
    }

    if (endDate) {
      const end = parseDate(endDate, true);

      if (!end) {
        return res.status(400).json({
          success: false,
          message: "Invalid endDate. Use DD-MM-YYYY or an ISO date.",
        });
      }

      dateFilter.$lte = end;
    }

    if (
      dateFilter.$gte &&
      dateFilter.$lte &&
      dateFilter.$gte > dateFilter.$lte
    ) {
      return res.status(400).json({
        success: false,
        message: "startDate cannot be later than endDate.",
      });
    }

    const stockRequestFilter = {};

    if (Object.keys(dateFilter).length) {
      stockRequestFilter.date = dateFilter;
    }

    if (req.query.status) {
      stockRequestFilter.status = req.query.status;
    } else {
      stockRequestFilter.status = "Completed";
    }

    if (productId) {
      stockRequestFilter["products.product"] = productId;
    }

    // Resolve the permitted centers through their reseller relationship.
    const centerFilter = { centerType: "Center" };

    if (centerId) {
      centerFilter._id = centerId;
    }

    if (permissions.indent_own_center && !permissions.indent_all_center) {
      if (!userCenter) {
        return res.status(403).json({
          success: false,
          message: "Your account is not assigned to a center.",
        });
      }

      // Own-center users cannot override their assigned center.
      if (
        centerId &&
        centerId.toString() !== userCenter.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "You cannot view another center's forwarded quantity.",
        });
      }

      centerFilter._id = userCenter;
    }

    const centers = await Center.find(centerFilter)
      .populate("reseller", "businessName name email mobile")
      .select("_id centerName centerCode reseller")
      .lean();

    const centerToReseller = new Map();
    const resellerData = new Map();

    for (const center of centers) {
      if (!center.reseller) continue;

      const reseller = center.reseller;
      const resellerKey = reseller._id.toString();

      if (resellerId && resellerKey !== resellerId) continue;

      const resellerName = reseller.businessName || reseller.name || "";

      centerToReseller.set(center._id.toString(), {
        resellerId: resellerKey,
        resellerName,
        resellerEmail: reseller.email || null,
        resellerMobile: reseller.mobile || null,
        centerName: center.centerName,
        centerCode: center.centerCode,
      });

      if (!resellerData.has(resellerKey)) {
        resellerData.set(resellerKey, {
          resellerId: resellerKey,
          resellerName,
          resellerEmail: reseller.email || null,
          resellerMobile: reseller.mobile || null,
          products: new Map(),
        });
      }
    }

    const centerIds = [...centerToReseller.keys()];

    if (!centerIds.length) {
      return res.status(200).json({
        success: true,
        message: "No centers found for the requested filters.",
        data: [],
        ...(isExport
          ? {}
          : {
              pagination: {
                currentPage: page,
                totalPages: 0,
                totalItems: 0,
                itemsPerPage: limit,
                hasNext: false,
                hasPrev: false,
              },
            }),
      });
    }

    stockRequestFilter.center = {
      $in: centerIds.map((id) => new mongoose.Types.ObjectId(id)),
    };

    const stockRequests = await StockRequest.find(stockRequestFilter)
      .populate("products.product", "productTitle productCode")
      .populate("center", "centerName centerCode")
      .sort({ date: -1 })
      .lean();

    const searchTerm = search?.trim().toLowerCase();

    for (const request of stockRequests) {
      const requestCenterId = request.center?._id?.toString();
      const centerInfo = centerToReseller.get(requestCenterId);

      if (!centerInfo || !Array.isArray(request.products)) continue;

      const reseller = resellerData.get(centerInfo.resellerId);
      if (!reseller) continue;

      for (const item of request.products) {
        const product = item.product;

        if (!product?._id) continue;

        const productKey = product._id.toString();
        const productName = product.productTitle || "Unknown Product";
        const productCode = product.productCode || "";

        const quantity = Number(item.receivedQuantity || 0) ||
          Number(item.approvedQuantity || 0);

        if (quantity <= 0) continue;

        if (
          searchTerm &&
          ![
            centerInfo.resellerName,
            productName,
            productCode,
            centerInfo.centerName,
            centerInfo.centerCode,
          ].some((value) => value?.toLowerCase().includes(searchTerm))
        ) {
          continue;
        }

        if (!reseller.products.has(productKey)) {
          reseller.products.set(productKey, {
            productId: productKey,
            productName,
            productCode,
            totalForwardedQty: 0,
            orderCount: 0,
            centers: new Map(),
          });
        }

        const productData = reseller.products.get(productKey);
        productData.totalForwardedQty += quantity;
        productData.orderCount += 1;

        if (!productData.centers.has(requestCenterId)) {
          productData.centers.set(requestCenterId, {
            centerId: requestCenterId,
            centerName: centerInfo.centerName,
            centerCode: centerInfo.centerCode,
            forwardedQty: 0,
          });
        }

        productData.centers.get(requestCenterId).forwardedQty += quantity;
      }
    }

    const result = [...resellerData.values()]
      .map((reseller) => ({
        resellerId: reseller.resellerId,
        resellerName: reseller.resellerName,
        resellerEmail: reseller.resellerEmail,
        resellerMobile: reseller.resellerMobile,
        products: [...reseller.products.values()]
          .map((product) => ({
            ...product,
            centers: [...product.centers.values()].sort(
              (a, b) => b.forwardedQty - a.forwardedQty
            ),
          }))
          .sort((a, b) => b.totalForwardedQty - a.totalForwardedQty),
      }))
      .filter((reseller) => reseller.products.length > 0);

    if (isExport) {
      const excelData = [];

      for (const reseller of result) {
        for (const product of reseller.products) {
          for (const center of product.centers) {
            excelData.push({
              "Reseller Name": reseller.resellerName,
              "Reseller Email": reseller.resellerEmail || "N/A",
              "Reseller Mobile": reseller.resellerMobile || "N/A",
              "Product Name": product.productName,
              "Product Code": product.productCode,
              "Center Name": center.centerName,
              "Center Code": center.centerCode,
              "Forwarded Quantity": center.forwardedQty,
              "Total Forwarded Qty for Product": product.totalForwardedQty,
              "Order Count": product.orderCount,
              "Status": stockRequestFilter.status || "All",
              "Start Date": startDate || "All",
              "End Date": endDate || "All",
            });
          }
        }
      }

      const summaryData = [
        {
          "Report Generated": new Date().toISOString(),
          "Total Resellers": result.length,
          "Total Product-Center Rows": excelData.length,
          "Total Forwarded Quantity": excelData.reduce(
            (sum, row) => sum + row["Forwarded Quantity"],
            0
          ),
          "Reseller Filter": resellerId || "All",
          "Center Filter": centerId || "All permitted centers",
          "Product Filter": productId || "All",
          "Start Date": startDate || "All",
          "End Date": endDate || "All",
        },
      ];

      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(excelData),
        "Forwarded Quantity"
      );

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(summaryData),
        "Summary"
      );

      const buffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="forwarded_quantity_${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx"`
      );

      return res.status(200).send(buffer);
    }

    const totalItems = result.length;
    const startIndex = (page - 1) * limit;
    const paginatedResult = result.slice(startIndex, startIndex + limit);
    const totalPages = Math.ceil(totalItems / limit);

    return res.status(200).json({
      success: true,
      message: "Resellers forwarded quantity retrieved successfully",
      data:
        resellerId && paginatedResult.length === 1
          ? paginatedResult[0]
          : paginatedResult,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      filters: {
        dateRange: startDate || endDate ? { startDate, endDate } : null,
        status: stockRequestFilter.status || null,
        resellerId: resellerId || null,
        centerId: centerId || null,
        productId: productId || null,
        search: search || null,
      },
    });
  } catch (error) {
    console.error("Get reseller forwarded quantity error:", error);

    return res.status(500).json({
      success: false,
      message: "Error retrieving reseller forwarded quantity",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};