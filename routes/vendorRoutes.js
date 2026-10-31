import express from "express";

import {
    createVendor,
    getVendors,
    getVendorById,
    updateVendor,
    deleteVendor
} from "../controllers/vendorController.js";

import {
    createVendorValidator,
    updateVendorValidator
} from "../validators/vendorValidator.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/authorizationMiddleware.js";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import { vendorLogoUpload } from "../config/multer.js";

const router = express.Router();

/**
 * Legacy Vendor permission module.
 *
 * The permission value comes directly from the database-backed
 * legacy RBAC configuration and must not be replaced with
 * application-defined permissions.
 */
const MODULE = "Settings";
const MANAGE_VENDORS_PERMISSION = "manage_vendors";

/**
 * Get all vendors.
 *
 * Authentication and the legacy vendor-management permission
 * are required before accessing vendor data.
 */
router.get(
    "/",
    asyncHandler(authMiddleware),
    requirePermission(MODULE, MANAGE_VENDORS_PERMISSION),
    asyncHandler(getVendors)
);

/**
 * Get a vendor by ID.
 */
router.get(
    "/:id",
    asyncHandler(authMiddleware),
    requirePermission(MODULE, MANAGE_VENDORS_PERMISSION),
    asyncHandler(getVendorById)
);

/**
 * Create a vendor.
 *
 * The logo field is optional and is processed using the
 * vendor-specific Multer configuration.
 */
router.post(
    "/",
    asyncHandler(authMiddleware),
    requirePermission(MODULE, MANAGE_VENDORS_PERMISSION),
    vendorLogoUpload.single("logo"),
    createVendorValidator,
    validationMiddleware,
    asyncHandler(createVendor)
);

/**
 * Update a vendor.
 *
 * A new logo can optionally replace the existing logo.
 */
router.put(
    "/:id",
    asyncHandler(authMiddleware),
    requirePermission(MODULE, MANAGE_VENDORS_PERMISSION),
    vendorLogoUpload.single("logo"),
    updateVendorValidator,
    validationMiddleware,
    asyncHandler(updateVendor)
);

/**
 * Delete a vendor.
 */
router.delete(
    "/:id",
    asyncHandler(authMiddleware),
    requirePermission(MODULE, MANAGE_VENDORS_PERMISSION),
    asyncHandler(deleteVendor)
);

export default router;