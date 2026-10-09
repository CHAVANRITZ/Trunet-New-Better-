
import * as stockUsageService from "../services/stockUsageService.js";

const sendSuccess = (res, statusCode, message, data) => {
    return res.status(statusCode).json({
        success: true,
        message,
        ...(data !== undefined ? { data } : {}),
    });
};

const sendError = (res, error, fallbackMessage) => {
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

    const message = error?.message || fallbackMessage;

    // Expected business-rule errors should not become generic 500s.
    const clientErrorPatterns = [
        /not found/i,
        /only .* can be/i,
        /only .* can be reverted/i,
        /cannot be reverted/i,
        /insufficient/i,
        /invalid .*id/i,
        /already been processed/i,
        /pending damage/i,
        /completed damage/i,
        /own center/i,
        /own centre/i,
        /serial number/i,
        /stock usage/i,
        /damage entries/i,
        /damage requests/i,
    ];

    if (clientErrorPatterns.some((pattern) => pattern.test(message))) {
        return res.status(400).json({
            success: false,
            message,
        });
    }

    console.error(fallbackMessage, error);

    return res.status(500).json({
        success: false,
        message: fallbackMessage,
        ...(process.env.NODE_ENV === "development"
            ? { error: error?.message, stack: error?.stack }
            : {}),
    });
};

export const createStockUsage = async (req, res) => {
    try {
        const createdBy =
            req.user?.id ??
            req.user?.fullUser?._id;

        if (!createdBy) {
            return sendError(
                res,
                new Error("Authenticated user ID is missing"),
                "Error creating stock usage"
            );
        }

        const result = await stockUsageService.createStockUsage({
            ...req.body,
            createdBy,
        });

        return sendSuccess(
            res,
            201,
            "Stock usage created successfully",
            result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error creating stock usage"
        );
    }
};

export const getAllStockUsage = async (req, res) => {
    try {
        const result = await stockUsageService.getAllStockUsage(req.query);

        return sendSuccess(
            res,
            200,
            "Stock usage records retrieved successfully",
            result
        );
    } catch (error) {
        return sendError(res, error, "Error retrieving stock usage");
    }
};

export const getStockUsageById = async (req, res) => {
    try {
        const result = await stockUsageService.getStockUsageById(req.params.id);

        return sendSuccess(
            res,
            200,
            "Stock usage retrieved successfully",
            result
        );
    } catch (error) {
        return sendError(res, error, "Error retrieving stock usage");
    }
};

export const updateStockUsage = async (req, res) => {
    try {
        const result = await stockUsageService.updateStockUsage(
            req.params.id,
            req.body
        );

        return sendSuccess(
            res,
            200,
            "Stock usage updated successfully",
            result
        );
    } catch (error) {
        return sendError(res, error, "Error updating stock usage");
    }
};

export const deleteStockUsage = async (req, res) => {
    try {
        const result = await stockUsageService.deleteStockUsage(req.params.id);

        return sendSuccess(
            res,
            200,
            "Stock usage deleted successfully",
            result
        );
    } catch (error) {
        return sendError(res, error, "Error deleting stock usage");
    }
};

export const approveDamageRequest = async (req, res) => {
    try {
        const approvedBy =
            req.user?.id ??
            req.user?.fullUser?._id;

        if (!approvedBy) {
            return sendError(
                res,
                new Error("Authenticated user ID is missing"),
                "Error approving damage request"
            );
        }

        const result = await stockUsageService.approveDamageRequest(
            req.params.id,
            {
                approvedBy,
                approvalRemark:
                    req.body?.approvalRemark ?? req.body?.remark,
            }
        );

        return sendSuccess(
            res,
            200,
            "Damage request approved successfully",
            result
        );
    } catch (error) {
        return sendError(
            res,
            error,
            "Error approving damage request"
        );
    }
};

export const rejectDamageRequest = async (req, res) => {
    try {
        const result = await stockUsageService.rejectDamageRequest(
            req.params.id,
            {
                rejectedBy: req.user?._id,
                rejectionRemark: req.body.rejectionRemark ?? req.body.remark,
            }
        );

        return sendSuccess(res, 200, "Damage request rejected successfully", result);
    } catch (error) {
        return sendError(res, error, "Error rejecting damage request");
    }
};

export const getPendingDamageRequests = async (req, res) => {
    try {
        const result = await stockUsageService.getPendingDamageRequests(req.query);

        return sendSuccess(res, 200, "Pending damage requests retrieved successfully", result);
    } catch (error) {
        return sendError(res, error, "Error retrieving pending damage requests");
    }
};

export const getDamageRequestsByStatus = async (req, res) => {
    try {
        const result = await stockUsageService.getDamageRequestsByStatus(
            req.params.status,
            req.query
        );

        return sendSuccess(res, 200, "Damage requests retrieved successfully", result);
    } catch (error) {
        return sendError(res, error, "Error retrieving damage requests");
    }
};

export const checkRevertEligibility = async (req, res) => {
    try {
        const result = await stockUsageService.checkRevertEligibility(req.params.id);

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result,
        });
    } catch (error) {
        return sendError(res, error, "Error checking damage revert eligibility");
    }
};

