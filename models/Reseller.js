import mongoose from "mongoose";

/**
 * Reseller model.
 *
 * Represents a reseller/business registered in the Trunet system.
 * Field names are kept compatible with the existing reseller data.
 */
const resellerSchema = new mongoose.Schema(
    {
        businessName: {
            type: String,
            required: true,
            trim: true,
        },

        contactNumber: {
            type: String,
            required: true,
            trim: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        mobile: {
            type: String,
            trim: true,
        },

        email: {
            type: String,
           
            trim: true,
            
        },

        gstNumber: {
            type: String,
            trim: true,
        },

        panNumber: {
            type: String,
            trim: true,
        },

        address1: {
            type: String,
            required: true,
            trim: true,
        },

        address2: {
            type: String,
            trim: true,
        },

        city: {
            type: String,
            trim: true,
        },

        state: {
            type: String,
            trim: true,
        },

        logo: {
            type: String,
            default: "",
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Reseller", resellerSchema);