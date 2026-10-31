import {
    createCenter as createCenterService,
    getCenters as getCentersService,
    getCenterById as getCenterByIdService,
    updateCenter as updateCenterService,
    deleteCenter as deleteCenterService,
    getCentersByReseller as getCentersByResellerService,
    getCentersByArea as getCentersByAreaService,
    getAllCentersBasic as getAllCentersBasicService,
    getCentersByResellerId as getCentersByResellerIdService,
    downloadCentersCSV as downloadCentersCSVService,
} from "../services/centerService.js";

/**
 * Create a new Center.
 */
export const createCenter = async (req, res) => {
    try {
        const center =
            await createCenterService(
                req.body
            );

        return res.status(201).json({
            success: true,
            data: center,
            message:
                "Center created successfully",
        });
    } catch (error) {
        console.error(
            "Error creating center:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error creating center",
        });
    }
};

/**
 * Get Centers.
 */
export const getCenters = async (
    req,
    res
) => {
    try {
        const result =
            await getCentersService(
                req.query,
                req.user
            );

        return res.status(200).json({
            success: true,
            message:
                "Centers retrieved successfully",
            data: result.centers,
            pagination:
                result.pagination,
            filters:
                result.filters,
        });
    } catch (error) {
        console.error(
            "Error retrieving centers:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error retrieving centers",
        });
    }
};

/**
 * Get Center by ID.
 */
export const getCenterById = async (
    req,
    res
) => {
    try {
        const center =
            await getCenterByIdService(
                req.params.id,
                req.user
            );

        return res.status(200).json({
            success: true,
            data: center,
        });
    } catch (error) {
        console.error(
            "Error retrieving center:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error retrieving center",
        });
    }
};

/**
 * Update Center.
 */
export const updateCenter = async (
    req,
    res
) => {
    try {
        const center =
            await updateCenterService(
                req.params.id,
                req.body,
                req.user
            );

        return res.status(200).json({
            success: true,
            data: center,
            message:
                "Center updated successfully",
        });
    } catch (error) {
        console.error(
            "Error updating center:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error updating center",
        });
    }
};

/**
 * Delete Center.
 */
export const deleteCenter = async (
    req,
    res
) => {
    try {
        await deleteCenterService(
            req.params.id,
            req.user
        );

        return res.status(200).json({
            success: true,
            message:
                "Center deleted successfully",
        });
    } catch (error) {
        console.error(
            "Error deleting center:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error deleting center",
        });
    }
};

/**
 * Get centers related to logged-in user's reseller.
 */
export const getCentersByReseller = async (
    req,
    res
) => {
    try {
        const centers =
            await getCentersByResellerService(
                req.user
            );

        return res.status(200).json({
            success: true,
            data: centers,
            message: `Found ${centers.length} centers`,
        });
    } catch (error) {
        console.error(
            "Error fetching centers by reseller:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error fetching centers",
        });
    }
};

/**
 * Get centers by Area.
 */
export const getCentersByArea = async (
    req,
    res
) => {
    try {
        const centers =
            await getCentersByAreaService(
                req.params.areaId,
                req.user
            );

        return res.status(200).json({
            success: true,
            data: centers,
            message: `Found ${centers.length} centers in area`,
        });
    } catch (error) {
        console.error(
            "Error fetching centers by area:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error fetching centers",
        });
    }
};

/**
 * Get basic list of all centers.
 */
export const getAllCentersBasic = async (
    req,
    res
) => {
    try {
        const centers =
            await getAllCentersBasicService(
                req.query.centerType
            );

        return res.status(200).json({
            success: true,
            message:
                "All centers retrieved successfully",
            data: centers,
            total: centers.length,
        });
    } catch (error) {
        console.error(
            "Error retrieving all centers:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error retrieving all centers",
        });
    }
};

/**
 * Get centers by specific reseller ID.
 */
export const getCentersByResellerId = async (
    req,
    res
) => {
    try {
        const result =
            await getCentersByResellerIdService(
                req.params.resellerId,
                req.user
            );

        return res.status(200).json({
            success: true,
            message: `Found ${result.centers.length} centers for reseller: ${result.reseller.businessName}`,
            data: result.centers,
            resellerInfo: {
                id: result.reseller._id,
                businessName:
                    result.reseller.businessName,
                totalCenters:
                    result.centers.length,
            },
        });
    } catch (error) {
        console.error(
            "Error fetching centers by reseller ID:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error fetching centers",
        });
    }
};

/**
 * Download Centers as CSV.
 */
export const downloadCentersCSV = async (
    req,
    res
) => {
    try {
        const result =
            await downloadCentersCSVService(
                req.user
            );

        res.setHeader(
            "Content-Type",
            "text/csv"
        );

        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${result.filename}"`
        );

        return res.status(200).send(
            result.csv
        );
    } catch (error) {
        console.error(
            "Download centers CSV error:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error exporting centers data",
        });
    }
};