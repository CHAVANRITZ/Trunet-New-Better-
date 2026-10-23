
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
    return crypto.createHash("sha256").update(token).digest("hex");
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
 * A user with the "center" role is never treated as a Super Admin
 * merely because the user document has a stale isSuperAdmin flag.
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
 * All ordinary users with at least one enabled assigned center
 * must select a center before accessing protected APIs.
 */
async function requiresCenterSelection(user) {
    const ids = getAssignedCenterIds(user);

    if (ids.length === 0) {
        return false;
    }

    return (
        await Center.countDocuments({
            _id: { $in: ids },
            status: "Enable"
        })
    ) > 0;
}

async function buildUserPayload(user) {
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

    const byId = new Map(
        centers.map(center => [String(center._id), center])
    );

    payload.center = user.center
        ? byId.get(String(user.center?._id ?? user.center)) || null
        : null;

    payload.accessibleCenters = (
        user.accessibleCenters || []
    )
        .map(item => byId.get(String(item?._id ?? item)))
        .filter(Boolean);

    return payload;
}

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
        sub: user._id.toString(),
        ...(centerId ? { centerId: String(centerId) } : {})
    });

    await RefreshToken.create({
        user: user._id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: getRefreshTokenExpiry()
    });

    return { accessToken, refreshToken };
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
 * Authenticate and return either:
 * 1. A restricted center-selection token, or
 * 2. A normal access token and refresh token.
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

    if (user.lockUntil && user.lockUntil > new Date()) {
        throw new ApiError(
            423,
            "Account temporarily locked. Please try again later."
        );
    }

    if (user.lockUntil && user.lockUntil <= new Date()) {
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

    /*
     * IMPORTANT:
     * Center selection is determined by assigned active centers,
     * not by the user-level isSuperAdmin flag.
     */
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
 * Validate a center selection and update the user's current center.
 */
async function applyCenterChoice(user, centerId) {
    if (
        typeof centerId !== "string" ||
        !mongoose.Types.ObjectId.isValid(centerId)
    ) {
        throw new ApiError(400, "A valid centerId is required.");
    }

    const normalizedCenterId = String(centerId);

    const center = await Center.findOne({
        _id: normalizedCenterId,
        status: "Enable"
    }).select("_id");

    if (!center) {
        throw new ApiError(404, "Center not found or is disabled.");
    }

    const assignedIds = getAssignedCenterIds(user);
    const isAdmin = await isUserSuperAdmin(user);

    if (
        !isAdmin &&
        !assignedIds.includes(center._id.toString())
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
 * Exchange the short-lived center-selection token for a real session.
 * POST /auth/select-center
 */
export async function selectCenter({
    authorizationHeader,
    centerId
}) {
    const [scheme, token] = (authorizationHeader || "").split(" ");

    if (scheme !== "Bearer" || !token) {
        throw new ApiError(401, "Invalid authorization header.");
    }

    const decoded = verifyAccessToken(token);

    if (decoded.step !== "center_selection" || !decoded.sub) {
        throw new ApiError(
            403,
            "This token cannot be used to select a center."
        );
    }

    const user = await User.findById(decoded.sub).populate("role");
    assertUsable(user);

    const updatedUser = await applyCenterChoice(user, centerId);

    const { accessToken, refreshToken } =
        await createSessionTokens(updatedUser, centerId);

    return {
        user: await buildUserPayload(updatedUser),
        accessToken,
        refreshToken
    };
}

/**
 * Switch center for an already authenticated user.
 */
export async function switchCenter({ userId, centerId }) {
    const user = await User.findById(userId).populate("role");
    assertUsable(user);

    const updatedUser = await applyCenterChoice(user, centerId);

    const accessToken = generateAccessToken({
        sub: updatedUser._id.toString(),
        role: String(updatedUser.role._id ?? updatedUser.role),
        centerId: String(centerId)
    });

    return {
        user: await buildUserPayload(updatedUser),
        accessToken
    };
}

/**
 * Rotate refresh tokens while preserving the selected center.
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
        populate: { path: "role" }
    });

    if (!storedToken) {
        throw new ApiError(401, "Invalid refresh token.");
    }

    if (storedToken.revokedAt) {
        throw new ApiError(401, "Refresh token has been revoked.");
    }

    if (storedToken.expiresAt <= new Date()) {
        throw new ApiError(401, "Refresh token has expired.");
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
        const center = await Center.exists({
            _id: centerId,
            status: "Enable"
        });

        const assignedIds = getAssignedCenterIds(user);
        const isAdmin = await isUserSuperAdmin(user);

        if (
            !center ||
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

    const { accessToken, refreshToken: newRefreshToken } =
        await createSessionTokens(user, centerId);

    return {
        accessToken,
        refreshToken: newRefreshToken
    };
}

/**
 * Revoke a refresh-token session during logout.
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
