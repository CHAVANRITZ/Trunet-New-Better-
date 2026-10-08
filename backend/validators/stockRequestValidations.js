import { body, param, query } from "express-validator";
import mongoose from "mongoose";

const objectId = (value) =>
  mongoose.Types.ObjectId.isValid(value);

export const validateIdParam = [
  param("id")
    .custom(objectId)
    .withMessage("Invalid stock request ID"),
];

export const validateCreateStockRequest = [
  body("warehouse")
    .notEmpty()
    .withMessage("Warehouse is required")
    .custom(objectId)
    .withMessage("Invalid warehouse ID"),

  body("center")
    .notEmpty()
    .withMessage("Center is required")
    .custom(objectId)
    .withMessage("Invalid center ID"),

  body("orderNumber")
    .trim()
    .notEmpty()
    .withMessage("Order number is required"),

  body("date")
    .optional()
    .isISO8601()
    .withMessage("Invalid date"),

  body("remark")
    .optional()
    .isString()
    .withMessage("Remark must be a string"),

  body("products")
    .isArray({ min: 1 })
    .withMessage("At least one product is required"),

  body("products.*.product")
    .notEmpty()
    .withMessage("Product is required")
    .custom(objectId)
    .withMessage("Invalid product ID"),

  body("products.*.quantity")
    .isInt({ min: 1 })
    .withMessage("Quantity must be at least 1"),
];

export const validateUpdateStockRequest = [
  param("id")
    .custom(objectId)
    .withMessage("Invalid stock request ID"),

  body("orderNumber")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Order number cannot be empty"),

  body("date")
    .optional()
    .isISO8601()
    .withMessage("Invalid date"),

  body("products")
    .optional()
    .isArray()
    .withMessage("Products must be an array"),
];

export const validateStockRequestQuery = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be at least 1"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage("Limit must be between 1 and 500"),

  query("center")
    .optional()
    .custom(objectId)
    .withMessage("Invalid center ID"),

  query("warehouse")
    .optional()
    .custom(objectId)
    .withMessage("Invalid warehouse ID"),

  query("product")
    .optional()
    .custom(objectId)
    .withMessage("Invalid product ID"),

  query("reseller")
    .optional()
    .custom(objectId)
    .withMessage("Invalid reseller ID"),

  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid start date"),

  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid end date"),
];

export const validateApproveStockRequest = [
  param("id")
    .custom(objectId)
    .withMessage("Invalid stock request ID"),

  body("productApprovals")
    .isArray({ min: 1 })
    .withMessage("Product approvals are required"),

  body("productApprovals.*.productId")
    .custom(objectId)
    .withMessage("Invalid product ID"),

  body("productApprovals.*.approvedQuantity")
    .isInt({ min: 0 })
    .withMessage(
      "Approved quantity must be a non-negative integer"
    ),

  body("productApprovals.*.approvedRemark")
    .optional()
    .isString()
    .withMessage("Approved remark must be a string"),

  body("productApprovals.*.approvedSerials")
    .optional()
    .isArray()
    .withMessage("Approved serials must be an array"),
];

export const validateShipStockRequest = [
  param("id")
    .custom(objectId)
    .withMessage("Invalid stock request ID"),

  body("shippedDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid shipped date"),

  body("expectedDeliveryDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid expected delivery date"),

  body("shipmentDetails")
    .optional()
    .isString(),

  body("shipmentRemark")
    .optional()
    .isString(),

  body("documents")
    .optional()
    .isArray(),
];

export const validateCompleteStockRequest = [
  param("id")
    .custom(objectId)
    .withMessage("Invalid stock request ID"),

  body("productReceipts")
    .isArray({ min: 1 })
    .withMessage("Product receipts are required"),

  body("productReceipts.*.productId")
    .custom(objectId)
    .withMessage("Invalid product ID"),

  body("productReceipts.*.receivedQuantity")
    .isInt({ min: 0 })
    .withMessage(
      "Received quantity must be a non-negative integer"
    ),

  body("productReceipts.*.receivedSerials")
    .optional()
    .isArray()
    .withMessage(
      "Received serials must be an array"
    ),
];

export const validateCompleteIncompleteRequest = [
  param("id")
    .custom(objectId)
    .withMessage("Invalid stock request ID"),

  body("productApprovals")
    .isArray({ min: 1 })
    .withMessage("Product approvals are required"),

  body("productApprovals.*.productId")
    .custom(objectId)
    .withMessage("Invalid product ID"),

  body("productApprovals.*.approvedQuantity")
    .isInt({ min: 0 })
    .withMessage(
      "Approved quantity must be a non-negative integer"
    ),
];

export const validateRejectShipment = [
  param("id")
    .custom(objectId)
    .withMessage("Invalid stock request ID"),

  body("rejectionRemark")
    .optional()
    .isString()
    .withMessage(
      "Rejection remark must be a string"
    ),
];

export const validateMarkAsIncomplete = [
  param("id")
    .custom(objectId)
    .withMessage("Invalid stock request ID"),

  body("incompleteRemark")
    .optional()
    .isString()
    .withMessage(
      "Incomplete remark must be a string"
    ),

  body("receivedProducts")
    .isArray()
    .withMessage(
      "receivedProducts must be an array"
    ),

  body("receivedProducts.*.productId")
    .custom(objectId)
    .withMessage("Invalid product ID"),

  body("receivedProducts.*.receivedQuantity")
    .isInt({ min: 0 })
    .withMessage(
      "Received quantity must be a non-negative integer"
    ),

  body("receivedProducts.*.receivedSerials")
    .optional()
    .isArray()
    .withMessage(
      "Received serials must be an array"
    ),
];

export const validateUpdateShippingInfo = [
  param("id")
    .custom(objectId)
    .withMessage("Invalid stock request ID"),

  body("shippedDate")
    .optional()
    .isISO8601(),

  body("expectedDeliveryDate")
    .optional()
    .isISO8601(),

  body("shipmentDetails")
    .optional()
    .isString(),

  body("shipmentRemark")
    .optional()
    .isString(),

  body("documents")
    .optional()
    .isArray(),
];

export const validateUpdateApprovedQuantities = [
  param("id")
    .custom(objectId)
    .withMessage("Invalid stock request ID"),

  body("productApprovals")
    .isArray({ min: 1 })
    .withMessage("Product approvals are required"),

  body("productApprovals.*.productId")
    .custom(objectId)
    .withMessage("Invalid product ID"),

  body("productApprovals.*.approvedQuantity")
    .isInt({ min: 0 })
    .withMessage(
      "Approved quantity must be a non-negative integer"
    ),
];