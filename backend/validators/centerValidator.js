import { body, param, query } from "express-validator";

/**
 * Validates Center ID.
 */
export const centerIdValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid center ID."),
];

/**
 * Validates Center creation.
 */
export const createCenterValidator = [
    body("centerType")
        .trim()
        .notEmpty()
        .withMessage("Center type is required.")
        .isIn(["Center", "Outlet"])
        .withMessage("Center type must be either Center or Outlet."),

    body("centerName")
        .trim()
        .notEmpty()
        .withMessage("Center name is required."),

    body("centerCode")
        .trim()
        .notEmpty()
        .withMessage("Center code is required.")
        .isLength({ max: 50 })
        .withMessage("Center code cannot exceed 50 characters."),

    body("email")
        .optional({ values: "falsy" })
        .trim()
        .isEmail()
        .withMessage("Please provide a valid email."),

    body("mobile")
        .optional({ values: "falsy" })
        .trim()
        .matches(/^[0-9]{10}$/)
        .withMessage("Please provide a valid 10-digit mobile number."),

    body("status")
        .optional()
        .trim()
        .isIn(["Enable", "Disable"])
        .withMessage("Status must be either Enable or Disable."),

    body("stockVerified")
        .optional()
        .trim()
        .isIn(["Yes", "No", ""])
        .withMessage("stockVerified must be Yes or No."),

    body("partnerId")
        .optional({ values: "falsy" })
        .isMongoId()
        .withMessage("Invalid partner ID."),

    body("areaId")
        .optional({ values: "falsy" })
        .isMongoId()
        .withMessage("Invalid area ID."),

    body("reseller")
        .optional({ values: "falsy" })
        .isMongoId()
        .withMessage("Invalid reseller ID."),
];

/**
 * Validates Center update.
 */
export const updateCenterValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid center ID."),

    body("centerType")
        .optional()
        .trim()
        .isIn(["Center", "Outlet"])
        .withMessage("Center type must be either Center or Outlet."),

    body("centerName")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("Center name cannot be empty."),

    body("centerCode")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("Center code cannot be empty."),

    body("email")
        .optional({ values: "falsy" })
        .trim()
        .isEmail()
        .withMessage("Please provide a valid email."),

    body("mobile")
        .optional({ values: "falsy" })
        .trim()
        .matches(/^[0-9]{10}$/)
        .withMessage("Please provide a valid 10-digit mobile number."),

    body("status")
        .optional()
        .trim()
        .isIn(["Enable", "Disable"])
        .withMessage("Status must be either Enable or Disable."),

    body("stockVerified")
        .optional()
        .trim()
        .isIn(["Yes", "No", ""])
        .withMessage("stockVerified must be Yes or No."),

    body("partnerId")
        .optional({ values: "falsy" })
        .isMongoId()
        .withMessage("Invalid partner ID."),

    body("areaId")
        .optional({ values: "falsy" })
        .isMongoId()
        .withMessage("Invalid area ID."),

    body("reseller")
        .optional({ values: "falsy" })
        .isMongoId()
        .withMessage("Invalid reseller ID."),
];

/**
 * Validates Center listing query parameters.
 */
export const getCentersValidator = [
    query("page")
        .optional()
        .isInt({ min: 1 })
        .withMessage("Page must be a positive integer."),

    query("limit")
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage("Limit must be between 1 and 100."),

    query("centerType")
        .optional()
        .isIn(["Center", "Outlet"])
        .withMessage("Invalid center type."),

    query("status")
        .optional()
        .isIn(["Enable", "Disable"])
        .withMessage("Invalid status."),

    query("reseller")
        .optional()
        .isMongoId()
        .withMessage("Invalid reseller ID."),

    query("areaId")
        .optional()
        .isMongoId()
        .withMessage("Invalid area ID."),
];