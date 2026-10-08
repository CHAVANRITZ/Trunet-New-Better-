import {
    createStockPurchase as createStockPurchaseService,
    getStockPurchases as getStockPurchasesService,
    getStockPurchaseById as getStockPurchaseByIdService,
    updateStockPurchase as updateStockPurchaseService,
    deleteStockPurchase as deleteStockPurchaseService,
    getPurchasesByVendor as getPurchasesByVendorService,
    getAllProductsWithStock as getAllProductsWithStockService,
    getAvailableStock as getAvailableStockService,
    getOutletStockSummary as getOutletStockSummaryService,
    getOutletSerialNumbers as getOutletSerialNumbersService,
    updateOutletSerialNumber as updateOutletSerialNumberService,
    deleteOutletSerialNumber as deleteOutletSerialNumberService,
} from "../services/stockPurchaseService.js";

import { ApiError } from "../utils/ApiError.js";

/**
 * Create Stock Purchase
 */
export async function createStockPurchase(req, res) {
    const outletId =
        req.body.outlet ||
        req.user?.center ||
        req.user?.fullUser?.center?._id ||
        req.user?.fullUser?.center;

    const stockPurchase =
        await createStockPurchaseService({
            ...req.body,
            outlet: outletId,
        });

    return res.status(201).json({
        success: true,
        message: "Stock purchase created successfully",
        data: stockPurchase,
    });
}

/**
 * Get All Stock Purchases
 */
export async function getAllStockPurchases(req, res) {
    const query = {
        ...req.query,
    };

    /*
     * Old behavior:
     * - view own purchase stock → user's center
     * - view all purchase stock → requested outlet if supplied
     */
    if (!query.outlet) {
        query.outlet =
            req.user?.center ||
            req.user?.fullUser?.center?._id ||
            req.user?.fullUser?.center;
    }

    const result =
        await getStockPurchasesService(query);

    if (!result.stockPurchases?.length) {
        return res.status(200).json({
            success: true,
            message: "No stock purchases found",
            data: [],
            pagination: {
                currentPage:
                    Number(query.page) || 1,
                totalPages: 0,
                totalItems: 0,
                itemsPerPage:
                    Number(query.limit) || 100,
            },
        });
    }

    return res.status(200).json({
        success: true,
        message: "Stock purchases retrieved successfully",
        data: result.stockPurchases,
        pagination: result.pagination,
    });
}

/**
 * Get Stock Purchase By ID
 */
export async function getStockPurchaseById(req, res) {
    const stockPurchase =
        await getStockPurchaseByIdService(
            req.params.id,
            req.user?.center ||
            req.user?.fullUser?.center?._id ||
            req.user?.fullUser?.center
        );

    if (!stockPurchase) {
        throw new ApiError(
            404,
            "Stock purchase not found or access denied"
        );
    }

    return res.status(200).json({
        success: true,
        message: "Stock purchase retrieved successfully",
        data: stockPurchase,
    });
}

/**
 * Update Stock Purchase
 */
export async function updateStockPurchase(req, res) {
    const stockPurchase =
        await updateStockPurchaseService(
            req.params.id,
            req.body,
            req.user?.center ||
            req.user?.fullUser?.center?._id ||
            req.user?.fullUser?.center
        );

    if (!stockPurchase) {
        throw new ApiError(
            404,
            "Stock purchase not found or access denied"
        );
    }

    return res.status(200).json({
        success: true,
        message: "Stock purchase updated successfully",
        data: stockPurchase,
    });
}

/**
 * Delete Stock Purchase
 */
export async function deleteStockPurchase(req, res) {
    const deleted =
        await deleteStockPurchaseService(
            req.params.id,
            req.user?.center ||
            req.user?.fullUser?.center?._id ||
            req.user?.fullUser?.center
        );

    if (!deleted) {
        throw new ApiError(
            404,
            "Stock purchase not found or access denied"
        );
    }

    return res.status(200).json({
        success: true,
        message: "Stock purchase deleted successfully",
    });
}

/**
 * Get Purchases By Vendor
 */
export async function getPurchasesByVendor(req, res) {
    const query = {
        ...req.query,
        outlet:
            req.query.outlet ||
            req.user?.center ||
            req.user?.fullUser?.center?._id ||
            req.user?.fullUser?.center,
    };

    const result =
        await getPurchasesByVendorService(
            req.params.vendorId,
            query
        );

    return res.status(200).json({
        success: true,
        message: "Vendor purchases retrieved successfully",
        data: result.stockPurchases,
        pagination: result.pagination,
    });
}

