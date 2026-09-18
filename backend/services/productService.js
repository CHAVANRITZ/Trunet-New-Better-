import mongoose from "mongoose";
import csv from "csv-parser";
import stream from "stream";
import fs from "fs/promises";
import path from "path";

import Product from "../models/Product.js";
import ProductCategory from "../models/ProductCategory.js";
import { ApiError } from "../utils/ApiError.js";
/**
 * Removes a product image from disk when it is no longer referenced.
 *
 * The database stores a relative application path such as
 * "uploads/products/product-123.png", while the actual file
 * exists relative to the backend working directory.
 *
 * Missing files are intentionally ignored because database
 * cleanup
 * should not fail merely because a physical file was already removed.
 */
const deleteProductImageFile = async (imagePath) => {
    if (!imagePath) {
        return;
    }

    const normalizedPath = imagePath.replace(/\\/g, "/");

    const absolutePath = path.join(
        process.cwd(),
        normalizedPath
    );

    try {
        await fs.unlink(absolutePath);
    } catch (error) {
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
};

/**
 * Builds MongoDB filters for product listing.
 *
 * Keeping filter construction inside the service prevents the
 * controller from becoming responsible for query/business logic.
 */
const buildSearchFilters = ({
    search,
    status,
    minPrice,
    maxPrice,
    trackSerialNumber,
    repairable,
    replaceable
}) => {
    const filters = {};

    if (search?.trim()) {
        const searchTerm = search.trim();

        filters.$or = [
            { productTitle: { $regex: searchTerm, $options: "i" } },
            { productCode: { $regex: searchTerm, $options: "i" } },
            { description: { $regex: searchTerm, $options: "i" } },
            { productBarcode: { $regex: searchTerm, $options: "i" } }
        ];
    }

    if (status) {
        const statuses = Array.isArray(status)
            ? status
            : status.split(",").map((value) => value.trim());

        const validStatuses = statuses.filter((value) =>
            ["Enable", "Disable"].includes(value)
        );

        if (validStatuses.length === 1) {
            filters.status = validStatuses[0];
        } else if (validStatuses.length > 1) {
            filters.status = { $in: validStatuses };
        }
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
        filters.productPrice = {};

        if (minPrice !== undefined) {
            filters.productPrice.$gte = Number(minPrice);
        }

        if (maxPrice !== undefined) {
            filters.productPrice.$lte = Number(maxPrice);
        }
    }

    if (["Yes", "No"].includes(trackSerialNumber)) {
        filters.trackSerialNumber = trackSerialNumber;
    }

    if (["Yes", "No"].includes(repairable)) {
        filters.repairable = repairable;
    }

    if (["Yes", "No"].includes(replaceable)) {
        filters.replaceable = replaceable;
    }

    return filters;
};

/**
 * Resolves a category input into its MongoDB ObjectId.
 *
 * Products store a reference to ProductCategory, so the service
 * accepts either a valid category ID or an exact category name.
 */
const resolveCategoryId = async (category) => {
    if (!category?.trim()) {
        return null;
    }

    const value = category.trim();

    if (mongoose.Types.ObjectId.isValid(value)) {
        const categoryById = await ProductCategory.findById(value);

        if (categoryById) {
            return categoryById._id;
        }
    }

    const categoryByName = await ProductCategory.findOne({
        productCategory: {
            $regex: `^${escapeRegex(value)}$`,
            $options: "i"
        }
    });

    return categoryByName?._id || null;
};

/**
 * Escapes user-provided text before it is used inside a regex.
 *
 * Without escaping, characters such as "." or "*" could change
 * the meaning of the search expression.
 */
const escapeRegex = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Converts MongoDB duplicate-key errors into application errors.
 *
 * Database-level uniqueness remains the final protection against
 * duplicate product titles or product codes.
 */
const handleDuplicateError = (error) => {
    if (error?.code !== 11000) {
        throw error;
    }

    const duplicateField = Object.keys(error.keyPattern || {})[0];

    if (duplicateField === "productCode") {
        throw new ApiError(
            409,
            "Product code is already in use."
        );
    }

    if (duplicateField === "productTitle") {
        throw new ApiError(
            409,
            "Product title is already in use."
        );
    }

    throw new ApiError(
        409,
        "A product with the provided unique value already exists."
    );
};

/**
 * Creates a new product.
 *
 * Category references are verified explicitly because MongoDB does
 * not automatically guarantee that a referenced document exists.
 * Product titles are checked case-insensitively to preserve the
 * application's duplicate-prevention behavior.
 */
export const createProduct = async (productData) => {
    try {
        const category = await resolveCategoryId(
            productData.productCategory
        );

        if (!category) {
            throw new ApiError(
                404,
                "Product category not found."
            );
        }

        const existingProduct = await Product.findOne({
            productTitle: {
                $regex: `^${escapeRegex(productData.productTitle.trim())}$`,
                $options: "i"
            }
        });

        if (existingProduct) {
            throw new ApiError(
                409,
                "Product title is already in use."
            );
        }

        productData.productCategory = category;

        // Empty product codes should behave like an omitted value
        // because the schema uses a sparse unique index.
        if (!productData.productCode?.trim()) {
            delete productData.productCode;
        }

        return await Product.create(productData);
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }

        handleDuplicateError(error);

        if (error.name === "ValidationError") {
            throw new ApiError(
                400,
                "Invalid product data provided."
            );
        }

        throw error;
    }
};
/**
 * Retrieves products with filtering, pagination and sorting.
 */
