import multer from "multer";

/**
 * Centralized Express error-handling middleware.
 *
 * Keeping error handling in one place ensures that controllers and
 * services do not need to repeat HTTP error-response logic.
 *
 * Express identifies an error middleware by its four parameters.
 */
export function errorMiddleware(err, req, res, next) {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal server error";

    /**
     * Multer errors are request-level upload failures and should
     * return a 400 response rather than an internal server error.
     */
    if (err instanceof multer.MulterError) {
        statusCode = 400;

        if (err.code === "LIMIT_FILE_SIZE") {
            message = "Uploaded file exceeds the allowed size limit.";
        } else {
            message = err.message || "File upload failed.";
        }
    }

    return res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === "development" && {
            stack: err.stack
        })
    });
}