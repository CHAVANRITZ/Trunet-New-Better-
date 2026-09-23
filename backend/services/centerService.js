import Center from "../models/Center.js";
import Reseller from "../models/Reseller.js";
import Area from "../models/Area.js";

/**
 * Normalize center code.
 */
const normalizeCenterCode = (centerCode) => {
    if (!centerCode) return centerCode;

    return centerCode
        .toString()
        .trim()
        .toUpperCase();
};

/**
 * Check whether a user has a specific Center permission.
 */
const hasCenterPermission = (user, permission) => {
    const permissions = user?.role?.permissions || [];

    const centerModule = permissions.find(
        (perm) => perm.module === "Center"
    );

    return !!centerModule?.permissions?.includes(permission);
};

/**
 * Get user's center ID.
 */
const getUserCenterId = (user) => {
    if (!user?.center) return null;

    return user.center?._id || user.center;
};

/**
 * Check whether the user can access a specific center.
 */
const canAccessOwnCenter = (user, centerId) => {
    const userCenterId = getUserCenterId(user);

    if (!userCenterId) return false;

    return (
        userCenterId.toString() ===
        centerId.toString()
    );
};

/**
 * Create Center.
 *
 * Existing behavior:
 * - Center requires reseller.
 * - Area is optional.
 * - Outlet may have reseller/area.
 * - Center code is stored uppercase.
 */
export const createCenter = async (data) => {
    const {
        resellerId,
        areaId,
        centerType,
        centerName,
        centerCode,
        email,
        mobile,
        status,
        addressLine1,
        addressLine2,
        city,
        state,
        stockVerified,
    } = data;

    if (!["Center", "Outlet"].includes(centerType)) {
        const error = new Error(
            "Invalid center type. Must be 'Center' or 'Outlet'"
        );
        error.statusCode = 400;
        throw error;
    }

    if (centerType === "Center" && !resellerId) {
        const error = new Error(
            "Reseller ID is required for Center type"
        );
        error.statusCode = 400;
        throw error;
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
    }

    if (areaId) {
        const area =
            await Area.findById(areaId);

        if (!area) {
            const error = new Error(
                "Area not found"
            );
            error.statusCode = 404;
            throw error;
        }
    }

    const normalizedCode =
        normalizeCenterCode(centerCode);

    if (normalizedCode) {
        const existingCenter =
            await Center.findOne({
                centerCode: normalizedCode,
            });

        if (existingCenter) {
            const error = new Error(
                `Center with code ${normalizedCode} already exists`
            );
            error.statusCode = 400;
            throw error;
        }
    }

    const centerData = {
        centerType,
        centerName,
        centerCode: normalizedCode,
        email,
        mobile,
        status: status || "Enable",
        addressLine1,
        addressLine2,
        city,
        state,
        stockVerified: stockVerified || "",
    };

    if (resellerId) {
        centerData.reseller = resellerId;
    }

    if (areaId) {
        centerData.area = areaId;
    }

    const center =
        await Center.create(centerData);

    return Center.findById(center._id)
        .populate(
            "reseller",
            "businessName"
        )
        .populate(
            "area",
            "areaName"
        );
};

/**
 * Get Centers with filtering,
 * pagination and sorting.
 */
