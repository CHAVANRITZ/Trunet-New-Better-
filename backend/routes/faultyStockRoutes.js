
import express from "express";

import {
    transferToRepairCenter,
    returnFromRepairCenter,
    getRepairTransfersForCenter,
    getDamagedAndUnderRepairSerials,
    markAsRepairedOrIrreparable,
    getDamageAndUnderRepairProduct,
    getRepairedProducts,
    transferRepairedToMainWarehouse,
    transferRepairedToResellerStock,
    getRepairedProductsInOutletStock,
    getAllFaultyStockForWarehouse,
    getAllFaultyStockForRepairing,
    acceptRepairedTransfer, // Add this
} from "../controllers/faultyStockController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";

import {
    authorizeAccess,
    attachAuthorizationContext,
} from "../middlewares/authorizationMiddleware.js";

const router = express.Router();

const MODULE = "Usage";

const viewPermissions = [
    "view_usage_own_center",
    "view_usage_all_center",
];

const managePermissions = [
    "manage_usage_own_center",
    "manage_usage_all_center",
];

const protect = (...permissions) => [
    authMiddleware,
    ...(permissions.length
        ? [authorizeAccess(MODULE, ...permissions)]
        : []),
    attachAuthorizationContext(MODULE),
];

/*
 * Repair transfer operations
 */

// Transfer faulty stock to repair center
router.post(
    "/repair-transfers",
    ...protect(...managePermissions),
    transferToRepairCenter
);

// Return stock from repair center
router.post(
    "/repair-transfers/return",
    ...protect(...managePermissions),
    returnFromRepairCenter
);

// Get repair transfers for a center
router.get(
    "/repair-transfers/center",
    ...protect(...viewPermissions),
    getRepairTransfersForCenter
);

// Get damaged and under-repair serial numbers
router.get(
    "/damaged-under-repair/serials",
    ...protect(...viewPermissions),
    getDamagedAndUnderRepairSerials
);

/*
 * Repair status and product information
 */

// Mark items as repaired or irreparable
router.patch(
    "/repair-status",
    ...protect(...managePermissions),
    markAsRepairedOrIrreparable
);

// Get damaged and under-repair product details
router.get(
    "/damaged-under-repair/products",
    ...protect(...viewPermissions),
    getDamageAndUnderRepairProduct
);

// Get repaired products
router.get(
    "/repaired-products",
    ...protect(...viewPermissions),
    getRepairedProducts
);

/*
 * Repaired stock transfers
 */

// Transfer repaired stock to main warehouse
router.post(
    "/repaired-products/transfer/main-warehouse",
    ...protect(...managePermissions),
    transferRepairedToMainWarehouse
);

router.patch(
  "/repaired-products/transfer/accept",
  ...protect(...managePermissions),
  acceptRepairedTransfer
);

// Transfer repaired stock to reseller
router.post(
    "/repaired-products/transfer/reseller",
    ...protect(...managePermissions),
    transferRepairedToResellerStock
);

// Get repaired products in outlet stock
router.get(
    "/repaired-products/outlet-stock",
    ...protect(...viewPermissions),
    getRepairedProductsInOutletStock
);

/*
 * Faulty stock reports
 */

// Get faulty stock for warehouse
router.get(
    "/warehouse",
    ...protect(...viewPermissions),
    getAllFaultyStockForWarehouse
);

// Get stock currently awaiting or undergoing repair
router.get(
    "/repairing",
    ...protect(...viewPermissions),
    getAllFaultyStockForRepairing
);

export default router;
