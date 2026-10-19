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
  console.log("\n========== DEBUG: getResellerForwardedQty START ==========");
  console.log("[ForwardedQty] URL:", req.originalUrl);
  console.log("[ForwardedQty] Method:", req.method);
  console.log("[ForwardedQty] Query:", JSON.stringify(req.query, null, 2));
  console.log("[ForwardedQty] User ID:", req.user?.id);
  console.log("[ForwardedQty] Selected center:", req.selectedCenterId);

  try {
    const { hasAccess, permissions, userCenter } =
      checkStockRequestPermissions(req, [
        "indent_all_center",
        "indent_own_center",
      ]);

    console.log("[ForwardedQty] Permission check:", {
      hasAccess,
      permissions,
      userCenter,
    });

    if (!hasAccess) {
      console.error("[ForwardedQty] STOP: Missing Indent permissions");

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

    console.log("[ForwardedQty] Extracted ID parameters:", {
      resellerId,
      centerId,
      productId,
      types: {
        resellerId: typeof resellerId,
        centerId: typeof centerId,
        productId: typeof productId,
      },
    });

    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(req.query.limit, 50);
    const isExport = req.query.export === "true";

    console.log("[ForwardedQty] Pagination/export:", {
      page,
      limit,
      isExport,
    });

    if (isExport && !startDate && !endDate) {
      console.error("[ForwardedQty] STOP: Export requested without dates");

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
      console.log(`[ForwardedQty] Validating ${name}:`, {
        value,
        isPresent: Boolean(value),
        isValid: value ? mongoose.isValidObjectId(value) : "not supplied",
      });

      if (value && !mongoose.isValidObjectId(value)) {
        console.error(`[ForwardedQty] STOP: Invalid ${name}`, value);

        return res.status(400).json({
          success: false,
          message: `Invalid ${name}.`,
        });
      }
    }

    const dateFilter = {};

    if (startDate) {
      const start = parseDate(startDate);

      console.log("[ForwardedQty] Parsed startDate:", start);

      if (!start) {
        console.error("[ForwardedQty] STOP: Invalid startDate", startDate);

        return res.status(400).json({
          success: false,
          message: "Invalid startDate. Use DD-MM-YYYY or an ISO date.",
        });
      }

      dateFilter.$gte = start;
    }

    if (endDate) {
      const end = parseDate(endDate, true);

      console.log("[ForwardedQty] Parsed endDate:", end);

      if (!end) {
        console.error("[ForwardedQty] STOP: Invalid endDate", endDate);

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
      console.error("[ForwardedQty] STOP: startDate is after endDate");

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

    console.log("[ForwardedQty] Initial stock request filter:",
      JSON.stringify(stockRequestFilter, null, 2)
    );

    // Resolve the permitted centers through their reseller relationship.
    const centerFilter = { centerType: "Center" };

    if (centerId) {
      centerFilter._id = centerId;
    }

    if (permissions.indent_own_center && !permissions.indent_all_center) {
      if (!userCenter) {
        console.error("[ForwardedQty] STOP: User has no assigned center");

        return res.status(403).json({
          success: false,
          message: "Your account is not assigned to a center.",
        });
      }

      if (
        centerId &&
        centerId.toString() !== userCenter.toString()
      ) {
        console.error("[ForwardedQty] STOP: Requested center differs from assigned center", {
          requestedCenter: centerId,
          assignedCenter: userCenter,
        });

        return res.status(403).json({
          success: false,
          message: "You cannot view another center's forwarded quantity.",
        });
      }

      centerFilter._id = userCenter;
    }

    console.log("[ForwardedQty] MongoDB center filter:",
      JSON.stringify(centerFilter, null, 2)
    );

    const centers = await Center.find(centerFilter)
      .populate("reseller", "businessName name email mobile")
      .select("_id centerName centerCode reseller")
      .lean();

    console.log("[ForwardedQty] Centers found:", centers.length);
    console.log(
      "[ForwardedQty] Center/reseller mappings:",
      centers.map((center) => ({
        centerId: center._id?.toString(),
        centerName: center.centerName,
        resellerId: center.reseller?._id?.toString() || null,
        resellerName:
          center.reseller?.businessName || center.reseller?.name || null,
      }))
    );

    const centerToReseller = new Map();
    const resellerData = new Map();

    for (const center of centers) {
      if (!center.reseller) {
        console.warn(
          "[ForwardedQty] Skipping center without reseller:",
          center._id?.toString()
        );
        continue;
      }

      const reseller = center.reseller;
      const resellerKey = reseller._id.toString();

      if (resellerId && resellerKey !== resellerId) {
        console.log("[ForwardedQty] Skipping center: reseller filter mismatch", {
          centerId: center._id.toString(),
          actualResellerId: resellerKey,
          requestedResellerId: resellerId,
        });
        continue;
      }

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

    console.log("[ForwardedQty] Eligible center IDs:", centerIds);
    console.log("[ForwardedQty] Eligible reseller count:", resellerData.size);

    if (!centerIds.length) {
      console.warn("[ForwardedQty] No eligible centers found");

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

    console.log("[ForwardedQty] Final stock request filter:",
      JSON.stringify(stockRequestFilter, null, 2)
    );

    const stockRequests = await StockRequest.find(stockRequestFilter)
      .populate("products.product", "productTitle productCode")
      .populate("center", "centerName centerCode")
      .sort({ date: -1 })
      .lean();

    console.log("[ForwardedQty] Stock requests found:", stockRequests.length);

    const searchTerm = search?.trim().toLowerCase();

    for (const request of stockRequests) {
      const requestCenterId = request.center?._id?.toString();
      const centerInfo = centerToReseller.get(requestCenterId);

      if (!centerInfo || !Array.isArray(request.products)) {
        console.log("[ForwardedQty] Skipping request:", {
          requestId: request._id?.toString(),
          requestCenterId,
          hasCenterMapping: Boolean(centerInfo),
          productsIsArray: Array.isArray(request.products),
        });
        continue;
      }

      const reseller = resellerData.get(centerInfo.resellerId);
      if (!reseller) continue;

      for (const item of request.products) {
        const product = item.product;
        if (!product?._id) continue;

        const productKey = product._id.toString();
        const productName = product.productTitle || "Unknown Product";
        const productCode = product.productCode || "";

        const quantity =
          Number(item.receivedQuantity || 0) ||
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

    console.log("[ForwardedQty] Final reseller count:", result.length);
    console.log(
      "[ForwardedQty] Result summary:",
      result.map((reseller) => ({
        resellerId: reseller.resellerId,
        resellerName: reseller.resellerName,
        productCount: reseller.products.length,
      }))
    );

    // Keep your existing Excel export block here unchanged.

    const totalItems = result.length;
    const startIndex = (page - 1) * limit;
    const paginatedResult = result.slice(startIndex, startIndex + limit);
    const totalPages = Math.ceil(totalItems / limit);

    console.log("[ForwardedQty] Pagination:", {
      totalItems,
      page,
      limit,
      totalPages,
      returnedItems: paginatedResult.length,
    });

    console.log("========== DEBUG: getResellerForwardedQty SUCCESS ==========\n");

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
        status: stockRequestFilter.status || "All",
        resellerId: resellerId || null,
        centerId: centerId || null,
        productId: productId || null,
        search: search || null,
      },
    });
  } catch (error) {
    console.error("[ForwardedQty] ERROR:", error);
    console.error("[ForwardedQty] Stack:", error.stack);
    console.error("========== DEBUG: getResellerForwardedQty FAILED ==========\n");

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
