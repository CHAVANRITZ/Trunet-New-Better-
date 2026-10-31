import express from "express";

import {
  createStockRequest,
  getAllStockRequests,
  getStockRequestById,
  updateStockRequest,
  deleteStockRequest,
  approveStockRequest,
  shipStockRequest,
  updateShippingInfo,
  rejectShipment,
  markAsIncomplete,
  completeStockRequest,
  completeIncompleteRequest,
  updateStockRequestStatus,
  getCenterSerialNumbers,
  updateApprovedQuantities,
  getMostRecentOrderNumber,
  getStockRequestCount,
  getStockRequestNotifications,
  updateWarehouseChallanApproval,
  updateCenterChallanApproval,
  exportStockRequestsToExcel,
} from "../controllers/stockRequestController.js";

import {
  validateCreateStockRequest,
  validateUpdateStockRequest,
  validateIdParam,
  validateStockRequestQuery,
  validateApproveStockRequest,
  validateShipStockRequest,
  validateCompleteStockRequest,
  validateCompleteIncompleteRequest,
  validateUpdateApprovedQuantities,
  validateRejectShipment,
  validateMarkAsIncomplete,
  validateUpdateShippingInfo,
} from "../validators/stockRequestValidations.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeAccess } from "../middlewares/authorizationMiddleware.js";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";

import {
  bulkUploadStockRequests,
  downloadStockRequestSampleCSV,
} from "../controllers/bulkStockRequestController.js";

import upload from "../middlewares/upload.js";

const router = express.Router();

const MODULE = "Indent";

/*
 * CREATE
 */
router.post(
  "/",
  authMiddleware,
  authorizeAccess(MODULE, "manage_indent"),
  validateCreateStockRequest,
  validationMiddleware,
  createStockRequest
);

/*
 * LIST
 */
router.get(
  "/",
  authMiddleware,
  authorizeAccess(
    MODULE,
    "indent_all_center",
    "indent_own_center"
  ),
  validateStockRequestQuery,
  validationMiddleware,
  getAllStockRequests
);

/*
 * IMPORTANT:
 * Static routes are placed BEFORE /:id routes.
 */

/*
 * EXCEL
 */
router.get(
  "/export-excel",
  authMiddleware,
  authorizeAccess(
    MODULE,
    "indent_all_center",
    "indent_own_center"
  ),
  exportStockRequestsToExcel
);

/*
 * COUNT
 */
router.get(
  "/indent-count",
  authMiddleware,
  getStockRequestCount
);

/*
 * RECENT ORDER NUMBER
 */
router.get(
  "/recent-order-number",
  authMiddleware,
  authorizeAccess(
    MODULE,
    "indent_all_center",
    "indent_own_center"
  ),
  getMostRecentOrderNumber
);

/*
 * NOTIFICATIONS
 */
router.get(
  "/notifications",
  authMiddleware,
  getStockRequestNotifications
);

/*
 * BULK UPLOAD
 */
router.post(
  "/bulk-upload",
  authMiddleware,
  upload.single("file"),
  bulkUploadStockRequests
);

/*
 * SAMPLE DOWNLOAD
 */
router.get(
  "/download/sample",
  downloadStockRequestSampleCSV
);

/*
 * CENTER SERIAL NUMBERS
 */
router.get(
  "/serial-numbers/product/:productId",
  authMiddleware,
  authorizeAccess(
    MODULE,
    "indent_all_center",
    "indent_own_center"
  ),
  getCenterSerialNumbers
);

/*
 * GET BY ID
 */
router.get(
  "/:id",
  authMiddleware,
  authorizeAccess(
    MODULE,
    "indent_all_center",
    "indent_own_center"
  ),
  validateIdParam,
  validationMiddleware,
  getStockRequestById
);

/*
 * UPDATE
 */
router.put(
  "/:id",
  authMiddleware,
  authorizeAccess(MODULE, "manage_indent"),
  validateUpdateStockRequest,
  validationMiddleware,
  updateStockRequest
);

/*
 * DELETE
 */
router.delete(
  "/:id",
  authMiddleware,
  authorizeAccess(
    MODULE,
    "delete_indent_own_center",
    "delete_indent_all_center"
  ),
  validateIdParam,
  validationMiddleware,
  deleteStockRequest
);

/*
 * APPROVE
 */
router.post(
  "/:id/approve",
  authMiddleware,
  authorizeAccess(
    MODULE,
    "stock_transfer_approve_from_outlet",
    "manage_indent"
  ),
  validateApproveStockRequest,
  validationMiddleware,
  approveStockRequest
);

/*
 * SHIP
 */
router.post(
  "/:id/ship",
  authMiddleware,
  authorizeAccess(MODULE, "manage_indent"),
  validateShipStockRequest,
  validationMiddleware,
  shipStockRequest
);

/*
 * COMPLETE
 */
router.post(
  "/:id/complete",
  authMiddleware,
  authorizeAccess(
    MODULE,
    "complete_indent",
    "manage_indent"
  ),
  validateCompleteStockRequest,
  validationMiddleware,
  completeStockRequest
);

/*
 * COMPLETE INCOMPLETE
 */
router.patch(
  "/:id/complete-incomplete",
  authMiddleware,
  authorizeAccess(MODULE, "manage_indent"),
  validateCompleteIncompleteRequest,
  validationMiddleware,
  completeIncompleteRequest
);

/*
 * SHIPPING INFO
 */
router.patch(
  "/:id/shipping-info",
  authMiddleware,
  authorizeAccess(MODULE, "manage_indent"),
  validateUpdateShippingInfo,
  validationMiddleware,
  updateShippingInfo
);

/*
 * REJECT SHIPMENT
 */
router.post(
  "/:id/reject-shipment",
  authMiddleware,
  authorizeAccess(MODULE, "manage_indent"),
  validateRejectShipment,
  validationMiddleware,
  rejectShipment
);

/*
 * MARK INCOMPLETE
 */
router.post(
  "/:id/mark-incomplete",
  authMiddleware,
  authorizeAccess(MODULE, "manage_indent"),
  validateMarkAsIncomplete,
  validationMiddleware,
  markAsIncomplete
);

/*
 * APPROVED QUANTITIES
 */
router.patch(
  "/:id/approved-quantities",
  authMiddleware,
  authorizeAccess(MODULE, "manage_indent"),
  validateUpdateApprovedQuantities,
  validationMiddleware,
  updateApprovedQuantities
);

/*
 * WAREHOUSE CHALLAN
 */
router.patch(
  "/:id/warehouse-challan-approval",
  authMiddleware,
  authorizeAccess(MODULE, "manage_indent"),
  updateWarehouseChallanApproval
);

/*
 * CENTER CHALLAN
 */
router.patch(
  "/:id/center-challan-approval",
  authMiddleware,
  authorizeAccess(MODULE, "manage_indent"),
  updateCenterChallanApproval
);

/*
 * STATUS
 */
router.patch(
  "/:id/status",
  authMiddleware,
  authorizeAccess(MODULE, "manage_indent"),
  validateIdParam,
  validationMiddleware,
  updateStockRequestStatus
);

export default router;