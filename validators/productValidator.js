import { body, param, query } from "express-validator";

/**
 * Validates product creation requests.
 *
 * Required fields are enforced here so the service can focus
 * on product business logic rather than malformed input.
 */
export const createProductValidator = [
    body("productCategory")
        .trim()
        .notEmpty()
        .withMessage("Product category is required.")
        .isMongoId()
        .withMessage("Invalid product category ID."),

    body("productTitle")
        .trim()
        .notEmpty()
        .withMessage("Product title is required.")
        .isLength({ max: 200 })
        .withMessage("Product title must not exceed 200 characters."),

    body("productCode")
        .optional({ checkFalsy: true })
        .trim()
        .isString()
        .withMessage("Product code must be a string.")
        .isLength({ max: 100 })
        .withMessage("Product code must not exceed 100 characters."),

    body("productPrice")
        .notEmpty()
        .withMessage("Product price is required.")
        .isFloat({ min: 0 })
        .withMessage("Product price must be a valid non-negative number."),

    body("salePrice")
        .notEmpty()
        .withMessage("Sale price is required.")
        .isFloat({ min: 0 })
        .withMessage("Sale price must be a valid non-negative number."),

    body("hsnCode")
        .trim()
        .notEmpty()
        .withMessage("HSN code is required.")
        .isLength({ max: 50 })
        .withMessage("HSN code must not exceed 50 characters."),

    body("productWeight")
        .optional({ checkFalsy: true })
        .trim()
        .isString()
        .withMessage("Product weight must be a string."),

    body("productBarcode")
        .optional({ checkFalsy: true })
        .trim()
        .isString()
        .withMessage("Product barcode must be a string."),

    body("description")
        .optional({ checkFalsy: true })
        .trim()
        .isString()
        .withMessage("Description must be a string."),

    body("status")
        .optional()
        .isIn(["Enable", "Disable"])
        .withMessage("Status must be either Enable or Disable."),

    body("trackSerialNumber")
        .optional()
        .isIn(["Yes", "No"])
        .withMessage("Track Serial Number must be either Yes or No."),

    body("repairable")
        .optional()
        .isIn(["Yes", "No"])
        .withMessage("Repairable must be either Yes or No."),

    body("replaceable")
        .optional()
        .isIn(["Yes", "No"])
        .withMessage("Replaceable must be either Yes or No.")
];

/**
 * Validates product update requests.
 *
 * All product fields are optional because PUT updates are handled
 * as partial updates by the service layer.
 */
export const updateProductValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid product ID."),

    body("productCategory")
        .optional()
        .isMongoId()
        .withMessage("Invalid product category ID."),

    body("productTitle")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("Product title cannot be empty.")
        .isLength({ max: 200 })
        .withMessage("Product title must not exceed 200 characters."),

    body("productCode")
        .optional({ checkFalsy: true })
        .trim()
        .isString()
        .withMessage("Product code must be a string.")
        .isLength({ max: 100 })
        .withMessage("Product code must not exceed 100 characters."),

    body("productPrice")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Product price must be a valid non-negative number."),

    body("salePrice")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Sale price must be a valid non-negative number."),

    body("hsnCode")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("HSN code cannot be empty.")
        .isLength({ max: 50 })
        .withMessage("HSN code must not exceed 50 characters."),

    body("productWeight")
        .optional({ checkFalsy: true })
        .trim()
        .isString()
        .withMessage("Product weight must be a string."),

    body("productBarcode")
        .optional({ checkFalsy: true })
        .trim()
        .isString()
        .withMessage("Product barcode must be a string."),

    body("description")
        .optional({ checkFalsy: true })
        .trim()
        .isString()
        .withMessage("Description must be a string."),

    body("status")
        .optional()
        .isIn(["Enable", "Disable"])
        .withMessage("Status must be either Enable or Disable."),

    body("trackSerialNumber")
        .optional()
        .isIn(["Yes", "No"])
        .withMessage("Track Serial Number must be either Yes or No."),

    body("repairable")
        .optional()
        .isIn(["Yes", "No"])
        .withMessage("Repairable must be either Yes or No."),

    body("replaceable")
        .optional()
        .isIn(["Yes", "No"])
        .withMessage("Replaceable must be either Yes or No.")
];

/**
 * Validates a product ID supplied in a route parameter.
 */
export const productIdValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid product ID.")
];

/**
 * Validates product listing query parameters.
 *
 * Keeping query validation here prevents invalid pagination,
 * sorting and filter values from reaching the service layer.
 */
export const getProductsValidator = [
    query("search")
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage("Search must not exceed 100 characters."),

    query("category")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("Category cannot be empty."),

    query("status")
        .optional()
        .custom((value) => {
            const values = Array.isArray(value)
                ? value
                : String(value)
                    .split(",")
                    .map((item) => item.trim());

            if (
                !values.every((item) =>
                    ["Enable", "Disable"].includes(item)
                )
            ) {
                throw new Error(
                    "Status must contain only Enable or Disable."
                );
            }

            return true;
        }),

    query("minPrice")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Minimum price must be a valid non-negative number."),

    query("maxPrice")
        .optional()
        .isFloat({ min: 0 })
        .withMessage("Maximum price must be a valid non-negative number."),

    query("trackSerialNumber")
        .optional()
        .isIn(["Yes", "No"])
        .withMessage("Track Serial Number must be either Yes or No."),

    query("repairable")
        .optional()
        .isIn(["Yes", "No"])
        .withMessage("Repairable must be either Yes or No."),

    query("replaceable")
        .optional()
        .isIn(["Yes", "No"])
        .withMessage("Replaceable must be either Yes or No."),

    query("page")
        .optional()
        .isInt({ min: 1 })
        .withMessage("Page must be a positive integer."),

    query("limit")
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage("Limit must be between 1 and 100."),

    query("sortBy")
        .optional()
        .isIn([
            "createdAt",
            "updatedAt",
            "productTitle",
            "productCode",
            "productPrice",
            "salePrice",
            "status"
        ])
        .withMessage("Invalid sort field."),

    query("sortOrder")
        .optional()
        .isIn(["asc", "desc"])
        .withMessage("Sort order must be either asc or desc.")
];

/**
 * Validates query parameters for the non-paginated product list.
 */
export const getAllProductsValidator = [
    query("sortBy")
        .optional()
        .isIn([
            "createdAt",
            "updatedAt",
            "productTitle",
            "productCode",
            "productPrice",
            "salePrice",
            "status"
        ])
        .withMessage("Invalid sort field."),

    query("sortOrder")
        .optional()
        .isIn(["asc", "desc"])
        .withMessage("Sort order must be either asc or desc.")
];