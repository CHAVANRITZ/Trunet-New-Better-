
import crypto from "crypto";

import mongoose from "mongoose";

import User from "../models/User.js";
import Role from "../models/Role.js";
import Center from "../models/Center.js";
import RefreshToken from "../models/RefreshToken.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

import { comparePassword } from "../utils/password.js";

import {
    durationToMilliseconds,
    generateAccessToken,
    generateCenterSelectionToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken
} from "../utils/token.js";

import {
    recordLoginHistory
} from "./loginHistoryService.js";

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
 * - Login history is recorded.
 * - Access and refresh tokens are issued.
 *
 * @param {Object} credentials - Login credentials.
 * @param {string} credentials.username - Username.
 * @param {string} credentials.password - Plain-text password.
 * @param {Object} credentials.request - Express request object.
 * @returns {Promise<Object>} Authentication result.
 */
export async function login({
    username,
    password,
    request
}) {
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
     * Record successful login information.
     *
     * The LoginHistory service handles:
     * - browser detection
     * - client IP detection
     * - LoginHistory database update
     *
     * This is intentionally executed only after
     * successful authentication.
     */
    await recordLoginHistory(
        user,
        request
    );

    const userPayload = await buildUserPayload(user);

    /*
     * Users who can work in several centers must pick one first.
     * They get a short-lived center-selection token only; the real
     * access token is issued by POST /auth/select-center.
     */
    if (await requiresCenterSelection(user)) {
        return {
            requiresCenterSelection: true,
            user: userPayload,
            accessToken: generateCenterSelectionToken({
                sub: user._id.toString()
            })
        };
    }

    const { accessToken, refreshToken } =
        await createSessionTokens(user);

    return {
        requiresCenterSelection: false,
        user: userPayload,
        accessToken,
        refreshToken
    };
}

// ---------------------------------------------------------------
// Center selection helpers
// ---------------------------------------------------------------

/**
 * True when the user is a Super Admin (user flag, role flag or role title).
 */

async function isUserSuperAdmin(user) {
    const roleId = user.role?._id ?? user.role;

    const role =
        typeof user.role === "object" && user.role?.roleTitle
            ? user.role
            : roleId
                ? await Role.findById(roleId).lean()
                : null;

    const title = String(role?.roleTitle || "")
        .trim()
        .toLowerCase();

    // A center-role user must not become Super Admin
    // because of a stale user-level flag.
    if (title === "center") {
        return false;
    }

    return (
        role?.isSuperAdmin === true ||
        title === "superadmin" ||
        user.isSuperAdmin === true
    );
}


/**
 * RULE: a non-Super-Admin user who has accessibleCenters
 * must choose a center after logging in.
 * Change this one function if the rule should be different.
 */
async function requiresCenterSelection(user) {
    if (await isUserSuperAdmin(user)) {
        return false;
    }

    return !(await isUserSuperAdmin(user));
}

/**
 * Safe user object for the client, with center and
 * accessibleCenters expanded to { _id, centerName, centerCode }.
 */
async function buildUserPayload(user) {
    const payload = sanitizeUser(user);

    const ids = [
        ...new Set(
            [user.center, ...(user.accessibleCenters || [])]
                .filter(Boolean)
                .map((id) => String(id._id ?? id))
        )
    ];

    if (ids.length === 0) {
        return payload;
    }

    const centers = await Center.find({ _id: { $in: ids } })
        .select("centerName centerCode")
        .lean();

    const byId = new Map(
        centers.map((center) => [String(center._id), center])
    );

    payload.center = user.center
        ? byId.get(String(user.center._id ?? user.center)) || null
        : null;

    payload.accessibleCenters = (user.accessibleCenters || [])
        .map((id) => byId.get(String(id._id ?? id)))
        .filter(Boolean);

    return payload;
}

/**
 * Creates an access token (optionally bound to a center)
 * and a stored refresh-token session.
 */
async function createSessionTokens(user, centerId = null) {
    const roleId = user.role
        ? String(user.role._id ?? user.role)
        : undefined;

    const accessToken = generateAccessToken({
        sub: user._id.toString(),
        role: roleId,
        ...(centerId ? { centerId: String(centerId) } : {})
    });

    const refreshToken = generateRefreshToken({
        sub: user._id.toString()
    });

    await RefreshToken.create({
        user: user._id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: getRefreshTokenExpiry()
    });

    return { accessToken, refreshToken };
}

