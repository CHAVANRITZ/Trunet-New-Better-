import mongoose from "mongoose";

/**
 * Vendor schema for Trunet.
 *
 * This schema intentionally follows the legacy Vendor collection
 * so that the new backend remains compatible with the existing
 * database structure and frontend contract.
 *
 * Vendor records contain supplier/business information used by
 * procurement-related workflows.
 */
const vendorSchema = new mongoose.Schema(
    {
        businessName: {
            type: String,
            required: true,
            trim: true
        },

        contactNumber: {
            type: String,
            required: true,
            trim: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        mobile: {
            type: String,
            required: false
        },

        email: {
            type: String,
            trim: true,
            unique: true
        },

        gstNumber: {
            type: String,
            trim: true
        },

        panNumber: {
            type: String,
            trim: true
        },

        address1: {
            type: String,
            trim: true
        },

        address2: {
            type: String,
            trim: true
        },

        city: {
            type: String,
            trim: true
        },

        state: {
            type: String,
            trim: true
        },

        logo: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

const Vendor = mongoose.model("Vendor", vendorSchema);

export default Vendor;