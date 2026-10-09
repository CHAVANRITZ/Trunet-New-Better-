import Building from "../models/Building.js";
import Center from "../models/Center.js";

const getUserCenterId = (user) =>
  user?.selectedCenterId || user?.fullUser?.center || null;

const getPermissions = (user) =>
  user?.fullUser?.role?.permissions || user?.role?.permissions || [];

/*
 * Building permissions are stored under the Settings module
 * using exact permission names such as:
 *
 * - manage_building_all_center
 * - manage_building_own_center
 * - view_building_all_center
 * - view_building_own_center
 *
 * Support the permission structure used by the new RBAC system.
 */
const hasPermission = (user, permissionName) => {
  const permissions = getPermissions(user);

  const settingsPermission = permissions.find(
    (permission) => permission.module === "Settings"
  );

  if (!settingsPermission) {
    return false;
  }

  if (Array.isArray(settingsPermission.permissions)) {
    return settingsPermission.permissions.includes(permissionName);
  }

  return false;
};

const canManageAll = (user) =>
  hasPermission(user, "manage_building_all_center");

const canManageOwn = (user) =>
  hasPermission(user, "manage_building_own_center");

const canViewAll = (user) =>
  hasPermission(user, "view_building_all_center");

const canViewOwn = (user) =>
  hasPermission(user, "view_building_own_center");

export const createBuildingService = async (user, data) => {
  if (!canManageAll(user) && !canManageOwn(user)) {
    const error = new Error(
      "You do not have permission to manage buildings"
    );
    error.statusCode = 403;
    throw error;
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

  const userCenterId = getUserCenterId(user);

  if (canManageOwn(user) && !canManageAll(user)) {
    if (
      !userCenterId ||
      userCenterId.toString() !== center.toString()
    ) {
      const error = new Error(
        "You can only manage buildings in your own center"
      );
      error.statusCode = 403;
      throw error;
    }
  }

  const centerExists = await Center.findById(center);

  if (!centerExists) {
    const error = new Error("Center not found");
    error.statusCode = 404;
    throw error;
  }

  return Building.create({
    center,
    buildingName,
    displayName,
    address1,
    address2,
    landmark,
    pincode,
  });
};

export const getBuildingsService = async (user, query) => {
  if (!canViewAll(user) && !canViewOwn(user)) {
    const error = new Error(
      "You do not have permission to view buildings"
    );
    error.statusCode = 403;
    throw error;
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

  const filter = {};

  const userCenterId = getUserCenterId(user);

  if (canViewOwn(user) && !canViewAll(user)) {
    filter.center = userCenterId;
  }

  if (center) {
    filter.center = center;
  }

  if (search) {
    const searchRegex = new RegExp(search, "i");

    filter.$or = [
      { buildingName: searchRegex },
      { displayName: searchRegex },
      { address1: searchRegex },
      { address2: searchRegex },
      { landmark: searchRegex },
      { pincode: searchRegex },
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
    centerFilter.city = new RegExp(city, "i");
  }

  if (state) {
    centerFilter.state = new RegExp(state, "i");
  }

  if (
    canViewAll(user) &&
    Object.keys(centerFilter).length > 0
  ) {
    const centerIds = await Center.find(centerFilter).distinct("_id");

    if (centerIds.length === 0) {
      return {
        data: [],
        pagination: {
          currentPage: Number(page),
          totalPages: 0,
          totalBuildings: 0,
        },
      };
    }

    filter.center = { $in: centerIds };
  }

  const pageNumber = Number(page);
  const limitNumber = Number(limit);
  const skip = (pageNumber - 1) * limitNumber;

  const sort = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,
  };

  const buildings = await Building.find(filter)
    .populate({
      path: "center",
      select: "centerName centerType area reseller status",
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
    })
    .sort(sort)
    .skip(skip)
    .limit(limitNumber)
    .select("-__v");

  const totalBuildings = await Building.countDocuments(filter);

  return {
    data: buildings,
    pagination: {
      currentPage: pageNumber,
      totalPages: Math.ceil(totalBuildings / limitNumber),
      totalBuildings,
    },
  };
};

export const getBuildingByIdService = async (
  user,
  buildingId
) => {
  if (!canViewAll(user) && !canViewOwn(user)) {
    const error = new Error(
      "You do not have permission to view buildings"
    );
    error.statusCode = 403;
    throw error;
  }

  const building = await Building.findById(buildingId).populate({
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
  });

  if (!building) {
    const error = new Error("Building not found");
    error.statusCode = 404;
    throw error;
  }

  const userCenterId = getUserCenterId(user);

  if (canViewOwn(user) && !canViewAll(user)) {
    if (
      !userCenterId ||
      building.center?._id?.toString() !==
        userCenterId.toString()
    ) {
      const error = new Error(
        "You can only view buildings from your own center"
      );
      error.statusCode = 403;
      throw error;
    }
  }

  return building;
};

export const updateBuildingService = async (
  user,
  buildingId,
  data
) => {
  if (!canManageAll(user) && !canManageOwn(user)) {
    const error = new Error(
      "You do not have permission to manage buildings"
    );
    error.statusCode = 403;
    throw error;
  }

  const building = await Building.findById(buildingId);

  if (!building) {
    const error = new Error("Building not found");
    error.statusCode = 404;
    throw error;
  }

  const userCenterId = getUserCenterId(user);

  if (canManageOwn(user) && !canManageAll(user)) {
    if (
      !userCenterId ||
      building.center?.toString() !==
        userCenterId.toString()
    ) {
      const error = new Error(
        "You can only manage buildings in your own center"
      );
      error.statusCode = 403;
      throw error;
    }
  }

  return Building.findByIdAndUpdate(
    buildingId,
    data,
    {
      new: true,
      runValidators: true,
    }
  ).populate({
    path: "center",
    select:
      "centerName centerType area reseller addressLine1 addressLine2 city state status",
    populate: [
      {
        path: "reseller",
        select: "resellerName",
      },
      {
        path: "area",
        select: "areaName",
      },
    ],
  });
};

export const deleteBuildingService = async (
  user,
  buildingId
) => {
  if (!canManageAll(user) && !canManageOwn(user)) {
    const error = new Error(
      "You do not have permission to manage buildings"
    );
    error.statusCode = 403;
    throw error;
  }

  const building = await Building.findById(buildingId);

  if (!building) {
    const error = new Error("Building not found");
    error.statusCode = 404;
    throw error;
  }

  const userCenterId = getUserCenterId(user);

  if (canManageOwn(user) && !canManageAll(user)) {
    if (
      !userCenterId ||
      building.center?.toString() !==
        userCenterId.toString()
    ) {
      const error = new Error(
        "You can only manage buildings in your own center"
      );
      error.statusCode = 403;
      throw error;
    }
  }

  await Building.findByIdAndDelete(buildingId);

  return {
    message: "Building deleted successfully",
  };
};