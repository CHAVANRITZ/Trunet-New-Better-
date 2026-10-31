import Warehouse from "../models/Warehouse.js";

/**
 * Creates a new warehouse document.
 *
 * Request validation is handled by warehouseValidation.js.
 */
export const createWarehouse = async (warehouseData) => {
    return Warehouse.create(warehouseData);
};

/**
 * Retrieves all warehouse documents.
 */
export const getAllWarehouses = async () => {
    return Warehouse.find();
};

/**
 * Retrieves a warehouse by its MongoDB ObjectId.
 */
export const getWarehouseById = async (warehouseId) => {
    return Warehouse.findById(warehouseId);
};

/**
 * Updates a warehouse by its MongoDB ObjectId.
 *
 * runValidators ensures the Warehouse schema rules are
 * applied during update operations.
 */
export const updateWarehouse = async (warehouseId, warehouseData) => {
    return Warehouse.findByIdAndUpdate(
        warehouseId,
        warehouseData,
        {
            new: true,
            runValidators: true,
        }
    );
};

/**
 * Deletes a warehouse by its MongoDB ObjectId.
 */
export const deleteWarehouse = async (warehouseId) => {
    return Warehouse.findByIdAndDelete(warehouseId);
};