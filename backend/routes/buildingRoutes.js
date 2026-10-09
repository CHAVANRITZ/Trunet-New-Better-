import express from "express";

import {
    createBuilding,
    getBuildings,
    getBuildingById,
    updateBuilding,
    deleteBuilding,
} from "../controllers/buildingController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeAccess } from "../middlewares/authorizationMiddleware.js";

import {
    createBuildingValidator,
    updateBuildingValidator,
    buildingIdValidator,
} from "../validators/buildingValidator.js";

const router = express.Router();

const MODULE = "Settings";

// Protect every Building route.
router.use(authMiddleware);

/**
 * Create Building
 */
router.post(
    "/",
    authorizeAccess(
        MODULE,
        "manage_building_all_center",
        "manage_building_own_center"
    ),
    createBuildingValidator,
    createBuilding
);

/**
 * Get all Buildings
 */
router.get(
    "/",
    authorizeAccess(
        MODULE,
        "view_building_own_center",
        "view_building_all_center"
    ),
    getBuildings
);

/**
 * Get Building by ID
 */
router.get(
    "/:id",
    authorizeAccess(
        MODULE,
        "view_building_own_center",
        "view_building_all_center"
    ),
    buildingIdValidator,
    getBuildingById
);

/**
 * Update Building
 */
router.put(
    "/:id",
    authorizeAccess(
        MODULE,
        "manage_building_own_center",
        "manage_building_all_center"
    ),
    updateBuildingValidator,
    updateBuilding
);

/**
 * Delete Building
 */
router.delete(
    "/:id",
    authorizeAccess(
        MODULE,
        "manage_building_all_center",
        "manage_building_own_center"
    ),
    buildingIdValidator,
    deleteBuilding
);

export default router;