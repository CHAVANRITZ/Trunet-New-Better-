import express from "express";

import {
    loginController,
    getCurrentUser,
    refreshTokenController,
    logoutController,
    getAllUsers,
    createUserController
} from "../controllers/authController.js";

import { getLoginHistory } from "../controllers/loginHistoryController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import {
    loginValidator,
    refreshTokenValidator,
    createUserValidator
} from "../validators/authValidator.js";

import { requirePermission } from "../middlewares/authorizationMiddleware.js";

const router = express.Router();

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate a user using username and password
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
 */
router.post(
    "/logout",
    refreshTokenValidator,
    validationMiddleware,
    asyncHandler(logoutController)
);

/**
 * @route   POST /api/v1/auth
 * @desc    Create a new user
 * @access  Private - requires User:create_user permission
 */
router.post(
    "/register",
    asyncHandler(authMiddleware),
    requirePermission("User", "create_user"),
    createUserValidator,
    validationMiddleware,
    asyncHandler(createUserController)
);

/**
 * @route   GET /api/v1/auth/login-history
 * @desc    Get login history
 * @access  Private
 */
router.get(
    "/login-history",
    asyncHandler(authMiddleware),
    asyncHandler(getLoginHistory)
);

/**
 * @route   GET /api/v1/auth
 * @desc    Get paginated users
 * @access  Private - requires User:view_user permission
 */
router.get(
    "/",
    asyncHandler(authMiddleware),
    requirePermission("User", "view_user"),
    asyncHandler(getAllUsers)
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

export default router;