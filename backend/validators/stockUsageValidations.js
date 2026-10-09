import { body, param, query, validationResult } from "express-validator";
import mongoose from "mongoose";

const isValidObjectId = (value) =>
  !value || mongoose.Types.ObjectId.isValid(value);

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
        value: err.value,
      })),
    });
  }

  next();
};

export const validateCreateStockUsage = [
  body("date")
    .optional()
    .isISO8601()
    .withMessage("Date must be a valid ISO 8601 date"),

  body("usageType")
    .notEmpty()
    .withMessage("Usage type is required")
    .isIn([
      "Customer",
      "Building",
      "Control Room",
      "Damage",
      "Damage Return",
    ])
    .withMessage("Invalid usage type"),

  body("center")
    .notEmpty()
    .withMessage("Center ID is required")
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("Invalid center ID"),

  body("customer")
    .optional({ nullable: true })
    .custom(isValidObjectId)
    .withMessage("Invalid customer ID"),

  body("building")
    .optional({ nullable: true })
    .custom(isValidObjectId)
    .withMessage("Invalid building ID"),

  body("controlRoom")
    .optional({ nullable: true })
    .custom(isValidObjectId)
    .withMessage("Invalid control room ID"),

  body("items")
    .isArray({ min: 1 })
    .withMessage("At least one item is required"),

  body("items.*.product")
    .notEmpty()
    .withMessage("Product ID is required for each item")
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("Invalid product ID"),

  body("items.*.quantity")
    .notEmpty()
    .withMessage("Quantity is required for each item")
    .isInt({ min: 1 })
    .withMessage("Quantity must be a positive integer"),

  body("items.*.serialNumbers")
    .optional()
    .isArray()
    .withMessage("Serial numbers must be an array"),

  body("reason")
    .optional()
    .isString()
    .withMessage("Reason must be a string")
    .isLength({ max: 500 })
    .withMessage("Reason cannot exceed 500 characters"),

  body("remark")
    .optional()
    .isString()
    .withMessage("Remark must be a string")
    .isLength({ max: 500 })
    .withMessage("Remark cannot exceed 500 characters"),

  handleValidationErrors,
];

export const validateUpdateStockUsage = [
  param("id")
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("Invalid stock usage ID"),

  body("date")
    .optional()
    .isISO8601()
    .withMessage("Date must be a valid ISO 8601 date"),

  body("usageType")
    .optional()
    .isIn([
      "Customer",
      "Building",
      "Control Room",
      "Damage",
      "Damage Return",
    ])
    .withMessage("Invalid usage type"),

  body("center")
    .optional()
    .custom(isValidObjectId)
    .withMessage("Invalid center ID"),

  body("items")
    .optional()
    .isArray({ min: 1 })
    .withMessage("Items must be a non-empty array"),

  body("items.*.product")
    .if(body("items").exists())
    .notEmpty()
    .withMessage("Product ID is required for each item")
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("Invalid product ID"),

  body("items.*.quantity")
    .if(body("items").exists())
    .notEmpty()
    .withMessage("Quantity is required for each item")
    .isInt({ min: 1 })
    .withMessage("Quantity must be a positive integer"),

  handleValidationErrors,
];

export const validateStockUsageId = [
  param("id")
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("Invalid stock usage ID"),

  handleValidationErrors,
];

export const validateDamageReturnApproval = [
  param("id")
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("Invalid stock usage ID"),

  body("remark")
    .optional()
    .isString()
    .withMessage("Remark must be a string")
    .isLength({ max: 500 })
    .withMessage("Remark cannot exceed 500 characters"),

  handleValidationErrors,
];

export const validateCheckRevertEligibility = [
  param("id")
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("Invalid stock usage ID"),

  handleValidationErrors,
];

export const validateRevertDamage = [
  param("id")
    .custom((value) => mongoose.Types.ObjectId.isValid(value))
    .withMessage("Invalid stock usage ID"),

  body("revertRemark")
    .optional()
    .isString()
    .withMessage("Revert remark must be a string")
    .isLength({ max: 500 })
    .withMessage("Revert remark cannot exceed 500 characters"),

  handleValidationErrors,
];

export const validateStockUsageQuery = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),

  query("usageType")
    .optional()
    .isString()
    .withMessage("Usage type must be a string"),

  query("status")
    .optional()
    .isString()
    .withMessage("Status must be a string"),

  query("center")
    .optional()
    .custom(isValidObjectId)
    .withMessage("Invalid center ID"),

  handleValidationErrors,
];