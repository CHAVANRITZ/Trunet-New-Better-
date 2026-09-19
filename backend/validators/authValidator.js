
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
