import {
    createProductCategory,
    getProductCategories,
    getProductCategoryById,
    updateProductCategory,
    deleteProductCategory
} from "../services/productCategoryService.js";

import { sendSuccess } from "../utils/responseHandler.js";

/**
 * Creates a new product category.
 *
 * The controller is intentionally thin: it extracts HTTP input,
 * delegates business logic to the service, and formats the response.
 */
export const createProductCategoryController = async (req, res) => {
    const category = await createProductCategory(req.body);

    return sendSuccess(res, {
        statusCode: 201,
        message: "Product category created successfully.",
        data: category
    });
};

/**
 * Returns a paginated list of product categories.
 */
export const getProductCategoriesController = async (req, res) => {
    const result = await getProductCategories(req.query);

    return sendSuccess(res, {
        statusCode: 200,
        message: "Product categories retrieved successfully.",
        data: result
    });
};

/**
 * Returns a single product category.
 */
export const getProductCategoryByIdController = async (req, res) => {
    const category = await getProductCategoryById(req.params.id);

    return sendSuccess(res, {
        statusCode: 200,
        message: "Product category retrieved successfully.",
        data: category
    });
};

/**
 * Updates an existing product category.
 */
export const updateProductCategoryController = async (req, res) => {
    const category = await updateProductCategory(
        req.params.id,
        req.body
    );

    return sendSuccess(res, {
        statusCode: 200,
        message: "Product category updated successfully.",
        data: category
    });
};

/**
 * Deletes an existing product category.
 */
export const deleteProductCategoryController = async (req, res) => {
    const category = await deleteProductCategory(req.params.id);

    return sendSuccess(res, {
        statusCode: 200,
        message: "Product category deleted successfully.",
        data: category
    });
};