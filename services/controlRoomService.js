import Center from "../models/Center.js";
import ControlRoom from "../models/ControlRoom.js";
import Permission from "../models/Permission.js";

const createServiceError = (message, statusCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const isSuperAdminUser = (user) => {
    return user?.role?.isSuperAdmin === true;
};

const getSettingsPermissions = async (user) => {
    if (isSuperAdminUser(user)) {
        return {
            permissions: [],
        };
    }

    const rolePermissions = user?.role?.permissions;

    if (!Array.isArray(rolePermissions)) {
        return {
            permissions: [],
        };
    }

    const embeddedPermissions = rolePermissions.filter(
        (permission) =>
            permission &&
            typeof permission === "object" &&
            !permission._bsontype &&
            permission.module
    );

    const permissionIds = rolePermissions.filter(
        (permission) =>
            permission &&
            (
                typeof permission === "string" ||
                permission._bsontype === "ObjectID" ||
                permission._bsontype === "ObjectId"
            )
    );

    if (permissionIds.length === 0) {
        const settingsModule = embeddedPermissions.find(
            (permission) =>
                permission.module?.toLowerCase() === "settings"
        );

        return {
            permissions: settingsModule?.permissions || [],
        };
    }

    const permissions = await Permission.find({
        _id: { $in: permissionIds },
        status: "Enable",
    }).select("module action");

    const normalizedPermissions = [
        ...embeddedPermissions,
    ];

    for (const permission of permissions) {
        let group = normalizedPermissions.find(
            (item) =>
                item.module?.toLowerCase() ===
                permission.module?.toLowerCase()
        );

        if (!group) {
            group = {
                module: permission.module,
                permissions: [],
            };

            normalizedPermissions.push(group);
        }

        if (
            !group.permissions.includes(
                permission.action
            )
        ) {
            group.permissions.push(permission.action);
        }
    }

    const settingsModule = normalizedPermissions.find(
        (permission) =>
            permission.module?.toLowerCase() === "settings"
    );

    return {
        permissions: settingsModule?.permissions || [],
    };
};

const hasPermission = (settingsPermissions, permission) => {
    return settingsPermissions.permissions.includes(permission);
};

const getUserCenterId = (user) => {
    const center = user?.fullUser?.center;

    if (!center) {
        return null;
    }

    return (center._id || center).toString();
};

const populateCenter = {
    path: "center",
    select: "centerName centerType area reseller status city state",
    populate: [
        {
            path: "reseller",
            select: "businessName",
        },
        {
            path: "area",
            select: "areaName",
        },
    ],
};

const populateCenterWithAddress = {
    path: "center",
    select:
        "centerName centerType area reseller addressLine1 addressLine2 city state status",
    populate: [
        {
            path: "reseller",
            select: "businessName",
        },
        {
            path: "area",
            select: "areaName",
        },
    ],
};

export const createControlRoomService = async (user, data) => {
    const settingsPermissions =
        await getSettingsPermissions(user);

    const canManageAll =
        isSuperAdminUser(user) ||
        hasPermission(
            settingsPermissions,
            "manage_control_room_all_center"
        );

    const canManageOwn =
        isSuperAdminUser(user) ||
        hasPermission(
            settingsPermissions,
            "manage_control_room_own_center"
        );

    if (!canManageAll && !canManageOwn) {
        throw createServiceError(
            "Access denied. manage_control_room_own_center or manage_control_room_all_center permission required.",
            403
        );
    }

    const {
        center,
        buildingName,
        displayName,
        address1,
        address2,
        landmark,
        pincode,
    } = data;

    if (
        canManageOwn &&
        !canManageAll &&
        user.fullUser?.center
    ) {
        const userCenterId = getUserCenterId(user);

        if (center !== userCenterId) {
            throw createServiceError(
                "Access denied. You can only create control rooms in your own center.",
                403
            );
        }
    }

    const centerDoc = await Center.findById(center);

    if (!centerDoc) {
        throw createServiceError(
            "Center not found",
            404
        );
    }

    const controlRoom = new ControlRoom({
        center,
        buildingName,
        displayName,
        address1,
        address2,
        landmark,
        pincode,
    });

    return controlRoom.save();
};

export const getControlRoomsService = async (
    user,
    query
) => {
    const settingsPermissions =
        await getSettingsPermissions(user);

    const canViewAll =
        isSuperAdminUser(user) ||
        hasPermission(
            settingsPermissions,
            "view_control_room_all_center"
        );

    const canViewOwn =
        isSuperAdminUser(user) ||
        hasPermission(
            settingsPermissions,
            "view_control_room_own_center"
        );

    if (!canViewAll && !canViewOwn) {
        throw createServiceError(
            "Access denied. view_control_room_own_center or view_control_room_all_center permission required.",
            403
        );
    }

    const {
        search,
        center,
        reseller,
        area,
        centerType,
        status,
        city,
        state,
        page = 1,
        limit = 100,
        sortBy = "createdAt",
        sortOrder = "desc",
    } = query;

    const currentPage = Number(page);
    const itemsPerPage = Number(limit);

    const filter = {};

    if (
        canViewOwn &&
        !canViewAll &&
        user.fullUser?.center
    ) {
        filter.center = getUserCenterId(user);
    } else if (center) {
        filter.center = center;
    }

    if (search?.trim()) {
        const searchTerm = search.trim();

        filter.$or = [
            {
                buildingName: {
                    $regex: searchTerm,
                    $options: "i",
                },
            },
            {
                displayName: {
                    $regex: searchTerm,
                    $options: "i",
                },
            },
            {
                address1: {
                    $regex: searchTerm,
                    $options: "i",
                },
            },
            {
                address2: {
                    $regex: searchTerm,
                    $options: "i",
                },
            },
            {
                landmark: {
                    $regex: searchTerm,
                    $options: "i",
                },
            },
            {
                pincode: {
                    $regex: searchTerm,
                    $options: "i",
                },
            },
        ];
    }

    const centerFilter = {};

    if (reseller) {
        centerFilter.reseller = reseller;
    }

    if (area) {
        centerFilter.area = area;
    }

    if (centerType) {
        centerFilter.centerType = centerType;
    }

    if (status) {
        centerFilter.status = status;
    }

    if (city) {
        centerFilter.city = {
            $regex: city,
            $options: "i",
        };
    }

    if (state) {
        centerFilter.state = {
            $regex: state,
            $options: "i",
        };
    }

    if (
        canViewAll &&
        Object.keys(centerFilter).length > 0
    ) {
        const centers = await Center.find(
            centerFilter
        ).select("_id");

        const centerIds = centers.map(
            (item) => item._id
        );

        if (centerIds.length === 0) {
            return {
                data: [],
                pagination: {
                    currentPage,
                    totalPages: 0,
                    totalControlRooms: 0,
                },
            };
        }

        if (filter.center) {
            const requestedCenterId =
                filter.center.toString();

            const centerExists = centerIds.some(
                (centerId) =>
                    centerId.toString() ===
                    requestedCenterId
            );

            if (!centerExists) {
                return {
                    data: [],
                    pagination: {
                        currentPage,
                        totalPages: 0,
                        totalControlRooms: 0,
                    },
                };
            }
        } else {
            filter.center = {
                $in: centerIds,
            };
        }
    }

    const skip =
        (currentPage - 1) * itemsPerPage;

    const sort = {
        [sortBy]:
            sortOrder === "asc" ? 1 : -1,
    };

    const [
        controlRooms,
        totalControlRooms,
    ] = await Promise.all([
        ControlRoom.find(filter)
            .populate(populateCenter)
            .sort(sort)
            .skip(skip)
            .limit(itemsPerPage)
            .select("-__v"),

        ControlRoom.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(
        totalControlRooms / itemsPerPage
    );

    return {
        data: controlRooms,
        pagination: {
            currentPage,
            totalPages,
            totalControlRooms,
            itemsPerPage,
        },
    };
};

export const getControlRoomByIdService = async (
    user,
    id
) => {
    const controlRoom =
        await ControlRoom.findById(id).populate(
            populateCenterWithAddress
        );

    if (!controlRoom) {
        throw createServiceError(
            "Control Room not found",
            404
        );
    }

    const settingsPermissions =
        await getSettingsPermissions(user);

    const canViewAll =
        isSuperAdminUser(user) ||
        hasPermission(
            settingsPermissions,
            "view_control_room_all_center"
        );

    const canViewOwn =
        isSuperAdminUser(user) ||
        hasPermission(
            settingsPermissions,
            "view_control_room_own_center"
        );

    if (
        canViewOwn &&
        !canViewAll &&
        user.fullUser?.center
    ) {
        const userCenterId =
            getUserCenterId(user);

        if (
            controlRoom.center &&
            controlRoom.center._id.toString() !==
                userCenterId
        ) {
            throw createServiceError(
                "Access denied. You can only view control rooms in your own center.",
                403
            );
        }
    }

    return controlRoom;
};

export const updateControlRoomService = async (
    user,
    id,
    data
) => {
    const controlRoom =
        await ControlRoom.findById(id);

    if (!controlRoom) {
        throw createServiceError(
            "Control Room not found",
            404
        );
    }

    const settingsPermissions =
        await getSettingsPermissions(user);

    const canManageAll =
        isSuperAdminUser(user) ||
        hasPermission(
            settingsPermissions,
            "manage_control_room_all_center"
        );

    const canManageOwn =
        isSuperAdminUser(user) ||
        hasPermission(
            settingsPermissions,
            "manage_control_room_own_center"
        );

    if (
        canManageOwn &&
        !canManageAll &&
        user.fullUser?.center
    ) {
        const userCenterId =
            getUserCenterId(user);

        if (
            controlRoom.center.toString() !==
            userCenterId
        ) {
            throw createServiceError(
                "Access denied. You can only manage control rooms in your own center.",
                403
            );
        }
    }

    return ControlRoom.findByIdAndUpdate(
        id,
        data,
        {
            new: true,
            runValidators: true,
        }
    ).populate(
        populateCenterWithAddress
    );
};

export const deleteControlRoomService = async (
    user,
    id
) => {
    const controlRoom =
        await ControlRoom.findById(id);

    if (!controlRoom) {
        throw createServiceError(
            "Control Room not found",
            404
        );
    }

    const settingsPermissions =
        await getSettingsPermissions(user);

    const canManageAll =
        isSuperAdminUser(user) ||
        hasPermission(
            settingsPermissions,
            "manage_control_room_all_center"
        );

    const canManageOwn =
        isSuperAdminUser(user) ||
        hasPermission(
            settingsPermissions,
            "manage_control_room_own_center"
        );

    if (
        canManageOwn &&
        !canManageAll &&
        user.fullUser?.center
    ) {
        const userCenterId =
            getUserCenterId(user);

        if (
            controlRoom.center.toString() !==
            userCenterId
        ) {
            throw createServiceError(
                "Access denied. You can only delete control rooms in your own center.",
                403
            );
        }
    }

    await ControlRoom.findByIdAndDelete(id);

    return {
        message:
            "Control Room deleted successfully",
    };
};