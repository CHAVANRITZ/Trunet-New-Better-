import crypto from "crypto";

import User from "../models/User.js";
import Role from "../models/Role.js";
import RefreshToken from "../models/RefreshToken.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import {
    comparePassword
} from "../utils/password.js";
import {
    durationToMilliseconds,
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken
} from "../utils/token.js";

/**
 * Maximum number of consecutive failed login attempts allowed
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
 * Only the hash is stored in MongoDB. The raw refresh token is
 * returned to the client but is never persisted.
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
 * The expiration comes from REFRESH_TOKEN_EXPIRES_IN rather than
 * being hardcoded, ensuring the database session and JWT use the
 * same application configuration.
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
 * Removes authentication-sensitive fields before returning
 * user information to the client.
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
 * Authenticates a user using username or email and password.
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
 * @param {string} credentials.identifier - Username or email.
 * @param {string} credentials.password - Plain-text password.
 * @returns {Promise<Object>} Authentication result.
 */
export async function login({ identifier, password }) {
    const normalizedIdentifier = identifier.trim().toLowerCase();

    /*
     * Password is excluded from normal User queries, so it must
     * be explicitly selected for authentication.
     */
    const user = await User.findOne({
        $or: [
            { username: normalizedIdentifier },
            { email: normalizedIdentifier }
        ]
    })
        .select("+password")
        .populate("role");

    /*
     * Do not reveal whether the username/email exists.
     *
     * Returning the same error for unknown users and incorrect
     * passwords prevents user-enumeration attacks.
     */
    if (!user) {
        throw new ApiError(401, "Invalid credentials.");
    }

    /*
     * Disabled accounts cannot authenticate even when the
     * supplied password is correct.
     */
    if (user.status !== "Enable") {
        throw new ApiError(403, "User account is disabled.");
    }

    /*
     * Check whether a previous series of failed attempts has
     * temporarily locked the account.
     */
    if (user.lockUntil && user.lockUntil > new Date()) {
        throw new ApiError(
            423,
            "Account temporarily locked. Please try again later."
        );
    }

    /*
     * A lock that has expired is cleared before continuing.
     */
    if (user.lockUntil && user.lockUntil <= new Date()) {
        user.lockUntil = null;
        user.loginAttempts = 0;
    }

    const passwordValid = await comparePassword(
        password,
        user.password
    );

    if (!passwordValid) {
        user.loginAttempts += 1;

        /*
         * Lock the account after the configured number of
         * consecutive failed attempts.
         */
        if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
            user.lockUntil = new Date(
                Date.now() + LOCK_DURATION_MS
            );
        }

        await user.save();

        /*
         * Keep the response intentionally generic so an attacker
         * cannot distinguish valid accounts from invalid ones.
         */
        throw new ApiError(401, "Invalid credentials.");
    }

    /*
     * Successful authentication clears the previous failed-login
     * state and records when the account last authenticated.
     */
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();

    await user.save();

    /*
     * The access token contains only the identity information
     * required by protected-request middleware.
     */
    const accessToken = generateAccessToken({
        sub: user._id.toString(),
        role: user.role?._id?.toString()
    });

    /*
     * The refresh token identifies the user but does not contain
     * unnecessary authorization or sensitive information.
     */
    const refreshToken = generateRefreshToken({
        sub: user._id.toString()
    });

    /*
     * Store only a hash of the refresh token.
     *
     * If the database is compromised, the attacker cannot directly
     * use the stored value as a refresh credential.
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
 * Refreshes an authenticated session using a valid refresh token.
 *
 * Refresh-token rotation is used here:
 * - The supplied refresh token must exist in MongoDB.
 * - Revoked or expired sessions are rejected.
 * - The associated user and role must still be active.
 * - The old refresh token is revoked after successful validation.
 * - A new access token and refresh token are issued.
 * - Only the hash of the new refresh token is stored.
 *
 * @param {string} token - Raw refresh token supplied by the client.
 * @returns {Promise<Object>} New access and refresh tokens.
 */
