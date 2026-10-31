import {
  createBuildingService,
  getBuildingsService,
  getBuildingByIdService,
  updateBuildingService,
  deleteBuildingService,
} from "../services/buildingService.js";

export const createBuilding = async (req, res) => {
  try {
    const building = await createBuildingService(req.user, req.body);

    return res.status(201).json({
      success: true,
      data: building,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((err) => err.message),
      });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getBuildings = async (req, res) => {
  try {
    const result = await getBuildingsService(req.user, req.query);

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching buildings",
    });
  }
};

export const getBuildingById = async (req, res) => {
  try {
    const building = await getBuildingByIdService(
      req.user,
      req.params.id
    );

    return res.status(200).json({
      success: true,
      data: building,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateBuilding = async (req, res) => {
  try {
    const building = await updateBuildingService(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      data: building,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((err) => err.message),
      });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteBuilding = async (req, res) => {
  try {
    const result = await deleteBuildingService(
      req.user,
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};