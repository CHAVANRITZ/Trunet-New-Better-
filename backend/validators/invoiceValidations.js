
import { body, param, query } from "express-validator";
import mongoose from "mongoose";

const isValidObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value);

const optionalObjectId = (value) =>
  value === undefined ||
  value === null ||
  value === "" ||
  isValidObjectId(value);

export const markAsInvoicedValidator = [
  body("stockRequestIds")
    .isArray({ min: 1 })
    .withMessage("At least one stock request ID is required"),

  body("stockRequestIds.*")
    .custom(isValidObjectId)
    .withMessage("Invalid stock request ID"),

  body("invoiceNumber")
    .trim()
    .notEmpty()
    .withMessage("Invoice number is required"),

  body("invoiceDate")
    .optional({ values: "null" })
    .isISO8601()
    .withMessage("Invalid invoice date"),

  body("invoiceData")
    .optional()
    .isObject()
    .withMessage("Invoice data must be an object"),

  body("invoiceData.reseller")
    .optional({ values: "null" })
    .custom(optionalObjectId)
    .withMessage("Invalid reseller ID"),

  body("invoiceData.centers")
    .optional()
    .isArray()
    .withMessage("Centers must be an array"),

  body("invoiceData.centers.*")
    .optional()
    .custom(optionalObjectId)
    .withMessage("Invalid center ID"),

  body("invoiceData.products")
    .optional()
    .isArray()
    .withMessage("Products must be an array"),

  body("invoiceData.products.*.productId")
    .optional({ values: "null" })
    .custom(optionalObjectId)
    .withMessage("Invalid product ID"),

  body("invoiceData.products.*.quantity")
    .optional({ values: "null" })
    .isFloat({ min: 0 })
    .withMessage("Quantity must be a non-negative number"),

  body("invoiceData.products.*.outletQty")
    .optional({ values: "null" })
    .isFloat({ min: 0 })
    .withMessage("Outlet quantity must be non-negative"),

  body("invoiceData.products.*.damageRepairQty")
    .optional({ values: "null" })
    .isFloat({ min: 0 })
    .withMessage("Damage repair quantity must be non-negative"),

  body("invoiceData.products.*.centerReturnQty")
    .optional({ values: "null" })
    .isFloat({ min: 0 })
    .withMessage("Center return quantity must be non-negative"),

  body("invoiceData.products.*.outletRate")
    .optional({ values: "null" })
    .isFloat({ min: 0 })
    .withMessage("Outlet rate must be non-negative"),

  body("invoiceData.products.*.repairRate")
    .optional({ values: "null" })
    .isFloat({ min: 0 })
    .withMessage("Repair rate must be non-negative"),

  body("invoiceData.products.*.centerReturnRate")
    .optional({ values: "null" })
    .isFloat({ min: 0 })
    .withMessage("Center return rate must be non-negative"),

  body("invoiceData.metadata")
    .optional()
    .isObject()
    .withMessage("Invoice metadata must be an object")
];

export const getInvoiceValidator = [
  param("id")
    .custom(isValidObjectId)
    .withMessage("Invalid invoice ID")
];

export const cancelInvoiceValidator = [
  param("invoiceId")
    .custom(isValidObjectId)
    .withMessage("Invalid invoice ID"),

  body("cancelReason")
    .trim()
    .notEmpty()
    .withMessage("Cancellation reason is required"),

  body("cancelWithCreditNote")
    .isBoolean()
    .withMessage("cancelWithCreditNote must be a boolean")
];

export const getAllInvoicesValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage("Limit must be between 1 and 500"),

  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid start date"),

  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("Invalid end date"),

  query("resellerId")
    .optional()
    .custom(isValidObjectId)
    .withMessage("Invalid reseller ID"),

  query("center")
    .optional()
    .custom((value) =>
      value
        .split(",")
        .every((id) => isValidObjectId(id.trim()))
    )
    .withMessage("Invalid center ID"),

  query("centerId")
    .optional()
    .custom((value) =>
      value
        .split(",")
        .every((id) => isValidObjectId(id.trim()))
    )
    .withMessage("Invalid center ID"),

  query("status")
    .optional()
    .isIn(["generated", "sent", "paid", "cancelled"])
    .withMessage("Invalid invoice status"),

  query("cancelWithCreditNote")
    .optional()
    .isIn(["true", "false"])
    .withMessage("cancelWithCreditNote must be true or false"),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("sortOrder must be asc or desc")
];