export const getProducts = async ({
    search,
    category,
    status,
    minPrice,
    maxPrice,
    trackSerialNumber,
    repairable,
    replaceable,
    page = 1,
    limit = 100,
    sortBy = "createdAt",
    sortOrder = "desc"
}) => {
    const filters = buildSearchFilters({
        search,
        status,
        minPrice,
        maxPrice,
        trackSerialNumber,
        repairable,
        replaceable
    });

    /**
     * Category filtering is resolved separately because Product
     * stores the category as an ObjectId reference.
     */
    if (category) {
        const categoryId = await resolveCategoryId(category);

        if (!categoryId) {
            return {
                products: [],
                pagination: {
                    currentPage: Number(page),
                    totalPages: 0,
                    totalProducts: 0,
                    hasNextPage: false,
                    hasPrevPage: false
                }
            };
        }

        filters.productCategory = categoryId;
    }

    const validSortFields = [
        "createdAt",
        "updatedAt",
        "productTitle",
        "productCode",
        "productPrice",
        "salePrice",
        "status"
    ];

    const actualSortBy = validSortFields.includes(sortBy)
        ? sortBy
        : "createdAt";

    const actualSortOrder = sortOrder === "asc" ? 1 : -1;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const [totalProducts, products] = await Promise.all([
        Product.countDocuments(filters),

        Product.find(filters)
            .populate(
                "productCategory",
                "productCategory remark"
            )
            .sort({
                [actualSortBy]: actualSortOrder
            })
            .skip(skip)
            .limit(limitNumber)
            .select("-__v")
    ]);

    const totalPages = Math.ceil(
        totalProducts / limitNumber
    );

    return {
        products,
        pagination: {
            currentPage: pageNumber,
            totalPages,
            totalProducts,
            hasNextPage: pageNumber < totalPages,
            hasPrevPage: pageNumber > 1
        }
    };
};

/**
 * Retrieves all products without pagination.
 *
 * This is useful for dropdowns and other UI components that need
 * the complete product collection.
 */
export const getAllProducts = async ({
    sortBy = "createdAt",
    sortOrder = "desc"
} = {}) => {
    const validSortFields = [
        "createdAt",
        "updatedAt",
        "productTitle",
        "productCode",
        "productPrice",
        "salePrice",
        "status"
    ];

    const actualSortBy = validSortFields.includes(sortBy)
        ? sortBy
        : "createdAt";

    const actualSortOrder = sortOrder === "asc" ? 1 : -1;

    return Product.find({})
        .populate(
            "productCategory",
            "productCategory remark"
        )
        .sort({
            [actualSortBy]: actualSortOrder
        })
        .select("-__v");
};

/**
 * Retrieves a single product by its ID.
 */
export const getProductById = async (productId) => {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw new ApiError(
            400,
            "Invalid product ID."
        );
    }

    const product = await Product.findById(productId)
        .populate(
            "productCategory",
            "productCategory remark"
        )
        .select("-__v");

    if (!product) {
        throw new ApiError(
            404,
            "Product not found."
        );
    }

    return product;
};

/**
 * Updates an existing product.
 *
 * When a new image replaces an existing image, the old physical
 * file is removed only after the database update succeeds.
 * If the database update fails, the newly uploaded image is removed
 * so failed requests do not leave orphaned files.
 */
