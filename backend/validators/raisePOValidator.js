import { body, param, query } from "express-validator";

/**
 * Validates Raise PO ID.
 */
export const raisePOIdValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid Raise PO ID."),
];

/**
 * Validates Raise PO creation.
 */
export const createRaisePOValidator = [
    body("date")
        .optional({ values: "falsy" })
        .isISO8601()
        .withMessage("Invalid date."),

    body("vendor")
        .notEmpty()
        .withMessage("Vendor is required.")
        .isMongoId()
        .withMessage("Invalid vendor ID."),

    body("outlet")
        .optional({ values: "falsy" })
        .isMongoId()
        .withMessage("Invalid outlet ID."),

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
        .withMessage("Price is required.")
        .isFloat({ min: 0 })
        .withMessage("Price must be greater than or equal to 0."),

    body("products.*.purchasedQuantity")
        .notEmpty()
        .withMessage("Purchased quantity is required.")
        .isInt({ min: 1 })
        .withMessage("Purchased quantity must be at least 1."),
];

/**
 * Validates Raise PO listing query parameters.
 */
export const getRaisePOValidator = [
    query("page")
        .optional()
        .isInt({ min: 1 })
        .withMessage("Page must be a positive integer."),

    query("limit")
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage("Limit must be between 1 and 100."),

    query("outlet")
        .optional({ values: "falsy" })
        .isMongoId()
        .withMessage("Invalid outlet ID."),

    query("vendor")
        .optional({ values: "falsy" })
        .isMongoId()
        .withMessage("Invalid vendor ID."),

    query("startDate")
        .optional({ values: "falsy" })
        .isISO8601()
        .withMessage("Invalid start date."),

    query("endDate")
        .optional({ values: "falsy" })
        .isISO8601()
        .withMessage("Invalid end date."),
];