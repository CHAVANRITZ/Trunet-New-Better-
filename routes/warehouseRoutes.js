import express from "express";

import {
    createWarehouse,
    getAllWarehouses,
    getWarehouseById,
    updateWarehouse,
    deleteWarehouse,
} from "../controllers/warehouseController.js";

import {
    validateCreateWarehouse,
    validateUpdateWarehouse,
    validateWarehouseId,
} from "../validators/warehouseValidation.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeAccess } from "../middlewares/authorizationMiddleware.js";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";

const router = express.Router();

const MODULE = "Center";

/**
 * Protect every Warehouse route.
 */
router.use(authMiddleware);

/**
 * Create Warehouse.
 *
 * Warehouse management uses the existing Center
 * management permission as approved by the business requirement.
 */
router.post(
    "/",
    authorizeAccess(
        MODULE,
        "manage_all_center"
    ),
    validateCreateWarehouse,
    validationMiddleware,
    createWarehouse
);

/**
 * Get all Warehouses.
 */
router.get(
    "/",
    authorizeAccess(
        MODULE,
        "view_all_center"
    ),
    getAllWarehouses
);

/**
 * Get Warehouse by ID.
 */
router.get(
    "/:id",
    authorizeAccess(
        MODULE,
        "view_all_center"
    ),
    validateWarehouseId,
    validationMiddleware,
    getWarehouseById
);

/**
 * Update Warehouse.
 */
router.put(
    "/:id",
    authorizeAccess(
        MODULE,
        "manage_all_center"
    ),
    validateUpdateWarehouse,
    validationMiddleware,
    updateWarehouse
);

/**
 * Delete Warehouse.
 *
 * Kept consistent with the Center module's
 * legacy authorization behavior.
 */
router.delete(
    "/:id",
    authorizeAccess(
        MODULE,
        "manage_all_center"
    ),
    validateWarehouseId,
    validationMiddleware,
    deleteWarehouse
);

export default router;