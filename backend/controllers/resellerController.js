import mongoose from "mongoose";

import {
    createReseller as createResellerService,
    getResellers as getResellersService,
    getResellerById as getResellerByIdService,
    updateReseller as updateResellerService,
    deleteReseller as deleteResellerService,
} from "../services/resellerService.js";

const sendError = (res, statusCode, message, error) => {
    return res.status(statusCode).json({
        success: false,
        message,
        ...(error ? { error: error.message || String(error) } : {}),
    });
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const validateResellerId = (req, res) => {
    if (!isValidObjectId(req.params.id)) {
        sendError(res, 400, "Invalid reseller ID");
        return false;
    }

    return true;
};

export const createReseller = async (req, res) => {
    try {
        const result = await createResellerService(req.body);

        return res.status(201).json({
            success: true,
            message: "Reseller created successfully with auto-generated outlet",
            data: {
                reseller: result.reseller,
                center: result.center,
            },
        });
    } catch (error) {
        const statusCode =
            error.code === 11000
                ? 409
                : error.name === "ValidationError"
                    ? 400
                    : 500;

        return sendError(
            res,
            statusCode,
            statusCode === 409
                ? "Reseller already exists"
                : statusCode === 400
                    ? "Reseller validation failed"
                    : "Error creating reseller",
            error
        );
    }
};

export const getResellers = async (req, res) => {
    try {
        const {
            search,
            city,
            state,
            page = "1",
            limit = "100",
            sortBy = "createdAt",
            sortOrder = "desc",
        } = req.query;

        const parsedPage = Number(page);
        const parsedLimit = Number(limit);

        if (
            !Number.isInteger(parsedPage) ||
            parsedPage < 1 ||
            !Number.isInteger(parsedLimit) ||
            parsedLimit < 1 ||
            parsedLimit > 500
        ) {
            return sendError(
                res,
                400,
                "page must be a positive integer and limit must be between 1 and 500"
            );
        }

        const normalizedSortOrder = String(sortOrder).toLowerCase();

        if (!["asc", "desc"].includes(normalizedSortOrder)) {
            return sendError(
                res,
                400,
                "sortOrder must be either asc or desc"
            );
        }

        const result = await getResellersService({
            search,
            city,
            state,
            page: parsedPage,
            limit: parsedLimit,
            sortBy,
            sortOrder: normalizedSortOrder,
        });

        return res.status(200).json({
            success: true,
            data: result.resellers,
            pagination: {
                currentPage: parsedPage,
                totalPages: result.pagination.totalPages,
                totalResellers: result.pagination.totalResellers,
                limit: parsedLimit,
                hasNextPage: result.pagination.hasNextPage,
                hasPrevPage: result.pagination.hasPrevPage,
            },
        });
    } catch (error) {
        console.error("[getResellers]", error.message);

        return sendError(
            res,
            500,
            "Error fetching resellers",
            error
        );
    }
};

export const getResellerById = async (req, res) => {
    try {
        if (!validateResellerId(req, res)) return;

        const reseller = await getResellerByIdService(req.params.id);

        if (!reseller) {
            return sendError(res, 404, "Reseller not found");
        }

        return res.status(200).json({
            success: true,
            data: reseller,
        });
    } catch (error) {
        console.error("[getResellerById]", error.message);

        return sendError(
            res,
            500,
            "Error fetching reseller",
            error
        );
    }
};

export const updateReseller = async (req, res) => {
    try {
        if (!validateResellerId(req, res)) return;

        const reseller = await updateResellerService(
            req.params.id,
            req.body
        );

        if (!reseller) {
            return sendError(res, 404, "Reseller not found");
        }

        return res.status(200).json({
            success: true,
            message: "Reseller updated successfully",
            data: reseller,
        });
    } catch (error) {
        console.error("[updateReseller]", error.message);

        const statusCode =
            error.name === "ValidationError" ||
            error.name === "CastError"
                ? 400
                : error.code === 11000
                    ? 409
                    : 500;

        return sendError(
            res,
            statusCode,
            statusCode === 409
                ? "Reseller already exists"
                : statusCode === 400
                    ? "Invalid reseller data"
                    : "Error updating reseller",
            error
        );
    }
};

export const deleteReseller = async (req, res) => {
    try {
        if (!validateResellerId(req, res)) return;

        const reseller = await deleteResellerService(req.params.id);

        if (!reseller) {
            return sendError(res, 404, "Reseller not found");
        }

        return res.status(200).json({
            success: true,
            message: "Reseller deleted successfully",
        });
    } catch (error) {
        console.error("[deleteReseller]", error.message);

        return sendError(
            res,
            500,
            "Error deleting reseller",
            error
        );
    }
};