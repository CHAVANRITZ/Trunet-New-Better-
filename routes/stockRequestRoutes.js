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
  exportStockRequestsToExcel
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
} from "../validations/stockRequestValidations.js";
import { authorizeAccess, protect } from "../middlewares/authMiddleware.js";
import { bulkUploadStockRequests, downloadStockRequestSampleCSV } from "../controllers/bulkStockRequestController.js";
import upload from "../middlewares/upload.js";

const router = express.Router();

const MODULE = "Indent";

// Create stock request
router.post(
  "/",
  protect,
  authorizeAccess(MODULE, "manage_indent"),
  validateCreateStockRequest,
  createStockRequest
);

// Get all stock requests with filters
router.get(
  "/",
  protect,
  authorizeAccess(MODULE, "indent_all_center", "indent_own_center"),
  validateStockRequestQuery,
  getAllStockRequests
);

// Export to Excel
router.get(
  "/export-excel",
  protect,
  authorizeAccess(MODULE, "indent_all_center", "indent_own_center"),
  exportStockRequestsToExcel
);

// Get stock request count
router.get(
  "/indent-count",
  protect,
  getStockRequestCount
);

// Get most recent order number
router.get(
  "/recent-order-number",
  protect,
  authorizeAccess(MODULE, "indent_all_center", "indent_own_center"),
  getMostRecentOrderNumber
);

// Get stock request notifications
router.get(
  "/notifications",
  protect,
  getStockRequestNotifications
);

// Get stock request by ID
router.get(
  "/:id",
  protect,
  authorizeAccess(MODULE, "indent_all_center", "indent_own_center"),
  validateIdParam,
  getStockRequestById
);

// Update stock request
router.put(
  "/:id",
  protect,
  authorizeAccess(MODULE, "manage_indent"),
  validateUpdateStockRequest,
  updateStockRequest
);

// Delete stock request
router.delete(
  "/:id",
  protect,
  authorizeAccess(MODULE, "delete_indent_own_center", "delete_indent_all_center"),
  validateIdParam,
  deleteStockRequest
);

// Approve stock request
router.post(
  "/:id/approve",
  protect,
  authorizeAccess(MODULE, "stock_transfer_approve_from_outlet", "manage_indent"),
  approveStockRequest
);

// Ship stock request
router.post(
  "/:id/ship",
  protect,
  authorizeAccess(MODULE, "manage_indent"),
  validateShipStockRequest,
  shipStockRequest
);

// Complete stock request
router.post(
  "/:id/complete",
  protect,
  authorizeAccess(MODULE, "complete_indent", "manage_indent"),
  validateCompleteStockRequest,
  completeStockRequest
);

// Complete incomplete stock request
router.patch(
  "/:id/complete-incomplete",
  protect,
  authorizeAccess(MODULE, "manage_indent"),
  validateCompleteIncompleteRequest,
  completeIncompleteRequest
);

// Update shipping info
router.patch(
  "/:id/shipping-info",
  protect,
  authorizeAccess(MODULE, "manage_indent"),
  validateUpdateShippingInfo,
  updateShippingInfo
);

// Reject shipment
router.post(
  "/:id/reject-shipment",
  protect,
  authorizeAccess(MODULE, "manage_indent"),
  validateRejectShipment,
  rejectShipment
);

// Get center serial numbers for a product
router.get(
  "/serial-numbers/product/:productId",
  protect,
  authorizeAccess(MODULE, "indent_all_center", "indent_own_center"),
  getCenterSerialNumbers
);

// Mark stock request as incomplete
router.post(
  "/:id/mark-incomplete",
  protect,
  authorizeAccess(MODULE, "manage_indent"),
  validateMarkAsIncomplete,
  markAsIncomplete
);

// Update approved quantities
router.patch(
  "/:id/approved-quantities",
  protect,
  authorizeAccess(MODULE, "manage_indent"),
  updateApprovedQuantities
);

// Update warehouse challan approval
router.patch(
  "/:id/warehouse-challan-approval",
  protect,
  authorizeAccess(MODULE, "manage_indent"),
  updateWarehouseChallanApproval
);

// Update center challan approval
router.patch(
  "/:id/center-challan-approval",
  protect,
  authorizeAccess(MODULE, "manage_indent"),
  updateCenterChallanApproval
);

// Update stock request status
router.patch(
  "/:id/status",
  protect,
  authorizeAccess(MODULE, "manage_indent"),
  validateIdParam,
  updateStockRequestStatus
);

// Bulk upload stock requests
router.post(
  "/bulk-upload",
  protect,
  upload.single('file'),
  bulkUploadStockRequests
);

// Download sample CSV for bulk upload
router.get(
  "/download/sample",
  downloadStockRequestSampleCSV
);

export default router;
