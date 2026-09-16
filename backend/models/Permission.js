import mongoose from "mongoose";

/**
 * Permission schema for Trunet's RBAC system.
 *
 * A permission represents one specific capability within the
 * application. Permissions are intentionally granular so that
 * access can be controlled without hard-coding role names into
 * application logic.
 *
 * Example:
 *
 * module: "User"
 * action: "manage_user"
 *
 * or:
 *
 * module: "Stock"
 * action: "stock_transfer_approve_from_outlet"
 */
const permissionSchema = new mongoose.Schema(
    {
        module: {
            type: String,
            required: true,
            trim: true
        },

        action: {
            type: String,
            required: true,
            trim: true
        },

        description: {
            type: String,
            trim: true,
            default: ""
        },

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
 * A module/action pair should represent one unique capability.
 *
 * For example, there should not be two separate permissions
 * representing:
 *
 * User + manage_user
 *
 * because that would make authorization ambiguous.
 */
permissionSchema.index(
    { module: 1, action: 1 },
    { unique: true }
);

permissionSchema.index({ status: 1 });

const Permission = mongoose.model("Permission", permissionSchema);

export default Permission;