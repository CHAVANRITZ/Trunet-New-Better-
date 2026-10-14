
import { body } from "express-validator";

/**
 * Validates login credentials before they reach the
 * authentication service.
 *
 * Login uses username and password.
 */
export const loginValidator = [
    body("username")
        .isString()
        .withMessage("Username must be a string.")
        .trim()
        .notEmpty()
        .withMessage("Username is required."),

    body("password")
        .isString()
        .withMessage("Password must be a string.")
        .notEmpty()
        .withMessage("Password is required.")
];

/**
 * Validates the refresh-token request before it reaches
 * the authentication service.
 */
export const refreshTokenValidator = [
    body("refreshToken")
        .isString()
        .withMessage("Refresh token must be a string.")
        .trim()
        .notEmpty()
        .withMessage("Refresh token is required.")
];

export const createUserValidator = [
    body("fullName")
        .isString().withMessage("Full name must be a string.")
        .trim()
        .notEmpty().withMessage("Full name is required."),

    body("username")
        .isString().withMessage("Username must be a string.")
        .trim()
        .notEmpty().withMessage("Username is required.")
        .isLength({ max: 50 }),

    body("email")
        .isEmail().withMessage("A valid email is required.")
        .normalizeEmail(),

    body("mobile")
        .optional({ checkFalsy: true })
        .matches(/^\d{10}$/)
        .withMessage("Mobile must be a 10-digit number."),

    body("role")
        .isMongoId().withMessage("A valid role is required."),

    body("center")
        .optional({ nullable: true, checkFalsy: true })
        .isMongoId().withMessage("A valid center is required."),

    body("accessibleCenters")
        .optional()
        .isArray().withMessage("Accessible branches must be an array."),

    body("accessibleCenters.*")
        .isMongoId().withMessage("Each accessible branch must be a valid ID."),

    body("status")
        .isIn(["Enable", "Disable"])
        .withMessage("Status must be Enable or Disable."),

    body("password")
        .isString()
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters."),

    body("confirmPassword")
        .custom((value, { req }) => value === req.body.password)
        .withMessage("Passwords do not match.")
];