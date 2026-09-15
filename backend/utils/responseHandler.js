/**
 * Sends a standardized successful API response.
 *
 * Keeping response formatting centralized ensures that all
 * Trunet endpoints return a predictable response structure.
 *
 * @param {Object} res - Express response object.
 * @param {Object} options - Response configuration.
 * @param {string} options.message - Human-readable success message.
 * @param {*} options.data - Response payload.
 * @param {number} [options.statusCode=200] - HTTP status code.
 * @returns {Object} Express response.
 */
export function sendSuccess(
    res,
    {
        message = "Request successful",
        data = null,
        statusCode = 200
    } = {}
) {
    return res.status(statusCode).json({
        success: true,
        message,
        data
    });
}