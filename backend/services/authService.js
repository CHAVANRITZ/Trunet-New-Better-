import crypto from "crypto";

import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

import { comparePassword } from "../utils/password.js";

import {
    durationToMilliseconds,
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken
} from "../utils/token.js";

/**
 * Maximum number of consecutive failed login attempts
 * before the account is temporarily locked.
 */
const MAX_LOGIN_ATTEMPTS = 5;

/**
 * Duration of the temporary account lock.
 */
const LOCK_DURATION_MS = 15 * 60 * 1000;

/**
 * Creates a SHA-256 hash of a refresh token.
 *
 * Only the hash is stored in MongoDB.
 *
 * @param {string} token - Raw refresh token.
 * @returns {string} SHA-256 token hash.
 */
function hashRefreshToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

/**
 * Calculates the expiration date for a refresh-token session.
 *
 * @returns {Date} Refresh-token expiration timestamp.
 */
function getRefreshTokenExpiry() {
    const duration = durationToMilliseconds(
        env.REFRESH_TOKEN_EXPIRES_IN
    );

    return new Date(Date.now() + duration);
}

/**
 * Removes authentication-sensitive fields before
 * returning user information to the client.
 *
 * @param {Object} user - Mongoose user document.
 * @returns {Object} Safe user representation.
 */
function sanitizeUser(user) {
    const userObject = user.toObject();

    delete userObject.password;
    delete userObject.loginAttempts;
    delete userObject.lockUntil;

    return userObject;
}

/**
 * Authenticates a user using username and password.
 *
 * Authentication rules handled here:
 * - User must exist.
 * - User account must be enabled.
 * - Temporarily locked accounts cannot log in.
 * - Password must match.
 * - Failed attempts are tracked.
 * - Successful login resets failed attempts.
 * - Last login time is recorded.
 * - Access and refresh tokens are issued.
 *
 * @param {Object} credentials - Login credentials.
 * @param {string} credentials.username - Username.
 * @param {string} credentials.password - Plain-text password.
 * @returns {Promise<Object>} Authentication result.
 */
export async function login({ username, password }) {
    /*
     * Validate username.
     */
    if (!username || typeof username !== "string") {
        throw new ApiError(
            400,
            "Username is required."
        );
    }

    /*
     * Validate password.
     */
    if (!password || typeof password !== "string") {
        throw new ApiError(
            400,
            "Password is required."
        );
    }

    /*
     * Normalize username before querying the database.
     */
    const normalizedUsername = username
        .trim()
        .toLowerCase();

    /*
     * Password is excluded from normal User queries,
     * so explicitly select it for authentication.
     */
    const user = await User.findOne({
        username: normalizedUsername
    })
        .select("+password")
        .populate("role");

    /*
     * Do not reveal whether the username exists.
     */
    if (!user) {
        throw new ApiError(
            401,
            "Invalid credentials."
        );
    }

    /*
     * Disabled accounts cannot authenticate.
     */
    if (user.status !== "Enable") {
        throw new ApiError(
            403,
            "User account is disabled."
        );
    }

    /*
     * Check whether a previous series of failed attempts
     * has temporarily locked the account.
     */
    if (
        user.lockUntil &&
        user.lockUntil > new Date()
    ) {
        throw new ApiError(
            423,
            "Account temporarily locked. Please try again later."
        );
    }

    /*
     * Clear an expired account lock before authentication.
     */
    if (
        user.lockUntil &&
        user.lockUntil <= new Date()
    ) {
        user.lockUntil = null;
        user.loginAttempts = 0;
    }

    /*
     * Compare the supplied password with the stored hash.
     */
    const passwordValid = await comparePassword(
        password,
        user.password
    );

    /*
     * Handle an incorrect password.
     */
    if (!passwordValid) {
        user.loginAttempts =
            (user.loginAttempts || 0) + 1;

        /*
         * Lock the account after the maximum number
         * of consecutive failed attempts.
         */
        if (
            user.loginAttempts >=
            MAX_LOGIN_ATTEMPTS
        ) {
            user.lockUntil = new Date(
                Date.now() + LOCK_DURATION_MS
            );
        }

        await user.save();

        /*
         * Keep the response generic to avoid revealing
         * authentication details.
         */
        throw new ApiError(
            401,
            "Invalid credentials."
        );
    }

    /*
     * Successful authentication clears previous
     * failed-login state and records the login time.
     */
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();

    await user.save();

    /*
     * Generate the access token using the authenticated
     * user's database identity and role reference.
     */
    const accessToken = generateAccessToken({
        sub: user._id.toString(),
        role: user.role?._id?.toString()
    });

    /*
     * Generate a refresh token for the authentication session.
     */
    const refreshToken = generateRefreshToken({
        sub: user._id.toString()
    });

    /*
     * Store only the hash of the refresh token.
     */
    await RefreshToken.create({
        user: user._id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: getRefreshTokenExpiry()
    });

    return {
        user: sanitizeUser(user),
        accessToken,
        refreshToken
    };
}

