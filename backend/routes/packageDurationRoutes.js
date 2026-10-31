
import express from "express";

import {
    createPackageDuration,
    getPackageDurations,
    getPackageDurationById,
    updatePackageDuration,
    deletePackageDuration,
} from "../controllers/packageDurationController.js";

import {
    validateCreatePackageDuration,
    validatePackageDurationId,
    validateUpdatePackageDuration,
} from "../validators/packageDurationValidation.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Authenticate all Package Duration endpoints.
router.use(authMiddleware);

// Create Package Duration
router.post(
    "/",
    validateCreatePackageDuration,
    createPackageDuration
);

// Get all Package Durations
router.get(
    "/",
    getPackageDurations
);

// Get Package Duration by ID
router.get(
    "/:id",
    validatePackageDurationId,
    getPackageDurationById
);

// Update Package Duration
router.put(
    "/:id",
    validatePackageDurationId,
    validateUpdatePackageDuration,
    updatePackageDuration
);

// Delete Package Duration
router.delete(
    "/:id",
    validatePackageDurationId,
    deletePackageDuration
);

export default router;
