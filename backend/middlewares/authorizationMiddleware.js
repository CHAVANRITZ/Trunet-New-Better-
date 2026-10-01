import { ApiError } from "../utils/ApiError.js";
import { isSuperAdmin } from "../utils/checkPermissions.js";
import Permission from "../models/Permission.js";

/**
 * Normalizes both supported permission formats:
 *
 * Legacy:
 * permissions: [
 *   {
 *     module: "Center",
 *     permissions: ["view_all_center"]
 *   }
 * ]
 *
 * Current database:
 * permissions: [
 *   ObjectId("...")
 * ]
 *
 * No database records are modified.
 */
const normalizePermissions = async (rolePermissions = []) => {
    if (!Array.isArray(rolePermissions)) {
        return [];
    }

    const embeddedPermissions = rolePermissions.filter(
        (permission) =>
            permission &&
            typeof permission === "object" &&
            !permission._bsontype &&
            permission.module
    );

    const permissionIds = rolePermissions.filter(
        (permission) =>
            permission &&
            (
                typeof permission === "string" ||
                permission._bsontype === "ObjectID" ||
                permission._bsontype === "ObjectId"
            )
    );

    if (permissionIds.length === 0) {
        return embeddedPermissions;
    }

    const permissions = await Permission.find({
        _id: { $in: permissionIds },
        status: "Enable",
    }).select("module action");

    const normalizedReferencedPermissions =
        permissions.reduce(
            (groups, permission) => {
                let group = groups.find(
                    (item) =>
                        item.module.toLowerCase() ===
                        permission.module.toLowerCase()
                );

                if (!group) {
                    group = {
                        module: permission.module,
                        permissions: [],
                    };

                    groups.push(group);
                }

                if (
                    !group.permissions.includes(
                        permission.action
                    )
                ) {
                    group.permissions.push(
                        permission.action
                    );
                }

                return groups;
            },
            []
        );

    return [
        ...embeddedPermissions,
        ...normalizedReferencedPermissions,
    ];
};

/**
 * Checks whether the authenticated user has at least
 * one of the requested permission actions.
 */
export function authorize(...requiredPermissions) {
    return async function authorizationMiddleware(
        req,
        res,
        next
    ) {
        try {
            if (!req.user) {
                throw new ApiError(
                    401,
                    "Authentication required."
                );
            }

            if (isSuperAdmin(req.user)) {
                return next();
            }

            if (requiredPermissions.length === 0) {
                return next();
            }

            const rolePermissions =
                await normalizePermissions(
                    req.user.role?.permissions || []
                );

            const userPermissions =
                rolePermissions.flatMap(
                    (group) =>
                        (group.permissions || []).map(
                            (permission) =>
                                `${group.module}:${permission}`
                        )
                );

            const hasPermission =
                requiredPermissions.some(
                    (permission) =>
                        userPermissions.includes(permission)
                );

            if (!hasPermission) {
                throw new ApiError(
                    403,
                    "Access denied. Insufficient permissions."
                );
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Checks whether the authenticated user has permission
 * for a specific module and action.
 */
export function authorizeAccess(
    moduleName,
    ...requiredActions
) {
    return async function moduleAuthorizationMiddleware(
        req,
        res,
        next
    ) {
        try {
            if (!req.user) {
                throw new ApiError(
                    401,
                    "Authentication required."
                );
            }

            if (isSuperAdmin(req.user)) {
                return next();
            }

            const rolePermissions =
                await normalizePermissions(
                    req.user.role?.permissions || []
                );

            const modulePermissions =
                rolePermissions.find(
                    (group) =>
                        group.module?.toLowerCase() ===
                        moduleName?.toLowerCase()
                );

            if (!modulePermissions) {
                throw new ApiError(
                    403,
                    `Access denied. No permissions for ${moduleName} module.`
                );
            }

            const hasPermission =
                requiredActions.some(
                    (action) =>
                        modulePermissions.permissions?.includes(
                            action
                        )
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
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Builds a normalized authorization context for a module.
 *
 * This middleware does not grant or remove permissions.
 * It only exposes the permissions already granted to the
 * authenticated user's database role.
 *
 * The context is consumed by services that need to make
 * business-level access decisions such as own-center versus
 * all-center access.
 */
export function attachAuthorizationContext(moduleName) {
    return async function authorizationContextMiddleware(
        req,
        res,
        next
    ) {
        try {
            if (!req.user) {
                throw new ApiError(
                    401,
                    "Authentication required."
                );
            }

            if (isSuperAdmin(req.user)) {
                req.authorizationContext = {
                    isSuperAdmin: true,
                    module: moduleName,
                    permissions: [],

                    canManageAll: true,
                    canManageOwn: true,
                    canViewAll: true,
                    canViewOwn: true,
                    canDeleteAll: true,
                    canDeleteOwn: true,
                    canApprove: true,
                    canIndentAll: true,
                    canIndentOwn: true,
                };

                return next();
            }

            const rolePermissions =
                await normalizePermissions(
                    req.user.role?.permissions || []
                );

            const modulePermissions =
                rolePermissions.find(
                    (group) =>
                        group.module?.toLowerCase() ===
                        moduleName?.toLowerCase()
                );

            const permissions =
                modulePermissions?.permissions || [];

            /*
             * Convert the database permissions into generic
             * capability flags consumed by services.
             *
             * These flags do not create permissions. They only
             * represent permissions already assigned to the user.
             */
            req.authorizationContext = {
                isSuperAdmin: false,
                module: moduleName,
                permissions,

                canManageAll:
                    permissions.includes(
                        "manage_stock_transfer_all_center"
                    ),

                canManageOwn:
                    permissions.includes(
                        "manage_stock_transfer_own_center"
                    ),

                canViewAll:
                    permissions.includes(
                        "stock_transfer_all_center"
                    ),

                canViewOwn:
                    permissions.includes(
                        "stock_transfer_own_center"
                    ),

                canDeleteAll:
                    permissions.includes(
                        "delete_transfer_all_center"
                    ),

                canDeleteOwn:
                    permissions.includes(
                        "delete_transfer_own_center"
                    ),

                canApprove:
                    permissions.includes(
                        "approval_transfer_center"
                    ),

                canIndentAll:
                    permissions.includes(
                        "indent_all_center"
                    ),

                canIndentOwn:
                    permissions.includes(
                        "indent_own_center"
                    ),
            };

            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Backward-compatible permission middleware.
 */
export function requirePermission(
    moduleName,
    permissionAction
) {
    return authorizeAccess(
        moduleName,
        permissionAction
    );
}