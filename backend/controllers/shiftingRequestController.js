import mongoose from "mongoose";
import { validationResult } from "express-validator";

import ShiftingRequest from "../models/ShiftingRequest.js";
import Customer from "../models/Customer.js";
import User from "../models/User.js";
import FilledStock from "../models/FilledStock.js";
import StockUsage from "../models/StockUsage.js";

const getUserId = (req) =>
    req.user?.id || req.user?._id || req.user?.fullUser?._id;

const getUserCenterId = (req) =>
    req.selectedCenterId ||
    req.user?.fullUser?.center?._id ||
    req.user?.fullUser?.center ||
    null;

const getShiftingPermissions = (req) => {
    const permissions = req.authorizationContext?.permissions || [];

    return {
        isSuperAdmin: req.authorizationContext?.isSuperAdmin === true ||
            req.user?.role?.isSuperAdmin === true,

        manage_shifting_own_center:
            permissions.includes("manage_shifting_own_center"),

        manage_shifting_all_center:
            permissions.includes("manage_shifting_all_center"),

        view_shifting_own_center:
            permissions.includes("view_shifting_own_center"),

        view_shifting_all_center:
            permissions.includes("view_shifting_all_center"),

        accept_shifting_own_center:
            permissions.includes("accept_shifting_own_center"),

        accept_shifting_all_center:
            permissions.includes("accept_shifting_all_center"),
    };
};

const hasPermission = (permissions, required) =>
    permissions.isSuperAdmin ||
    required.some((permission) => permissions[permission]);

const handleControllerError = (error, res) => {
    console.error("Shifting Request Controller Error:", error);

    if (error.name === "ValidationError") {
        return res.status(400).json({
            success: false,
            message: "Validation error",
            errors: Object.values(error.errors).map((item) => item.message),
        });
    }

    if (error.code === 11000) {
        return res.status(400).json({
            success: false,
            message: "Duplicate entry found",
        });
    }

    if (error.name === "CastError" || error.name === "BSONError") {
        return res.status(400).json({
            success: false,
            message: "Invalid ID format",
        });
    }

    return res.status(500).json({
        success: false,
        message: "Internal server error",
        error:
            process.env.NODE_ENV === "development"
                ? error.message
                : "Internal server error",
    });
};

const getCenterScopedQuery = (req, permissions, centerField = null) => {
    const centerId = getUserCenterId(req);

    if (
        permissions.isSuperAdmin ||
        permissions.view_shifting_all_center ||
        permissions.manage_shifting_all_center ||
        permissions.accept_shifting_all_center
    ) {
        return {};
    }

    if (!centerId) {
        return { _id: null };
    }

    if (centerField) {
        return { [centerField]: centerId };
    }

    return {
        $or: [
            { fromCenter: centerId },
            { toCenter: centerId },
        ],
    };
};

/*
 * CREATE SHIFTING REQUEST
 */
export const createShiftingRequest = async (req, res) => {
    try {
        const permissions = getShiftingPermissions(req);

        if (!hasPermission(permissions, [
            "manage_shifting_own_center",
            "manage_shifting_all_center",
        ])) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Shifting manage permission required.",
            });
        }

        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }

        const {
            date,
            customer,
            address1,
            address2,
            city,
            remark,
            toCenter,
        } = req.body;

        const fromCenterId = getUserCenterId(req);

        if (!fromCenterId) {
            return res.status(400).json({
                success: false,
                message: "User must be associated with a center",
            });
        }

        const customerData = await Customer.findById(customer);

        if (!customerData) {
            return res.status(404).json({
                success: false,
                message: "Customer not found",
            });
        }

        if (
            !permissions.isSuperAdmin &&
            permissions.manage_shifting_own_center &&
            !permissions.manage_shifting_all_center &&
            String(customerData.center) !== String(fromCenterId)
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Access denied. You can only create shifting requests for customers in your center.",
            });
        }

        const existingPendingRequest = await ShiftingRequest.findOne({
            customer,
            status: "Pending",
        });

        if (existingPendingRequest) {
            return res.status(400).json({
                success: false,
                message:
                    "There is already a pending shifting request for this customer",
            });
        }

        if (String(customerData.center) === String(toCenter)) {
            return res.status(400).json({
                success: false,
                message: "Customer is already registered in the target center",
            });
        }

        const newRequest = await ShiftingRequest.create({
            date,
            customer,
            address1,
            address2,
            city,
            remark,
            fromCenter: fromCenterId,
            toCenter: toCenter || fromCenterId,
        });

        const populatedRequest = await ShiftingRequest.findById(newRequest._id)
            .populate("customer", "name username mobile center")
            .populate("fromCenter", "centerName centerCode")
            .populate("toCenter", "centerName centerCode");

        return res.status(201).json({
            success: true,
            message: "Shifting request created successfully",
            data: populatedRequest,
        });
    } catch (error) {
        return handleControllerError(error, res);
    }
};

