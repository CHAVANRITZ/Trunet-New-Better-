import express from "express";

import {
    createRole,
    getRoles,
    getRoleById,
    updateRole,
    deleteRole
} from "../controllers/roleController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";

import { requirePermission } from "../middlewares/authorizationMiddleware.js";

import {
    createRoleValidator,
    updateRoleValidator,
    roleIdValidator
} from "../validators/roleValidator.js";

import { validateRequest } from "../middlewares/validateRequest.js";

const router = express.Router();

const MODULE = "Roles and Permissions";

/**
 * Create a new role.
 *
 * Requires the database-backed `create_role` permission
 * from the Roles and Permissions module.
 */
router.post(
    "/",
    authMiddleware,
    requirePermission(MODULE, "create_role"),
    createRoleValidator,
    validateRequest,
    createRole
);

/**
 * Get all roles.
 *
 * Requires the database-backed `view_role` permission
 * from the Roles and Permissions module.
 */
router.get(
    "/",
    authMiddleware,
    requirePermission(MODULE, "view_role"),
    getRoles
);

/**
 * Get a role by ID.
 *
 * Uses the same `view_role` permission as the role listing.
 */
router.get(
    "/:id",
    authMiddleware,
    requirePermission(MODULE, "view_role"),
    roleIdValidator,
    validateRequest,
    getRoleById
);

/**
 * Update a role.
 *
 * Requires the database-backed `update_role` permission
 * from the Roles and Permissions module.
 */
router.put(
    "/:id",
    authMiddleware,
    requirePermission(MODULE, "update_role"),
    updateRoleValidator,
    validateRequest,
    updateRole
);

/**
 * Delete a role.
 *
 * Requires the database-backed `delete_role` permission
 * from the Roles and Permissions module.
 */
router.delete(
    "/:id",
    authMiddleware,
    requirePermission(MODULE, "delete_role"),
    roleIdValidator,
    validateRequest,
    deleteRole
);

export default router;