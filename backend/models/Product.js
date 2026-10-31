import mongoose from "mongoose";

/**
 * Product schema.
 *
 * A product represents an item that can be purchased, stocked,
 * transferred, used, repaired, replaced, or otherwise tracked
 * within the Trunet inventory system.
 *
 * The product category is stored as a reference rather than
 * duplicating category information inside every product.
 */
const productSchema = new mongoose.Schema(
    {
        /**
         * Classification of the product.
         *
         * This reference is required because every product must
         * belong to a product category.
         */
        productCategory: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ProductCategory",
            required: true
        },

        /**
         * Human-readable name of the product.
         *
         * Product titles must be unique across the catalog.
         */
        productTitle: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        /**
         * Product code is optional, but when provided it must be
         * unique.
         *
         * Sparse uniqueness allows multiple products to omit the
         * product code without conflicting with one another.
         */
        productCode: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },

        productPrice: {
            type: Number,
            required: true
        },

        salePrice: {
            type: Number,
            required: true
        },

        hsnCode: {
            type: String,
            required: true,
            trim: true
        },

        productImage: {
            type: String,
            default: ""
        },

        productWeight: {
            type: String,
            default: ""
        },

        productBarcode: {
            type: String,
            default: ""
        },

        status: {
            type: String,
            enum: ["Enable", "Disable"],
            default: "Enable"
        },

        description: {
            type: String,
            default: ""
        },

        /**
         * Determines whether individual product units need
         * serial-number tracking.
         */
        trackSerialNumber: {
            type: String,
            enum: ["Yes", "No"],
            default: "No"
        },

        /**
         * Determines whether the product can enter the repair
         * workflow when damaged or faulty.
         */
        repairable: {
            type: String,
            enum: ["Yes", "No"],
            default: "No"
        },

        /**
         * Determines whether the product can enter the replacement
         * workflow.
         */
        replaceable: {
            type: String,
            enum: ["Yes", "No"],
            default: "No"
        }
    },
    {
        timestamps: true
    }
);

const Product = mongoose.model("Product", productSchema);

export default Product;