export const revertDamageEntry = async (req, res) => {
    try {
        const permissions =
            req.authorizationContext?.permissions ?? [];

        const canManageAllCenters =
            req.authorizationContext?.isSuperAdmin === true ||
            permissions.includes("manage_usage_all_center");

        const result = await stockUsageService.revertDamageEntry({
            id: req.params.id,
            revertedBy: req.user?.id,
            revertRemark: req.body?.revertRemark,
            userCenter:
                req.user?.fullUser?.center?._id ??
                req.user?.fullUser?.center ??
                req.user?.center?._id ??
                req.user?.center ??
                null,
            canManageAllCenters,
        });

        return sendSuccess(
            res,
            200,
            "Damage entry reverted successfully",
            result
        );
    } catch (error) {
        return sendError(res, error);
    }
};

export const getStockUsageByCustomer = async (req, res) => {
    try {
        const result = await stockUsageService.getStockUsageByCustomer(
            req.params.customerId
        );
        return sendSuccess(res, 200, "Customer stock usage retrieved successfully", result);
    } catch (error) {
        return sendError(res, error, "Error retrieving customer stock usage");
    }
};

export const getStockUsageByBuilding = async (req, res) => {
    try {
        const result = await stockUsageService.getStockUsageByBuilding(
            req.params.buildingId
        );
        return sendSuccess(res, 200, "Building stock usage retrieved successfully", result);
    } catch (error) {
        return sendError(res, error, "Error retrieving building stock usage");
    }
};

export const getStockUsageByControlRoom = async (req, res) => {
    try {
        const result = await stockUsageService.getStockUsageByControlRoom(
            req.params.controlRoomId
        );
        return sendSuccess(res, 200, "Control room stock usage retrieved successfully", result);
    } catch (error) {
        return sendError(res, error, "Error retrieving control room stock usage");
    }
};

export const getProductDevicesByCustomer = async (req, res) => {
    try {
        const result = await stockUsageService.getProductDevicesByCustomer(
            req.params.customerId
        );
        return sendSuccess(res, 200, "Customer devices retrieved successfully", result);
    } catch (error) {
        return sendError(res, error, "Error retrieving customer devices");
    }
};

export const getProductDevicesByBuilding = async (req, res) => {
    try {
        const result = await stockUsageService.getProductDevicesByBuilding(
            req.params.buildingId
        );
        return sendSuccess(res, 200, "Building devices retrieved successfully", result);
    } catch (error) {
        return sendError(res, error, "Error retrieving building devices");
    }
};

export const getProductDevicesByControlRoom = async (req, res) => {
    try {
        const result = await stockUsageService.getProductDevicesByControlRoom(
            req.params.controlRoomId
        );
        return sendSuccess(res, 200, "Control room devices retrieved successfully", result);
    } catch (error) {
        return sendError(res, error, "Error retrieving control room devices");
    }
};

export const changeToDamageReturn = async (req, res) => {
    try {
        const result = await stockUsageService.changeToDamageReturn({
            id: req.params.id,
            remark: req.body?.remark,
            changedBy: req.user?._id,
        });
        return sendSuccess(res, 200, "Stock usage changed to Damage Return successfully", result);
    } catch (error) {
        return sendError(res, error, "Error changing stock usage to Damage Return");
    }
};

export const getDamageReturnRecordsWithStats = async (req, res) => {
    try {
        const result = await stockUsageService.getDamageReturnRecordsWithStats({
            ...req.query,
            userCenter:
                req.user?.center?._id ?? req.user?.center ?? null,

            canViewAllCenters:
                req.authorizationContext?.canViewAll === true,
        });
        return sendSuccess(res, 200, "Damage Return records retrieved successfully", result);
    } catch (error) {
        return sendError(res, error, "Error retrieving Damage Return records");
    }
};

export const returnProductSerial = async (req, res) => {
    try {
        const result = await stockUsageService.returnProductSerial({
            ...req.body,
            returnedBy: req.user?._id,
            userCenterId: req.authorizationContext?.centerId,
        });
        return sendSuccess(res, 200, "Product serial returned successfully", result);
    } catch (error) {
        return sendError(res, error, "Error returning product serial");
    }
};

export const replaceProductSerial = async (req, res) => {
    try {
        const result = await stockUsageService.replaceProductSerial({
            ...req.body,
            replacedBy: req.user?._id,
            userCenterId: req.authorizationContext?.centerId,
        });
        return sendSuccess(res, 200, "Product serial replaced successfully", result);
    } catch (error) {
        return sendError(res, error, "Error replacing product serial");
    }
};

export const getAllFaultyStock = async (req, res) => {
    try {
        const result = await stockUsageService.getAllFaultyStock({
            ...req.query,
            userCenter:
                req.user?.center?._id ?? req.user?.center ?? null,

            canViewAllCenters:
                req.authorizationContext?.canViewAll === true,
        });
        return sendSuccess(res, 200, "Faulty stock retrieved successfully", result);
    } catch (error) {
        return sendError(res, error, "Error retrieving faulty stock");
    }
};