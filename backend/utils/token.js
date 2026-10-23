
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { ApiError } from "./ApiError.js";

/**
 * Converts a JWT duration string into milliseconds.
 * Supported formats: 30s, 15m, 1h, 7d, 1w.
 */
export function durationToMilliseconds(duration) {
    const match = /^(\d+)\s*(s|m|h|d|w)$/.exec(
        String(duration || "")
    );

    if (!match) {
        throw new ApiError(
            500,
            "Invalid JWT expiration configuration."
        );
    }

    const value = Number(match[1]);

    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000
    };

    return value * multipliers[match[2]];
}

/**
 * Generates a regular access token.
 */
export function generateAccessToken(payload) {
    if (!env.JWT_SECRET) {
        throw new ApiError(
            500,
            "JWT access token configuration is missing."
        );
    }

    return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN
    });
}

/**
 * Generates a restricted token for center selection.
 * It must not grant access to normal protected endpoints.
 */
export function generateCenterSelectionToken(payload) {
    if (!env.JWT_SECRET) {
        throw new ApiError(
            500,
            "JWT access token configuration is missing."
        );
    }

    if (!payload?.sub) {
        throw new ApiError(
            500,
            "Center-selection token requires a user ID."
        );
    }

    return jwt.sign(
        {
            ...payload,
            step: "center_selection"
        },
        env.JWT_SECRET,
        {
            expiresIn: "15m"
        }
    );
}

/**
 * Generates a refresh token.
 */
export function generateRefreshToken(payload) {
    if (!env.REFRESH_TOKEN_SECRET) {
        throw new ApiError(
            500,
            "JWT refresh token configuration is missing."
        );
    }

    return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, {
        expiresIn: env.REFRESH_TOKEN_EXPIRES_IN
    });
}

/**
 * Verifies a regular access token.
 */
export function verifyAccessToken(token) {
    if (!env.JWT_SECRET) {
        throw new ApiError(
            500,
            "JWT access token configuration is missing."
        );
    }

    try {
        return jwt.verify(token, env.JWT_SECRET);
    } catch {
        throw new ApiError(
            401,
            "Invalid or expired access token."
        );
    }
}

/**
 * Verifies a refresh token.
 * The caller must additionally check its database session record.
 */
export function verifyRefreshToken(token) {
    if (!env.REFRESH_TOKEN_SECRET) {
        throw new ApiError(
            500,
            "JWT refresh token configuration is missing."
        );
    }

    try {
        return jwt.verify(token, env.REFRESH_TOKEN_SECRET);
    } catch {
        throw new ApiError(
            401,
            "Invalid or expired refresh token."
        );
    }
}
