import * as stockRequestService from "../services/stockRequestService.js";

// ---------------------------------------------------------------------------
// All handlers delegate to the service. The service returns { statusCode, body }.
// Response behavior (status codes, envelopes, field names, error messages) is
// identical to the legacy controller because the service reproduces it exactly.
// ---------------------------------------------------------------------------

export const createStockRequest = async (req, res) => {
  const result = await stockRequestService.createStockRequest(req.user, req.body);
  return res.status(result.statusCode).json(result.body);
};

export const getAllStockRequests = async (req, res) => {
  const result = await stockRequestService.getAllStockRequests(req.user, req.query);
  return res.status(result.statusCode).json(result.body);
};

export const getStockRequestById = async (req, res) => {
  const result = await stockRequestService.getStockRequestById(req.user, req.params.id);
  return res.status(result.statusCode).json(result.body);
};

export const updateStockRequest = async (req, res) => {
  const result = await stockRequestService.updateStockRequest(req.user, req.params.id, req.body);
  return res.status(result.statusCode).json(result.body);
};

export const deleteStockRequest = async (req, res) => {
  const result = await stockRequestService.deleteStockRequest(req.user, req.params.id);
  return res.status(result.statusCode).json(result.body);
};

export const approveStockRequest = async (req, res) => {
  const result = await stockRequestService.approveStockRequest(req.user, req.params.id, req.body);
  return res.status(result.statusCode).json(result.body);
};

export const updateApprovedQuantities = async (req, res) => {
  const result = await stockRequestService.updateApprovedQuantities(req.user, req.params.id, req.body);
  return res.status(result.statusCode).json(result.body);
};

export const shipStockRequest = async (req, res) => {
  const result = await stockRequestService.shipStockRequest(req.user, req.params.id, req.body);
  return res.status(result.statusCode).json(result.body);
};

export const updateShippingInfo = async (req, res) => {
  const result = await stockRequestService.updateShippingInfo(req.user, req.params.id, req.body);
  return res.status(result.statusCode).json(result.body);
};

export const rejectShipment = async (req, res) => {
  const result = await stockRequestService.rejectShipment(req.user, req.params.id);
  return res.status(result.statusCode).json(result.body);
};

export const completeStockRequest = async (req, res) => {
  const result = await stockRequestService.completeStockRequest(req.user, req.params.id, req.body);
  return res.status(result.statusCode).json(result.body);
};

export const markAsIncomplete = async (req, res) => {
  const result = await stockRequestService.markAsIncomplete(req.user, req.params.id, req.body);
  return res.status(result.statusCode).json(result.body);
};

export const completeIncompleteRequest = async (req, res) => {
  const result = await stockRequestService.completeIncompleteRequest(req.user, req.params.id, req.body);
  return res.status(result.statusCode).json(result.body);
};

export const updateStockRequestStatus = async (req, res) => {
  const result = await stockRequestService.updateStockRequestStatus(req.user, req.params.id, req.body);
  return res.status(result.statusCode).json(result.body);
};

export const getCenterSerialNumbers = async (req, res) => {
  const result = await stockRequestService.getCenterSerialNumbers(req.user, req.params.productId);
  return res.status(result.statusCode).json(result.body);
};

export const getMostRecentOrderNumber = async (req, res) => {
  const result = await stockRequestService.getMostRecentOrderNumber(req.user);
  return res.status(result.statusCode).json(result.body);
};

export const getStockRequestCount = async (req, res) => {
  const result = await stockRequestService.getStockRequestCount(req.query);
  return res.status(result.statusCode).json(result.body);
};

export const getStockRequestNotifications = async (req, res) => {
  const result = await stockRequestService.getStockRequestNotifications(req.user, req.query);
  return res.status(result.statusCode).json(result.body);
};

export const updateWarehouseChallanApproval = async (req, res) => {
  const result = await stockRequestService.updateWarehouseChallanApproval(req.user, req.params.id, req.body);
  return res.status(result.statusCode).json(result.body);
};

export const updateCenterChallanApproval = async (req, res) => {
  const result = await stockRequestService.updateCenterChallanApproval(req.user, req.params.id, req.body);
  return res.status(result.statusCode).json(result.body);
};

export const exportStockRequestsToExcel = async (req, res) => {
  const result = await stockRequestService.exportStockRequestsToExcel(req.user, req.query);
  return res.status(result.statusCode).json(result.body);
};

// ---------------------------------------------------------------------------
// Bulk upload — file is passed via multer (req.file).
// ---------------------------------------------------------------------------
export const bulkUploadStockRequests = async (req, res) => {
  const result = await stockRequestService.bulkUploadStockRequests(req.user, req.file);
  return res.status(result.statusCode).json(result.body);
};

// ---------------------------------------------------------------------------
// Sample CSV — returns raw CSV string, not JSON. Headers set by controller.
// ---------------------------------------------------------------------------
export const downloadStockRequestSampleCSV = async (req, res) => {
  const result = await stockRequestService.downloadBulkUploadSample();
  if (result.raw) {
    if (result.headers) {
      Object.entries(result.headers).forEach(([k, v]) => res.setHeader(k, v));
    }
    return res.status(result.statusCode).send(result.body);
  }
  return res.status(result.statusCode).json(result.body);
};