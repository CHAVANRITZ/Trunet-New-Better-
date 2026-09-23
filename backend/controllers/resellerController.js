import {
    createReseller as createResellerService,
    getResellers as getResellersService,
    getResellerById as getResellerByIdService,
    updateReseller as updateResellerService,
    deleteReseller as deleteResellerService,
} from "../services/resellerService.js";

export const createReseller = async (req, res) => {
    try {
        const result = await createResellerService(req.body);

        res.status(201).json({
            success: true,
            message: "Reseller created successfully with auto-generated outlet",
            data: {
                reseller: result.reseller,
                center: result.center,
            },
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Error creating reseller",
            error: error.message,
        });
    }
};

export const getResellers = async (req, res) => {
    try {
        const {
            search,
            city,
            state,
            page = 1,
            limit = 100,
            sortBy = "createdAt",
            sortOrder = "desc",
        } = req.query;

        const result = await getResellersService({
            search,
            city,
            state,
            page,
            limit,
            sortBy,
            sortOrder,
        });

        res.status(200).json({
            success: true,
            data: result.resellers,
            pagination: {
                currentPage: Number(page),
                totalPages: result.pagination.totalPages,
                totalResellers: result.pagination.totalResellers,
                limit: Number(limit),
                hasNextPage: result.pagination.hasNextPage,
                hasPrevPage: result.pagination.hasPrevPage,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching resellers",
            error: error.message,
        });
    }
};

export const getResellerById = async (req, res) => {
    try {
        const reseller = await getResellerByIdService(req.params.id);

        if (!reseller) {
            return res.status(404).json({
                success: false,
                message: "Reseller not found",
            });
        }

        res.status(200).json({
            success: true,
            data: reseller,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching reseller",
            error,
        });
    }
};

export const updateReseller = async (req, res) => {
    try {
        const reseller = await updateResellerService(
            req.params.id,
            req.body
        );

        if (!reseller) {
            return res.status(404).json({
                success: false,
                message: "Reseller not found",
            });
        }

        res.status(200).json({
            success: true,
            message: "Reseller updated successfully",
            data: reseller,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Error updating reseller",
            error,
        });
    }
};

export const deleteReseller = async (req, res) => {
    try {
        const reseller = await deleteResellerService(req.params.id);

        if (!reseller) {
            return res.status(404).json({
                success: false,
                message: "Reseller not found",
            });
        }

        res.status(200).json({
            success: true,
            message: "Reseller deleted successfully",
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Error deleting reseller",
            error,
        });
    }
};