/**
 * Refreshes an authenticated session using a valid
 * refresh token.
 *
 * Refresh-token rotation is used so that the previous
 * refresh token cannot be reused after successful rotation.
 *
 * @param {string} token - Raw refresh token.
 * @returns {Promise<Object>} New access and refresh tokens.
 */
export async function refreshToken(token) {
    if (
        !token ||
        typeof token !== "string"
    ) {
        throw new ApiError(
            401,
            "Refresh token is required."
        );
    }

    /*
     * Verify JWT signature and expiration.
     */
    const decodedToken = verifyRefreshToken(token);

    if (!decodedToken.sub) {
        throw new ApiError(
            401,
            "Invalid refresh token."
        );
    }

    /*
     * Hash the supplied refresh token because only
     * the hash is stored in MongoDB.
     */
    const tokenHash = hashRefreshToken(token);

    /*
     * Find the corresponding persisted refresh session
     * and load the current user and database-backed role.
     */
    const storedToken = await RefreshToken.findOne({
        tokenHash
    }).populate({
        path: "user",
        populate: {
            path: "role"
        }
    });

    /*
     * A valid JWT must also have a corresponding
     * active database session.
     */
    if (!storedToken) {
        throw new ApiError(
            401,
            "Invalid refresh token."
        );
    }

    /*
     * Prevent reuse of an already revoked token.
     */
    if (storedToken.revokedAt) {
        throw new ApiError(
            401,
            "Refresh token has been revoked."
        );
    }

    /*
     * Check database expiration as an additional safeguard.
     */
    if (
        storedToken.expiresAt <= new Date()
    ) {
        throw new ApiError(
            401,
            "Refresh token has expired."
        );
    }

    const user = storedToken.user;

    /*
     * The associated user must still exist.
     */
    if (!user) {
        throw new ApiError(
            401,
            "Authenticated user no longer exists."
        );
    }

    /*
     * The current account status is checked before
     * issuing another access token.
     */
    if (user.status !== "Enable") {
        throw new ApiError(
            403,
            "User account is disabled."
        );
    }

    /*
     * A user must still have a configured database-backed role.
     */
    if (!user.role) {
        throw new ApiError(
            403,
            "User role is not configured."
        );
    }

    /*
     * Ensure the refresh token belongs to the same
     * user identified by its JWT payload.
     */
    if (
        user._id.toString() !==
        decodedToken.sub
    ) {
        throw new ApiError(
            401,
            "Invalid refresh token."
        );
    }

    /*
     * Revoke the old refresh token before issuing
     * its replacement.
     */
    storedToken.revokedAt = new Date();

    await storedToken.save();

    /*
     * Generate a new access token using the user's
     * current database-backed role.
     */
    const accessToken = generateAccessToken({
        sub: user._id.toString(),
        role: user.role._id.toString()
    });

    /*
     * Generate a completely new refresh token.
     */
    const newRefreshToken = generateRefreshToken({
        sub: user._id.toString()
    });

    /*
     * Store only the hash of the new refresh token.
     */
    await RefreshToken.create({
        user: user._id,
        tokenHash: hashRefreshToken(newRefreshToken),
        expiresAt: getRefreshTokenExpiry()
    });

    return {
        accessToken,
        refreshToken: newRefreshToken
    };
}

/**
 * Logs out a refresh-token session.
 *
 * The refresh token itself identifies the session
 * that should be revoked.
 *
 * @param {string} token - Raw refresh token.
 * @returns {Promise<void>}
 */
export async function logout(token) {
    if (
        !token ||
        typeof token !== "string"
    ) {
        throw new ApiError(
            401,
            "Refresh token is required."
        );
    }

    /*
     * Verify that the refresh token was issued by
     * the application and has not naturally expired.
     */
    verifyRefreshToken(token);

    /*
     * Hash the supplied token because MongoDB stores
     * only the token hash.
     */
    const tokenHash = hashRefreshToken(token);

    /*
     * Find the persisted authentication session.
     */
    const storedToken = await RefreshToken.findOne({
        tokenHash
    });

    if (!storedToken) {
        throw new ApiError(
            401,
            "Invalid refresh token."
        );
    }

    /*
     * Revoke the session if it has not already been revoked.
     */
    if (!storedToken.revokedAt) {
        storedToken.revokedAt = new Date();

        await storedToken.save();
    }
}