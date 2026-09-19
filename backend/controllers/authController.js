import User from "../models/User.js";

import {
    login,
    refreshToken,
    logout
} from "../services/authService.js";

import { sendSuccess } from "../utils/responseHandler.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Authenticates a user using username and password
 * and returns authentication tokens.
 */
export async function loginController(req, res) {
    const result = await login({
        username: req.body.username,
        password: req.body.password
    });

    return sendSuccess(res, {
        statusCode: 200,
        message: "Login successful.",
        data: result
    });
}

/**
 * Returns the currently authenticated user's profile.
 */
export async function getCurrentUser(req, res) {
    const user = await User.findById(req.user.id)
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

    return sendSuccess(res, {
        message: "Current user retrieved successfully.",
        data: {
            user
        }
    });
}

/**
 * Exchanges a valid refresh token for a new access token
 * and a rotated refresh token.
 */
export async function refreshTokenController(req, res) {
    const result = await refreshToken(
        req.body.refreshToken
    );

    return sendSuccess(res, {
        statusCode: 200,
        message: "Token refreshed successfully.",
        data: result
    });
}

/**
 * Logs out the current authentication session.
 */
export async function logoutController(req, res) {
    await logout(req.body.refreshToken);

    return sendSuccess(res, {
        statusCode: 200,
        message: "Logout successful."
    });
}