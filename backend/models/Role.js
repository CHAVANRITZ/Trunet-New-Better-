import mongoose from "mongoose";

/**
 * Role schema for Trunet's role-based access control (RBAC).
 *
 * A role groups related permissions together.
 *
 * Example:
 *
 * Admin
 *   ├── manage_user
 *   ├── manage_indent
 *   └── manage_usage_all_center
 *
 * Users reference a role rather than storing their permissions
 * directly. This keeps authorization rules centralized and
 * prevents permission duplication across users.
 */
const roleSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        description: {
            type: String,
            trim: true,
            default: ""
        },

        permissions: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Permission"
            }
        ],

        status: {
            type: String,
            enum: ["Enable", "Disable"],
            default: "Enable"
        }
    },
    {
        timestamps: true
    }
);

/*
 * Makes role lookups predictable and efficient.
 */
roleSchema.index({ status: 1 });

const Role = mongoose.model("Role", roleSchema);

export default Role;