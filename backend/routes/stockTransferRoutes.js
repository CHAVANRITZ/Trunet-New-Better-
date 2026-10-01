import express from "express";

import {
    createStockTransfer,
    getAllStockTransfers,
    getStockTransferById,
    updateStockTransfer,
    deleteStockTransfer,
    submitStockTransfer,
    approveStockTransferByAdmin,
    rejectStockTransferByAdmin,
    confirmStockTransfer,
    shipStockTransfer,
    completeStockTransfer,
    markStockTransferAsIncomplete,
    rejectStockTransfer,
    getPendingAdminApprovalTransfers,
    getTransferStats,
    updateShippingInfo,
    rejectShipping,
    getMostRecentTransferNumber,
    completeIncompleteStockTransfer,
    updateApprovedQuantities,
    getWarehouseProductSummary,
} from "../controllers/stockTransferController.js";

import {
    validateCreateStockTransfer,
    validateUpdateStockTransfer,
    validateIdParam,
    validateAdminApproval,
    validateAdminRejection,
    validateShipping,
    validateUpdateShippingInfo,
    validateCompletion,
    validateConfirmation,
    validateIncompleteTransfer,
    validateRejectShipment,
    validateRejectTransfer,
    validateQueryParams,
    validateUpdateApprovedQuantities,
    validateCompleteIncompleteTransfer,
} from "../validators/stockTransferValidator.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
    authorizeAccess,
    attachAuthorizationContext,
} from "../middlewares/authorizationMiddleware.js";

const router = express.Router();

/*
 * Transfer is the existing legacy permission module.
 *
 * Permission action names are intentionally preserved because
 * they are part of the existing database/API authorization contract.
 */
const MODULE = "Transfer";

/*
 * --------------------------------------------------------------------------
 * Collection routes
 * --------------------------------------------------------------------------
 */

router
    .route("/")
    .post(
        authMiddleware,
        authorizeAccess(
            MODULE,
            "manage_stock_transfer_own_center",
            "manage_stock_transfer_all_center"
        ),
        attachAuthorizationContext(MODULE),
        validateCreateStockTransfer,
        createStockTransfer
    )
    .get(
        authMiddleware,
        authorizeAccess(
            MODULE,
            "stock_transfer_own_center",
            "stock_transfer_all_center"
        ),
        attachAuthorizationContext(MODULE),
        validateQueryParams,
        getAllStockTransfers
    );

/*
 * --------------------------------------------------------------------------
 * Transfer metadata / reporting routes
 * --------------------------------------------------------------------------
 */

router.get(
    "/latest-transfer-number",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "stock_transfer_own_center",
        "stock_transfer_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getMostRecentTransferNumber
);

router.get(
    "/summary/original-outlet",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "stock_transfer_own_center",
        "stock_transfer_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getWarehouseProductSummary
);

router.get(
    "/stats",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "stock_transfer_own_center",
        "stock_transfer_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getTransferStats
);

/*
 * --------------------------------------------------------------------------
 * Individual transfer routes
 * --------------------------------------------------------------------------
 */

router
    .route("/:id")
    .get(
        authMiddleware,
        authorizeAccess(
            MODULE,
            "stock_transfer_own_center",
            "stock_transfer_all_center"
        ),
        attachAuthorizationContext(MODULE),
        validateIdParam,
        getStockTransferById
    )
    .put(
        authMiddleware,
        authorizeAccess(
            MODULE,
            "manage_stock_transfer_own_center",
            "manage_stock_transfer_all_center"
        ),
        attachAuthorizationContext(MODULE),
        validateUpdateStockTransfer,
        updateStockTransfer
    )
    .delete(
        authMiddleware,
        authorizeAccess(
            MODULE,
            "delete_transfer_own_center",
            "delete_transfer_all_center"
        ),
        attachAuthorizationContext(MODULE),
        validateIdParam,
        deleteStockTransfer
    );

