import jwt from "jsonwebtoken";

import User from "../models/User.js";
import { env } from "../config/env.js";
import { isSuperAdmin } from "../utils/checkPermissions.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Authenticates requests using the JWT access token.
 *
 * The access token identifies the user through the `sub`
 * claim. The current user and role are loaded from MongoDB
 * on every protected request so that changes to user status,
 * role, or permissions take effect without requiring a new token.
 */
export async function authMiddleware(req, res, next) {
    try {
        const authorizationHeader = req.headers.authorization;

        if (!authorizationHeader) {
            throw new ApiError(
                401,
                "You are not logged in. Please log in to get access."
            );
        }

        const [scheme, token] = authorizationHeader.split(" ");

        if (scheme !== "Bearer" || !token) {
            throw new ApiError(
                401,
                "Invalid authorization header."
            );
        }

        const decodedToken = jwt.verify(token, env.JWT_SECRET);

        /*
         * The new authentication service uses the standard
         * JWT `sub` claim for the authenticated user's ID.
         */
        if (!decodedToken.sub) {
            throw new ApiError(
                401,
                "Invalid token. User information is missing."
            );
        }

        /*
         * Center-selection tokens must not be used to access
         * normal protected endpoints.
         */
        if (decodedToken.step === "center_selection") {
            return res.status(403).json({
                success: false,
                message: "Please select a center first.",
                requiresCenterSelection: true
            });
        }

        /*
         * Load the current user and the complete database-backed
         * role. Permissions are intentionally read from the role
         * document instead of being hardcoded in application code.
         */
        const user = await User.findById(decodedToken.sub)
    .populate({
        path: "role",
        select: "roleTitle permissions isSuperAdmin createdBy createdAt updatedAt"
    });

        if (!user) {
            throw new ApiError(
                401,
                "The user belonging to this token no longer exists."
            );
        }

        if (user.status !== "Enable") {
            throw new ApiError(
                403,
                "Your account has been disabled. Please contact administrator."
            );
        }

        if (!user.role) {
            throw new ApiError(
                403,
                "User role is not configured."
            );
        }

        /*
         * Keep the authenticated user object available to all
         * downstream controllers and authorization middleware.
         */
        req.user = {
    id: user._id.toString(),
    role: user.role,
    status: user.status,
    fullUser: user
};

        /*
         * Preserve the center ID when it exists in a token.
         * The current login flow may legitimately issue a token
         * without a center when center selection has not occurred.
         */
        if (decodedToken.centerId) {
            req.selectedCenterId = decodedToken.centerId;
        }

        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            throw new ApiError(
                401,
                "Your token has expired. Please log in again."
            );
        }

        if (error.name === "JsonWebTokenError") {
            throw new ApiError(
                401,
                "Invalid token. Please log in again."
            );
        }

        throw error;
    }
}

/**
 * Restricts access to specific database-backed role titles.
 *
 * This middleware is retained for legacy routes that explicitly
 * restrict access by role. It does not create or define roles.
 *
 * Super-admin access is determined using role.isSuperAdmin.
 *
 * @param {...string} roles - Allowed role titles
 * @returns {Function} Express middleware
 */
export function restrictTo(...roles) {
    return function roleMiddleware(req, res, next) {
        if (!req.user) {
            throw new ApiError(401, "Authentication required.");
        }

        if (isSuperAdmin(req.user)) {
            return next();
        }

        const currentRole = req.user.role?.roleTitle;

        if (!roles.includes(currentRole)) {
            throw new ApiError(
                403,
                "You do not have permission to perform this action."
            );
        }

        next();
    };
}