/**
 * Get All Products With Stock
 *
 * Old API intentionally does NOT paginate
 * in the active controller implementation.
 */
// export async function getAllProductsWithStock(req, res) {
//     const result =
//         await getAllProductsWithStockService({
//             ...req.query,
//             outlet:
//                 req.user?.center,
//         });

//     return res.status(200).json({
//         success: true,
//         message:
//             `Products with stock information retrieved successfully for ${result.centerType.toLowerCase()}`,
//         data: result.products,
//         center: result.center,
//         stockSummary: result.stockSummary,
//         totalItems: result.totalItems,
//     });
// }

export async function getAllProductsWithStock(req, res) {
    const result =
        await getAllProductsWithStockService({
            ...req.query,
            outlet:
                req.query.outlet ||
                req.user?.center ||
                req.user?.fullUser?.center?._id ||
                req.user?.fullUser?.center,
        });

    return res.status(200).json({
        success: true,
        message: "Products with stock information retrieved successfully",
        data: result.products,
        pagination: result.pagination,
    });
}

/**
 * Get Available Stock
 *
 * Route:
 * GET /stock/available/:productId
 *
 * Outlet is derived from logged-in user's center,
 * exactly as old controller behavior.
 */
export async function getAvailableStock(req, res) {
    const outletId =
        req.query.outlet ||
        req.user?.center ||
        req.user?.fullUser?.center?._id ||
        req.user?.fullUser?.center;

    if (!outletId) {
        throw new ApiError(
            400,
            "Outlet context required for available stock lookup"
        );
    }

    const result =
        await getAvailableStockService(
            req.params.productId,
            outletId
        );

    return res.status(200).json({
        success: true,
        message: "Available stock retrieved successfully",
        data: result,
    });
}

/**
 * Get Outlet Stock Summary
 *
 * Route:
 * GET /stock/outlet-summary
 */
export async function getOutletStockSummary(req, res) {
    const outletId =
        req.query.outlet ||
        req.user?.center ||
        req.user?.fullUser?.center?._id ||
        req.user?.fullUser?.center;

    if (!outletId) {
        throw new ApiError(
            400,
            "User is not associated with an outlet"
        );
    }

    const result =
        await getOutletStockSummaryService(
            outletId
        );

    return res.status(200).json({
        success: true,
        message:
            "Outlet stock summary retrieved successfully",
        data: result,
    });
}

/**
 * Get Outlet Serial Numbers
 *
 * Route:
 * GET /serial-numbers/product/:outletId/:productId
 *
 * Optional:
 * ?resellerId=...
 */
export async function getOutletSerialNumbers(req, res) {
    const {
        outletId,
        productId,
    } = req.params;

    if (!outletId) {
        throw new ApiError(
            400,
            "Outlet ID is required"
        );
    }

    const result =
        await getOutletSerialNumbersService(
            outletId,
            productId,
            req.query.resellerId
        );

    return res.status(200).json(result);
}

/**
 * Update Outlet Serial Number
 */
export async function updateOutletSerialNumber(req, res) {
    const {
        productId,
        serialNumber,
    } = req.params;

    const outletId =
        req.user?.center ||
        req.user?.fullUser?.center?._id ||
        req.user?.fullUser?.center;

    if (!outletId) {
        throw new ApiError(
            400,
            "User center information not found"
        );
    }

    const result =
        await updateOutletSerialNumberService(
            productId,
            serialNumber,
            req.body,
            outletId
        );

    if (!result) {
        throw new ApiError(
            404,
            "Serial number not found or not available"
        );
    }

    return res.status(200).json({
        success: true,
        message: "Serial number updated successfully",
        data: result,
    });
}

/**
 * Delete Outlet Serial Number
 */
export async function deleteOutletSerialNumber(req, res) {
    const {
        productId,
        serialNumber,
    } = req.params;

    const outletId =
        req.user?.center ||
        req.user?.fullUser?.center?._id ||
        req.user?.fullUser?.center;

    if (!outletId) {
        throw new ApiError(
            400,
            "User center information not found"
        );
    }

    const result =
        await deleteOutletSerialNumberService(
            productId,
            serialNumber,
            outletId
        );

    if (!result) {
        throw new ApiError(
            404,
            "Serial number not found or not available"
        );
    }

    return res.status(200).json({
        success: true,
        message:
            "Serial number deleted and stock adjusted successfully",
        data: result,
    });
}