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
    acceptRepairedTransfer,
} from "../controllers/faultyStockController.js";

import {
    acceptDamageItems,
    rejectDamageItems,
    acceptRepairTransfer,
    acceptRejectRepairedTransfer,
    acceptRejectResellerTransfer,
} from "../controllers/acceptDamageController.js";

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

const authorizeUsage = (...permissions) => [
    authMiddleware,
    authorizeAccess(MODULE, ...permissions),
    attachAuthorizationContext(MODULE),
];

/*
|--------------------------------------------------------------------------
| Repair transfer operations
|--------------------------------------------------------------------------
*/

// Current route
router.post(
    "/repair-transfers",
    ...authorizeUsage(...managePermissions),
    transferToRepairCenter
);

// Legacy alias
router.post(
    "/transfer",
    ...authorizeUsage(...managePermissions),
    transferToRepairCenter
);

// Current route
router.post(
    "/repair-transfers/return",
    ...authorizeUsage(...managePermissions),
    returnFromRepairCenter
);

// Legacy alias
router.post(
    "/return-from-repair",
    ...authorizeUsage(...managePermissions),
    returnFromRepairCenter
);

router.get(
    "/repair-transfers/center",
    ...authorizeUsage(...viewPermissions),
    getRepairTransfersForCenter
);

// Current serial route: controller reads productId from req.query
router.get(
    "/damaged-under-repair/serials",
    ...authorizeUsage(...viewPermissions),
    getDamagedAndUnderRepairSerials
);

// Legacy serial URL alias.
// The controller reads req.query.productId, not req.params.productId.
router.get(
    "/serials/:productId",
    ...authorizeUsage(...viewPermissions),
    (req, res, next) => {
        req.query.productId = req.params.productId;
        return getDamagedAndUnderRepairSerials(req, res, next);
    }
);

/*
|--------------------------------------------------------------------------
| Damage acceptance and rejection
|--------------------------------------------------------------------------
*/

router.post(
    "/accept-damage",
    ...authorizeUsage(...managePermissions),
    acceptDamageItems
);

router.post(
    "/reject-damage",
    ...authorizeUsage(...managePermissions),
    rejectDamageItems
);

router.post(
    "/accept-repair-transfer",
    ...authorizeUsage(...managePermissions),
    acceptRepairTransfer
);

// Additional acceptance handlers
router.post(
    "/accept-reject-repaired-transfer",
    ...authorizeUsage(...managePermissions),
    acceptRejectRepairedTransfer
);

router.post(
    "/accept-reject-reseller-transfer",
    ...authorizeUsage(...managePermissions),
    acceptRejectResellerTransfer
);

/*
|--------------------------------------------------------------------------
| Repair status and product information
|--------------------------------------------------------------------------
*/

// Current route
router.patch(
    "/repair-status",
    ...authorizeUsage(...managePermissions),
    markAsRepairedOrIrreparable
);

// Legacy alias
router.post(
    "/mark-repair-status",
    ...authorizeUsage(...managePermissions),
    markAsRepairedOrIrreparable
);

router.get(
    "/damaged-under-repair/products",
    ...authorizeUsage(...viewPermissions),
    getDamageAndUnderRepairProduct
);

// Legacy alias
router.get(
    "/damage-products",
    ...authorizeUsage(...viewPermissions),
    getDamageAndUnderRepairProduct
);

router.get(
    "/repaired-products",
    ...authorizeUsage(...viewPermissions),
    getRepairedProducts
);

/*
|--------------------------------------------------------------------------
| Repaired stock transfers
|--------------------------------------------------------------------------
*/

// Current route
router.post(
    "/repaired-products/transfer/main-warehouse",
    ...authorizeUsage(...managePermissions),
    transferRepairedToMainWarehouse
);

// Legacy alias
router.post(
    "/transfer-repaired-to-warehouse",
    ...authorizeUsage(...managePermissions),
    transferRepairedToMainWarehouse
);

// Acceptance handler for repaired stock sent to an outlet
router.patch(
    "/repaired-products/transfer/accept",
    ...authorizeUsage(...managePermissions),
    acceptRepairedTransfer
);

// Current route
router.post(
    "/repaired-products/transfer/reseller",
    ...authorizeUsage(...managePermissions),
    transferRepairedToResellerStock
);

// Legacy alias
router.post(
    "/transfer-to-reseller-center",
    ...authorizeUsage(...managePermissions),
    transferRepairedToResellerStock
);

router.get(
    "/repaired-products/outlet-stock",
    ...authorizeUsage(...viewPermissions),
    getRepairedProductsInOutletStock
);

// Legacy alias
router.get(
    "/outlet-repaired-stock",
    ...authorizeUsage(...viewPermissions),
    getRepairedProductsInOutletStock
);

/*
|--------------------------------------------------------------------------
| Faulty stock reports
|--------------------------------------------------------------------------
*/

// Current warehouse report
router.get(
    "/warehouse",
    ...authorizeUsage(...viewPermissions),
    getAllFaultyStockForWarehouse
);

// Legacy alias
router.get(
    "/product-status",
    ...authorizeUsage(...viewPermissions),
    getAllFaultyStockForWarehouse
);

// Current repairing report
router.get(
    "/repairing",
    ...authorizeUsage(...viewPermissions),
    getAllFaultyStockForRepairing
);

// Legacy alias
router.get(
    "/under-repaired",
    ...authorizeUsage(...viewPermissions),
    getAllFaultyStockForRepairing
);

export default router;