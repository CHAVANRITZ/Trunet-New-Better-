import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { ApiError } from "./ApiError.js";

/**
 * Converts a JWT duration string into milliseconds.
 *
 * Supported formats:
 * - seconds: 30s
 * - minutes: 15m
 * - hours: 1h
 * - days: 7d
 * - weeks: 1w
 *
 * Keeping this conversion in the token utility prevents other
 * layers from duplicating JWT expiration configuration logic.
 *
 * @param {string} duration - JWT duration.
 * @returns {number} Duration in milliseconds.
 */
export function durationToMilliseconds(duration) {
    const match = /^(\d+)\s*(s|m|h|d|w)$/.exec(duration);

    if (!match) {
        throw new ApiError(
            500,
            "Invalid JWT expiration configuration."
        );
    }

    const value = Number(match[1]);
    const unit = match[2];

    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000
    };

    return value * multipliers[unit];
}

/**
 * Creates a short-lived JWT access token.
 *
 * The access token identifies the authenticated user when they
 * access protected API endpoints.
 *
 * Only the minimum identity information required by authentication
 * middleware should be placed inside the token payload.
 *
 * @param {Object} payload - Token payload.
 * @returns {string} Signed access token.
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
 * Creates a long-lived JWT refresh token.
 *
 * The refresh token is persisted separately as a hashed session
 * record so individual sessions can be revoked.
 *
 * @param {Object} payload - Token payload.
 * @returns {string} Signed refresh token.
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
 * Verifies an access token and returns its decoded payload.
 *
 * @param {string} token - JWT access token.
 * @returns {Object} Decoded token payload.
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
 * Verifies a refresh token and returns its decoded payload.
 *
 * JWT verification confirms the token was signed by Trunet and
 * has not expired. The refresh-token database record must still
 * be checked separately because a valid JWT may have been revoked.
 *
 * @param {string} token - JWT refresh token.
 * @returns {Object} Decoded token payload.
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