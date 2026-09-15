/**
 * Centralized Express error-handling middleware.
 *
 * Keeping error handling in one place ensures that controllers and
 * services do not need to repeat HTTP error-response logic.
 *
 * Express identifies an error middleware by its four parameters.
 */
export function errorMiddleware(err, req, res, next) {
    const statusCode = err.statusCode || 500;

    return res.status(statusCode).json({
        success: false,
        message: err.message || "Internal server error",
        ...(process.env.NODE_ENV === "development" && {
            stack: err.stack
        })
    });
}