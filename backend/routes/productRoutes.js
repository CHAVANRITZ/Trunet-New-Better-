import express from "express";

import {
    createProductController,
    getProductsController,
    getAllProductsController,
    getProductByIdController,
    updateProductController,
    deleteProductController,
    downloadProductCSVTemplateController,
    bulkImportProductsController
} from "../controllers/productController.js";

import {
    createProductValidator,
    updateProductValidator,
    productIdValidator,
    getProductsValidator,
    getAllProductsValidator
} from "../validators/productValidator.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import upload, { memoryUpload } from "../config/multer.js";


const router = express.Router();

/**
 * Product listing.
 *
 * Validation happens before the controller so malformed query
 * parameters never reach the service layer.
 */
router.get(
    "/",
    getProductsValidator,
    validationMiddleware,
    asyncHandler(authMiddleware),
    asyncHandler(getProductsController)
);

/**
 * Retrieves all products without pagination.
 *
 * This route must appear before "/:id" so "all" is not interpreted
 * as a MongoDB product ID.
 */
router.get(
    "/all",
    getAllProductsValidator,
    validationMiddleware,
    asyncHandler(authMiddleware),
    asyncHandler(getAllProductsController)
);

/**
 * Downloads the CSV template used for bulk product imports.
 */
router.get(
    "/download-template",
    asyncHandler(authMiddleware),
    asyncHandler(downloadProductCSVTemplateController)
);

/**
 * Imports products from a CSV file.
 *
 * The CSV is kept in memory because it only needs to exist for
 * the duration of the import operation.
 */
router.post(
    "/bulk-import",
    asyncHandler(authMiddleware),
    memoryUpload.single("csvFile"),
    asyncHandler(bulkImportProductsController)
);

/**
 * Retrieves a single product.
 */
router.get(
    "/:id",
    productIdValidator,
    validationMiddleware,
    asyncHandler(authMiddleware),
    asyncHandler(getProductByIdController)
);

/**
 * Creates a product.
 *
 * Authentication occurs before Multer so unauthenticated requests
 * are rejected before the server processes an uploaded image.
 */
router.post(
    "/",
    asyncHandler(authMiddleware),
    upload.single("productImage"),
    createProductValidator,
    validationMiddleware,
    asyncHandler(createProductController)
);

/**
 * Updates a product.
 *
 * A new image is optional. When supplied, the controller passes
 * its generated path to the service layer.
 */
router.put(
    "/:id",
    asyncHandler(authMiddleware),
    upload.single("productImage"),
    updateProductValidator,
    validationMiddleware,
    asyncHandler(updateProductController)
);

/**
 * Deletes a product.
 */
router.delete(
    "/:id",
    productIdValidator,
    validationMiddleware,
    asyncHandler(authMiddleware),
    asyncHandler(deleteProductController)
);

export default router;