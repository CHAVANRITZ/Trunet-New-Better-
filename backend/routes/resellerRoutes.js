import express from "express";

import {
    createReseller,
    getResellers,
    getResellerById,
    updateReseller,
    deleteReseller,
} from "../controllers/resellerController.js";

import {
    createResellerValidator,
    updateResellerValidator,
    resellerIdValidator,
    getResellersValidator,
} from "../validators/resellerValidator.js";

import { validationMiddleware } from "../middlewares/validationMiddleware.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

/**
 * Create reseller
 */
router.post(
    "/",
    asyncHandler(authMiddleware),
    createResellerValidator,
    validationMiddleware,
    asyncHandler(createReseller)
);

/**
 * Get all resellers
 */
router.get(
    "/",
    asyncHandler(authMiddleware),
    getResellersValidator,
    validationMiddleware,
    asyncHandler(getResellers)
);

/**
 * Get reseller by ID
 */
router.get(
    "/:id",
    asyncHandler(authMiddleware),
    resellerIdValidator,
    validationMiddleware,
    asyncHandler(getResellerById)
);

/**
 * Update reseller
 */
router.put(
    "/:id",
    asyncHandler(authMiddleware),
    updateResellerValidator,
    validationMiddleware,
    asyncHandler(updateReseller)
);

/**
 * Delete reseller
 */
router.delete(
    "/:id",
    asyncHandler(authMiddleware),
    resellerIdValidator,
    validationMiddleware,
    asyncHandler(deleteReseller)
);

export default router;