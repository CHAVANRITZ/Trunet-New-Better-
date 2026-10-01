import stockTransferService, {
    StockTransferServiceError,
} from "../services/stockTransferService.js";

/**
 * Send a successful API response.
 *
 * Keeping response formatting here allows the service layer to remain
 * independent of Express while preserving the legacy API contract.
 */
const sendSuccess = (res, statusCode, message, data) => {
    return res.status(statusCode).json({
        success: true,
        message,
        ...(data !== undefined ? { data } : {}),
    });
};

/**
 * Send a legacy-compatible error response.
 */
const sendError = (res, error, fallbackMessage) => {
    if (error instanceof StockTransferServiceError) {
        return res.status(error.statusCode || 400).json({
            success: false,
            message: error.message,
            ...(error.errors ? { errors: error.errors } : {}),
            ...(error.details ? { error: error.details } : {}),
        });
    }

    if (error?.name === "ValidationError") {
        return res.status(400).json({
            success: false,
            message: "Validation error",
            errors: Object.values(error.errors || {}).map((item) => ({
                field: item.path,
                message: item.message,
            })),
        });
    }

    if (error?.name === "CastError") {
        return res.status(400).json({
            success: false,
            message: `Invalid ${error.path}: ${error.value}`,
        });
    }

    if (error?.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern || {})[0];

        return res.status(409).json({
            success: false,
            message: `${duplicateField || "Field"} already exists`,
        });
    }

    console.error(fallbackMessage, error);

    return res.status(500).json({
        success: false,
        message: fallbackMessage,
        ...(process.env.NODE_ENV === "development"
            ? {
                  error: error.message,
                  stack: error.stack,
              }
            : {}),
    });
};

/**
 * Create Stock Transfer.
 */
export const createStockTransfer = async (req, res) => {
    try {
        const result = await stockTransferService.createStockTransfer({
            user: req.user,
            accessContext: req.authorizationContext,
            fromCenter: req.body.fromCenter,
            transferNumber: req.body.transferNumber,
            remark: req.body.remark,
            products: req.body.products,
            date: req.body.date,
            status: req.body.status,
            productApprovals: req.body.productApprovals,
        });

        return sendSuccess(
            res,
            201,
            `Stock transfer created successfully with status: ${
                req.body.status || "Draft"
            }`,
            result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error creating stock transfer"
        );
    }
};

/**
 * Submit Stock Transfer.
 */
export const submitStockTransfer = async (req, res) => {
    try {
        const result = await stockTransferService.submitStockTransfer({
            id: req.params.id,
            user: req.user,
            accessContext: req.authorizationContext,
        });

        return sendSuccess(
            res,
            200,
            "Stock transfer submitted successfully. Waiting for admin approval.",
            result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error submitting stock transfer"
        );
    }
};

/**
 * Approve Stock Transfer by Admin.
 */
export const approveStockTransferByAdmin = async (req, res) => {
    try {
        const result =
            await stockTransferService.approveStockTransferByAdmin({
                id: req.params.id,
                userId: req.body.userId,
                user: req.user,
                accessContext: req.authorizationContext,
            });

        return sendSuccess(
            res,
            200,
            "Stock transfer approved by admin successfully",
            result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error approving stock transfer by admin"
        );
    }
};

/**
 * Reject Stock Transfer by Admin.
 */
export const rejectStockTransferByAdmin = async (req, res) => {
    try {
        const result =
            await stockTransferService.rejectStockTransferByAdmin({
                id: req.params.id,
                userId: req.body.userId,
                user: req.user,
                accessContext: req.authorizationContext,
            });

        return sendSuccess(
            res,
            200,
            "Stock transfer rejected by admin",
            result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error rejecting stock transfer by admin"
        );
    }
};

/**
 * Validate transfer serial numbers.
 *
 * Kept for compatibility with the service/controller API even though
 * the legacy route file does not currently expose this endpoint.
 */
