import {
    createWarehouse as createWarehouseService,
    getAllWarehouses as getAllWarehousesService,
    getWarehouseById as getWarehouseByIdService,
    updateWarehouse as updateWarehouseService,
    deleteWarehouse as deleteWarehouseService,
} from "../services/warehouseService.js";

/**
 * Create a new Warehouse.
 */
export const createWarehouse = async (req, res) => {
    try {
        const warehouse =
            await createWarehouseService(req.body);

        return res.status(201).json({
            success: true,
            data: warehouse,
            message: "Warehouse created successfully",
        });
    } catch (error) {
        console.error(
            "Error creating warehouse:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error creating warehouse",
        });
    }
};

/**
 * Get all Warehouses.
 */
export const getAllWarehouses = async (req, res) => {
    try {
        const warehouses =
            await getAllWarehousesService();

        return res.status(200).json({
            success: true,
            message:
                "Warehouses retrieved successfully",
            data: warehouses,
        });
    } catch (error) {
        console.error(
            "Error retrieving warehouses:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error retrieving warehouses",
        });
    }
};

/**
 * Get Warehouse by ID.
 */
export const getWarehouseById = async (req, res) => {
    try {
        const warehouse =
            await getWarehouseByIdService(
                req.params.id
            );

        if (!warehouse) {
            return res.status(404).json({
                success: false,
                message: "Warehouse not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: warehouse,
        });
    } catch (error) {
        console.error(
            "Error retrieving warehouse:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error retrieving warehouse",
        });
    }
};

/**
 * Update Warehouse.
 */
export const updateWarehouse = async (req, res) => {
    try {
        const warehouse =
            await updateWarehouseService(
                req.params.id,
                req.body
            );

        if (!warehouse) {
            return res.status(404).json({
                success: false,
                message: "Warehouse not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: warehouse,
            message:
                "Warehouse updated successfully",
        });
    } catch (error) {
        console.error(
            "Error updating warehouse:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error updating warehouse",
        });
    }
};

/**
 * Delete Warehouse.
 */
export const deleteWarehouse = async (req, res) => {
    try {
        const warehouse =
            await deleteWarehouseService(
                req.params.id
            );

        if (!warehouse) {
            return res.status(404).json({
                success: false,
                message: "Warehouse not found",
            });
        }

        return res.status(200).json({
            success: true,
            message:
                "Warehouse deleted successfully",
        });
    } catch (error) {
        console.error(
            "Error deleting warehouse:",
            error
        );

        return res.status(
            error.statusCode || 500
        ).json({
            success: false,
            message:
                error.message ||
                "Error deleting warehouse",
        });
    }
};