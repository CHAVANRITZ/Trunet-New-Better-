import { body, param, query } from "express-validator";

/**
 * Validates Stock Purchase ID.
 */
export const stockPurchaseIdValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid stock purchase ID."),
];

/**
 * Validates data required to create a Stock Purchase.
 */
export const createStockPurchaseValidator = [
    body("type")
        .notEmpty()
        .withMessage("Purchase type is required.")
        .isIn(["new", "refurbish"])
        .withMessage("Purchase type must be either new or refurbish."),

    body("date")
        .optional()
        .isISO8601()
        .withMessage("Please provide a valid purchase date."),

    body("invoiceNo")
        .notEmpty()
        .withMessage("Invoice number is required.")
        .trim(),

    body("vendor")
        .notEmpty()
        .withMessage("Vendor is required.")
        .isMongoId()
        .withMessage("Invalid vendor ID."),

    body("outlet")
        .optional({ values: "falsy" })
        .isMongoId()
        .withMessage("Invalid outlet ID."),

    body("transportAmount")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Transport amount cannot be negative."),

    body("remark")
        .optional()
        .isString()
        .withMessage("Remark must be a string."),

    body("cgst")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("CGST cannot be negative."),

    body("sgst")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("SGST cannot be negative."),

    body("igst")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("IGST cannot be negative."),

    body("products")
        .isArray({ min: 1 })
        .withMessage("At least one product is required."),

    body("products.*.product")
        .notEmpty()
        .withMessage("Product is required.")
        .isMongoId()
        .withMessage("Invalid product ID."),

    body("products.*.price")
        .notEmpty()
        .withMessage("Product price is required.")
        .isFloat({ min: 0 })
        .withMessage("Product price cannot be negative."),

    body("products.*.purchasedQuantity")
        .notEmpty()
        .withMessage("Purchased quantity is required.")
        .isInt({ min: 1 })
        .withMessage("Purchased quantity must be at least 1."),

    body("products.*.serialNumbers")
        .optional()
        .isArray()
        .withMessage("Serial numbers must be an array."),

    body("products.*.serialNumbers.*.serialNumber")
        .optional()
        .isString()
        .trim()
        .notEmpty()
        .withMessage("Serial number cannot be empty."),
];

/**
 * Validates data supplied while updating a Stock Purchase.
 *
 * The legacy API supports updating an existing purchase,
 * so fields remain optional here.
 */
export const updateStockPurchaseValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid stock purchase ID."),

    body("type")
        .optional()
        .isIn(["new", "refurbish"])
        .withMessage("Purchase type must be either new or refurbish."),

    body("date")
        .optional()
        .isISO8601()
        .withMessage("Please provide a valid purchase date."),

    body("invoiceNo")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("Invoice number cannot be empty."),

    body("vendor")
        .optional()
        .isMongoId()
        .withMessage("Invalid vendor ID."),

    body("outlet")
        .optional()
        .isMongoId()
        .withMessage("Invalid outlet ID."),

    body("transportAmount")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Transport amount cannot be negative."),

    body("remark")
        .optional()
        .isString()
        .withMessage("Remark must be a string."),

    body("cgst")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("CGST cannot be negative."),

    body("sgst")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("SGST cannot be negative."),

    body("igst")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("IGST cannot be negative."),

    body("products")
        .optional()
        .isArray({ min: 1 })
        .withMessage("Products must contain at least one product."),

    body("products.*.product")
        .optional()
        .isMongoId()
        .withMessage("Invalid product ID."),

    body("products.*.price")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Product price cannot be negative."),

    body("products.*.purchasedQuantity")
        .optional()
        .isInt({ min: 1 })
        .withMessage("Purchased quantity must be at least 1."),

    body("products.*.serialNumbers")
        .optional()
        .isArray()
        .withMessage("Serial numbers must be an array."),

    body("products.*.serialNumbers.*.serialNumber")
        .optional()
        .isString()
        .trim()
        .notEmpty()
        .withMessage("Serial number cannot be empty."),
];

/**
 * Validates Stock Purchase listing query parameters.
 */
export const getStockPurchasesValidator = [
    query("page")
        .optional()
        .isInt({ min: 1 })
        .withMessage("Page must be a positive integer."),

    query("limit")
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage("Limit must be between 1 and 100."),

    query("type")
        .optional()
        .isIn(["new", "refurbish"])
        .withMessage("Invalid purchase type."),

    query("vendor")
        .optional()
        .isMongoId()
        .withMessage("Invalid vendor ID."),

    query("outlet")
        .optional()
        .isMongoId()
        .withMessage("Invalid outlet ID."),

    query("startDate")
        .optional()
        .isISO8601()
        .withMessage("Invalid start date."),

    query("endDate")
        .optional()
        .isISO8601()
        .withMessage("Invalid end date."),

    query("sortBy")
        .optional()
        .isString()
        .withMessage("sortBy must be a string."),

    query("sortOrder")
        .optional()
        .isIn(["asc", "desc", "1", "-1"])
        .withMessage("sortOrder must be asc, desc, 1, or -1."),

    query("search")
        .optional()
        .isString()
        .withMessage("Search must be a string."),
];

/**
 * Validates vendor parameter.
 */
export const vendorIdValidator = [
    param("vendorId")
        .isMongoId()
        .withMessage("Invalid vendor ID."),
];

/**
 * Validates product stock availability parameters.
 */
export const stockAvailabilityValidator = [
    param("productId")
        .isMongoId()
        .withMessage("Invalid product ID."),
];

/**
 * Validates product listing query parameters.
 */
export const productQueryValidator = [
    query("page")
        .optional()
        .isInt({ min: 1 })
        .withMessage("Page must be a positive integer."),

    query("limit")
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage("Limit must be between 1 and 100."),

    query("search")
        .optional()
        .isString()
        .withMessage("Search must be a string."),
];