export const updateProduct = async (
    productId,
    productData
) => {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw new ApiError(
            400,
            "Invalid product ID."
        );
    }

    const allowedFields = [
        "productCategory",
        "productTitle",
        "productCode",
        "productPrice",
        "salePrice",
        "hsnCode",
        "productImage",
        "productWeight",
        "productBarcode",
        "status",
        "description",
        "trackSerialNumber",
        "repairable",
        "replaceable"
    ];

    const updateData = {};

    for (const field of allowedFields) {
        if (productData[field] !== undefined) {
            updateData[field] = productData[field];
        }
    }

    const newImagePath = updateData.productImage;

    /**
     * Tracks whether the database update has completed successfully.
     *
     * This prevents the newly uploaded image from being deleted
     * after the database already references it.
     */
    let databaseUpdated = false;

    try {
        const existingProduct =
            await Product.findById(productId);

        if (!existingProduct) {
            throw new ApiError(
                404,
                "Product not found."
            );
        }

        if (updateData.productCategory) {
            const categoryId =
                await resolveCategoryId(
                    updateData.productCategory
                );

            if (!categoryId) {
                throw new ApiError(
                    404,
                    "Product category not found."
                );
            }

            updateData.productCategory = categoryId;
        }

        if (updateData.productTitle) {
            const duplicateProduct =
                await Product.findOne({
                    _id: { $ne: productId },
                    productTitle: {
                        $regex: `^${escapeRegex(
                            updateData.productTitle.trim()
                        )}$`,
                        $options: "i"
                    }
                });

            if (duplicateProduct) {
                throw new ApiError(
                    409,
                    "Product title is already in use."
                );
            }
        }

        if (
            updateData.productCode !== undefined &&
            !updateData.productCode.trim()
        ) {
            updateData.productCode = undefined;
        }

        const product =
            await Product.findByIdAndUpdate(
                productId,
                updateData,
                {
                    new: true,
                    runValidators: true
                }
            )
                .populate(
                    "productCategory",
                    "productCategory remark"
                )
                .select("-__v");

        /**
         * The database now references the new image.
         *
         * Mark the database operation as successful before
         * attempting physical file cleanup.
         */
        databaseUpdated = true;

        /**
         * Remove the old image only after the database successfully
         * points to the new image.
         *
         * Failure to remove the old file should not make an already
         * successful product update fail.
         */
        if (
            newImagePath &&
            existingProduct.productImage &&
            existingProduct.productImage !== newImagePath
        ) {
            try {
                await deleteProductImageFile(
                    existingProduct.productImage
                );
            } catch (error) {
                console.error(
                    "Failed to delete old product image:",
                    error
                );
            }
        }

        return product;
    } catch (error) {
        /**
         * If the database update failed, the newly uploaded image
         * is not referenced by any product and can safely be removed.
         *
         * Once databaseUpdated becomes true, the new image must
         * never be deleted here.
         */
        if (newImagePath && !databaseUpdated) {
            try {
                await deleteProductImageFile(
                    newImagePath
                );
            } catch {
                // Preserve the original application error.
            }
        }

        if (error instanceof ApiError) {
            throw error;
        }

        handleDuplicateError(error);

        if (error.name === "ValidationError") {
            throw new ApiError(
                400,
                "Invalid product data provided."
            );
        }

        throw error;
    }
};

/**
 * Deletes a product and removes its associated image file.
 *
 * The database record is removed first. The physical image is then
 * deleted because no product record should reference it anymore.
 */
export const deleteProduct = async (productId) => {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw new ApiError(
            400,
            "Invalid product ID."
        );
    }

    const product =
        await Product.findByIdAndDelete(productId);

    if (!product) {
        throw new ApiError(
            404,
            "Product not found."
        );
    }

    if (product.productImage) {
        try {
            await deleteProductImageFile(
                product.productImage
            );
        } catch (error) {
            /**
             * The database deletion already succeeded. Do not turn
             * a successful product deletion into an API failure only
             * because physical file cleanup encountered an error.
             */
            console.error(
                "Failed to delete product image:",
                error
            );
        }
    }

    return product;
};


/**
 * Generates the CSV template used for bulk product imports.
 *
 * The template intentionally contains only fields that can be
 * supplied through the Product import workflow.
 */
