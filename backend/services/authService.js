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

import { recordLoginHistory } from "./loginHistoryService.js";

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

function hashRefreshToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

function getRefreshTokenExpiry() {
    return new Date(
        Date.now() +
        durationToMilliseconds(env.REFRESH_TOKEN_EXPIRES_IN)
    );
}

function sanitizeUser(user) {
    const result = user.toObject();

    delete result.password;
    delete result.loginAttempts;
    delete result.lockUntil;

    return result;
}

/**
 * Determines whether a user is a Super Admin.
 * A user assigned the Center role must not become a Super Admin
 * because of a stale user-level flag.
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
 * Gets unique center IDs assigned to the user.
 */
function getAssignedCenterIds(user) {
    const ids = [
        user.center?._id ?? user.center,
        ...(user.accessibleCenters || []).map(
            item => item?._id ?? item
        )
    ]
        .filter(Boolean)
        .map(String);

    return [...new Set(ids)];
}

/**
 * Determines whether the user must select an active center.
 * Super Admins are not required to select a center during login.
 */
async function requiresCenterSelection(user) {
    if (await isUserSuperAdmin(user)) {
        return false;
    }

    const ids = getAssignedCenterIds(user);

    if (ids.length === 0) {
        return false;
    }

    const activeCenterCount = await Center.countDocuments({
        _id: { $in: ids },
        status: "Enable"
    });

    return activeCenterCount > 0;
}

/**
 * Returns a sanitized user with enabled assigned centers expanded.
 */
export async function buildUserPayload(user) {
    const payload = sanitizeUser(user);
    const ids = getAssignedCenterIds(user);

    const centers = ids.length
        ? await Center.find({
            _id: { $in: ids },
            status: "Enable"
        })
            .select("centerName centerCode centerType status")
            .lean()
        : [];

    const centersById = new Map(
        centers.map(center => [
            String(center._id),
            center
        ])
    );

    const currentCenterId = user.center?._id ?? user.center;

    payload.center = currentCenterId
        ? centersById.get(String(currentCenterId)) || null
        : null;

    payload.accessibleCenters = (
        user.accessibleCenters || []
    )
        .map(item => {
            const centerId = item?._id ?? item;
            return centersById.get(String(centerId));
        })
        .filter(Boolean);

    return payload;
}

/**
 * Creates an access token and a persisted refresh-token session.
 */
async function createSessionTokens(user, centerId = null) {
    const roleId = user.role
        ? String(user.role._id ?? user.role)
        : undefined;

    const accessToken = generateAccessToken({
        sub: user._id.toString(),
        ...(roleId ? { role: roleId } : {}),
        ...(centerId ? { centerId: String(centerId) } : {})
    });

    const refreshToken = generateRefreshToken({
        sub: user._id.toString(),
        ...(centerId ? { centerId: String(centerId) } : {})
    });

    await RefreshToken.create({
        user: user._id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: getRefreshTokenExpiry()
    });

    return {
        accessToken,
        refreshToken
    };
}

/**
 * Validates that the user exists, is enabled, and has a role.
 */
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
 * Validates center access and updates the user's current center.
 */
async function applyCenterChoice(user, centerId) {
    if (
        typeof centerId !== "string" ||
        !mongoose.Types.ObjectId.isValid(centerId)
    ) {
        throw new ApiError(400, "A valid centerId is required.");
    }

    const center = await Center.findOne({
        _id: centerId,
        status: "Enable"
    }).select("_id");

    if (!center) {
        throw new ApiError(
            404,
            "Center not found or is disabled."
        );
    }

    const assignedIds = getAssignedCenterIds(user);
    const isAdmin = await isUserSuperAdmin(user);
    const normalizedCenterId = String(center._id);

    if (
        !isAdmin &&
        !assignedIds.includes(normalizedCenterId)
    ) {
        throw new ApiError(
            403,
            "You do not have access to this center."
        );
    }

    await User.updateOne(
        { _id: user._id },
        { $set: { center: center._id } }
    );

    return User.findById(user._id).populate("role");
}

/**
 * Authenticates the user and either returns a center-selection token
 * or creates a regular authenticated session.
 */
