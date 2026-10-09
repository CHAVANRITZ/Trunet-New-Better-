import express from "express";

import {
    createCustomer,
    getCustomers,
    getCustomersWithoutPagination,
    getCustomerById,
    updateCustomer,
    deleteCustomer,
    importCustomers,
} from "../controllers/customerController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeAccess } from "../middlewares/authorizationMiddleware.js";

import {
    memoryUpload,
} from "../config/multer.js";

const router = express.Router();

const MODULE = "Customer";

/**
 * Create Customer
 *
 * Legacy permissions:
 * - manage_customer_all_center
 * - manage_customer_own_center
 */
router.post(
    "/",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_customer_all_center",
        "manage_customer_own_center"
    ),
    createCustomer
);

/**
 * Import Customers from CSV
 *
 * IMPORTANT:
 * Legacy route did NOT use authentication
 * or authorization middleware here.
 *
 * Keep this behavior unchanged.
 *
 * Uses the existing project memoryUpload
 * middleware.
 */
router.post(
    "/import",
    memoryUpload.single("file"),
    importCustomers
);

/**
 * Get Customers with pagination
 *
 * Legacy permissions:
 * - view_customer_own_center
 * - view_customer_all_center
 */
router.get(
    "/",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_customer_own_center",
        "view_customer_all_center"
    ),
    getCustomers
);

/**
 * Get all Customers without pagination
 */
router.get(
    "/all",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_customer_own_center",
        "view_customer_all_center"
    ),
    getCustomersWithoutPagination
);

/**
 * Get Customer by ID
 */
router.get(
    "/:id",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "view_customer_own_center",
        "view_customer_all_center"
    ),
    getCustomerById
);

/**
 * Update Customer
 */
router.put(
    "/:id",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_customer_all_center",
        "manage_customer_own_center"
    ),
    updateCustomer
);

/**
 * Delete Customer
 */
router.delete(
    "/:id",
    authMiddleware,
    authorizeAccess(
        MODULE,
        "manage_customer_all_center",
        "manage_customer_own_center"
    ),
    deleteCustomer
);

export default router;