export async function refreshToken(token) {
    if (!token || typeof token !== "string") {
        throw new ApiError(
            401,
            "Refresh token is required."
        );
    }

    /*
     * Verify the JWT signature and expiration before consulting
     * the database. This ensures the token was issued by Trunet
     * and has not naturally expired.
     */
    const decodedToken = verifyRefreshToken(token);

    if (!decodedToken.sub) {
        throw new ApiError(
            401,
            "Invalid refresh token."
        );
    }

    /*
     * The database stores only the SHA-256 hash of the refresh
     * token, so hash the supplied token before looking it up.
     */
    const tokenHash = hashRefreshToken(token);

    const storedToken = await RefreshToken.findOne({
        tokenHash
    }).populate({
        path: "user",
        populate: {
            path: "role"
        }
    });

    /*
     * A valid JWT alone is not enough. The refresh-token session
     * must also still exist in MongoDB.
     */
    if (!storedToken) {
        throw new ApiError(
            401,
            "Invalid refresh token."
        );
    }

    /*
     * Prevent reuse of a refresh token that has already been
     * rotated or explicitly revoked.
     */
    if (storedToken.revokedAt) {
        throw new ApiError(
            401,
            "Refresh token has been revoked."
        );
    }

    /*
     * Check the database expiration as an additional safeguard.
     * MongoDB's TTL cleanup happens asynchronously, so an expired
     * document may temporarily still exist.
     */
    if (storedToken.expiresAt <= new Date()) {
        throw new ApiError(
            401,
            "Refresh token has expired."
        );
    }

    const user = storedToken.user;

    if (!user) {
        throw new ApiError(
            401,
            "Authenticated user no longer exists."
        );
    }

    /*
     * A user's account may have been disabled after the refresh
     * token was originally issued. Check the current database state.
     */
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

    /*
     * Disabled roles must immediately lose the ability to obtain
     * new access tokens.
     */
    if (user.role.status !== "Enable") {
        throw new ApiError(
            403,
            "User role is disabled."
        );
    }

    /*
     * Ensure the refresh token belongs to the same user identified
     * by its JWT payload.
     */
    if (user._id.toString() !== decodedToken.sub) {
        throw new ApiError(
            401,
            "Invalid refresh token."
        );
    }

    /*
     * Rotate the refresh token.
     *
     * The old token becomes unusable immediately after this point.
     */
    storedToken.revokedAt = new Date();
    await storedToken.save();

    /*
     * Generate a new short-lived access token using the user's
     * current role. This means role changes take effect on refresh.
     */
    const accessToken = generateAccessToken({
        sub: user._id.toString(),
        role: user.role._id.toString()
    });

    /*
     * Generate a completely new refresh token rather than reusing
     * the previous credential.
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
 * Logs out the current refresh-token session.
 *
 * Logout does not require the access token because the refresh
 * token itself identifies the authentication session that should
 * be revoked.
 *
 * The raw refresh token is never stored or returned. It is hashed
 * and matched against the persisted session before revocation.
 *
 * @param {string} token - Raw refresh token supplied by the client.
 * @returns {Promise<void>}
 */
export async function logout(token) {
    if (!token || typeof token !== "string") {
        throw new ApiError(
            401,
            "Refresh token is required."
        );
    }

    /*
     * Verify that the token was issued by Trunet and has not
     * naturally expired.
     */
    verifyRefreshToken(token);

    /*
     * MongoDB stores only the SHA-256 hash of the refresh token.
     */
    const tokenHash = hashRefreshToken(token);

    const storedToken = await RefreshToken.findOne({
        tokenHash
    });

    /*
     * If the session does not exist, there is nothing to revoke.
     */
    if (!storedToken) {
        throw new ApiError(
            401,
            "Invalid refresh token."
        );
    }

    /*
     * Make logout idempotent. If the token has already been
     * revoked, it cannot be used for authentication again.
     */
    if (!storedToken.revokedAt) {
        storedToken.revokedAt = new Date();
        await storedToken.save();
    }
}