export const validateSerialNumbers = async (req, res) => {
    try {
        const result = await stockTransferService.validateSerialNumbers({
            id: req.params.id,
            productApprovals: req.body.productApprovals,
        });

        return res.status(200).json({
            success: true,
            message: result.isValid
                ? "All serial numbers are valid"
                : "Some serial numbers validation failed",
            data: result.data,
            isValid: result.isValid,
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Error validating serial numbers"
        );
    }
};

/**
 * Get available serial numbers for a transfer.
 */
export const getAvailableSerials = async (req, res) => {
    try {
        const result =
            await stockTransferService.getAvailableSerials({
                id: req.params.id,
            });

        return sendSuccess(
            res,
            200,
            "Available serial numbers retrieved successfully",
            result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error retrieving available serial numbers"
        );
    }
};

/**
 * Confirm Stock Transfer.
 */
export const confirmStockTransfer = async (req, res) => {
    try {
        const result =
            await stockTransferService.confirmStockTransfer({
                id: req.params.id,
                userId: req.body.userId,
                productApprovals: req.body.productApprovals,
                user: req.user,
                accessContext: req.authorizationContext,
            });

        return res.status(200).json({
            success: true,
            message:
                result.message ||
                "Stock transfer confirmed successfully",
            data: result.data,
            ...(result.stockUpdates
                ? { stockUpdates: result.stockUpdates }
                : {}),
        });
    } catch (error) {
        if (
            error instanceof StockTransferServiceError &&
            error.validationFailed
        ) {
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                error: error.message,
            });
        }

        return sendError(
            res,
            error,
            "Error confirming stock transfer"
        );
    }
};

/**
 * Complete Stock Transfer.
 */
export const completeStockTransfer = async (req, res) => {
    try {
        const result =
            await stockTransferService.completeStockTransfer({
                id: req.params.id,
                userId: req.body.userId,
                productReceipts: req.body.productReceipts,
                user: req.user,
                accessContext: req.authorizationContext,
            });

        return sendSuccess(
            res,
            200,
            "Stock transfer completed successfully",
            result
        );
    } catch (error) {
        if (
            error instanceof StockTransferServiceError &&
            error.errorType === "receivedQuantity"
        ) {
            return res.status(400).json({
                success: false,
                message: "Quantity validation failed",
                error: error.message,
            });
        }

        if (
            error instanceof StockTransferServiceError &&
            error.errorType === "insufficientStock"
        ) {
            return res.status(400).json({
                success: false,
                message: "Stock validation failed",
                error: error.message,
            });
        }

        return sendError(
            res,
            error,
            "Error completing stock transfer"
        );
    }
};

/**
 * Ship Stock Transfer.
 */
export const shipStockTransfer = async (req, res) => {
    try {
        const result =
            await stockTransferService.shipStockTransfer({
                id: req.params.id,
                userId: req.body.userId,
                shippingDetails: {
                    shippedDate: req.body.shippedDate,
                    expectedDeliveryDate:
                        req.body.expectedDeliveryDate,
                    shipmentDetails:
                        req.body.shipmentDetails,
                    carrierInfo: req.body.carrierInfo,
                },
                user: req.user,
                accessContext: req.authorizationContext,
            });

        return sendSuccess(
            res,
            200,
            "Stock transfer shipped successfully. Stock deducted from source center using assigned serial numbers.",
            result
        );
    } catch (error) {
        if (
            error instanceof StockTransferServiceError &&
            error.errorType === "serial"
        ) {
            return res.status(400).json({
                success: false,
                message: "Serial number validation failed",
                error: error.message,
            });
        }

        return sendError(
            res,
            error,
            "Error shipping stock transfer"
        );
    }
};

/**
 * Mark Stock Transfer as Incomplete.
 */
export const markStockTransferAsIncomplete = async (req, res) => {
    try {
        const result =
            await stockTransferService.markStockTransferAsIncomplete({
                id: req.params.id,
                userId: req.body.userId,
                receivedProducts: req.body.receivedProducts,
                incompleteRemark: req.body.incompleteRemark,
                user: req.user,
                accessContext: req.authorizationContext,
            });

        return sendSuccess(
            res,
            200,
            "Stock transfer marked as incomplete",
            result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error marking stock transfer as incomplete"
        );
    }
};

