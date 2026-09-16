import User from "../models/User.js";
import Role from "../models/Role.js";

import { SYSTEM_ROLES } from "../constants/roles.js";
import { ApiError } from "../utils/ApiError.js";
import { verifyAccessToken } from "../utils/token.js";

/**
 * Authenticates a request using its access token.
 *
 * The JWT is used to identify the user, but authorization data
 * is loaded from MongoDB. This prevents an old JWT from retaining
 * outdated role information after a user's role or account status
 * changes.
 *
 * Expected header:
 *
 * Authorization: Bearer <access-token>
 */
export async function authMiddleware(req, res, next) {
    const authorizationHeader = req.headers.authorization;

    if (!authorizationHeader) {
        throw new ApiError(
            401,
            "Authentication required."
        );
    }

    const [scheme, token] = authorizationHeader.split(" ");

    if (
        scheme !== "Bearer" ||
        !token
    ) {
        throw new ApiError(
            401,
            "Invalid authorization header."
        );
    }

    const decodedToken = verifyAccessToken(token);

    /*
     * The JWT's subject identifies the user. The database remains
     * the source of truth for the user's current account status
     * and role.
     */
    const user = await User.findById(decodedToken.sub)
        .populate("role");

    if (!user) {
        throw new ApiError(
            401,
            "Authenticated user no longer exists."
        );
    }

    if (user.status !== "Enable") {
        throw new ApiError(
            403,
            "User account is disabled."
        );
    }

    if (!user.role) {
        throw new ApiError(
            403,
            "User role is not configured."
        );
    }

    if (user.role.status !== "Enable") {
        throw new ApiError(
            403,
            "User role is disabled."
        );
    }

    /*
     * Store the current database-backed identity on the request.
     *
     * Downstream authorization middleware can now use the current
     * role and permissions instead of trusting role information
     * from the JWT.
     */
    req.user = {
        id: user._id.toString(),
        role: user.role
    };

    next();
}