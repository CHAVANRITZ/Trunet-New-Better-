import mongoose from "mongoose";

/**
 * User schema for Trunet authentication and access control.
 */
const userSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: true,
            trim: true
        },

        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true
        },

        email: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
            lowercase: true
        },

        mobile: {
            type: String,
            trim: true
        },

        password: {
            type: String,
            required: true,
            select: false
        },

        role: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Role",
            required: true
        },

        // User-level Super Admin access
        isSuperAdmin: {
            type: Boolean,
            default: false
        },

        // Primary operational center
        center: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Center",
            default: null
        },

        // Centers this user is permitted to access
        accessibleCenters: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Center"
            }
        ],

        status: {
            type: String,
            enum: ["Enable", "Disable"],
            default: "Enable"
        },

        lastLogin: {
            type: Date,
            default: null
        },

        // Account lockout protection
        loginAttempts: {
            type: Number,
            default: 0
        },

        lockUntil: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Indexes
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ center: 1 });

const User = mongoose.model("User", userSchema);

export default User;