export const generateProductCSVTemplate = () => {
    const headers = [
        "productCategory",
        "productTitle",
        "productCode",
        "productPrice",
        "salePrice",
        "hsnCode",
        "productWeight",
        "productBarcode",
        "status",
        "description",
        "trackSerialNumber",
        "repairable",
        "replaceable"
    ];

    const sampleRows = [
        [
            "Electronics",
            "Sample Product 1",
            "PROD001",
            "1000",
            "900",
            "85171200",
            "1.5kg",
            "1234567890123",
            "Enable",
            "Sample product description",
            "Yes",
            "Yes",
            "No"
        ],
        [
            "Clothing",
            "Sample Product 2",
            "PROD002",
            "500",
            "450",
            "61102000",
            "0.2kg",
            "1234567890124",
            "Enable",
            "Another sample product",
            "No",
            "No",
            "Yes"
        ]
    ];

    const escapeCSVValue = (value) =>
        `"${String(value ?? "").replace(/"/g, '""')}"`;

    return [
        headers.map(escapeCSVValue).join(","),
        ...sampleRows.map((row) =>
            row.map(escapeCSVValue).join(",")
        )
    ].join("\n");
};

/**
 * Parses a CSV buffer into an array of objects.
 *
 * Memory-based parsing allows the upload middleware to avoid
 * creating temporary CSV files on disk.
 */
const parseCSVBuffer = (buffer) =>
    new Promise((resolve, reject) => {
        const rows = [];

        const readableStream = new stream.Readable();

        readableStream.push(buffer);
        readableStream.push(null);

        readableStream
            .pipe(csv())
            .on("data", (row) => rows.push(row))
            .on("end", () => resolve(rows))
            .on("error", reject);
    });

/**
 * Finds an existing category or creates one during bulk import.
 *
 * Bulk imports historically allowed category names instead of
 * requiring callers to know MongoDB category IDs.
 */
const getOrCreateCategory = async (categoryName) => {
    if (
        !categoryName ||
        typeof categoryName !== "string"
    ) {
        throw new ApiError(
            400,
            "Product category is required."
        );
    }

    const trimmedName = categoryName.trim();

    if (!trimmedName) {
        throw new ApiError(
            400,
            "Product category cannot be empty."
        );
    }

    let category = await ProductCategory.findOne({
        productCategory: {
            $regex: `^${escapeRegex(trimmedName)}$`,
            $options: "i"
        }
    });

    if (!category) {
        try {
            category = await ProductCategory.create({
                productCategory: trimmedName,
                remark: "Auto-created during bulk import"
            });
        } catch (error) {
            /**
             * Another request may have created the same category
             * between our find and create operations.
             */
            if (error.code !== 11000) {
                throw error;
            }

            category = await ProductCategory.findOne({
                productCategory: {
                    $regex: `^${escapeRegex(trimmedName)}$`,
                    $options: "i"
                }
            });
        }
    }

    if (!category) {
        throw new ApiError(
            500,
            "Unable to resolve product category."
        );
    }

    return category._id;
};

/**
 * Validates the required fields and enum values of a CSV row.
 */
const validateBulkProductRow = (row) => {
    const errors = [];

    if (!row.productTitle?.trim()) {
        errors.push("Product title is required.");
    }

    if (!row.productCategory?.trim()) {
        errors.push("Product category is required.");
    }

    if (
        row.productPrice === undefined ||
        row.productPrice === "" ||
        Number.isNaN(Number(row.productPrice)) ||
        Number(row.productPrice) < 0
    ) {
        errors.push(
            "Product price must be a valid non-negative number."
        );
    }

    if (
        row.salePrice === undefined ||
        row.salePrice === "" ||
        Number.isNaN(Number(row.salePrice)) ||
        Number(row.salePrice) < 0
    ) {
        errors.push(
            "Sale price must be a valid non-negative number."
        );
    }

    if (!row.hsnCode?.trim()) {
        errors.push("HSN code is required.");
    }

    if (
        row.status &&
        !["Enable", "Disable"].includes(row.status)
    ) {
        errors.push(
            "Status must be either Enable or Disable."
        );
    }

    if (
        row.trackSerialNumber &&
        !["Yes", "No"].includes(row.trackSerialNumber)
    ) {
        errors.push(
            "Track Serial Number must be either Yes or No."
        );
    }

    if (
        row.repairable &&
        !["Yes", "No"].includes(row.repairable)
    ) {
        errors.push(
            "Repairable must be either Yes or No."
        );
    }

    if (
        row.replaceable &&
        !["Yes", "No"].includes(row.replaceable)
    ) {
        errors.push(
            "Replaceable must be either Yes or No."
        );
    }

    return errors;
};

