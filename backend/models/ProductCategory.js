import mongoose from "mongoose";

/**
 * Product Category schema.
 *
 * A product category provides a reusable classification for
 * products in the Trunet catalog.
 */
const productCategorySchema = new mongoose.Schema(
    {
        productCategory: {
            type: String,
            required: [true, "Product category is required."],
            trim: true
        },

        remark: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

/**
 * Prevent duplicate category names at the database level.
 *
 * Database-level uniqueness protects against duplicate records
 * even when multiple requests are processed concurrently.
 */
productCategorySchema.index(
    { productCategory: 1 },
    { unique: true }
);

const ProductCategory = mongoose.model(
    "ProductCategory",
    productCategorySchema
);

export default ProductCategory;