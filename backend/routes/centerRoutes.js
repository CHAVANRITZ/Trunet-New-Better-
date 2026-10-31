import express from "express";

import {
    createCenter,
    getCenters,
    getCenterById,
    getCentersByArea,
    updateCenter,
    deleteCenter,
    getCentersByReseller,
    getAllCentersBasic,
    getCentersByResellerId,
    downloadCentersCSV,
} from "../controllers/centerController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeAccess } from "../middlewares/authorizationMiddleware.js";

const router = express.Router();

const MODULE = "Center";

// Protect every Center route.
router.use(authMiddleware);

/**
 * Create Center
 */
router.post(
    "/",
    authorizeAccess(
        MODULE,
        "manage_all_center",
        "manage_own_center"
    ),
    createCenter
);

/**
 * Get all centers with filtering,
 * pagination, search and sorting.
 */
router.get(
    "/",
    authorizeAccess(
        MODULE,
        "view_own_center",
        "view_all_center"
    ),
    getCenters
);

/**
 * Download Centers CSV
 */
router.get(
    "/download/csv",
    authorizeAccess(
        MODULE,
        "view_own_center",
        "view_all_center"
    ),
    downloadCentersCSV
);

/**
 * Get basic Center list.
 *
 * Kept for legacy compatibility.
 */
router.get(
    "/main-warehouse",
    getAllCentersBasic
);

/**
 * Get centers belonging to
 * logged-in user's reseller.
 */
router.get(
    "/resellers/center",
    authorizeAccess(
        MODULE,
        "view_own_center",
        "view_all_center"
    ),
    getCentersByReseller
);

/**
 * Get centers by reseller ID.
 */
router.get(
    "/reseller/:resellerId",
    authorizeAccess(
        MODULE,
        "view_own_center",
        "view_all_center"
    ),
    getCentersByResellerId
);

/**
 * Get centers by area.
 *
 * Area support is retained for legacy
 * compatibility and future Area module.
 */
router.get(
    "/area/:areaId",
    authorizeAccess(
        MODULE,
        "view_own_center",
        "view_all_center"
    ),
    getCentersByArea
);

/**
 * Get Center by ID.
 *
 * IMPORTANT:
 * This must come after the specific routes above.
 */
router.get(
    "/:id",
    authorizeAccess(
        MODULE,
        "view_own_center",
        "view_all_center"
    ),
    getCenterById
);

/**
 * Update Center.
 */
router.put(
    "/:id",
    authorizeAccess(
        MODULE,
        "manage_own_center",
        "manage_all_center"
    ),
    updateCenter
);

/**
 * Delete Center.
 *
 * Legacy behavior allows only
 * manage_all_center.
 */
router.delete(
    "/:id",
    authorizeAccess(
        MODULE,
        "manage_all_center"
    ),
    deleteCenter
);

export default router;