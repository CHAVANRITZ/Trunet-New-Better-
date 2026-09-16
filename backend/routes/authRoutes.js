import express from "express";

import {
    loginController,
    getCurrentUser,
    refreshTokenController,
    logoutController
} from "../controllers/authController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import {
    loginValidator,
    refreshTokenValidator
} from "../validators/authValidator.js";

import { PERMISSIONS } from "../constants/permissions.js";
import { requirePermission } from "../middlewares/authorizationMiddleware.js";

const router = express.Router();

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate a user using username/email and password
 * @access  Public
 */
router.post(
    "/login",
    loginValidator,
    validationMiddleware,
    asyncHandler(loginController)
);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Issue a new access token and rotate the refresh token
 * @access  Public
 */
router.post(
    "/refresh",
    refreshTokenValidator,
    validationMiddleware,
    asyncHandler(refreshTokenController)
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Revoke the current refresh-token session
 * @access  Public
 *
 * The refresh token identifies the session being logged out.
 * Revoking it prevents the token from being used again.
 */
router.post(
    "/logout",
    refreshTokenValidator,
    validationMiddleware,
    asyncHandler(logoutController)
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Return the currently authenticated user's profile
 * @access  Private
 */
router.get(
    "/me",
    asyncHandler(authMiddleware),
    asyncHandler(getCurrentUser)
);

/**
 * @route   GET /api/v1/auth/rbac-test
 * @desc    Verify that permission-based authorization is working
 * @access  Private - manage_user permission
 *
 * This endpoint is a development verification endpoint and can
 * be removed once the RBAC middleware is covered by proper tests.
 */
router.get(
    "/rbac-test",
    asyncHandler(authMiddleware),
    asyncHandler(
        requirePermission(PERMISSIONS.MANAGE_USER)
    ),
    (req, res) => {
        return res.status(200).json({
            success: true,
            message: "RBAC permission check passed."
        });
    }
);

export default router;