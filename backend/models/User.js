import mongoose from "mongoose";

/**
 * User schema for Trunet authentication and access control.
 *
 * A user represents an authenticated person who can interact
 * with the Trunet system. Authorization is handled separately
 * through the user's assigned role and permissions.
 *
 * Security-sensitive fields such as the password are excluded
 * from normal query results by default.
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

        /*
         * The user's primary operational center.
         *
         * This remains separate from accessibleCenters because
         * a user's primary center and the centers they are allowed
         * to access are not necessarily the same thing.
         */
        center: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Center",
            default: null
        },

        /*
         * Defines the centers this user is permitted to access.
         *
         * Authorization rules involving center-level access will
         * be implemented in the service/middleware layer rather
         * than embedded inside the User model.
         */
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

        /*
         * Used for basic account lockout protection.
         *
         * We will implement the actual login-attempt rules in
         * authService rather than placing business logic here.
         */
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

/*
 * Indexes improve lookup performance for fields frequently
 * used during authentication and user administration.
 *
 * username and email already receive unique indexes from
 * their schema definitions, so they are not duplicated here.
 */
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ center: 1 });

const User = mongoose.model("User", userSchema);

export default User;