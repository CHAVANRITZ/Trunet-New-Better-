import { body, param, query } from "express-validator";

/**
 * Validates reseller creation requests.
 *
 * Required fields are based on the existing Reseller UI:
 * - Reseller Name
 * - Contact Number
 * - Contact Person Name
 * - Email
 * - Address 1
 */
export const createResellerValidator = [
    body("businessName")
        .trim()
        .notEmpty()
        .withMessage("Reseller name is required."),

    body("contactNumber")
        .trim()
        .notEmpty()
        .withMessage("Contact number is required."),

    body("name")
        .trim()
        .notEmpty()
        .withMessage("Contact person name is required."),

    body("mobile")
        .optional({ values: "falsy" })
        .trim(),

    body("email")
        .trim()
        .notEmpty()
        .withMessage("Email is required.")
        .isEmail()
        .withMessage("Please provide a valid email address."),

    body("gstNumber")
        .optional({ values: "falsy" })
        .trim(),

    body("panNumber")
        .optional({ values: "falsy" })
        .trim(),

    body("address1")
        .trim()
        .notEmpty()
        .withMessage("Address 1 is required."),

    body("address2")
        .optional({ values: "falsy" })
        .trim(),

    body("city")
        .optional({ values: "falsy" })
        .trim(),

    body("state")
        .optional({ values: "falsy" })
        .trim(),

    body("logo")
        .optional({ values: "falsy" })
        .trim(),
];

/**
 * Validates reseller update requests.
 *
 * All fields are optional because an update may modify
 * only a subset of reseller information.
 */
export const updateResellerValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid reseller ID."),

    body("businessName")
        .optional({ values: "falsy" })
        .trim(),

    body("contactNumber")
        .optional({ values: "falsy" })
        .trim(),

    body("name")
        .optional({ values: "falsy" })
        .trim(),

    body("mobile")
        .optional({ values: "falsy" })
        .trim(),

    body("email")
        .optional({ values: "falsy" })
        .trim()
        .isEmail()
        .withMessage("Please provide a valid email address."),

    body("gstNumber")
        .optional({ values: "falsy" })
        .trim(),

    body("panNumber")
        .optional({ values: "falsy" })
        .trim(),

    body("address1")
        .optional({ values: "falsy" })
        .trim(),

    body("address2")
        .optional({ values: "falsy" })
        .trim(),

    body("city")
        .optional({ values: "falsy" })
        .trim(),

    body("state")
        .optional({ values: "falsy" })
        .trim(),

    body("logo")
        .optional({ values: "falsy" })
        .trim(),
];

/**
 * Validates reseller ID parameters.
 */
export const resellerIdValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid reseller ID."),
];

/**
 * Validates reseller list query parameters.
 */
export const getResellersValidator = [
    query("page")
        .optional()
        .isInt({ min: 1 })
        .withMessage("Page must be a positive integer."),

    query("limit")
        .optional()
        .isInt({ min: 1 })
        .withMessage("Limit must be a positive integer."),

    query("sortOrder")
        .optional()
        .isIn(["asc", "desc"])
        .withMessage("Sort order must be either asc or desc."),
];