/*
 * --------------------------------------------------------------------------
 * Transfer lifecycle
 * --------------------------------------------------------------------------
 */

router.post(
    "/:id/submit",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_stock_transfer_own_center",
        "manage_stock_transfer_all_center"
    ),
    attachAuthorizationContext(MODULE),
    validateIdParam,
    submitStockTransfer
);

router.post(
    "/:id/approve",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_stock_transfer_own_center",
        "manage_stock_transfer_all_center",
        "approval_transfer_center"
    ),
    attachAuthorizationContext(MODULE),
    validateConfirmation,
    confirmStockTransfer
);

router.post(
    "/:id/reject",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_stock_transfer_own_center",
        "manage_stock_transfer_all_center"
    ),
    attachAuthorizationContext(MODULE),
    validateRejectTransfer,
    rejectStockTransfer
);

/*
 * --------------------------------------------------------------------------
 * Admin approval
 * --------------------------------------------------------------------------
 */

router.patch(
    "/:id/admin/approve",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_stock_transfer_own_center",
        "manage_stock_transfer_all_center"
    ),
    attachAuthorizationContext(MODULE),
    validateAdminApproval,
    approveStockTransferByAdmin
);

router.patch(
    "/:id/admin/reject",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_stock_transfer_own_center",
        "manage_stock_transfer_all_center"
    ),
    attachAuthorizationContext(MODULE),
    validateAdminRejection,
    rejectStockTransferByAdmin
);

/*
 * --------------------------------------------------------------------------
 * Shipping
 * --------------------------------------------------------------------------
 */

router.post(
    "/:id/ship",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_stock_transfer_own_center",
        "manage_stock_transfer_all_center"
    ),
    attachAuthorizationContext(MODULE),
    validateShipping,
    shipStockTransfer
);

router.patch(
    "/:id/shipping-info",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_stock_transfer_own_center",
        "manage_stock_transfer_all_center"
    ),
    attachAuthorizationContext(MODULE),
    validateUpdateShippingInfo,
    updateShippingInfo
);

router.patch(
    "/:id/reject-shipment",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_stock_transfer_own_center",
        "manage_stock_transfer_all_center"
    ),
    attachAuthorizationContext(MODULE),
    validateRejectShipment,
    rejectShipping
);

/*
 * --------------------------------------------------------------------------
 * Completion / incomplete transfer handling
 * --------------------------------------------------------------------------
 */

router.post(
    "/:id/complete",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_stock_transfer_own_center",
        "manage_stock_transfer_all_center"
    ),
    attachAuthorizationContext(MODULE),
    validateCompletion,
    completeStockTransfer
);

router.post(
    "/:id/mark-incomplete",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_stock_transfer_own_center",
        "manage_stock_transfer_all_center"
    ),
    attachAuthorizationContext(MODULE),
    validateIncompleteTransfer,
    markStockTransferAsIncomplete
);

router.patch(
    "/:id/complete-incomplete",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_stock_transfer_own_center",
        "manage_stock_transfer_all_center"
    ),
    attachAuthorizationContext(MODULE),
    validateCompleteIncompleteTransfer,
    completeIncompleteStockTransfer
);

/*
 * --------------------------------------------------------------------------
 * Approval quantity / serial updates
 * --------------------------------------------------------------------------
 */

router.patch(
    "/:id/approved-quantities",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_stock_transfer_own_center",
        "manage_stock_transfer_all_center"
    ),
    attachAuthorizationContext(MODULE),
    validateUpdateApprovedQuantities,
    updateApprovedQuantities
);

/*
 * --------------------------------------------------------------------------
 * Admin pending approval
 * --------------------------------------------------------------------------
 */

router.get(
    "/admin/pending-approval",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "indent_all_center",
        "indent_own_center"
    ),
    attachAuthorizationContext(MODULE),
    getPendingAdminApprovalTransfers
);

export default router;