/*
 * GET ALL SHIFTING REQUESTS
 */
export const getAllShiftingRequests = async (req, res) => {
    try {
        const permissions = getShiftingPermissions(req);

        if (!hasPermission(permissions, [
            "view_shifting_own_center",
            "view_shifting_all_center",
        ])) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Shifting view permission required.",
            });
        }

        const {
            search,
            center,
            status,
            page = 1,
            limit = 100,
        } = req.query;

        const query = {};
        const centerId = getUserCenterId(req);

        if (
            !permissions.isSuperAdmin &&
            permissions.view_shifting_own_center &&
            !permissions.view_shifting_all_center
        ) {
            if (!centerId) {
                return res.status(400).json({
                    success: false,
                    message: "User must be associated with a center",
                });
            }

            query.$or = [
                { fromCenter: centerId },
                { toCenter: centerId },
            ];
        } else if (center && permissions.view_shifting_all_center) {
            query.$or = [
                { fromCenter: center },
                { toCenter: center },
            ];
        }

        if (search) {
            query.$and = [{
                $or: [
                    { remark: { $regex: search, $options: "i" } },
                    { status: { $regex: search, $options: "i" } },
                ],
            }];
        }

        if (status) {
            query.status = status;
        }

        const pageNumber = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.max(1, parseInt(limit, 10) || 100);

        const [total, requests] = await Promise.all([
            ShiftingRequest.countDocuments(query),
            ShiftingRequest.find(query)
                .populate("customer", "name username mobile email center")
                .populate("fromCenter", "centerName centerCode")
                .populate("toCenter", "centerName centerCode")
                .populate("approvedBy", "fullName email")
                .populate("rejectedBy", "fullName email")
                .sort({ createdAt: -1 })
                .skip((pageNumber - 1) * pageSize)
                .limit(pageSize),
        ]);

        const data = requests.map((request) => {
            const item = request.toObject();
            const from = item.fromCenter?._id?.toString();
            const to = item.toCenter?._id?.toString();
            const current = centerId?.toString();

            if (current) {
                item.centerRelationship =
                    from === current && to === current
                        ? "both"
                        : from === current
                            ? "from"
                            : to === current
                                ? "to"
                                : undefined;
            }

            return item;
        });

        return res.status(200).json({
            success: true,
            data,
            pagination: {
                total,
                page: pageNumber,
                limit: pageSize,
                totalPages: Math.ceil(total / pageSize),
            },
            permissionInfo: {
                hasViewAll: permissions.view_shifting_all_center ||
                    permissions.isSuperAdmin,
                hasViewOwn: permissions.view_shifting_own_center,
                userCenter: centerId,
            },
        });
    } catch (error) {
        return handleControllerError(error, res);
    }
};

/*
 * PRESERVE LEGACY STOCK TRANSFER BEHAVIOR:
 * Completed customer StockUsage records are aggregated into FilledStock.
 */
