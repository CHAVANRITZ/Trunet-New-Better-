/**
 * Custom application error used for expected API failures.
 *
 * Using a dedicated error class allows services and controllers
 * to throw errors with an HTTP status code without knowing how
 * Express will format the final response.
 *
 * Example:
 * throw new ApiError(401, "Invalid credentials");
 */
export class ApiError extends Error {
    /**
     * @param {number} statusCode - HTTP status code.
     * @param {string} message - Human-readable error message.
     */
    constructor(statusCode, message) {
        super(message);

        this.name = "ApiError";
        this.statusCode = statusCode;

        // Maintains a clean stack trace when supported by the runtime.
        Error.captureStackTrace(this, this.constructor);
    }
}