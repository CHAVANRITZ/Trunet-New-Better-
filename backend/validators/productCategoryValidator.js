import { body, param, query } from "express-validator";

/**
 * Validates product category creation requests.
 *
 * Keeping validation here prevents malformed HTTP input from
 * reaching the service layer.
 */
export const createProductCategoryValidator = [
    body("productCategory")
        .trim()
        .notEmpty()
        .withMessage("Product category is required.")
        .isLength({ max: 100 })
        .withMessage("Product category must not exceed 100 characters."),

    body("remark")
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage("Remark must not exceed 500 characters.")
];

/**
 * Validates product category update requests.
 *
 * At least one supported field must be supplied. The service
 * remains responsible for business rules such as duplicate
 * category detection.
 */
export const updateProductCategoryValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid product category ID."),

    body("productCategory")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("Product category cannot be empty.")
        .isLength({ max: 100 })
        .withMessage("Product category must not exceed 100 characters."),

    body("remark")
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage("Remark must not exceed 500 characters.")
];

/**
 * Validates requests that target a specific product category.
 */
export const productCategoryIdValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid product category ID.")
];

/**
 * Validates product category listing parameters.
 *
 * Only supported sort fields are accepted so the client cannot
 * arbitrarily construct database sort expressions.
 */
export const getProductCategoriesValidator = [
    query("search")
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage("Search must not exceed 100 characters."),

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
        .isIn(["productCategory", "remark", "createdAt", "updatedAt"])
        .withMessage("Invalid sort field."),

    query("sortOrder")
        .optional()
        .isIn(["asc", "desc"])
        .withMessage("Sort order must be either asc or desc.")
];