import mongoose from "mongoose";

const warehouseSchema = new mongoose.Schema(
    {
        reseller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Reseller",
            required: true,
        },

        area: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Area",
            required: false,
        },

        warehouseName: {
            type: String,
            required: [true, "Warehouse name is required"],
            trim: true,
        },

        warehouseCode: {
            type: String,
            required: true,
            unique: true,
            sparse: true,
            uppercase: true,
            trim: true,
        },

        email: {
            type: String,
            trim: true,
            match: [
                /^\S+@\S+\.\S+$/,
                "Please provide a valid email",
            ],
        },

        mobile: {
            type: String,
            trim: true,
            match: [
                /^[0-9]{10}$/,
                "Please provide a valid 10-digit mobile number",
            ],
        },

        status: {
            type: String,
            enum: ["Enable", "Disable"],
            default: "Enable",
        },

        addressLine1: {
            type: String,
            trim: true,
        },

        addressLine2: {
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

        stockVerified: {
            type: String,
            enum: {
                values: ["Yes", "No", ""],
                message:
                    "`{VALUE}` is not a valid enum value for path `{PATH}`",
            },
            default: "",
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Warehouse", warehouseSchema);