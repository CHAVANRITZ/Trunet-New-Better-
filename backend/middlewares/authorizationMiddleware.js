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

    const normalizedReferencedPermissions = permissions.reduce(
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

            if (!group.permissions.includes(permission.action)) {
                group.permissions.push(permission.action);
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
    return async function authorizationMiddleware(req, res, next) {
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

            const rolePermissions = await normalizePermissions(
                req.user.role?.permissions || []
            );

            const userPermissions = rolePermissions.flatMap(
                (group) =>
                    (group.permissions || []).map(
                        (permission) =>
                            `${group.module}:${permission}`
                    )
            );

            const hasPermission = requiredPermissions.some(
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

            const rolePermissions = await normalizePermissions(
                req.user.role?.permissions || []
            );

            const modulePermissions = rolePermissions.find(
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
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Backward-compatible permission middleware.
 */
export function requirePermission(moduleName, permissionAction) {
    return authorizeAccess(
        moduleName,
        permissionAction
    );
}