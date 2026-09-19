import { body, param } from "express-validator";

/**
 * Validates data required to create a role.
 *
 * The validator follows the legacy Role contract:
 * - roleTitle is required.
 * - permissions remain an embedded array of modules and actions.
 */
export const createRoleValidator = [
    body("roleTitle")
        .trim()
        .notEmpty()
        .withMessage("Role title is required.")
        .isLength({ max: 50 })
        .withMessage("Role title cannot exceed 50 characters."),

    body("permissions")
        .optional()
        .isArray()
        .withMessage("Permissions must be an array."),

    body("permissions.*.module")
        .if(body("permissions").exists())
        .trim()
        .notEmpty()
        .withMessage("Permission module is required."),

    body("permissions.*.permissions")
        .if(body("permissions").exists())
        .isArray()
        .withMessage("Permission actions must be an array."),

    body("permissions.*.permissions.*")
        .if(body("permissions").exists())
        .trim()
        .notEmpty()
        .withMessage("Permission action cannot be empty.")
];

/**
 * Validates data required to update a role.
 *
 * All update fields are optional, but at least the supplied
 * values must follow the legacy document structure.
 */
export const updateRoleValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid role ID."),

    body("roleTitle")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("Role title cannot be empty.")
        .isLength({ max: 50 })
        .withMessage("Role title cannot exceed 50 characters."),

    body("permissions")
        .optional()
        .isArray()
        .withMessage("Permissions must be an array."),

    body("permissions.*.module")
        .if(body("permissions").exists())
        .trim()
        .notEmpty()
        .withMessage("Permission module is required."),

    body("permissions.*.permissions")
        .if(body("permissions").exists())
        .isArray()
        .withMessage("Permission actions must be an array."),

    body("permissions.*.permissions.*")
        .if(body("permissions").exists())
        .trim()
        .notEmpty()
        .withMessage("Permission action cannot be empty.")
];

/**
 * Validates a role ID supplied in the URL.
 */
export const roleIdValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid role ID.")
];