export const getCenters = async (
    query,
    user
) => {
    const {
        centerType,
        page = 1,
        limit = 100,
        search,
        sortBy = "centerName",
        sortOrder = "asc",
        reseller,
        area,
        status,
    } = query;

    const pageNumber = Math.max(
        parseInt(page, 10) || 1,
        1
    );

    const limitNumber = Math.max(
        parseInt(limit, 10) || 100,
        1
    );

    const canViewAll =
        hasCenterPermission(
            user,
            "view_all_center"
        );

    const canViewOwn =
        hasCenterPermission(
            user,
            "view_own_center"
        );

    if (!canViewAll && !canViewOwn) {
        const error = new Error(
            "Access denied. view_own_center or view_all_center permission required."
        );
        error.statusCode = 403;
        throw error;
    }

    const filter = {};

    if (canViewOwn && !canViewAll) {
        const userCenterId =
            getUserCenterId(user);

        if (!userCenterId) {
            const error = new Error(
                "User center not found"
            );
            error.statusCode = 404;
            throw error;
        }

        filter._id = userCenterId;
    }

    if (centerType) {
        filter.centerType = centerType;
    }

    if (reseller) {
        filter.reseller = reseller;
    }

    if (area) {
        filter.area = area;
    }

    if (status) {
        filter.status = status;
    }

    if (search) {
        filter.$or = [
            {
                centerName: {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                centerCode: {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                email: {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                mobile: {
                    $regex: search,
                    $options: "i",
                },
            },
        ];
    }

    const validSortFields = [
        "centerName",
        "centerCode",
        "centerType",
        "createdAt",
        "updatedAt",
        "status",
    ];

    const actualSortBy =
        validSortFields.includes(sortBy)
            ? sortBy
            : "centerName";

    const sortOptions = {
        [actualSortBy]:
            sortOrder === "desc" ? -1 : 1,
    };

    const [
        centers,
        total,
        centerTypeCounts,
    ] = await Promise.all([
        Center.find(filter)
            .populate(
                "reseller",
                "businessName"
            )
            .populate(
                "area",
                "areaName"
            )
            .sort(sortOptions)
            .limit(limitNumber)
            .skip(
                (pageNumber - 1) *
                    limitNumber
            ),

        Center.countDocuments(filter),

        Center.aggregate([
            {
                $match: filter,
            },
            {
                $group: {
                    _id: "$centerType",
                    count: {
                        $sum: 1,
                    },
                },
            },
        ]),
    ]);

    const centerTypeStats = {};

    centerTypeCounts.forEach((stat) => {
        centerTypeStats[stat._id] =
            stat.count;
    });

    const totalPages = Math.ceil(
        total / limitNumber
    );

    return {
        centers,
        pagination: {
            currentPage: pageNumber,
            totalPages,
            totalItems: total,
            itemsPerPage: limitNumber,
            hasNextPage:
                pageNumber < totalPages,
            hasPrevPage:
                pageNumber > 1,
        },
        filters: {
            centerType: centerTypeStats,
            total,
        },
    };
};

/**
 * Get Center by ID.
 */
export const getCenterById = async (
    centerId,
    user
) => {
    const center =
        await Center.findById(centerId)
            .populate(
                "reseller",
                "businessName"
            )
            .populate(
                "area",
                "areaName"
            );

    if (!center) {
        const error = new Error(
            "Center not found"
        );
        error.statusCode = 404;
        throw error;
    }

    const canViewAll =
        hasCenterPermission(
            user,
            "view_all_center"
        );

    const canViewOwn =
        hasCenterPermission(
            user,
            "view_own_center"
        );

    if (!canViewAll && !canViewOwn) {
        const error = new Error(
            "Access denied. view_own_center or view_all_center permission required."
        );
        error.statusCode = 403;
        throw error;
    }

    if (
        canViewOwn &&
        !canViewAll &&
        !canAccessOwnCenter(
            user,
            center._id
        )
    ) {
        const error = new Error(
            "Access denied. You can only view your own center."
        );
        error.statusCode = 403;
        throw error;
    }

    return center;
};

/**
 * Update Center.
 */
export const updateCenter = async (
    centerId,
    data,
    user
) => {
    const center =
        await Center.findById(centerId);

    if (!center) {
        const error = new Error(
            "Center not found"
        );
        error.statusCode = 404;
        throw error;
    }

    const canManageAll =
        hasCenterPermission(
            user,
            "manage_all_center"
        );

    const canManageOwn =
        hasCenterPermission(
            user,
            "manage_own_center"
        );

    if (
        !canManageAll &&
        !canManageOwn
    ) {
        const error = new Error(
            "Access denied. manage_own_center or manage_all_center permission required."
        );
        error.statusCode = 403;
        throw error;
    }

    if (
        canManageOwn &&
        !canManageAll &&
        !canAccessOwnCenter(
            user,
            center._id
        )
    ) {
        const error = new Error(
            "Access denied. You can only manage your own center."
        );
        error.statusCode = 403;
        throw error;
    }

    const {
        resellerId,
        areaId,
        centerType,
        centerName,
        centerCode,
        email,
        mobile,
        status,
        addressLine1,
        addressLine2,
        city,
        state,
        stockVerified,
    } = data;

    const updateData = {};

    const finalCenterType =
        centerType || center.centerType;

    if (
        !["Center", "Outlet"].includes(
            finalCenterType
        )
    ) {
        const error = new Error(
            "Invalid center type. Must be 'Center' or 'Outlet'"
        );
        error.statusCode = 400;
        throw error;
    }

    if (centerType !== undefined) {
        updateData.centerType =
            centerType;
    }

    /**
     * CENTER
     */
    if (finalCenterType === "Center") {
        const finalReseller =
            resellerId !== undefined
                ? resellerId
                : center.reseller;

        if (!finalReseller) {
            const error = new Error(
                "Reseller ID is required for Center type"
            );
            error.statusCode = 400;
            throw error;
        }

        const reseller =
            await Reseller.findById(
                finalReseller
            );

        if (!reseller) {
            const error = new Error(
                "Reseller not found"
            );
            error.statusCode = 404;
            throw error;
        }

        updateData.reseller =
            finalReseller;

        if (areaId !== undefined) {
            if (areaId) {
                const area =
                    await Area.findById(
                        areaId
                    );

                if (!area) {
                    const error =
                        new Error(
                            "Area not found"
                        );
                    error.statusCode = 404;
                    throw error;
                }

                updateData.area = areaId;
            } else {
                updateData.area = null;
            }
        }
    }

    /**
     * OUTLET
     */
    if (finalCenterType === "Outlet") {
        if (resellerId !== undefined) {
            if (resellerId) {
                const reseller =
                    await Reseller.findById(
                        resellerId
                    );

                if (!reseller) {
                    const error =
                        new Error(
                            "Reseller not found"
                        );
                    error.statusCode = 404;
                    throw error;
                }

                updateData.reseller =
                    resellerId;
            } else {
                updateData.reseller = null;
            }
        }

        if (areaId !== undefined) {
            if (areaId) {
                const area =
                    await Area.findById(
                        areaId
                    );

                if (!area) {
                    const error =
                        new Error(
                            "Area not found"
                        );
                    error.statusCode = 404;
                    throw error;
                }

                updateData.area = areaId;
            } else {
                updateData.area = null;
            }
        }
    }

    if (centerName !== undefined) {
        updateData.centerName =
            centerName;
    }

    if (centerCode !== undefined) {
        const normalizedCode =
            normalizeCenterCode(
                centerCode
            );

        const existingCenter =
            await Center.findOne({
                centerCode:
                    normalizedCode,
                _id: {
                    $ne: centerId,
                },
            });

        if (existingCenter) {
            const error = new Error(
                `Center with code ${normalizedCode} already exists`
            );
            error.statusCode = 400;
            throw error;
        }

        updateData.centerCode =
            normalizedCode;
    }

    if (email !== undefined) {
        updateData.email = email;
    }

    if (mobile !== undefined) {
        updateData.mobile = mobile;
    }

    if (status !== undefined) {
        if (
            !["Enable", "Disable"].includes(
                status
            )
        ) {
            const error = new Error(
                "Invalid status. Must be 'Enable' or 'Disable'"
            );
            error.statusCode = 400;
            throw error;
        }

        updateData.status = status;
    }

    if (addressLine1 !== undefined) {
        updateData.addressLine1 =
            addressLine1;
    }

    if (addressLine2 !== undefined) {
        updateData.addressLine2 =
            addressLine2;
    }

    if (city !== undefined) {
        updateData.city = city;
    }

    if (state !== undefined) {
        updateData.state = state;
    }

    if (stockVerified !== undefined) {
        if (
            stockVerified &&
            !["Yes", "No"].includes(
                stockVerified
            )
        ) {
            const error = new Error(
                "Invalid stockVerified value. Must be 'Yes' or 'No'"
            );
            error.statusCode = 400;
            throw error;
        }

        updateData.stockVerified =
            stockVerified;
    }

    return Center.findByIdAndUpdate(
        centerId,
        updateData,
        {
            new: true,
            runValidators: true,
        }
    )
        .populate(
            "reseller",
            "businessName"
        )
        .populate(
            "area",
            "areaName"
        );
};

/**
 * Delete Center.
 *
 * Only manage_all_center can delete.
 */
export const deleteCenter = async (
    centerId,
    user
) => {
    const center =
        await Center.findById(
            centerId
        );

    if (!center) {
        const error = new Error(
            "Center not found"
        );
        error.statusCode = 404;
        throw error;
    }

    const canManageAll =
        hasCenterPermission(
            user,
            "manage_all_center"
        );

    if (!canManageAll) {
        const error = new Error(
            "Access denied. manage_all_center permission required to delete centers."
        );
        error.statusCode = 403;
        throw error;
    }

    await Center.findByIdAndDelete(
        centerId
    );

    return true;
};

/**
 * Get Centers by reseller of
 * logged-in user's center.
 */
export const getCentersByReseller =
    async (user) => {
        const isAdmin =
            user?.role?.roleTitle
                ?.toLowerCase()
                .includes("admin");

        let filter = {};

        if (!isAdmin) {
            const userCenter =
                await Center.findById(
                    getUserCenterId(user)
                );

            if (!userCenter) {
                const error = new Error(
                    "User center not found"
                );
                error.statusCode = 404;
                throw error;
            }

            filter = {
                reseller:
                    userCenter.reseller,
            };
        }

        return Center.find(filter)
            .populate(
                "reseller",
                "businessName"
            )
            .populate(
                "area",
                "areaName"
            )
            .select(
                "_id centerName centerCode centerType status reseller area"
            )
            .sort({
                centerName: 1,
            });
    };

/**
 * Get Centers by Area.
 */
export const getCentersByArea = async (
    areaId,
    user
) => {
    const canViewAll =
        hasCenterPermission(
            user,
            "view_all_center"
        );

    const canViewOwn =
        hasCenterPermission(
            user,
            "view_own_center"
        );

    const filter = {
        area: areaId,
    };

    if (
        canViewOwn &&
        !canViewAll
    ) {
        const userCenter =
            await Center.findById(
                getUserCenterId(user)
            );

        if (
            !userCenter ||
            userCenter.area?.toString() !==
                areaId.toString()
        ) {
            const error = new Error(
                "Access denied. You can only view centers in your area."
            );
            error.statusCode = 403;
            throw error;
        }

        filter._id =
            getUserCenterId(user);
    }

    return Center.find(filter)
        .populate(
            "reseller",
            "businessName"
        )
        .populate(
            "area",
            "areaName"
        );
};

/**
 * Get basic Center list.
 */
export const getAllCentersBasic =
    async (centerType) => {
        const filter = {};

        if (centerType) {
            filter.centerType =
                centerType;
        }

        return Center.find(filter)
            .populate(
                "reseller",
                "businessName"
            )
            .populate(
                "area",
                "areaName"
            )
            .select(
                "_id centerName centerCode centerType status reseller area"
            )
            .sort({
                centerName: 1,
            });
    };

/**
 * Get Centers by reseller ID.
 */
export const getCentersByResellerId =
    async (
        resellerId,
        user
    ) => {
        const reseller =
            await Reseller.findById(
                resellerId
            );

        if (!reseller) {
            const error = new Error(
                "Reseller not found"
            );
            error.statusCode = 404;
            throw error;
        }

        const canViewAll =
            hasCenterPermission(
                user,
                "view_all_center"
            );

        const canViewOwn =
            hasCenterPermission(
                user,
                "view_own_center"
            );

        if (
            !canViewAll &&
            !canViewOwn
        ) {
            const error = new Error(
                "Access denied. view_own_center or view_all_center permission required."
            );
            error.statusCode = 403;
            throw error;
        }

        const filter = {
            reseller: resellerId,
        };

        if (
            canViewOwn &&
            !canViewAll
        ) {
            filter._id =
                getUserCenterId(user);
        }

        const centers =
            await Center.find(filter)
                .populate(
                    "reseller",
                    "businessName contactPerson mobile email"
                )
                .populate(
                    "area",
                    "areaName"
                )
                .sort({
                    centerName: 1,
                });

        return {
            centers,
            reseller,
        };
    };

/**
 * Escape a CSV value.
 *
 * No third-party CSV library is required.
 */
const escapeCSVValue = (value) => {
    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    const stringValue = String(value);

    if (
        stringValue.includes('"') ||
        stringValue.includes(",") ||
        stringValue.includes("\n") ||
        stringValue.includes("\r")
    ) {
        return `"${stringValue.replace(
            /"/g,
            '""'
        )}"`;
    }

    return stringValue;
};

/**
 * Convert rows into CSV text.
 */
const rowsToCSV = (
    fields,
    rows
) => {
    const header = fields
        .map(escapeCSVValue)
        .join(",");

    const body = rows.map((row) =>
        fields
            .map((field) =>
                escapeCSVValue(
                    row[field]
                )
            )
            .join(",")
    );

    return [
        header,
        ...body,
    ].join("\n");
};

/**
 * Prepare Center CSV export.
 *
 * Uses native JavaScript instead of json2csv.
 */
export const downloadCentersCSV =
    async (user) => {
        const canViewAll =
            hasCenterPermission(
                user,
                "view_all_center"
            );

        const canViewOwn =
            hasCenterPermission(
                user,
                "view_own_center"
            );

        if (
            !canViewAll &&
            !canViewOwn
        ) {
            const error = new Error(
                "Access denied. view_own_center or view_all_center permission required."
            );
            error.statusCode = 403;
            throw error;
        }

        const filter = {};

        if (
            canViewOwn &&
            !canViewAll
        ) {
            filter._id =
                getUserCenterId(user);
        }

        const centers =
            await Center.find(filter)
                .populate(
                    "reseller",
                    "businessName name email mobile contactNumber"
                )
                .populate(
                    "area",
                    "areaName"
                )
                .lean()
                .sort({
                    centerName: 1,
                });

        if (!centers.length) {
            const error = new Error(
                "No centers found to export"
            );
            error.statusCode = 404;
            throw error;
        }

        const csvData =
            centers.map((center) => ({
                "Center ID":
                    center._id?.toString() ||
                    "",

                "Center Name":
                    center.centerName ||
                    "",

                "Center Code":
                    center.centerCode ||
                    "",

                "Center Type":
                    center.centerType ||
                    "",

                Status:
                    center.status || "",

                Email:
                    center.email || "",

                Mobile:
                    center.mobile || "",

                "Address Line 1":
                    center.addressLine1 ||
                    "",

                "Address Line 2":
                    center.addressLine2 ||
                    "",

                City:
                    center.city || "",

                State:
                    center.state || "",

                "Stock Verified":
                    center.stockVerified ||
                    "",

                "Reseller ID":
                    center.reseller?._id?.toString() ||
                    "",

                "Reseller Business Name":
                    center.reseller
                        ?.businessName || "",

                "Reseller Name":
                    center.reseller?.name ||
                    "",

                "Reseller Email":
                    center.reseller?.email ||
                    "",

                "Reseller Mobile":
                    center.reseller?.mobile ||
                    "",

                "Reseller Contact":
                    center.reseller
                        ?.contactNumber || "",

                "Area ID":
                    center.area?._id?.toString() ||
                    "",

                "Area Name":
                    center.area?.areaName ||
                    "",

                "Created At":
                    center.createdAt
                        ? new Date(
                              center.createdAt
                          ).toLocaleString()
                        : "",

                "Updated At":
                    center.updatedAt
                        ? new Date(
                              center.updatedAt
                          ).toLocaleString()
                        : "",
            }));

        const fields = [
            "Center ID",
            "Center Name",
            "Center Code",
            "Center Type",
            "Status",
            "Email",
            "Mobile",
            "Address Line 1",
            "Address Line 2",
            "City",
            "State",
            "Stock Verified",
            "Reseller ID",
            "Reseller Business Name",
            "Reseller Name",
            "Reseller Email",
            "Reseller Mobile",
            "Reseller Contact",
            "Area ID",
            "Area Name",
            "Created At",
            "Updated At",
        ];

        return {
            csv: rowsToCSV(
                fields,
                csvData
            ),
            filename: `centers_export_${
                new Date()
                    .toISOString()
                    .split("T")[0]
            }.csv`,
        };
    };