const transferCustomerStockToFilledStock = async (shiftingRequest) => {
    const { customer, fromCenter, toCenter, _id: shiftingRequestId } =
        shiftingRequest;

    const usages = await StockUsage.find({
        customer,
        center: fromCenter,
        usageType: "Customer",
        status: "completed",
    })
        .populate("items.product", "productTitle productCode trackSerialNumber")
        .sort({ date: -1 });

    const productMap = new Map();

    for (const usage of usages) {
        for (const item of usage.items) {
            if (!item.product || item.quantity <= 0) continue;

            const productId = item.product._id.toString();

            if (!productMap.has(productId)) {
                productMap.set(productId, {
                    product: item.product,
                    quantity: 0,
                    serialNumbers: [],
                    usageReference: usage._id,
                    latestUsageDate: usage.date,
                });
            }

            const entry = productMap.get(productId);
            entry.quantity += item.quantity;

            for (const serial of item.serialNumbers || []) {
                if (!entry.serialNumbers.includes(serial)) {
                    entry.serialNumbers.push(serial);
                }
            }

            if (
                usage.date &&
                (!entry.latestUsageDate || usage.date > entry.latestUsageDate)
            ) {
                entry.usageReference = usage._id;
                entry.latestUsageDate = usage.date;
            }
        }
    }

    const summary = [];

    for (const stock of productMap.values()) {
        if (stock.quantity <= 0) continue;

        await FilledStock.create({
            customer,
            product: stock.product._id,
            // Keep the legacy source-center assignment unchanged.
            center: fromCenter,
            quantity: stock.quantity,
            serialNumbers: stock.serialNumbers.map((serial) => ({
                serialNumber: serial,
                status: "active",
                assignedDate: new Date(),
                originalUsageId: stock.usageReference,
            })),
            originalUsageId: stock.usageReference,
            shiftingRequestId,
            status: "active",
            lastUpdated: new Date(),
        });

        summary.push({
            product: stock.product.productTitle,
            quantity: stock.quantity,
            serialNumbers: stock.serialNumbers.length,
        });
    }

    return {
        transferredProducts: summary.length,
        totalQuantity: summary.reduce((total, item) => total + item.quantity, 0),
        fromCenter,
        toCenter,
        details: summary,
    };
};

/*
 * APPROVE OR REJECT SHIFTING REQUEST
 */
export const updateShiftingRequestStatus = async (req, res) => {
    try {
        const permissions = getShiftingPermissions(req);

        if (!hasPermission(permissions, [
            "accept_shifting_own_center",
            "accept_shifting_all_center",
        ])) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Shifting approval permission required.",
            });
        }

        const { id } = req.params;
        const { status, rejectionReason } = req.body;
        const userId = getUserId(req);

        if (!["Approve", "Reject"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be "Approved" or "Rejected".',
            });
        }

        const request = await ShiftingRequest.findById(id)
            .populate("customer", "name mobile center")
            .populate("fromCenter", "centerName centerCode")
            .populate("toCenter", "centerName centerCode");

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Shifting request not found",
            });
        }

        const userCenterId = getUserCenterId(req);

        if (
            !permissions.isSuperAdmin &&
            permissions.accept_shifting_own_center &&
            !permissions.accept_shifting_all_center &&
            String(request.toCenter?._id) !== String(userCenterId)
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Access denied. You can only approve requests where your center is the destination.",
            });
        }

        if (request.status !== "Pending") {
            return res.status(400).json({
                success: false,
                message: `This request is already ${request.status.toLowerCase()}.`,
            });
        }

        if (status === "Approve") {
            const customer = await Customer.findById(request.customer._id);

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found",
                });
            }

            const transferSummary =
                await transferCustomerStockToFilledStock(request);

            customer.shiftingHistory.push({
                fromCenter: request.fromCenter._id,
                toCenter: request.toCenter._id,
                shiftingRequest: request._id,
                shiftedAt: new Date(),
                shiftedBy: userId,
            });

            customer.center = request.toCenter._id;
            await customer.save();

            request.status = "Approve";
            request.approvedBy = userId;
            request.approvedAt = new Date();
            request.customerCenterUpdated = true;
            request.customerCenterUpdatedAt = new Date();

            await request.save();

            const updatedRequest = await ShiftingRequest.findById(id)
                .populate("customer", "name username mobile center")
                .populate("fromCenter", "centerName centerCode")
                .populate("toCenter", "centerName centerCode")
                .populate("approvedBy", "fullName email")
                .populate("rejectedBy", "fullName email");

            return res.status(200).json({
                success: true,
                message:
                    `Shifting request approved successfully. ${transferSummary.transferredProducts} products added to filled stock for the new center.`,
                data: updatedRequest,
                transferSummary,
            });
        }

        request.status = "Reject";
        request.rejectedBy = userId;
        request.rejectedAt = new Date();

        if (rejectionReason) {
            request.remark += ` | Rejection Reason: ${rejectionReason}`;
        }

        await request.save();

        const updatedRequest = await ShiftingRequest.findById(id)
            .populate("customer", "name username mobile center")
            .populate("fromCenter", "centerName centerCode")
            .populate("toCenter", "centerName centerCode")
            .populate("approvedBy", "fullName email")
            .populate("rejectedBy", "fullName email");

        return res.status(200).json({
            success: true,
            message: "Shifting request rejected successfully",
            data: updatedRequest,
        });
    } catch (error) {
        return handleControllerError(error, res);
    }
};