/**
 * Validates the chosen center and stores it as the user's current center.
 * Returns the updated user document.
 */
async function applyCenterChoice(user, centerId) {
    if (
        typeof centerId !== "string" ||
        !mongoose.Types.ObjectId.isValid(centerId)
    ) {
        throw new ApiError(400, "A valid centerId is required.");
    }

    const allowedIds = [
        user.center,
        ...(user.accessibleCenters || [])
    ]
        .filter(Boolean)
        .map(String);

    const allowed =
        allowedIds.includes(centerId) ||
        (await isUserSuperAdmin(user));

    if (!allowed) {
        throw new ApiError(
            403,
            "You do not have access to this center."
        );
    }

    if (!(await Center.exists({ _id: centerId }))) {
        throw new ApiError(404, "Center not found.");
    }

    await User.updateOne(
        { _id: user._id },
        { $set: { center: centerId } }
    );

    return User.findById(user._id);
}

function assertUsable(user) {
    if (!user) {
        throw new ApiError(401, "User no longer exists.");
    }

    if (user.status !== "Enable") {
        throw new ApiError(403, "User account is disabled.");
    }

    if (!user.role) {
        throw new ApiError(403, "User role is not configured.");
    }
}

/**
 * Step 2 of login: exchange the center-selection token
 * plus a centerId for a real access token.
 */
export async function selectCenter({ authorizationHeader, centerId }) {
    const [scheme, token] = (authorizationHeader || "").split(" ");

    if (scheme !== "Bearer" || !token) {
        throw new ApiError(401, "Invalid authorization header.");
    }

    const decoded = verifyAccessToken(token);

    if (decoded.step !== "center_selection") {
        throw new ApiError(
            403,
            "This token cannot be used to select a center."
        );
    }

    const user = await User.findById(decoded.sub);
    assertUsable(user);

    const updated = await applyCenterChoice(user, centerId);

    const { accessToken, refreshToken } =
        await createSessionTokens(updated, centerId);

    return {
        user: await buildUserPayload(updated),
        accessToken,
        refreshToken
    };
}

/**
 * Switch center while already logged in (normal access token).
 */
