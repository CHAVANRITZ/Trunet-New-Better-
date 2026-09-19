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
export default router;