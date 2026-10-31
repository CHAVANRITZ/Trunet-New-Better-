
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Role from "../models/Role.js";
import { env } from "../config/env.js";
import { isSuperAdmin as checkIsSuperAdmin } from "../utils/checkPermissions.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Authenticates requests using the JWT access token.
 *
 * Loads the current user and role from MongoDB on every protected
 * request so account status and permission changes take effect.
 *
 * All errors are forwarded to Express error middleware with next(error).
 */
export async function authMiddleware(req, res, next) {
    try {
        const authorizationHeader = req.headers.authorization;

        if (!authorizationHeader) {
            return next(
                new ApiError(
                    401,
                    "You are not logged in. Please log in to get access."
                )
            );
        }

        const [scheme, token] = authorizationHeader.split(" ");

        if (scheme !== "Bearer" || !token) {
            return next(
                new ApiError(401, "Invalid authorization header.")
            );
        }

        let decodedToken;

        try {
            decodedToken = jwt.verify(token, env.JWT_SECRET);
        } catch (error) {
            if (error.name === "TokenExpiredError") {
                return next(
                    new ApiError(
                        401,
                        "Your token has expired. Please log in again."
                    )
                );
            }

            if (
                error.name === "JsonWebTokenError" ||
                error.name === "NotBeforeError"
            ) {
                return next(
                    new ApiError(
                        401,
                        "Invalid token. Please log in again."
                    )
                );
            }

            return next(error);
        }

        // Require the authenticated user's ID in the token.
        if (
            !decodedToken.sub ||
            !jwtIdIsValid(decodedToken.sub)
        ) {
            return next(
                new ApiError(
                    401,
                    "Invalid token. User information is missing."
                )
            );
        }

// Center-selection tokens may access only the center-selection endpoint.
// Center-selection tokens can access only the existing selection endpoint.
if (decodedToken.step === "center_selection") {
    const isSelectCenterEndpoint =
        req.method === "POST" &&
        req.path.replace(/\/+$/, "") === "/select-center";

    if (!isSelectCenterEndpoint) {
        return res.status(403).json({
            success: false,
            message: "Please select a center first.",
            requiresCenterSelection: true
        });
    }
}

        // Load the latest user record from MongoDB.
        const user = await User.findById(decodedToken.sub);

        if (!user) {
            return next(
                new ApiError(
                    401,
                    "The user belonging to this token no longer exists."
                )
            );
        }

        if (user.status !== "Enable") {
            return next(
                new ApiError(
                    403,
                    "Your account has been disabled. Please contact administrator."
                )
            );
        }

        if (!user.role) {
            return next(
                new ApiError(403, "User role is not configured.")
            );
        }

        // Load the raw role document to preserve stored permissions.
        const role = await Role.collection.findOne({
            _id: user.role
        });

        if (!role) {
            return next(
                new ApiError(403, "User role is not configured.")
            );
        }

        // Determine Super Admin access from the user or role.
        const roleTitle =
            typeof role.roleTitle === "string"
                ? role.roleTitle.trim().toLowerCase()
                : "";

        const userIsSuperAdmin = user.isSuperAdmin === true;
        const roleIsSuperAdmin = role.isSuperAdmin === true;
        const titleIsSuperAdmin = roleTitle === "superadmin";

        const superAdminStatus =
            userIsSuperAdmin ||
            roleIsSuperAdmin ||
            titleIsSuperAdmin;

        // Attach the authenticated user to the request.
        req.user = {
            id: user._id.toString(),
            role,
            status: user.status,
            fullUser: user,
            isSuperAdmin: superAdminStatus
        };

        // Preserve the selected center when present in the token.
        if (decodedToken.centerId) {
            req.selectedCenterId = decodedToken.centerId;
        }

        return next();
    } catch (error) {
        // Forward database errors and all unexpected errors.
        return next(error);
    }
}

/**
 * Checks whether a value can be used as a MongoDB user ID.
 */
function jwtIdIsValid(value) {
    return (
        typeof value === "string" &&
        /^[a-fA-F0-9]{24}$/.test(value)
    );
}

/**
 * Restricts access to specific database-backed role titles.
 *
 * Super Admin users are allowed through automatically.
 */
export function restrictTo(...roles) {
    return function roleMiddleware(req, res, next) {
        if (!req.user) {
            return next(
                new ApiError(401, "Authentication required.")
            );
        }

        const hasSuperAdminAccess =
            req.user.isSuperAdmin === true ||
            checkIsSuperAdmin(req.user);

        if (hasSuperAdminAccess) {
            return next();
        }

        const currentRole = req.user.role?.roleTitle;

        if (!roles.includes(currentRole)) {
            return next(
                new ApiError(
                    403,
                    "You do not have permission to perform this action."
                )
            );
        }

        return next();
    };
}