export async function switchCenter({ userId, centerId }) {
    const user = await User.findById(userId);
    assertUsable(user);

    const updated = await applyCenterChoice(user, centerId);

    const accessToken = generateAccessToken({
        sub: updated._id.toString(),
        role: String(updated.role._id ?? updated.role),
        centerId: String(centerId)
    });

    return {
        user: await buildUserPayload(updated),
        accessToken
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




// old code new mdhe login history add keli ahe fkt
// import crypto from "crypto";

// import User from "../models/User.js";
// import RefreshToken from "../models/RefreshToken.js";
// import { env } from "../config/env.js";
// import { ApiError } from "../utils/ApiError.js";

// import { comparePassword } from "../utils/password.js";

// import {
//     durationToMilliseconds,
//     generateAccessToken,
//     generateRefreshToken,
//     verifyRefreshToken
// } from "../utils/token.js";

// /**
//  * Maximum number of consecutive failed login attempts
//  * before the account is temporarily locked.
//  */
// const MAX_LOGIN_ATTEMPTS = 5;

// /**
//  * Duration of the temporary account lock.
//  */
// const LOCK_DURATION_MS = 15 * 60 * 1000;

// /**
//  * Creates a SHA-256 hash of a refresh token.
//  *
//  * Only the hash is stored in MongoDB.
//  *
//  * @param {string} token - Raw refresh token.
//  * @returns {string} SHA-256 token hash.
//  */
// function hashRefreshToken(token) {
//     return crypto
//         .createHash("sha256")
//         .update(token)
//         .digest("hex");
// }

// /**
//  * Calculates the expiration date for a refresh-token session.
//  *
//  * @returns {Date} Refresh-token expiration timestamp.
//  */
// function getRefreshTokenExpiry() {
//     const duration = durationToMilliseconds(
//         env.REFRESH_TOKEN_EXPIRES_IN
//     );

//     return new Date(Date.now() + duration);
// }

// /**
//  * Removes authentication-sensitive fields before
//  * returning user information to the client.
//  *
//  * @param {Object} user - Mongoose user document.
//  * @returns {Object} Safe user representation.
//  */
// function sanitizeUser(user) {
//     const userObject = user.toObject();

//     delete userObject.password;
//     delete userObject.loginAttempts;
//     delete userObject.lockUntil;

//     return userObject;
// }

// /**
//  * Authenticates a user using username and password.
//  *
//  * Authentication rules handled here:
//  * - User must exist.
//  * - User account must be enabled.
//  * - Temporarily locked accounts cannot log in.
//  * - Password must match.
//  * - Failed attempts are tracked.
//  * - Successful login resets failed attempts.
//  * - Last login time is recorded.
//  * - Access and refresh tokens are issued.
//  *
//  * @param {Object} credentials - Login credentials.
//  * @param {string} credentials.username - Username.
//  * @param {string} credentials.password - Plain-text password.
//  * @returns {Promise<Object>} Authentication result.
//  */
// export async function login({ username, password }) {
//     /*
//      * Validate username.
//      */
//     if (!username || typeof username !== "string") {
//         throw new ApiError(
//             400,
//             "Username is required."
//         );
//     }

//     /*
//      * Validate password.
//      */
//     if (!password || typeof password !== "string") {
//         throw new ApiError(
//             400,
//             "Password is required."
//         );
//     }

//     /*
//      * Normalize username before querying the database.
//      */
//     const normalizedUsername = username
//         .trim()
//         .toLowerCase();

//     /*
//      * Password is excluded from normal User queries,
//      * so explicitly select it for authentication.
//      */
//     const user = await User.findOne({
//         username: normalizedUsername
//     })
//         .select("+password")
//         .populate("role");

//     /*
//      * Do not reveal whether the username exists.
//      */
//     if (!user) {
//         throw new ApiError(
//             401,
//             "Invalid credentials."
//         );
//     }

//     /*
//      * Disabled accounts cannot authenticate.
//      */
//     if (user.status !== "Enable") {
//         throw new ApiError(
//             403,
//             "User account is disabled."
//         );
//     }

//     /*
//      * Check whether a previous series of failed attempts
//      * has temporarily locked the account.
//      */
//     if (
//         user.lockUntil &&
//         user.lockUntil > new Date()
//     ) {
//         throw new ApiError(
//             423,
//             "Account temporarily locked. Please try again later."
//         );
//     }

//     /*
//      * Clear an expired account lock before authentication.
//      */
//     if (
//         user.lockUntil &&
//         user.lockUntil <= new Date()
//     ) {
//         user.lockUntil = null;
//         user.loginAttempts = 0;
//     }

//     /*
//      * Compare the supplied password with the stored hash.
//      */
//     const passwordValid = await comparePassword(
//         password,
//         user.password
//     );

//     /*
//      * Handle an incorrect password.
//      */
//     if (!passwordValid) {
//         user.loginAttempts =
//             (user.loginAttempts || 0) + 1;

//         /*
//          * Lock the account after the maximum number
//          * of consecutive failed attempts.
//          */
//         if (
//             user.loginAttempts >=
//             MAX_LOGIN_ATTEMPTS
//         ) {
//             user.lockUntil = new Date(
//                 Date.now() + LOCK_DURATION_MS
//             );
//         }

//         await user.save();

//         /*
//          * Keep the response generic to avoid revealing
//          * authentication details.
//          */
//         throw new ApiError(
//             401,
//             "Invalid credentials."
//         );
//     }

//     /*
//      * Successful authentication clears previous
//      * failed-login state and records the login time.
//      */
//     user.loginAttempts = 0;
//     user.lockUntil = null;
//     user.lastLogin = new Date();

//     await user.save();

//     /*
//      * Generate the access token using the authenticated
//      * user's database identity and role reference.
//      */
//     const accessToken = generateAccessToken({
//         sub: user._id.toString(),
//         role: user.role?._id?.toString()
//     });

//     /*
//      * Generate a refresh token for the authentication session.
//      */
//     const refreshToken = generateRefreshToken({
//         sub: user._id.toString()
//     });

//     /*
//      * Store only the hash of the refresh token.
//      */
//     await RefreshToken.create({
//         user: user._id,
//         tokenHash: hashRefreshToken(refreshToken),
//         expiresAt: getRefreshTokenExpiry()
//     });

//     return {
//         user: sanitizeUser(user),
//         accessToken,
//         refreshToken
//     };
// }

// /**
//  * Refreshes an authenticated session using a valid
//  * refresh token.
//  *
//  * Refresh-token rotation is used so that the previous
//  * refresh token cannot be reused after successful rotation.
//  *
//  * @param {string} token - Raw refresh token.
//  * @returns {Promise<Object>} New access and refresh tokens.
//  */
// export async function refreshToken(token) {
//     if (
//         !token ||
//         typeof token !== "string"
//     ) {
//         throw new ApiError(
//             401,
//             "Refresh token is required."
//         );
//     }

//     /*
//      * Verify JWT signature and expiration.
//      */
//     const decodedToken = verifyRefreshToken(token);

//     if (!decodedToken.sub) {
//         throw new ApiError(
//             401,
//             "Invalid refresh token."
//         );
//     }

//     /*
//      * Hash the supplied refresh token because only
//      * the hash is stored in MongoDB.
//      */
//     const tokenHash = hashRefreshToken(token);

//     /*
//      * Find the corresponding persisted refresh session
//      * and load the current user and database-backed role.
//      */
//     const storedToken = await RefreshToken.findOne({
//         tokenHash
//     }).populate({
//         path: "user",
//         populate: {
//             path: "role"
//         }
//     });

//     /*
//      * A valid JWT must also have a corresponding
//      * active database session.
//      */
//     if (!storedToken) {
//         throw new ApiError(
//             401,
//             "Invalid refresh token."
//         );
//     }

//     /*
//      * Prevent reuse of an already revoked token.
//      */
//     if (storedToken.revokedAt) {
//         throw new ApiError(
//             401,
//             "Refresh token has been revoked."
//         );
//     }

//     /*
//      * Check database expiration as an additional safeguard.
//      */
//     if (
//         storedToken.expiresAt <= new Date()
//     ) {
//         throw new ApiError(
//             401,
//             "Refresh token has expired."
//         );
//     }

//     const user = storedToken.user;

//     /*
//      * The associated user must still exist.
//      */
//     if (!user) {
//         throw new ApiError(
//             401,
//             "Authenticated user no longer exists."
//         );
//     }

//     /*
//      * The current account status is checked before
//      * issuing another access token.
//      */
//     if (user.status !== "Enable") {
//         throw new ApiError(
//             403,
//             "User account is disabled."
//         );
//     }

//     /*
//      * A user must still have a configured database-backed role.
//      */
//     if (!user.role) {
//         throw new ApiError(
//             403,
//             "User role is not configured."
//         );
//     }

//     /*
//      * Ensure the refresh token belongs to the same
//      * user identified by its JWT payload.
//      */
//     if (
//         user._id.toString() !==
//         decodedToken.sub
//     ) {
//         throw new ApiError(
//             401,
//             "Invalid refresh token."
//         );
//     }

//     /*
//      * Revoke the old refresh token before issuing
//      * its replacement.
//      */
//     storedToken.revokedAt = new Date();

//     await storedToken.save();

//     /*
//      * Generate a new access token using the user's
//      * current database-backed role.
//      */
//     const accessToken = generateAccessToken({
//         sub: user._id.toString(),
//         role: user.role._id.toString()
//     });

//     /*
//      * Generate a completely new refresh token.
//      */
//     const newRefreshToken = generateRefreshToken({
//         sub: user._id.toString()
//     });

//     /*
//      * Store only the hash of the new refresh token.
//      */
//     await RefreshToken.create({
//         user: user._id,
//         tokenHash: hashRefreshToken(newRefreshToken),
//         expiresAt: getRefreshTokenExpiry()
//     });

//     return {
//         accessToken,
//         refreshToken: newRefreshToken
//     };
// }

// /**
//  * Logs out a refresh-token session.
//  *
//  * The refresh token itself identifies the session
//  * that should be revoked.
//  *
//  * @param {string} token - Raw refresh token.
//  * @returns {Promise<void>}
//  */
// export async function logout(token) {
//     if (
//         !token ||
//         typeof token !== "string"
//     ) {
//         throw new ApiError(
//             401,
//             "Refresh token is required."
//         );
//     }

//     /*
//      * Verify that the refresh token was issued by
//      * the application and has not naturally expired.
//      */
//     verifyRefreshToken(token);

//     /*
//      * Hash the supplied token because MongoDB stores
//      * only the token hash.
//      */
//     const tokenHash = hashRefreshToken(token);

//     /*
//      * Find the persisted authentication session.
//      */
//     const storedToken = await RefreshToken.findOne({
//         tokenHash
//     });

//     if (!storedToken) {
//         throw new ApiError(
//             401,
//             "Invalid refresh token."
//         );
//     }

//     /*
//      * Revoke the session if it has not already been revoked.
//      */
//     if (!storedToken.revokedAt) {
//         storedToken.revokedAt = new Date();

//         await storedToken.save();
//     }
// }

