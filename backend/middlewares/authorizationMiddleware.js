import { ApiError } from "../utils/ApiError.js";
import { isSuperAdmin } from "../utils/checkPermissions.js";

/**
 * Checks whether the authenticated user has at least one
 * of the requested permission actions.
 *
 * Permissions are read directly from the user's database-backed
 * role. No permission list is maintained in application code.
 *
 * Legacy permission structure:
 *
 * role.permissions[] = {
 *     module,
 *     permissions: []
 * }
 *
 * Example:
 *
 * authorize("create_user", "update_user")
 */
export function authorize(...requiredPermissions) {
    return function authorizationMiddleware(req, res, next) {
        if (!req.user) {
            throw new ApiError(
                401,
                "Authentication required."
            );
        }

        /*
         * Super-admin access is controlled by the database field
         * role.isSuperAdmin. No role name is hardcoded here.
         */
        if (isSuperAdmin(req.user)) {
            return next();
        }

        /*
         * If no permissions are supplied, there is nothing
         * to validate.
         */
        if (requiredPermissions.length === 0) {
            return next();
        }

        const permissionGroups = req.user.role?.permissions || [];

        /*
         * Access is granted when the user's role contains
         * at least one of the requested permission actions.
         */
        const hasPermission = requiredPermissions.some(
            (requiredPermission) =>
                permissionGroups.some(
                    (group) =>
                        group.permissions?.includes(requiredPermission)
                )
        );

        if (!hasPermission) {
            throw new ApiError(
                403,
                "Access denied. Insufficient permissions."
            );
        }

        next();
    };
}

/**
 * Checks whether the authenticated user has permission for
 * a specific legacy module and action.
 *
 * Legacy permission structure:
 *
 * module → permissions[]
 *
 * Example:
 *
 * authorizeAccess("User", "create_user")
 *
 * Module matching is case-insensitive.
 */
export function authorizeAccess(moduleName, ...requiredActions) {
    return function moduleAuthorizationMiddleware(req, res, next) {
        if (!req.user) {
            throw new ApiError(
                401,
                "Authentication required."
            );
        }

        /*
         * Super-admin access is determined from the database-backed
         * role configuration.
         */
        if (isSuperAdmin(req.user)) {
            return next();
        }

        const permissionGroups = req.user.role?.permissions || [];

        /*
         * Find the permission group belonging to the requested
         * legacy module.
         */
        const modulePermissions = permissionGroups.find(
            (group) =>
                group.module?.toLowerCase() === moduleName?.toLowerCase()
        );

        if (!modulePermissions) {
            throw new ApiError(
                403,
                `Access denied. No permissions for ${moduleName} module.`
            );
        }

        /*
         * The legacy authorization behaviour allows access when
         * at least one requested action exists in the module.
         */
        const hasPermission = requiredActions.some(
            (action) =>
                modulePermissions.permissions?.includes(action)
        );

        if (!hasPermission) {
            throw new ApiError(
                403,
                `Access denied. You need at least one of these permissions: ${requiredActions.join(
                    ", "
                )} for the ${moduleName} module.`
            );
        }

        next();
    };
}

/**
 * Backward-compatible permission middleware.
 *
 * Existing routes may use requirePermission(module, action).
 * It delegates directly to authorizeAccess() so there is
 * only one permission-checking implementation.
 */
export function requirePermission(moduleName, permissionAction) {
    return authorizeAccess(moduleName, permissionAction);
}