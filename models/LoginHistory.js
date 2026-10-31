import mongoose from "mongoose";

const loginHistorySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },

        browser: {
            type: String,
            required: true,
            trim: true
        },

        ip: {
            type: String,
            required: true,
            trim: true
        },

        date: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

loginHistorySchema.index({ user: 1, date: -1 });
loginHistorySchema.index({ email: 1 });

const LoginHistory = mongoose.model(
    "LoginHistory",
    loginHistorySchema
);

export default LoginHistory;