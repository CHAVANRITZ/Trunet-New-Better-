import Area from "../models/Area.js";
import Reseller from "../models/Reseller.js";

/**
 * Create Area
 */
export const createArea = async ({ resellerId, areaName }) => {
    if (!resellerId || !areaName) {
        const error = new Error(
            "Reseller ID and Area name are required"
        );
        error.statusCode = 400;
        throw error;
    }

    const reseller = await Reseller.findById(resellerId);

    if (!reseller) {
        const error = new Error("Reseller not found");
        error.statusCode = 404;
        throw error;
    }

    return Area.create({
        reseller: resellerId,
        areaName,
    });
};

/**
 * Get Areas with pagination and sorting
 */
export const getAreas = async ({
    page = 1,
    limit = 100,
    sortBy = "areaName",
    sortOrder = "asc",
}) => {
    const validSortFields = [
        "areaName",
        "createdAt",
        "updatedAt",
    ];

    const actualSortBy = validSortFields.includes(sortBy)
        ? sortBy
        : "areaName";

    const pageNumber = Math.max(
        parseInt(page, 10) || 1,
        1
    );

    const limitNumber = Math.max(
        parseInt(limit, 10) || 100,
        1
    );

    const sortOptions = {
        [actualSortBy]:
            sortOrder === "desc" ? -1 : 1,
    };

    const skip =
        (pageNumber - 1) * limitNumber;

    const [areas, totalAreas] = await Promise.all([
        Area.find()
            .populate("reseller", "businessName")
            .sort(sortOptions)
            .skip(skip)
            .limit(limitNumber)
            .lean(),

        Area.countDocuments(),
    ]);

    const totalPages = Math.ceil(
        totalAreas / limitNumber
    );

    return {
        areas,
        pagination: {
            currentPage: pageNumber,
            totalPages,
            totalItems: totalAreas,
            itemsPerPage: limitNumber,
            hasNextPage: pageNumber < totalPages,
            hasPrevPage: pageNumber > 1,
            nextPage:
                pageNumber < totalPages
                    ? pageNumber + 1
                    : null,
            prevPage:
                pageNumber > 1
                    ? pageNumber - 1
                    : null,
        },
    };
};

/**
 * Get Areas by Reseller
 */
export const getAreasByReseller = async (
    resellerId
) => {
    return Area.find({
        reseller: resellerId,
    }).populate(
        "reseller",
        "businessName"
    );
};

/**
 * Get Area by ID
 */
export const getAreaById = async (areaId) => {
    const area = await Area.findById(areaId)
        .populate(
            "reseller",
            "businessName"
        );

    if (!area) {
        const error = new Error("Area not found");
        error.statusCode = 404;
        throw error;
    }

    return area;
};

/**
 * Update Area
 */
export const updateArea = async (
    areaId,
    { areaName, resellerId }
) => {
    const updateData = {};

    if (areaName) {
        updateData.areaName = areaName;
    }

    if (resellerId) {
        const reseller =
            await Reseller.findById(resellerId);

        if (!reseller) {
            const error = new Error(
                "Reseller not found"
            );
            error.statusCode = 404;
            throw error;
        }

        updateData.reseller = resellerId;
    }

    const area =
        await Area.findByIdAndUpdate(
            areaId,
            updateData,
            {
                new: true,
                runValidators: true,
            }
        ).populate(
            "reseller",
            "businessName"
        );

    if (!area) {
        const error = new Error(
            "Area not found"
        );
        error.statusCode = 404;
        throw error;
    }

    return area;
};

/**
 * Delete Area
 */
export const deleteArea = async (areaId) => {
    const area =
        await Area.findByIdAndDelete(areaId);

    if (!area) {
        const error = new Error(
            "Area not found"
        );
        error.statusCode = 404;
        throw error;
    }

    return area;
};