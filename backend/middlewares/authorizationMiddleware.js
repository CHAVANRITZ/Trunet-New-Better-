import Permission from "../models/Permission.js";

import { SYSTEM_ROLES } from "../constants/roles.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Creates middleware that requires a specific permission.
 *
 * Authentication and authorization are intentionally separate:
 *
 * authMiddleware
 *     → identifies the current user
 *
 * requirePermission()
 *     → determines whether that user may perform an action
 *
 * @param {string} permissionAction - Permission action identifier.
 * @returns {Function} Express middleware.
 */
export function requirePermission(permissionAction) {
    return async function permissionMiddleware(req, res, next) {
        if (!req.user) {
            throw new ApiError(
                401,
                "Authentication required."
            );
        }

        const role = req.user.role;

        /*
         * Super Admin has full administrative access.
         *
         * This is the one special role-level rule in the system.
         * Normal roles must rely on explicit permissions.
         */
        if (role.name === SYSTEM_ROLES.SUPER_ADMIN) {
            return next();
        }

        /*
         * Resolve the requested permission from the database.
         *
         * Permission definitions remain database records rather
         * than being hardcoded into individual endpoints.
         */
        const permission = await Permission.findOne({
            action: permissionAction,
            status: "Enable"
        });

        if (!permission) {
            throw new ApiError(
                403,
                "Required permission is not configured."
            );
        }

        /*
         * Role.permissions contains Permission ObjectIds.
         *
         * Compare their string representations because MongoDB
         * ObjectIds are objects rather than plain strings.
         */
        const hasPermission = role.permissions.some(
            (rolePermissionId) =>
                rolePermissionId.toString() ===
                permission._id.toString()
        );

        if (!hasPermission) {
            throw new ApiError(
                403,
                "You do not have permission to perform this action."
            );
        }

        next();
    };
}