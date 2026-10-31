import ProductCategory from "../models/ProductCategory.js";
import Product from "../models/Product.js";
import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";

/**
 * Creates a new product category.
 *
 * The service owns the duplicate-category business rule so the
 * controller remains focused only on HTTP request/response handling.
 */
export const createProductCategory = async ({ productCategory, remark }) => {
    const normalizedName = productCategory.trim();

    const existingCategory = await ProductCategory.findOne({
        productCategory: normalizedName
    });

    if (existingCategory) {
        throw new ApiError(409, "Product category already exists.");
    }

    try {
        return await ProductCategory.create({
            productCategory: normalizedName,
            remark: remark?.trim() || ""
        });
    } catch (error) {
        /**
         * The unique database index is the final protection against
         * duplicates when concurrent requests pass the application-
         * level existence check at the same time.
         */
        if (error.code === 11000) {
            throw new ApiError(409, "Product category already exists.");
        }

        throw error;
    }
};

/**
 * Retrieves product categories with optional search, pagination,
 * and sorting.
 */
export const getProductCategories = async ({
    search,
    page = 1,
    limit = 100,
    sortBy = "createdAt",
    sortOrder = "desc"
}) => {
    const filter = {};

    if (search?.trim()) {
        const searchTerm = search.trim();

        filter.$or = [
            {
                productCategory: {
                    $regex: searchTerm,
                    $options: "i"
                }
            },
            {
                remark: {
                    $regex: searchTerm,
                    $options: "i"
                }
            }
        ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const sort = {
        [sortBy]: sortOrder === "asc" ? 1 : -1
    };

    const [categories, totalCategories] = await Promise.all([
        ProductCategory.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(Number(limit))
            .select("-__v"),

        ProductCategory.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(
        totalCategories / Number(limit)
    );

    return {
        categories,
        pagination: {
            currentPage: Number(page),
            totalPages,
            totalCategories
        }
    };
};

/**
 * Retrieves a single product category by its MongoDB ID.
 */
export const getProductCategoryById = async (id) => {
    if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(400, "Invalid product category ID.");
    }

    const category = await ProductCategory.findById(id);

    if (!category) {
        throw new ApiError(404, "Product category not found.");
    }

    return category;
};

/**
 * Updates an existing product category.
 *
 * Only fields explicitly supported by the API are updated.
 */
export const updateProductCategory = async (
    id,
    { productCategory, remark }
) => {
    if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(400, "Invalid product category ID.");
    }

    const category = await ProductCategory.findById(id);

    if (!category) {
        throw new ApiError(404, "Product category not found.");
    }

    if (productCategory !== undefined) {
        const normalizedName = productCategory.trim();

        const duplicate = await ProductCategory.findOne({
            productCategory: normalizedName,
            _id: { $ne: id }
        });

        if (duplicate) {
            throw new ApiError(409, "Product category already exists.");
        }

        category.productCategory = normalizedName;
    }

    if (remark !== undefined) {
        category.remark = remark.trim();
    }

    try {
        return await category.save();
    } catch (error) {
        if (error.code === 11000) {
            throw new ApiError(409, "Product category already exists.");
        }

        throw error;
    }
};

/**
 * Deletes a product category.
 *
 * Categories referenced by products are protected from deletion.
 * This prevents products from being left with a broken category
 * reference.
 */
export const deleteProductCategory = async (id) => {
    if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(400, "Invalid product category ID.");
    }

    const category = await ProductCategory.findById(id);

    if (!category) {
        throw new ApiError(404, "Product category not found.");
    }

    const productsUsingCategory = await Product.exists({
        productCategory: id
    });

    if (productsUsingCategory) {
        throw new ApiError(
            409,
            "Product category cannot be deleted because it is assigned to one or more products."
        );
    }

    await ProductCategory.deleteOne({ _id: id });

    return category;
};