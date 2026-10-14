import Building from "../models/Building.js";
import Customer from "../models/Customer.js";
import Center from "../models/Center.js";

export const getAllData = async (req, res) => {
  try {
    // Authentication middleware attaches the role and full user to req.user.
    const role = req.user?.role;
    const fullUser = req.user?.fullUser;

    if (!role || !fullUser) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user information is missing.",
      });
    }

    const userPermissions = Array.isArray(role.permissions)
      ? role.permissions
      : [];

    const getModulePermissions = (moduleName) => {
      const module = userPermissions.find(
        (permission) => permission.module === moduleName
      );

      return Array.isArray(module?.permissions)
        ? module.permissions
        : [];
    };

    const customerPermissions = getModulePermissions("Customer");
    const centerPermissions = getModulePermissions("Center");
    const settingsPermissions = getModulePermissions("Settings");

    const canViewAllCustomers = customerPermissions.includes(
      "view_customer_all_center"
    );
    const canViewOwnCustomers = customerPermissions.includes(
      "view_customer_own_center"
    );

    const canViewAllCenters = centerPermissions.includes("view_all_center");
    const canViewOwnCenters = centerPermissions.includes("view_own_center");

    const canViewAllBuildings = settingsPermissions.includes(
      "view_building_all_center"
    );
    const canViewOwnBuildings = settingsPermissions.includes(
      "view_building_own_center"
    );

    const hasCustomerPermission =
      canViewAllCustomers || canViewOwnCustomers;
    const hasCenterPermission =
      canViewAllCenters || canViewOwnCenters;
    const hasBuildingPermission =
      canViewAllBuildings || canViewOwnBuildings;

    // The new auth middleware stores the database user in fullUser.
    const userCenterId =
      req.selectedCenterId ||
      fullUser.center?._id ||
      fullUser.center ||
      null;

    const buildingFilter = {};
    const customerFilter = {};
    const centerFilter = {};

    // Apply center restrictions for own-center-only access.
    if (hasBuildingPermission && !canViewAllBuildings) {
      if (!userCenterId) {
        return res.status(403).json({
          success: false,
          message: "User is not assigned to a center.",
        });
      }

      buildingFilter.center = userCenterId;
    }

    if (hasCustomerPermission && !canViewAllCustomers) {
      if (!userCenterId) {
        return res.status(403).json({
          success: false,
          message: "User is not assigned to a center.",
        });
      }

      customerFilter.center = userCenterId;
    }

    if (hasCenterPermission && !canViewAllCenters) {
      if (!userCenterId) {
        return res.status(403).json({
          success: false,
          message: "User is not assigned to a center.",
        });
      }

      centerFilter._id = userCenterId;
    }

    if (
      !hasBuildingPermission &&
      !hasCustomerPermission &&
      !hasCenterPermission
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied. No permissions to view any data.",
        data: {
          buildings: [],
          customers: [],
          centers: [],
        },
        counts: {
          buildings: 0,
          customers: 0,
          centers: 0,
        },
      });
    }

    const [buildings, customers, centers] = await Promise.all([
      hasBuildingPermission
        ? Building.find(buildingFilter)
            .select("buildingName _id center")
            .populate("center", "centerName centerCode _id")
            .lean()
        : Promise.resolve([]),

      hasCustomerPermission
        ? Customer.find(customerFilter)
            .select("username name _id center")
            .populate("center", "centerName centerCode _id")
            .lean()
        : Promise.resolve([]),

      hasCenterPermission
        ? Center.find(centerFilter)
            .select("centerName centerCode _id")
            .lean()
        : Promise.resolve([]),
    ]);

    const transformedData = {
      buildings: buildings.map((building) => ({
        id: building._id,
        name: building.buildingName,
        center: building.center
          ? {
              id: building.center._id,
              name: building.center.centerName,
            }
          : null,
      })),

      customers: customers.map((customer) => ({
        id: customer._id,
        name: customer.name,
        username: customer.username,
        center: customer.center
          ? {
              id: customer.center._id,
              name: customer.center.centerName,
            }
          : null,
      })),

      centers: centers.map((center) => ({
        id: center._id,
        name: center.centerName,
        code: center.centerCode,
      })),
    };

    return res.status(200).json({
      success: true,
      data: transformedData,
      counts: {
        buildings: transformedData.buildings.length,
        customers: transformedData.customers.length,
        centers: transformedData.centers.length,
      },
      permissions: {
        buildings: hasBuildingPermission,
        customers: hasCustomerPermission,
        centers: hasCenterPermission,
        viewAll: {
          buildings: canViewAllBuildings,
          customers: canViewAllCustomers,
          centers: canViewAllCenters,
        },
        viewOwn: {
          buildings: canViewOwnBuildings,
          customers: canViewOwnCustomers,
          centers: canViewOwnCenters,
        },
      },
    });
  } catch (error) {
    console.error("Get all available data error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch available data.",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};