/**
 * Imports products from a CSV buffer.
 *
 * Each CSV row is processed independently so validation failures
 * and duplicate records can be reported against their original
 * CSV row without preventing valid rows from being imported.
 *
 * Existing product codes and product titles are checked before
 * database insertion. This provides predictable duplicate reporting
 * instead of relying only on MongoDB bulk-write error formatting.
 */
export const bulkImportProducts = async (buffer) => {
    if (!buffer) {
        throw new ApiError(
            400,
            "CSV file is required."
        );
    }

    const rows = await parseCSVBuffer(buffer);

    if (rows.length === 0) {
        throw new ApiError(
            400,
            "CSV file is empty or could not be parsed."
        );
    }

    const results = {
        total: rows.length,
        successful: 0,
        failed: 0,
        errors: []
    };

    const productsToInsert = [];
    const productRowMappings = [];

    /**
     * Tracks product codes and titles already present in the
     * current CSV file.
     *
     * This prevents duplicate records within the same CSV from
     * reaching MongoDB.
     */
    const csvProductCodes = new Set();
    const csvProductTitles = new Set();

    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];

        // CSV header occupies row 1, so data starts from row 2.
        const rowNumber = index + 2;

        try {
            /**
             * Validate the complete CSV row before performing
             * category lookup or database insertion.
             */
            const validationErrors =
                validateBulkProductRow(row);

            if (validationErrors.length > 0) {
                results.errors.push({
                    row: rowNumber,
                    data: row,
                    errors: validationErrors
                });

                results.failed += 1;
                continue;
            }

            const productTitle =
                row.productTitle.trim();

            const productCode =
                row.productCode?.trim() || null;

            /**
             * Product titles are unique in the Product collection.
             *
             * Check duplicates within the uploaded CSV first.
             */
            const normalizedTitle =
                productTitle.toLowerCase();

            if (
                csvProductTitles.has(
                    normalizedTitle
                )
            ) {
                results.errors.push({
                    row: rowNumber,
                    data: row,
                    errors: [
                        "Product title already exists in the CSV file."
                    ]
                });

                results.failed += 1;
                continue;
            }

            /**
             * Product codes are unique when provided.
             *
             * Check duplicates within the uploaded CSV first.
             */
            const normalizedCode =
                productCode?.toLowerCase();

            if (
                normalizedCode &&
                csvProductCodes.has(
                    normalizedCode
                )
            ) {
                results.errors.push({
                    row: rowNumber,
                    data: row,
                    errors: [
                        "Product code already exists in the CSV file."
                    ]
                });

                results.failed += 1;
                continue;
            }

            /**
             * Check whether the product title already exists
             * in the database.
             *
             * Case-insensitive matching keeps the behavior
             * consistent with the normal product creation flow.
             */
            const existingTitle =
                await Product.findOne({
                    productTitle: {
                        $regex: `^${escapeRegex(
                            productTitle
                        )}$`,
                        $options: "i"
                    }
                })
                    .select("_id")
                    .lean();

            if (existingTitle) {
                results.errors.push({
                    row: rowNumber,
                    data: row,
                    errors: [
                        "Product title already exists."
                    ]
                });

                results.failed += 1;
                continue;
            }

            /**
             * Check the product code only when the CSV row
             * actually contains one.
             */
            if (productCode) {
                const existingCode =
                    await Product.findOne({
                        productCode: productCode
                    })
                        .select("_id")
                        .lean();

                if (existingCode) {
                    results.errors.push({
                        row: rowNumber,
                        data: row,
                        errors: [
                            "Product code already exists."
                        ]
                    });

                    results.failed += 1;
                    continue;
                }
            }

            /**
             * Resolve the category after the row has passed
             * validation and duplicate checks.
             */
            const categoryId =
                await getOrCreateCategory(
                    row.productCategory
                );

            const product = {
                productCategory: categoryId,
                productTitle,
                productCode:
                    productCode || undefined,
                productPrice:
                    Number(row.productPrice),
                salePrice:
                    Number(row.salePrice),
                hsnCode:
                    row.hsnCode.trim(),
                productWeight:
                    row.productWeight?.trim() || "",
                productBarcode:
                    row.productBarcode?.trim() || "",
                status:
                    row.status || "Enable",
                description:
                    row.description?.trim() || "",
                trackSerialNumber:
                    row.trackSerialNumber || "No",
                repairable:
                    row.repairable || "No",
                replaceable:
                    row.replaceable || "No"
            };

            productsToInsert.push(product);

            productRowMappings.push({
                productIndex:
                    productsToInsert.length - 1,
                rowNumber,
                row
            });

            /**
             * Remember accepted values so duplicates appearing
             * later in the same CSV are rejected.
             */
            csvProductTitles.add(
                normalizedTitle
            );

            if (normalizedCode) {
                csvProductCodes.add(
                    normalizedCode
                );
            }
        } catch (error) {
            results.errors.push({
                row: rowNumber,
                data: row,
                errors: [error.message]
            });

            results.failed += 1;
        }
    }

    /**
     * Every CSV row was either rejected during validation/
     * duplicate checking or prepared for insertion.
     */
    if (productsToInsert.length === 0) {
        return results;
    }

    /**
     * Insert all remaining valid products together.
     *
     * ordered:false allows MongoDB to continue inserting other
     * valid documents if an unexpected database-level conflict
     * occurs during this operation.
     */
    try {
        const insertedProducts =
            await Product.insertMany(
                productsToInsert,
                {
                    ordered: false
                }
            );

        results.successful =
            insertedProducts.length;

        return results;
    } catch (error) {
        /**
         * A database-level duplicate can still occur if another
         * request inserts the same unique value between our
         * duplicate check and insertMany().
         *
         * MongoDB/Mongoose can expose bulk-write information
         * through writeErrors or result-level writeErrors.
         */
        const writeErrors =
            error.writeErrors ||
            error.result?.writeErrors ||
            [];

        /**
         * If the database did not provide structured bulk-write
         * information, do not incorrectly report all prepared
         * products as successful.
         *
         * Re-check the prepared products against the database and
         * identify which ones now exist.
         */
        if (writeErrors.length === 0) {
            let successfulCount = 0;

            for (
                let index = 0;
                index < productsToInsert.length;
                index += 1
            ) {
                const product =
                    productsToInsert[index];

                const existingProduct =
                    await Product.findOne({
                        $or: [
                            {
                                productTitle: product.productTitle
                            },
                            ...(product.productCode
                                ? [
                                      {
                                          productCode:
                                              product.productCode
                                      }
                                  ]
                                : [])
                        ]
                    })
                        .select(
                            "productTitle productCode"
                        )
                        .lean();

                if (!existingProduct) {
                    const mapping =
                        productRowMappings[index];

                    results.errors.push({
                        row:
                            mapping?.rowNumber ||
                            "Unknown",
                        data:
                            mapping?.row ||
                            product,
                        errors: [
                            "Product could not be imported."
                        ]
                    });

                    results.failed += 1;
                } else {
                    successfulCount += 1;
                }
            }

            results.successful =
                successfulCount;

            return results;
        }

        /**
         * Handle structured MongoDB duplicate-key errors.
         */
        const failedIndexes = new Set();

        for (const writeError of writeErrors) {
            if (
                writeError.code === 11000 &&
                Number.isInteger(
                    writeError.index
                )
            ) {
                failedIndexes.add(
                    writeError.index
                );
            }
        }

        results.successful =
            productsToInsert.length -
            failedIndexes.size;

        results.failed +=
            failedIndexes.size;

        for (const failedIndex of failedIndexes) {
            const mapping =
                productRowMappings.find(
                    (item) =>
                        item.productIndex ===
                        failedIndex
                );

            const failedProduct =
                productsToInsert[failedIndex];

            const writeError =
                writeErrors.find(
                    (item) =>
                        item.index ===
                        failedIndex
                );

            const keyPattern =
                writeError?.err?.keyPattern ||
                writeError?.keyPattern ||
                {};

            const duplicateField =
                Object.keys(
                    keyPattern
                )[0];

            let duplicateMessage =
                "A product with the provided unique value already exists.";

            if (
                duplicateField ===
                "productCode"
            ) {
                duplicateMessage =
                    "Product code already exists.";
            } else if (
                duplicateField ===
                "productTitle"
            ) {
                duplicateMessage =
                    "Product title already exists.";
            }

            results.errors.push({
                row:
                    mapping?.rowNumber ||
                    "Unknown",
                data:
                    mapping?.row ||
                    failedProduct,
                errors: [
                    duplicateMessage
                ]
            });
        }

        return results;
    }
};