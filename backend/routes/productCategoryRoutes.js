import express from "express";

import {
    createProductCategoryController,
    getProductCategoriesController,
    getProductCategoryByIdController,
    updateProductCategoryController,
    deleteProductCategoryController
} from "../controllers/productCategoryController.js";

import {
    createProductCategoryValidator,
    getProductCategoriesValidator,
    productCategoryIdValidator,
    updateProductCategoryValidator
} from "../validators/productCategoryValidator.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

/**
 * Product Category Routes
 *
 * Request flow:
 *
 * Validation
 *      ↓
 * Authentication
 *      ↓
 * Controller
 *      ↓
 * Service
 *      ↓
 * Model
 *
 * Business logic is intentionally kept out of this route module.
 */

/**
 * Create a product category.
 *
 * POST /api/v1/product-categories
 */
router.post(
    "/",
    createProductCategoryValidator,
    validationMiddleware,
    asyncHandler(authMiddleware),
    asyncHandler(createProductCategoryController)
);

/**
 * Get all product categories.
 *
 * Supports search, pagination, and sorting through query parameters.
 *
 * GET /api/v1/product-categories
 */
router.get(
    "/",
    getProductCategoriesValidator,
    validationMiddleware,
    asyncHandler(authMiddleware),
    asyncHandler(getProductCategoriesController)
);

/**
 * Get a product category by ID.
 *
 * GET /api/v1/product-categories/:id
 */
router.get(
    "/:id",
    productCategoryIdValidator,
    validationMiddleware,
    asyncHandler(authMiddleware),
    asyncHandler(getProductCategoryByIdController)
);

/**
 * Update a product category.
 *
 * PUT /api/v1/product-categories/:id
 */
router.put(
    "/:id",
    updateProductCategoryValidator,
    validationMiddleware,
    asyncHandler(authMiddleware),
    asyncHandler(updateProductCategoryController)
);

/**
 * Delete a product category.
 *
 * DELETE /api/v1/product-categories/:id
 */
router.delete(
    "/:id",
    productCategoryIdValidator,
    validationMiddleware,
    asyncHandler(authMiddleware),
    asyncHandler(deleteProductCategoryController)
);

export default router;