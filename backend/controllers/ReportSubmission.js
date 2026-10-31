import StockClosing from "../models/StockClosing.js";
import mongoose from "mongoose";
import Center from "../models/Center.js";
import { getMonthsBetweenDates, getCurrentMonthInfo } from "../utils/dateHelper.js";

// Resolve the authenticated user's center using new auth middleware.
const getUserCenterId = (req) => {
  return (
    req.selectedCenterId ||
    req.user?.fullUser?.center?._id ||
    req.user?.fullUser?.center ||
    null
  );
};

// Resolve authenticated user ID.
const getAuthenticatedUserId = (req) => {
  return req.user?.id || req.user?.fullUser?._id || null;
};

// Check Closing module permissions.
const checkStockClosingPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user?.role?.permissions || [];

  const closingModule = userPermissions.find(
    (permission) => permission.module === "Closing"
  );

  const modulePermissions = closingModule?.permissions || [];

  const permissions = {
    manage_closing_stock_own_center: modulePermissions.includes(
      "manage_closing_stock_own_center"
    ),
    manage_closing_stock_all_center: modulePermissions.includes(
      "manage_closing_stock_all_center"
    ),
    view_closing_stock_own_center: modulePermissions.includes(
      "view_closing_stock_own_center"
    ),
    view_closing_stock_all_center: modulePermissions.includes(
      "view_closing_stock_all_center"
    ),
    change_closing_qty: modulePermissions.includes("change_closing_qty"),
  };

  return {
    hasAccess: requiredPermissions.some(
      (permission) => permissions[permission] === true
    ),
    permissions,
    userCenter: getUserCenterId(req),
  };
};

// Standard controller error handler.
const handleControllerError = (error, res) => {
  console.error("Stock closing controller error:", error);

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

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Duplicate entry found",
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

const isValidObjectId = (value) =>
  Boolean(value) && mongoose.Types.ObjectId.isValid(value);

const getCenterObjectId = (req) => {
  const centerId = getUserCenterId(req);

  if (!centerId || !isValidObjectId(centerId)) {
    return null;
  }

  return new mongoose.Types.ObjectId(centerId);
};

// Enforce center scope for read/update/delete operations.
const buildCenterAccessFilter = (permissions, userCenter) => {
  if (
    permissions.view_closing_stock_own_center &&
    !permissions.view_closing_stock_all_center
  ) {
    if (!userCenter) {
      return null;
    }

    return {
      $or: [
        { closingCenter: userCenter },
        { center: userCenter },
      ],
    };
  }

  return {};
};