import express from "express";

import {
    createShiftingRequest,
    getAllShiftingRequests,
    updateShiftingRequestStatus,
    getShiftingRequestById,
    getCustomerShiftingHistory,
    getCustomerCurrentCenter,
    deleteShiftingRequest,
    updateShiftingRequest,
    getShiftingRequestsByCustomer,
} from "../controllers/shiftingRequestController.js";

import {
    validateShiftingRequest,
} from "../validators/shiftingRequestValidator.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";

import {
    authorizeAccess,
    attachAuthorizationContext,
} from "../middlewares/authorizationMiddleware.js";

const router = express.Router();

const MODULE = "Shifting";

/*
 * Create shifting request
 * POST /api/v1/shifting-requests
 */
router.post(
    "/",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_shifting_own_center",
        "manage_shifting_all_center"
    ),
    attachAuthorizationContext(MODULE),
    validateShiftingRequest,
    createShiftingRequest
);

/*
 * Get all shifting requests
 * GET /api/v1/shifting-requests
 */
router.get(
    "/",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_shifting_own_center",
        "view_shifting_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getAllShiftingRequests
);

/*
 * Get shifting requests for a customer
 * Keep this route before /:id.
 * GET /api/v1/shifting-requests/customer/:customerId/requests
 */
router.get(
    "/customer/:customerId/requests",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_shifting_own_center",
        "view_shifting_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getShiftingRequestsByCustomer
);

/*
 * Get customer shifting history
 * GET /api/v1/shifting-requests/customers/:customerId/history
 */
router.get(
    "/customers/:customerId/history",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_shifting_own_center",
        "view_shifting_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getCustomerShiftingHistory
);

/*
 * Get customer's current center and shifting history
 * GET /api/v1/shifting-requests/customers/:customerId/current-center
 */
router.get(
    "/customers/:customerId/current-center",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_shifting_own_center",
        "view_shifting_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getCustomerCurrentCenter
);

/*
 * Get a shifting request by ID
 * GET /api/v1/shifting-requests/:id
 */
router.get(
    "/:id",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_shifting_own_center",
        "view_shifting_all_center"
    ),
    attachAuthorizationContext(MODULE),
    getShiftingRequestById
);

/*
 * Update a pending shifting request
 * PUT /api/v1/shifting-requests/:id
 */
router.put(
    "/:id",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_shifting_own_center",
        "manage_shifting_all_center"
    ),
    attachAuthorizationContext(MODULE),
    updateShiftingRequest
);

/*
 * Delete a shifting request
 * DELETE /api/v1/shifting-requests/:id
 */
router.delete(
    "/:id",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_shifting_own_center",
        "manage_shifting_all_center"
    ),
    attachAuthorizationContext(MODULE),
    deleteShiftingRequest
);

/*
 * Approve or reject a shifting request
 * PUT /api/v1/shifting-requests/:id/status
 */
router.put(
    "/:id/status",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "accept_shifting_all_center",
        "accept_shifting_own_center"
    ),
    attachAuthorizationContext(MODULE),
    updateShiftingRequestStatus
);

export default router;