export async function login({ username, password, request }) {
    if (!username || typeof username !== "string") {
        throw new ApiError(400, "Username is required.");
    }

    if (!password || typeof password !== "string") {
        throw new ApiError(400, "Password is required.");
    }

    const normalizedUsername = username.trim().toLowerCase();

    const user = await User.findOne({
        username: normalizedUsername
    })
        .select("+password")
        .populate("role");

    if (!user) {
        throw new ApiError(401, "Invalid credentials.");
    }

    if (user.status !== "Enable") {
        throw new ApiError(403, "User account is disabled.");
    }

    const now = new Date();

    if (user.lockUntil && user.lockUntil > now) {
        throw new ApiError(
            423,
            "Account temporarily locked. Please try again later."
        );
    }

    if (user.lockUntil && user.lockUntil <= now) {
        user.lockUntil = null;
        user.loginAttempts = 0;
    }

    const passwordValid = await comparePassword(
        password,
        user.password
    );

    if (!passwordValid) {
        user.loginAttempts = (user.loginAttempts || 0) + 1;

        if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
            user.lockUntil = new Date(
                Date.now() + LOCK_DURATION_MS
            );
        }

        await user.save();

        throw new ApiError(401, "Invalid credentials.");
    }

    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();

    await user.save();

    await recordLoginHistory(user, request);

    const userPayload = await buildUserPayload(user);
    const centerSelectionRequired =
        await requiresCenterSelection(user);

    if (centerSelectionRequired) {
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

/**
 * Exchanges a center-selection token for a regular authenticated session.
 */
export async function selectCenter({
    authorizationHeader,
    centerId
}) {
    const [scheme, token] = (authorizationHeader || "").split(" ");

    if (scheme !== "Bearer" || !token) {
        throw new ApiError(
            401,
            "Invalid authorization header."
        );
    }

    const decoded = verifyAccessToken(token);

    if (
        decoded.step !== "center_selection" ||
        !decoded.sub
    ) {
        throw new ApiError(
            403,
            "This token cannot be used to select a center."
        );
    }

    const user = await User.findById(decoded.sub).populate("role");

    assertUsable(user);

    const updatedUser = await applyCenterChoice(
        user,
        centerId
    );

    const { accessToken, refreshToken } =
        await createSessionTokens(updatedUser, centerId);

    return {
        user: await buildUserPayload(updatedUser),
        accessToken,
        refreshToken
    };
}

/**
 * Switches the current center for an authenticated user.
 */
export async function switchCenter({ userId, centerId }) {
    const user = await User.findById(userId).populate("role");

    assertUsable(user);

    const updatedUser = await applyCenterChoice(
        user,
        centerId
    );

    const { accessToken, refreshToken } =
        await createSessionTokens(updatedUser, centerId);

    return {
        user: await buildUserPayload(updatedUser),
        accessToken,
        refreshToken
    };
}

/**
 * Rotates a refresh token after validating its database session.
 */
export async function refreshToken(token) {
    if (!token || typeof token !== "string") {
        throw new ApiError(401, "Refresh token is required.");
    }

    const decodedToken = verifyRefreshToken(token);

    if (!decodedToken.sub) {
        throw new ApiError(401, "Invalid refresh token.");
    }

    const storedToken = await RefreshToken.findOne({
        tokenHash: hashRefreshToken(token)
    }).populate({
        path: "user",
        populate: {
            path: "role"
        }
    });

    if (!storedToken) {
        throw new ApiError(401, "Invalid refresh token.");
    }

    if (storedToken.revokedAt) {
        throw new ApiError(
            401,
            "Refresh token has been revoked."
        );
    }

    if (storedToken.expiresAt <= new Date()) {
        throw new ApiError(
            401,
            "Refresh token has expired."
        );
    }

    const user = storedToken.user;

    assertUsable(user);

    if (user._id.toString() !== decodedToken.sub) {
        throw new ApiError(401, "Invalid refresh token.");
    }

    const centerId = decodedToken.centerId
        ? String(decodedToken.centerId)
        : null;

    if (centerId) {
        const centerExists = await Center.exists({
            _id: centerId,
            status: "Enable"
        });

        const assignedIds = getAssignedCenterIds(user);
        const isAdmin = await isUserSuperAdmin(user);

        if (
            !centerExists ||
            (!isAdmin && !assignedIds.includes(centerId))
        ) {
            throw new ApiError(
                403,
                "Selected center is no longer available to this user."
            );
        }
    } else if (await requiresCenterSelection(user)) {
        throw new ApiError(
            403,
            "A center must be selected before refreshing this session."
        );
    }

    storedToken.revokedAt = new Date();
    await storedToken.save();

    const {
        accessToken,
        refreshToken: newRefreshToken
    } = await createSessionTokens(user, centerId);

    return {
        accessToken,
        refreshToken: newRefreshToken
    };
}

/**
 * Revokes the refresh-token session during logout.
 */
export async function logout(token) {
    if (!token || typeof token !== "string") {
        throw new ApiError(401, "Refresh token is required.");
    }

    verifyRefreshToken(token);

    const storedToken = await RefreshToken.findOne({
        tokenHash: hashRefreshToken(token)
    });

    if (!storedToken) {
        throw new ApiError(401, "Invalid refresh token.");
    }

    if (!storedToken.revokedAt) {
        storedToken.revokedAt = new Date();
        await storedToken.save();
    }
}