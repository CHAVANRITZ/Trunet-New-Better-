import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Role from "../models/Role.js";
import { env } from "../config/env.js";
import { isSuperAdmin as checkIsSuperAdmin } from "../utils/checkPermissions.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Authenticates requests using the JWT access token.
 *
 * The current user and role are loaded from MongoDB on every
 * protected request so that changes to user status, role, or
 * permissions take effect without requiring a new token.
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

        // Require the authenticated user's ID in the token.
        if (!decodedToken.sub) {
            throw new ApiError(
                401,
                "Invalid token. User information is missing."
            );
        }

        // Center-selection tokens cannot access protected endpoints.
        if (decodedToken.step === "center_selection") {
            return res.status(403).json({
                success: false,
                message: "Please select a center first.",
                requiresCenterSelection: true
            });
        }

        // Load the latest user record from MongoDB.
        const user = await User.findById(decodedToken.sub);

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
         * Load the raw role document to preserve its stored
         * permissions and Super Admin configuration.
         */
        const role = await Role.collection.findOne({
            _id: user.role
        });

        if (!role) {
            throw new ApiError(
                403,
                "User role is not configured."
            );
        }

        /*
         * Super Admin detection:
         * 1. Check the user's explicit flag.
         * 2. Check the role's explicit flag.
         * 3. Recognize the superadmin role title.
         *
         * This supports your current database, where the user
         * flag is false but the assigned role flag is true.
         */
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

        /*
         * Preserve the selected center from the token when
         * present. A null user center is allowed here.
         */
        if (decodedToken.centerId) {
            req.selectedCenterId = decodedToken.centerId;
        }

        // Temporary diagnostic log; remove after verification.
        console.log("AUTH MIDDLEWARE SUPERADMIN CHECK", {
            email: user.email,
            userIsSuperAdmin,
            roleTitle: role.roleTitle,
            roleIsSuperAdmin,
            finalIsSuperAdmin: req.user.isSuperAdmin,
            center: user.center?.toString?.() || user.center || null
        });

        return next();
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
 * Super Admin users are allowed through automatically.
 *
 * @param {...string} roles - Allowed role titles
 * @returns {Function} Express middleware
 */
export function restrictTo(...roles) {
    return function roleMiddleware(req, res, next) {
        if (!req.user) {
            throw new ApiError(
                401,
                "Authentication required."
            );
        }

        // Use the flag established by authMiddleware.
        // Retain the existing utility as a compatibility fallback.
        const hasSuperAdminAccess =
            req.user.isSuperAdmin === true ||
            checkIsSuperAdmin(req.user);

        if (hasSuperAdminAccess) {
            return next();
        }

        const currentRole =
            req.user.role?.roleTitle;

        if (!roles.includes(currentRole)) {
            throw new ApiError(
                403,
                "You do not have permission to perform this action."
            );
        }

        return next();
    };
}