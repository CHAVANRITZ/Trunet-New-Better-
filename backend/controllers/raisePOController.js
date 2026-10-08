import {
    createRaisePO,
    getAllRaisePO,
    changeRejectedToPending,
    approveRaisePO,
    rejectRaisePO,
    deletePO,
} from "../services/raisePOService.js";

/**
 * Create Raise PO.
 */
export async function createRaisePOController(req, res) {
    const raisePO = await createRaisePO(
        req.user,
        req.body
    );

    return res.status(201).json({
        success: true,
        message:
            "Purchase Order created successfully and pending approval",
        data: raisePO,
    });
}

/**
 * Get all Raise POs.
 */
export async function getAllRaisePOController(req, res) {
    const result = await getAllRaisePO(
        req.user,
        req.query
    );

    if (result.data.length === 0) {
        return res.status(200).json({
            success: true,
            message: "No raise po found",
            data: [],
            pagination: result.pagination,
        });
    }

    return res.status(200).json({
        success: true,
        message: "Data retrieved successfully",
        data: result.data,
        pagination: result.pagination,
    });
}

/**
 * Change rejected/approved PO back to pending.
 */
export async function changeRejectedToPendingController(
    req,
    res
) {
    const raisePO = await changeRejectedToPending(
        req.user,
        req.params.id
    );

    return res.status(200).json({
        success: true,
        message:
            "Purchase Order status changed to pending successfully",
        data: raisePO,
    });
}

/**
 * Approve Raise PO.
 */
export async function approveRaisePOController(req, res) {
    const raisePO = await approveRaisePO(
        req.user,
        req.params.id
    );

    return res.status(200).json({
        success: true,
        message:
            "Purchase Order approved successfully",
        data: raisePO,
    });
}

/**
 * Reject Raise PO.
 */
export async function rejectRaisePOController(req, res) {
    const raisePO = await rejectRaisePO(
        req.user,
        req.params.id
    );

    return res.status(200).json({
        success: true,
        message:
            "Purchase Order rejected successfully",
        data: raisePO,
    });
}

/**
 * Delete Raise PO.
 */
export async function deletePOController(req, res) {
    await deletePO(
        req.user,
        req.params.id
    );

    return res.status(200).json({
        success: true,
        message: "PO deleted successfully",
    });
}