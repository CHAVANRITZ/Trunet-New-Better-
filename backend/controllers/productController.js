import {
    createProduct,
    getProducts,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    generateProductCSVTemplate,
    bulkImportProducts
} from "../services/productService.js";
import { sendSuccess } from "../utils/responseHandler.js";

/**
 * Creates a new product.
 *
 * If an image was uploaded but product creation fails, the uploaded
 * file is removed so the server does not keep an orphaned image
 * that is not referenced by any product.
 */
export const createProductController = async (req, res) => {
    const productData = {
        ...req.body
    };

    let productImagePath = null;

    /**
     * Multer stores the uploaded image on disk before the service
     * layer is called. Keep track of its application path so it can
     * be cleaned up if product creation fails.
     */
    if (req.file) {
        productImagePath =
            `uploads/products/${req.file.filename}`;

        productData.productImage = productImagePath;
    }

    try {
        const product = await createProduct(productData);

        return sendSuccess(res, {
            statusCode: 201,
            message: "Product created successfully.",
            data: product
        });
    } catch (error) {
        /**
         * Product creation failed, so no product should reference
         * the uploaded image. Remove the unused physical file.
         */
        if (productImagePath) {
            try {
                const fs = await import("fs/promises");
                const path = await import("path");

                const absolutePath = path.join(
                    process.cwd(),
                    productImagePath
                );

                await fs.unlink(absolutePath);
            } catch (cleanupError) {
                /**
                 * Preserve the original product creation error.
                 * File cleanup failure should not hide the actual
                 * reason why product creation failed.
                 */
            }
        }

        throw error;
    }
};

/**
 * Retrieves products using the supplied filters, pagination and
 * sorting parameters.
 */
export const getProductsController = async (req, res) => {
    const result = await getProducts(req.query);

    return sendSuccess(res, {
        message: "Products retrieved successfully.",
        data: result
    });
};

/**
 * Retrieves all products without pagination.
 *
 * This endpoint is intended for use cases such as dropdowns where
 * the complete product list is required.
 */
export const getAllProductsController = async (req, res) => {
    const products = await getAllProducts(req.query);

    return sendSuccess(res, {
        message: "Products retrieved successfully.",
        data: products
    });
};

/**
 * Retrieves a single product by its ID.
 */
export const getProductByIdController = async (req, res) => {
    const product = await getProductById(req.params.id);

    return sendSuccess(res, {
        message: "Product retrieved successfully.",
        data: product
    });
};

/**
 * Updates an existing product.
 *
 * When a new image is uploaded, its path is passed to the service
 * together with the remaining product fields.
 */
export const updateProductController = async (req, res) => {
    const productData = {
        ...req.body
    };

    if (req.file) {
        productData.productImage = `uploads/products/${req.file.filename}`;
    }

    const product = await updateProduct(
        req.params.id,
        productData
    );

    return sendSuccess(res, {
        message: "Product updated successfully.",
        data: product
    });
};

/**
 * Deletes a product by its ID.
 */
export const deleteProductController = async (req, res) => {
    await deleteProduct(req.params.id);

    return sendSuccess(res, {
        message: "Product deleted successfully."
    });
};
/**
 * Downloads the standard CSV template for bulk product imports.
 */
export const downloadProductCSVTemplateController = async (
    _req,
    res
) => {
    const csvContent = generateProductCSVTemplate();

    res.setHeader(
        "Content-Type",
        "text/csv"
    );

    res.setHeader(
        "Content-Disposition",
        "attachment; filename=product_bulk_upload_template.csv"
    );

    return res.status(200).send(csvContent);
};

/**
 * Imports products from an uploaded CSV file.
 *
 * Multer stores the CSV in memory, allowing the service layer to
 * process the file buffer without creating temporary files.
 */
export const bulkImportProductsController = async (
    req,
    res
) => {
    const results = await bulkImportProducts(
        req.file?.buffer
    );

    return sendSuccess(res, {
        message: `Bulk import completed. Successful: ${results.successful}, Failed: ${results.failed}.`,
        data: results
    });
};