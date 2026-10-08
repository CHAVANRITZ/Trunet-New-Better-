import express from "express";

import {
    createStockPurchase,
    getAllStockPurchases,
    getStockPurchaseById,
    getAllProductsWithStock,
    updateStockPurchase,
    deleteStockPurchase,
    getPurchasesByVendor,
    getAvailableStock,
    getOutletStockSummary,
    getOutletSerialNumbers,
    updateOutletSerialNumber,
    deleteOutletSerialNumber,
} from "../controllers/stockPurchaseController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
    authorizeAccess,
} from "../middlewares/authorizationMiddleware.js";

import { validationMiddleware } from "../middlewares/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import {
    createStockPurchaseValidator,
    updateStockPurchaseValidator,
    stockPurchaseIdValidator,
    getStockPurchasesValidator,
    vendorIdValidator,
    productQueryValidator,
    stockAvailabilityValidator,
} from "../validators/stockPurchaseValidator.js";

const router = express.Router();

const MODULE = "Purchase";

const ADD_PURCHASE_STOCK = "add_purchase_stock";
const VIEW_OWN_PURCHASE_STOCK = "view_own_purchase_stock";
const VIEW_ALL_PURCHASE_STOCK = "view_all_purchase_stock";

/*
 * Create Stock Purchase
 */
router.post(
    "/",
    authMiddleware,
    authorizeAccess(MODULE, ADD_PURCHASE_STOCK),
    createStockPurchaseValidator,
    validationMiddleware,
    asyncHandler(createStockPurchase)
);

/*
 * Get All Stock Purchases
 */
router.get(
    "/",
    authMiddleware,
    authorizeAccess(
        MODULE,
        VIEW_OWN_PURCHASE_STOCK,
        VIEW_ALL_PURCHASE_STOCK
    ),
    getStockPurchasesValidator,
    validationMiddleware,
    asyncHandler(getAllStockPurchases)
);

/*
 * Get Products With Stock
 */
router.get(
    "/products/with-stock",
    authMiddleware,
    authorizeAccess(
        MODULE,
        VIEW_OWN_PURCHASE_STOCK,
        VIEW_ALL_PURCHASE_STOCK
    ),
    productQueryValidator,
    validationMiddleware,
    asyncHandler(getAllProductsWithStock)
);

/*
 * Get Available Stock For Product
 */
router.get(
    "/stock/available/:productId",
    authMiddleware,
    authorizeAccess(
        MODULE,
        VIEW_OWN_PURCHASE_STOCK,
        VIEW_ALL_PURCHASE_STOCK
    ),
    stockAvailabilityValidator,
    validationMiddleware,
    asyncHandler(getAvailableStock)
);

/*
 * Get Stock Purchase By ID
 */
router.get(
    "/:id",
    authMiddleware,
    authorizeAccess(
        MODULE,
        VIEW_OWN_PURCHASE_STOCK,
        VIEW_ALL_PURCHASE_STOCK
    ),
    stockPurchaseIdValidator,
    validationMiddleware,
    asyncHandler(getStockPurchaseById)
);

/*
 * Update Stock Purchase
 */
router.put(
    "/:id",
    authMiddleware,
    updateStockPurchaseValidator,
    validationMiddleware,
    asyncHandler(updateStockPurchase)
);

/*
 * Delete Stock Purchase
 */
router.delete(
    "/:id",
    authMiddleware,
    stockPurchaseIdValidator,
    validationMiddleware,
    asyncHandler(deleteStockPurchase)
);

/*
 * Get Purchases By Vendor
 */
router.get(
    "/vendor/:vendorId",
    authMiddleware,
    authorizeAccess(
        MODULE,
        VIEW_OWN_PURCHASE_STOCK,
        VIEW_ALL_PURCHASE_STOCK
    ),
    vendorIdValidator,
    validationMiddleware,
    asyncHandler(getPurchasesByVendor)
);

/*
 * Get Outlet Stock Summary
 */
router.get(
    "/stock/outlet-summary",
    authMiddleware,
    authorizeAccess(
        MODULE,
        VIEW_OWN_PURCHASE_STOCK,
        VIEW_ALL_PURCHASE_STOCK
    ),
    asyncHandler(getOutletStockSummary)
);

/*
 * Get Outlet Serial Numbers
 */
router.get(
    "/serial-numbers/product/:outletId/:productId",
    authMiddleware,
    authorizeAccess(
        MODULE,
        VIEW_OWN_PURCHASE_STOCK,
        VIEW_ALL_PURCHASE_STOCK
    ),
    asyncHandler(getOutletSerialNumbers)
);

/*
 * Update Outlet Serial Number
 */
router.put(
    "/serial-numbers/product/:productId/serial/:serialNumber",
    authMiddleware,
    asyncHandler(updateOutletSerialNumber)
);

/*
 * Delete Outlet Serial Number
 */
router.delete(
    "/serial-numbers/product/:productId/serial/:serialNumber",
    authMiddleware,
    asyncHandler(deleteOutletSerialNumber)
);

export default router;