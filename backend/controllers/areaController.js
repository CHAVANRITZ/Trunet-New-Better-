import {
    createArea as createAreaService,
    getAreas as getAreasService,
    getAreasByReseller as getAreasByResellerService,
    getAreaById as getAreaByIdService,
    updateArea as updateAreaService,
    deleteArea as deleteAreaService,
} from "../services/areaService.js";

/**
 * Create Area
 */
export const createArea = async (req, res) => {
    try {
        const area = await createAreaService(
            req.body
        );

        return res.status(201).json({
            success: true,
            data: area,
        });
    } catch (error) {
        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * Get Areas
 */
export const getAreas = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 100,
            sortBy = "areaName",
            sortOrder = "asc",
        } = req.query;

        const result =
            await getAreasService({
                page,
                limit,
                sortBy,
                sortOrder,
            });

        return res.status(200).json({
            success: true,
            message: "Areas retrieved successfully",
            data: {
                areas: result.areas,
                pagination: result.pagination,
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error retrieving areas",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : "Internal server error",
        });
    }
};

/**
 * Get Areas by Reseller
 */
export const getAreasByReseller = async (
    req,
    res
) => {
    try {
        const areas =
            await getAreasByResellerService(
                req.params.resellerId
            );

        return res.status(200).json({
            success: true,
            data: areas,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * Get Area by ID
 */
export const getAreaById = async (req, res) => {
    try {
        const area =
            await getAreaByIdService(
                req.params.id
            );

        return res.status(200).json({
            success: true,
            data: area,
        });
    } catch (error) {
        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * Update Area
 */
export const updateArea = async (req, res) => {
    try {
        const area =
            await updateAreaService(
                req.params.id,
                req.body
            );

        return res.status(200).json({
            success: true,
            message: "Area updated successfully",
            data: area,
        });
    } catch (error) {
        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * Delete Area
 */
export const deleteArea = async (req, res) => {
    try {
        await deleteAreaService(
            req.params.id
        );

        return res.status(200).json({
            success: true,
            message: "Area deleted successfully",
        });
    } catch (error) {
        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message: error.message,
        });
    }
};