/**
 * Complete an Incomplete Stock Transfer.
 */
export const completeIncompleteStockTransfer = async (req, res) => {
    try {
        const result =
            await stockTransferService.completeIncompleteStockTransfer({
                id: req.params.id,
                userId: req.body.userId,
                productApprovals: req.body.productApprovals,
                productReceipts: req.body.productReceipts,
                user: req.user,
                accessContext: req.authorizationContext,
            });

        return sendSuccess(
            res,
            200,
            "Incomplete stock transfer completed successfully",
            result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error completing incomplete stock transfer"
        );
    }
};

/**
 * Reject Stock Transfer.
 */
export const rejectStockTransfer = async (req, res) => {
    try {
        const result =
            await stockTransferService.rejectStockTransfer({
                id: req.params.id,
                userId: req.body.userId,
                rejectionReason: req.body.rejectionReason,
                user: req.user,
                accessContext: req.authorizationContext,
            });

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result.data,
            ...(result.restorationSummary
                ? {
                      restorationSummary:
                          result.restorationSummary,
                  }
                : {}),
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Error rejecting stock transfer"
        );
    }
};

/**
 * Get all Stock Transfers.
 */
export const getAllStockTransfers = async (req, res) => {
    try {
        const {
            page,
            limit,
            sortBy,
            sortOrder,
            ...filterParams
        } = req.query;

        const result =
            await stockTransferService.getAllStockTransfers({
                page: Number(page) || 1,
                limit: Number(limit) || 100,
                sortBy: sortBy || "createdAt",
                sortOrder: sortOrder || "desc",
                filterParams,
                user: req.user,
                accessContext: req.authorizationContext,
            });

        if (!result.stockTransfers?.length) {
            return res.status(200).json({
                success: true,
                message: "No stock transfers found",
                data: [],
                pagination:
                    result.pagination || {
                        currentPage: 0,
                        totalPages: 0,
                        totalItems: 0,
                        itemsPerPage:
                            Number(limit) || 100,
                    },
                filters: result.filters || {},
                status: result.status || {},
            });
        }

        return res.status(200).json({
            success: true,
            message: "Stock transfers retrieved successfully",
            data: result.stockTransfers,
            pagination: result.pagination,
            filters: result.filters,
            status: result.status,
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Error retrieving stock transfers"
        );
    }
};

/**
 * Get Stock Transfer by ID.
 */
export const getStockTransferById = async (req, res) => {
    try {
        const result =
            await stockTransferService.getStockTransferById({
                id: req.params.id,
                user: req.user,
                accessContext: req.authorizationContext,
            });

        return sendSuccess(
            res,
            200,
            "Stock transfer retrieved successfully",
            result
        );
    } catch (error) {
        if (error?.name === "CastError") {
            return res.status(400).json({
                success: false,
                message: "Invalid stock transfer ID",
            });
        }

        return sendError(
            res,
            error,
            "Error retrieving stock transfer"
        );
    }
};

/**
 * Update Stock Transfer.
 */
export const updateStockTransfer = async (req, res) => {
    try {
        const result =
            await stockTransferService.updateStockTransfer({
                id: req.params.id,
                user: req.user,
                accessContext: req.authorizationContext,
                fromCenter: req.body.fromCenter,
                transferNumber: req.body.transferNumber,
                remark: req.body.remark,
                date: req.body.date,
                products: req.body.products,
            });

        return sendSuccess(
            res,
            200,
            "Stock transfer updated successfully",
            result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error updating stock transfer"
        );
    }
};

/**
 * Delete Stock Transfer.
 */
export const deleteStockTransfer = async (req, res) => {
    try {
        await stockTransferService.deleteStockTransfer({
            id: req.params.id,
            user: req.user,
            accessContext: req.authorizationContext,
        });

        return res.status(200).json({
            success: true,
            message: "Stock transfer deleted successfully",
        });
    } catch (error) {
        return sendError(
            res,
            error,
            "Error deleting stock transfer"
        );
    }
};

/**
 * Get transfers pending admin approval.
 */
export const getPendingAdminApprovalTransfers = async (req, res) => {
    try {
        const result =
            await stockTransferService.getPendingAdminApprovalTransfers({
                query: req.query,
                user: req.user,
                accessContext: req.authorizationContext,
            });

        return sendSuccess(
            res,
            200,
            "Pending admin approval transfers retrieved successfully",
            result.data || result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error retrieving pending admin approval transfers"
        );
    }
};

/**
 * Get transfer statistics.
 */
export const getTransferStats = async (req, res) => {
    try {
        const result =
            await stockTransferService.getTransferStats({
                user: req.user,
                accessContext: req.authorizationContext,
            });

        return sendSuccess(
            res,
            200,
            "Transfer statistics retrieved successfully",
            result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error retrieving transfer statistics"
        );
    }
};

/**
 * Update shipping information.
 */
export const updateShippingInfo = async (req, res) => {
    try {
        const result =
            await stockTransferService.updateShippingInfo({
                id: req.params.id,
                user: req.user,
                accessContext: req.authorizationContext,
                shippedDate: req.body.shippedDate,
                expectedDeliveryDate:
                    req.body.expectedDeliveryDate,
                shipmentDetails:
                    req.body.shipmentDetails,
                carrierInfo: req.body.carrierInfo,
                documents: req.body.documents,
            });

        return sendSuccess(
            res,
            200,
            "Shipping information updated successfully",
            result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error updating shipping information"
        );
    }
};

/**
 * Reject shipping and revert transfer to Confirmed.
 */
export const rejectShipping = async (req, res) => {
    try {
        const result =
            await stockTransferService.rejectShipping({
                id: req.params.id,
                user: req.user,
                accessContext: req.authorizationContext,
            });

        return sendSuccess(
            res,
            200,
            "Shipping rejected successfully. Transfer reverted to Confirmed status.",
            result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error rejecting shipping"
        );
    }
};

/**
 * Get the most recent transfer number.
 */
export const getMostRecentTransferNumber = async (req, res) => {
    try {
        const result =
            await stockTransferService.getMostRecentTransferNumber();

        return sendSuccess(
            res,
            200,
            result.message ||
                "Most recent transfer number retrieved successfully",
            result.data || result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error retrieving most recent transfer number"
        );
    }
};

/**
 * Update approved quantities and serial numbers.
 */
export const updateApprovedQuantities = async (req, res) => {
    try {
        const result =
            await stockTransferService.updateApprovedQuantities({
                id: req.params.id,
                productApprovals: req.body.productApprovals,
                userId: req.body.userId,
                user: req.user,
                accessContext: req.authorizationContext,
            });

        return sendSuccess(
            res,
            200,
            "Approved quantities and serial numbers updated successfully",
            result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error updating approved quantities"
        );
    }
};

/**
 * Get warehouse / center product summary.
 */
export const getWarehouseProductSummary = async (req, res) => {
    try {
        const result =
            await stockTransferService.getWarehouseProductSummary({
                query: req.query,
                user: req.user,
                accessContext: req.authorizationContext,
            });

        const targetType =
            result.data?.center?.centerType === "Outlet"
                ? "warehouse"
                : "center";

        return sendSuccess(
            res,
            200,
            `Product summary retrieved successfully for ${targetType}`,
            result.data || result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error retrieving product summary"
        );
    }
};

/**
 * Get product distribution across centers.
 */
export const getProductDistribution = async (req, res) => {
    try {
        const result =
            await stockTransferService.getProductDistribution({
                query: req.query,
                user: req.user,
                accessContext: req.authorizationContext,
            });

        return sendSuccess(
            res,
            200,
            "Product distribution across centers retrieved successfully",
            result.data || result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error retrieving product distribution"
        );
    }
};