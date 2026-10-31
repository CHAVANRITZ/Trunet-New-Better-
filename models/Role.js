import mongoose from "mongoose";

/**
 * Role schema for Trunet's role-based access control (RBAC).
 *
 * A role defines which permissions are available to users assigned
 * to that role.
 *
 * The structure of this document intentionally follows the legacy
 * Trunet database schema so that the new backend remains compatible
 * with the existing database and frontend contract.
 *
 * Example:
 *
 * {
 *   roleTitle: "admin",
 *   permissions: [
 *     {
 *       module: "User",
 *       permissions: [
 *         "create_user",
 *         "view_user",
 *         "update_user",
 *         "delete_user"
 *       ]
 *     }
 *   ]
 * }
 */
const permissionSchema = new mongoose.Schema(
    {
        module: {
            type: String,
            required: true,
            trim: true
        },

        permissions: [
            {
                type: String,
                required: true,
                trim: true
            }
        ]
    }
);

const roleSchema = new mongoose.Schema(
    {
        /*
         * Keep roleTitle exactly as defined by the legacy schema.
         *
         * Role names are part of the existing database contract,
         * so they must not be renamed to "name".
         */
        roleTitle: {
            type: String,
            required: [true, "Role title is required"],
            unique: true,
            trim: true,
            maxlength: [50, "Role title cannot exceed 50 characters"]
        },

        /*
         * Permissions are intentionally embedded in the role,
         * matching the legacy database structure.
         */
        permissions: [permissionSchema],

        /*
         * Identifies the user who created the role.
         */
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        /*
         * Superadmin is represented as a property of the role
         * in the legacy database.
         */
        isSuperAdmin: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

/*
 * Preserve the legacy unique roleTitle constraint.
 */
// roleSchema.index(
//     { roleTitle: 1 },
//     { unique: true }
// );

/*
 * Normalize role titles consistently while preserving the
 * original legacy field name.
 */
roleSchema.pre("save", function(next) {
    if (this.roleTitle) {
        this.roleTitle = this.roleTitle.toLowerCase();
    }

    next();
});

/**
 * Checks whether a role with the given title already exists.
 *
 * @param {string} roleTitle - Role title to check.
 * @returns {Promise<boolean>} True when the role exists.
 */
roleSchema.statics.roleExists = async function(roleTitle) {
    const role = await this.findOne({
        roleTitle: roleTitle.toLowerCase()
    });

    return Boolean(role);
};

const Role = mongoose.model("Role", roleSchema);

export default Role;