/*
 * GET SHIFTING REQUEST BY ID
 */
export const getShiftingRequestById = async (req, res) => {
    try {
        const permissions = getShiftingPermissions(req);

        if (!hasPermission(permissions, [
            "view_shifting_own_center",
            "view_shifting_all_center",
        ])) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Shifting view permission required.",
            });
        }

        const query = { _id: req.params.id };
        const centerId = getUserCenterId(req);

        if (
            !permissions.isSuperAdmin &&
            permissions.view_shifting_own_center &&
            !permissions.view_shifting_all_center
        ) {
            query.$or = [
                { fromCenter: centerId },
                { toCenter: centerId },
            ];
        }

        const request = await ShiftingRequest.findOne(query)
            .populate(
                "customer",
                "name username mobile email center address1 address2 city state shiftingHistory"
            )
            .populate("fromCenter", "centerName centerCode address phone")
            .populate("toCenter", "centerName centerCode address phone")
            .populate("approvedBy", "fullName email")
            .populate("rejectedBy", "fullName email");

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Shifting request not found or access denied",
            });
        }

        return res.status(200).json({ success: true, data: request });
    } catch (error) {
        return handleControllerError(error, res);
    }
};

/*
 * GET CUSTOMER SHIFTING HISTORY
 */
export const getCustomerShiftingHistory = async (req, res) => {
    try {
        const permissions = getShiftingPermissions(req);

        if (!hasPermission(permissions, [
            "view_shifting_own_center",
            "view_shifting_all_center",
        ])) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Shifting view permission required.",
            });
        }

        const { customerId } = req.params;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.max(1, parseInt(req.query.limit, 10) || 100);
        const centerId = getUserCenterId(req);

        const customerQuery = { _id: customerId };

        if (
            !permissions.isSuperAdmin &&
            permissions.view_shifting_own_center &&
            !permissions.view_shifting_all_center
        ) {
            if (!centerId) {
                return res.status(400).json({
                    success: false,
                    message: "User must be associated with a center",
                });
            }
            customerQuery.center = centerId;
        }

        const customer = await Customer.findOne(customerQuery);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found or you don't have access to this customer",
            });
        }

        const query = { customer: customerId };

        if (
            !permissions.isSuperAdmin &&
            permissions.view_shifting_own_center &&
            !permissions.view_shifting_all_center
        ) {
            query.$or = [
                { fromCenter: centerId },
                { toCenter: centerId },
            ];
        }

        const [total, history] = await Promise.all([
            ShiftingRequest.countDocuments(query),
            ShiftingRequest.find(query)
                .populate("fromCenter", "centerName centerCode")
                .populate("toCenter", "centerName centerCode")
                .populate("approvedBy", "fullName email")
                .populate("rejectedBy", "fullName email")
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit),
        ]);

        return res.status(200).json({
            success: true,
            data: history,
            customer: {
                id: customer._id,
                name: customer.name,
                username: customer.username,
                currentCenter: customer.center,
            },
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        return handleControllerError(error, res);
    }
};

/*
 * GET CUSTOMER CURRENT CENTER AND HISTORY
 */
export const getCustomerCurrentCenter = async (req, res) => {
    try {
        const permissions = getShiftingPermissions(req);

        if (!hasPermission(permissions, [
            "view_shifting_own_center",
            "view_shifting_all_center",
        ])) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Shifting view permission required.",
            });
        }

        const customerQuery = { _id: req.params.customerId };
        const centerId = getUserCenterId(req);

        if (
            !permissions.isSuperAdmin &&
            permissions.view_shifting_own_center &&
            !permissions.view_shifting_all_center
        ) {
            if (!centerId) {
                return res.status(400).json({
                    success: false,
                    message: "User must be associated with a center",
                });
            }
            customerQuery.center = centerId;
        }

        const customer = await Customer.findOne(customerQuery)
            .populate("center", "centerName centerCode address phone")
            .populate("shiftingHistory.fromCenter", "centerName centerCode")
            .populate("shiftingHistory.toCenter", "centerName centerCode")
            .populate("shiftingHistory.shiftedBy", "fullName email");

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found or you don't have access to this customer",
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                customer: {
                    id: customer._id,
                    name: customer.name,
                    username: customer.username,
                    mobile: customer.mobile,
                    email: customer.email,
                },
                currentCenter: customer.center,
                shiftingHistory: customer.shiftingHistory,
            },
        });
    } catch (error) {
        return handleControllerError(error, res);
    }
};

