import mongoose from "mongoose";
import ResellerStock from "../models/ResellerStock.js";
import Reseller from "../models/Reseller.js";
import Product from "../models/Product.js";
import Center from "../models/Center.js";
import ProductCategory from "../models/ProductCategory.js";
import User from "../models/User.js";
import XLSX from "xlsx";

/**
 * Get authenticated user ID for the new backend.
 */
const getUserId = (req) => {
  return req.user?.id || req.user?.fullUser?._id?.toString() || null;
};

/**
 * Resolve the user's center using the new auth structure.
 */
const getUserCenterId = (req) => {
  return (
    req.selectedCenterId ||
    req.user?.fullUser?.center?._id ||
    req.user?.fullUser?.center ||
    null
  );
};

/**
 * Check Available Stock module permissions.
 */
const checkResellerStockPermissions = (req, requiredPermissions = []) => {
  if (!req.user) {
    return {
      hasAccess: false,
      permissions: {},
      userCenter: null,
    };
  }

  const rolePermissions = req.user.role?.permissions || [];

  const availableStockModule = rolePermissions.find(
    (module) => module.module === "Available Stock"
  );

  const permissionList = availableStockModule?.permissions || [];

  const permissions = {
    available_stock_own_center: permissionList.includes(
      "available_stock_own_center"
    ),
    available_stock_all_center: permissionList.includes(
      "available_stock_all_center"
    ),
  };

  const hasAccess = requiredPermissions.some(
    (permission) => permissions[permission] === true
  );

  return {
    hasAccess,
    permissions,
    userCenter: getUserCenterId(req),
  };
};

/**
 * Normalize one or multiple IDs from query parameters.
 */
const buildArrayFilter = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const values = Array.isArray(value)
    ? value
    : String(value).split(",");

  const normalizedValues = values
    .map((item) => String(item).trim())
    .filter(Boolean);

  if (!normalizedValues.length) {
    return null;
  }

  const ids = normalizedValues.map((item) =>
    mongoose.Types.ObjectId.isValid(item) &&
    String(new mongoose.Types.ObjectId(item)) === item
      ? new mongoose.Types.ObjectId(item)
      : item
  );

  return ids.length === 1 ? ids[0] : { $in: ids };
};

/**
 * Resolve a product category by ID, name, or code.
 */
const getCategoryId = async (categoryParam) => {
  if (!categoryParam) return null;

  if (mongoose.Types.ObjectId.isValid(categoryParam)) {
    return new mongoose.Types.ObjectId(categoryParam);
  }

  const escapedCategory = String(categoryParam).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

  const category = await ProductCategory.findOne({
    $or: [
      {
        productCategory: {
          $regex: new RegExp(`^${escapedCategory}$`, "i"),
        },
      },
      {
        categoryCode: {
          $regex: new RegExp(`^${escapedCategory}$`, "i"),
        },
      },
    ],
  })
    .select("_id")
    .lean();

  return category?._id || null;
};

/**
 * Get the reseller associated with a center.
 */
const getResellerFromCenter = async (centerId) => {
  if (!centerId || !mongoose.Types.ObjectId.isValid(centerId)) {
    return null;
  }

  const center = await Center.findById(centerId)
    .select("reseller")
    .lean();

  return center?.reseller || null;
};

/**
 * Standard controller error handler.
 */
const handleControllerError = (error, res) => {
  console.error("Reseller stock controller error:", error);

  if (
    error.name === "ValidationError" ||
    error.name === "CastError" ||
    error instanceof mongoose.Error
  ) {
    return res.status(400).json({
      success: false,
      message:
        error.name === "ValidationError"
          ? "Validation error"
          : "Invalid ID or request data",
      ...(error.name === "ValidationError"
        ? {
            errors: Object.values(error.errors).map(
              (item) => item.message
            ),
          }
        : {}),
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
    ...(process.env.NODE_ENV === "development"
      ? { error: error.message }
      : {}),
  });
};

/**
 * Build a reseller stock filter with center-level access restrictions.
 */
const buildResellerStockFilter = async (
  query,
  permissions,
  userCenter
) => {
  const {
    resellerId,
    reseller,
    product,
    centerId,
    center,
    forCenter,
  } = query;

  const filter = {};

  // Own-center users may only access their own center's reseller.
  if (
    permissions.available_stock_own_center &&
    !permissions.available_stock_all_center
  ) {
    if (!userCenter) {
      return { noAccess: true };
    }

    const ownResellerId = await getResellerFromCenter(userCenter);

    if (!ownResellerId) {
      return { noAccess: true };
    }

    filter.reseller = ownResellerId;
  }

  // Optional reseller filter.
  if (resellerId || reseller) {
    const requestedReseller = buildArrayFilter(resellerId || reseller);

    if (requestedReseller) {
      if (
        filter.reseller &&
        requestedReseller.toString?.() &&
        filter.reseller.toString() !== requestedReseller.toString()
      ) {
        // Do not allow a requested reseller to override own-center scope.
        if (
          permissions.available_stock_own_center &&
          !permissions.available_stock_all_center
        ) {
          return { noAccess: true };
        }
      }

      filter.reseller = requestedReseller;
    }
  }

  // Optional center filter: resolve center to its reseller.
  if (centerId || center || forCenter) {
    const requestedCenter = buildArrayFilter(
      forCenter || centerId || center
    );

    const requestedCenterId =
      requestedCenter && requestedCenter.$in
        ? requestedCenter.$in[0]
        : requestedCenter;

    if (
      requestedCenterId &&
      permissions.available_stock_own_center &&
      !permissions.available_stock_all_center &&
      requestedCenterId.toString() !== userCenter?.toString()
    ) {
      return { noAccess: true };
    }

    if (requestedCenterId) {
      const centerResellerId =
        await getResellerFromCenter(requestedCenterId);

      if (!centerResellerId) {
        return { noAccess: true };
      }

      if (
        filter.reseller &&
        filter.reseller.toString() !== centerResellerId.toString()
      ) {
        return { noAccess: true };
      }

      filter.reseller = centerResellerId;
    }
  }

  // Optional product filter.
  const productFilter = buildArrayFilter(product);

  if (productFilter) {
    filter.product = productFilter;
  }

  return filter;
};

export const getResellerStockList = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkResellerStockPermissions(req, [
        "available_stock_own_center",
        "available_stock_all_center",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied to reseller stock.",
      });
    }

    const filter = await buildResellerStockFilter(
      req.query,
      permissions,
      userCenter
    );

    if (filter.noAccess) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this reseller's stock.",
      });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100
    );

    const [stock, totalItems] = await Promise.all([
      ResellerStock.find(filter)
        .populate("reseller", "businessName")
        .populate(
          "product",
          "productTitle productCode productPrice productCategory trackSerialNumber"
        )
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ResellerStock.countDocuments(filter),
    ]);

    let center = null;

    if (userCenter && mongoose.Types.ObjectId.isValid(userCenter)) {
      center = await Center.findById(userCenter)
        .select("_id centerName centerCode centerType reseller")
        .lean();
    }

    const formattedStock = stock.map((item) => ({
      ...item,
      productName: item.product?.productTitle || "",
      productCode: item.product?.productCode || "",
      resellerName: item.reseller?.businessName || "",
    }));

    return res.status(200).json({
      success: true,
      message: "Reseller stock retrieved successfully.",
      data: {
        stock: formattedStock,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalItems / limit),
          totalItems,
          itemsPerPage: limit,
          hasNext: page < Math.ceil(totalItems / limit),
          hasPrev: page > 1,
        },
        center,
      },
    });
  } catch (error) {
    return handleControllerError(error, res);
  }
};
