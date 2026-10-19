import express from "express";

import {
    loginController,
    getCurrentUser,
    refreshTokenController,
    logoutController,
    getAllUsers,
    createUserController,
    getUserById,
    updateUserController,
    deleteUserController
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

// POST /api/v1/auth/login
router.post(
    "/login",
    loginValidator,
    validationMiddleware,
    asyncHandler(loginController)
);

// POST /api/v1/auth/refresh
router.post(
    "/refresh",
    refreshTokenValidator,
    validationMiddleware,
    asyncHandler(refreshTokenController)
);

// POST /api/v1/auth/logout
router.post(
    "/logout",
    refreshTokenValidator,
    validationMiddleware,
    asyncHandler(logoutController)
);

// POST /api/v1/auth/register
router.post(
    "/register",
    asyncHandler(authMiddleware),
    requirePermission("User", "create_user"),
    createUserValidator,
    validationMiddleware,
    asyncHandler(createUserController)
);

// GET /api/v1/auth/login-history
router.get(
    "/login-history",
    asyncHandler(authMiddleware),
    asyncHandler(getLoginHistory)
);

// GET /api/v1/auth/me
router.get(
    "/me",
    asyncHandler(authMiddleware),
    asyncHandler(getCurrentUser)
);

// GET /api/v1/auth
router.get(
    "/",
    asyncHandler(authMiddleware),
    requirePermission("User", "view_user"),
    asyncHandler(getAllUsers)
);
// Backward-compatible user routes used by the existing frontend

// GET /api/v1/auth/user/:id
router.get(
    "/user/:id",
    asyncHandler(authMiddleware),
    requirePermission("User", "view_user"),
    asyncHandler(getUserById)
);

// DELETE /api/v1/auth/user/:id
router.delete(
    "/user/:id",
    asyncHandler(authMiddleware),
    requirePermission("User", "delete_user"),
    asyncHandler(deleteUserController)
);

// PUT /api/v1/auth/user/:id
router.put(
    "/user/:id",
    asyncHandler(authMiddleware),
    requirePermission("User", "update_user"),
    asyncHandler(updateUserController)
);
// DELETE /api/v1/auth/:id
router.delete(
    "/:id",
    asyncHandler(authMiddleware),
    requirePermission("User", "delete_user"),
    asyncHandler(deleteUserController)
);

// GET /api/v1/auth/:id
router.get(
    "/:id",
    asyncHandler(authMiddleware),
    requirePermission("User", "view_user"),
    asyncHandler(getUserById)
);

// PUT /api/v1/auth/:id
router.put(
    "/:id",
    asyncHandler(authMiddleware),
    requirePermission("User", "update_user"),
    asyncHandler(updateUserController)
);

export default router;