/*
 * UPDATE PENDING SHIFTING REQUEST
 */
export const updateShiftingRequest = async (req, res) => {
    try {
        const permissions = getShiftingPermissions(req);

        if (!hasPermission(permissions, [
            "manage_shifting_own_center",
            "manage_shifting_all_center",
        ])) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Shifting manage permission required.",
            });
        }

        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }

        const { id } = req.params;
        const { date, address1, address2, city, remark, toCenter } = req.body;

        const query = { _id: id };
        const centerId = getUserCenterId(req);

        if (
            !permissions.isSuperAdmin &&
            permissions.manage_shifting_own_center &&
            !permissions.manage_shifting_all_center
        ) {
            query.fromCenter = centerId;
        }

        const request = await ShiftingRequest.findOne(query);

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Shifting request not found or access denied",
            });
        }

        if (request.status !== "Pending") {
            return res.status(400).json({
                success: false,
                message:
                    `Cannot update a request that is already ${request.status.toLowerCase()}.`,
            });
        }

        if (date) request.date = date;
        if (address1) request.address1 = address1;
        if (address2) request.address2 = address2;
        if (city) request.city = city;
        if (remark) request.remark = remark;

        if (toCenter && String(toCenter) !== String(request.toCenter)) {
            const customer = await Customer.findById(request.customer);

            if (!customer) {
                return res.status(404).json({
                    success: false,
                    message: "Customer not found",
                });
            }

            if (String(customer.center) === String(toCenter)) {
                return res.status(400).json({
                    success: false,
                    message: "Customer is already registered in the target center",
                });
            }

            request.toCenter = toCenter;
        }

        await request.save();

        const updatedRequest = await ShiftingRequest.findById(id)
            .populate("customer", "name username mobile center")
            .populate("fromCenter", "centerName centerCode")
            .populate("toCenter", "centerName centerCode");

        return res.status(200).json({
            success: true,
            message: "Shifting request updated successfully",
            data: updatedRequest,
        });
    } catch (error) {
        return handleControllerError(error, res);
    }
};

/*
 * DELETE SHIFTING REQUEST
 */
export const deleteShiftingRequest = async (req, res) => {
    try {
        const permissions = getShiftingPermissions(req);

        if (!hasPermission(permissions, [
            "manage_shifting_own_center",
            "manage_shifting_all_center",
        ])) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Shifting manage permission required.",
            });
        }

        const query = { _id: req.params.id };
        const centerId = getUserCenterId(req);

        if (
            !permissions.isSuperAdmin &&
            permissions.manage_shifting_own_center &&
            !permissions.manage_shifting_all_center
        ) {
            query.$or = [
                { fromCenter: centerId },
                { toCenter: centerId },
            ];
        }

        const request = await ShiftingRequest.findOne(query);

        if (!request) {
            return res.status(404).json({
                success: false,
                message: "Shifting request not found or access denied",
            });
        }

        // Preserve the legacy condition and status spelling.
        if (request.status === "Approved") {
            return res.status(400).json({
                success: false,
                message: "Cannot delete an approved shifting request.",
            });
        }

        await ShiftingRequest.findByIdAndDelete(req.params.id);

        return res.status(200).json({
            success: true,
            message: "Shifting request deleted successfully",
        });
    } catch (error) {
        return handleControllerError(error, res);
    }
};

/*
 * GET SHIFTING REQUESTS FOR A CUSTOMER
 */
