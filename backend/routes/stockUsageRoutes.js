import express from "express";

import {
    createStockUsage,
    getAllStockUsage,
    getStockUsageById,
    updateStockUsage,
    deleteStockUsage,
    approveDamageRequest,
    rejectDamageRequest,
    getPendingDamageRequests,
    getDamageRequestsByStatus,
    getStockUsageByCustomer,
    getStockUsageByBuilding,
    getStockUsageByControlRoom,
    getProductDevicesByCustomer,
    getProductDevicesByBuilding,
    getProductDevicesByControlRoom,
    changeToDamageReturn,
    getDamageReturnRecordsWithStats,
    returnProductSerial,
    replaceProductSerial,
    getAllFaultyStock,
    checkRevertEligibility,
    revertDamageEntry,
} from "../controllers/stockUsageController.js";

import {
    validateCreateStockUsage,
    validateUpdateStockUsage,
    validateStockUsageId,
    validateDamageReturnApproval,
    validateCheckRevertEligibility,
    validateRevertDamage,
    validateStockUsageQuery,
} from "../validators/stockUsageValidations.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
    authorizeAccess,
    attachAuthorizationContext,
} from "../middlewares/authorizationMiddleware.js";

const router = express.Router();

const MODULE = "Usage";

/*
 * Collection routes
 */

router
    .route("/")
    .post(
        authMiddleware,
        authorizeAccess(
            MODULE,
            "manage_usage_own_center",
            "manage_usage_all_center"
        ),
        attachAuthorizationContext(MODULE),
        validateCreateStockUsage,
        createStockUsage
    )
    .get(
        authMiddleware,
        authorizeAccess(
            MODULE,
            "view_usage_own_center",
            "view_usage_all_center"
        ),
        attachAuthorizationContext(MODULE),
        validateStockUsageQuery,
        getAllStockUsage
    );

/*
 * Pending and status-based damage requests
 */

router.get(
    "/pending",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_usage_own_center",
        "view_usage_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getPendingDamageRequests
);

router.get(
    "/requests/:status",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_usage_own_center",
        "view_usage_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getDamageRequestsByStatus
);

/*
 * Damage Return and faulty stock
 */

router.get(
    "/damage-return",
    authMiddleware,
    attachAuthorizationContext(MODULE),
    getDamageReturnRecordsWithStats
);

router.get(
    "/faulty-stock",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_usage_own_center",
        "view_usage_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getAllFaultyStock
);

router.patch(
    "/damage/:id/damage-return",
    authMiddleware,
    attachAuthorizationContext(MODULE),
    validateStockUsageId,
    changeToDamageReturn
);

/*
 * Product serial operations
 */

router.post(
    "/return/product",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_usage_own_center",
        "manage_usage_all_center"
    ),
    attachAuthorizationContext(MODULE),
    returnProductSerial
);

router.post(
    "/replace-serial",
    authMiddleware,
    attachAuthorizationContext(MODULE),
    replaceProductSerial
);

/*
 * Customer, building, and control-room lookups
 * Keep these before /:id routes.
 */

router.get(
    "/customer/:customerId/devices",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_usage_own_center",
        "view_usage_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getProductDevicesByCustomer
);

router.get(
    "/building/:buildingId/devices",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_usage_own_center",
        "view_usage_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getProductDevicesByBuilding
);

router.get(
    "/control-room/:controlRoomId/devices",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_usage_own_center",
        "view_usage_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getProductDevicesByControlRoom
);

router.get(
    "/customer/:customerId",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_usage_own_center",
        "view_usage_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getStockUsageByCustomer
);

router.get(
    "/building/:buildingId",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_usage_own_center",
        "view_usage_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getStockUsageByBuilding
);

router.get(
    "/control-room/:controlRoomId",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_usage_own_center",
        "view_usage_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getStockUsageByControlRoom
);

/*
 * Damage approval, rejection, and revert
 */

router.patch(
    "/:id/approve",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "accept_damage_return"
    ),
    attachAuthorizationContext(MODULE),
    validateDamageReturnApproval,
    approveDamageRequest
);

router.patch(
    "/:id/reject",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_usage_own_center",
        "manage_usage_all_center"
    ),
    attachAuthorizationContext(MODULE),
    validateStockUsageId,
    rejectDamageRequest
);

router.get(
    "/:id/check-revert",
    authMiddleware,
    attachAuthorizationContext(MODULE),
    validateCheckRevertEligibility,
    checkRevertEligibility
);

router.put(
    "/:id/revert-damage",
    authMiddleware,
    attachAuthorizationContext(MODULE),
    validateRevertDamage,
    revertDamageEntry
);

/*
 * Individual usage routes
 */

router
    .route("/:id")
    .get(
        authMiddleware,
        authorizeAccess(
            MODULE,
            "view_usage_own_center",
            "view_usage_all_center"
        ),
        attachAuthorizationContext(MODULE),
        validateStockUsageId,
        getStockUsageById
    )
    .put(
        authMiddleware,
        authorizeAccess(
            MODULE,
            "allow_edit_usage"
        ),
        attachAuthorizationContext(MODULE),
        validateUpdateStockUsage,
        updateStockUsage
    )
    .delete(
        authMiddleware,
        authorizeAccess(
            MODULE,
            "manage_usage_own_center",
            "manage_usage_all_center"
        ),
        attachAuthorizationContext(MODULE),
        validateStockUsageId,
        deleteStockUsage
    );

export default router;