export const getShiftingRequestsByCustomer = async (req, res) => {
    try {
        const permissions = getShiftingPermissions(req);

        if (!hasPermission(permissions, [
            "view_shifting_own_center",
            "view_shifting_all_center",
        ])) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Shifting view permission required.",
            });
        }

        const { customerId } = req.params;
        const {
            page = 1,
            limit = 100,
            status,
            startDate,
            endDate,
            sortBy = "date",
            sortOrder = "desc",
        } = req.query;

        const pageNumber = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.max(1, parseInt(limit, 10) || 100);
        const centerId = getUserCenterId(req);

        const customerQuery = { _id: customerId };

        if (
            !permissions.isSuperAdmin &&
            permissions.view_shifting_own_center &&
            !permissions.view_shifting_all_center
        ) {
            if (!centerId) {
                return res.status(400).json({
                    success: false,
                    message: "User must be associated with a center",
                });
            }
            customerQuery.center = centerId;
        }

        const customer = await Customer.findOne(customerQuery);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer not found or you don't have access to this customer",
            });
        }

        const query = { customer: customerId };

        if (
            !permissions.isSuperAdmin &&
            permissions.view_shifting_own_center &&
            !permissions.view_shifting_all_center
        ) {
            query.$or = [
                { fromCenter: centerId },
                { toCenter: centerId },
            ];
        }

        if (status && status !== "all") {
            query.status = status;
        }

        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }

        const sort = {
            [sortBy]: sortOrder === "desc" ? -1 : 1,
        };

        const [total, requests] = await Promise.all([
            ShiftingRequest.countDocuments(query),
            ShiftingRequest.find(query)
                .populate("toCenter", "centerName centerCode")
                .populate("fromCenter", "centerName centerCode address1 address2 city")
                .populate("approvedBy", "fullName")
                .populate("rejectedBy", "fullName")
                .select(
                    "date status remark address1 address2 city fromCenter toCenter approvedBy rejectedBy approvedAt rejectedAt createdAt"
                )
                .sort(sort)
                .skip((pageNumber - 1) * pageSize)
                .limit(pageSize),
        ]);

        const formattedRequests = requests.map((request) => {
            let statusDetail = "";

            switch (request.status) {
                case "Approved":
                    statusDetail = `Approved by ${
                        request.approvedBy?.fullName || "Unknown"
                    } on ${
                        request.approvedAt?.toLocaleDateString() || "Unknown date"
                    }`;
                    break;

                case "Rejected":
                    statusDetail = `Rejected by ${
                        request.rejectedBy?.fullName || "Unknown"
                    } on ${
                        request.rejectedAt?.toLocaleDateString() || "Unknown date"
                    }`;
                    break;

                case "Pending":
                    statusDetail = "Waiting for approval";
                    break;

                default:
                    statusDetail = request.status;
            }

            const oldAddress = [
                request.fromCenter?.address1,
                request.fromCenter?.address2,
                request.fromCenter?.city,
            ].filter(Boolean).join(", ");

            const currentAddress = [
                request.address1,
                request.address2,
                request.city,
            ].filter(Boolean).join(", ");

            return {
                _id: request._id,
                "Center To": request.toCenter?.centerName || "Unknown Center",
                "Center From": request.fromCenter?.centerName || "Unknown Center",
                Date: request.date?.toLocaleDateString(),
                status: request.status,
                "Status Detail": statusDetail,
                "Old Address": oldAddress || "Not available",
                "Current Address": currentAddress || "Not available",
                Remark: request.remark,
                "Created At": request.createdAt?.toLocaleDateString(),
            };
        });

        return res.status(200).json({
            success: true,
            data: formattedRequests,
            customer: {
                id: customer._id,
                name: customer.name,
                username: customer.username,
                mobile: customer.mobile,
                email: customer.email,
                currentCenter: customer.center,
            },
            userCenter: {
                id: centerId,
                name: req.user?.fullUser?.center?.centerName || "User Center",
            },
            pagination: {
                total,
                page: pageNumber,
                limit: pageSize,
                totalPages: Math.ceil(total / pageSize),
            },
            filters: {
                status: status || "all",
                startDate: startDate || "all",
                endDate: endDate || "all",
            },
            accessInfo: {
                canViewAll: permissions.view_shifting_all_center ||
                    permissions.isSuperAdmin,
                description:
                    permissions.view_shifting_all_center ||
                    permissions.isSuperAdmin
                        ? "Viewing all shifting requests for customer"
                        : "Viewing shifting requests for customer in your center",
            },
        });
    } catch (error) {
        return handleControllerError(error, res);
    }
};