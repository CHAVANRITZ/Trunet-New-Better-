import { sendSuccess } from "../utils/responseHandler.js";

/**
 * Returns the current health status of the Trunet API.
 *
 * This endpoint is intentionally lightweight and does not require
 * authentication or a database query. It is used by developers,
 * monitoring systems, and deployment environments to verify that
 * the API process is running.
 */
export function getHealth(req, res) {
    return sendSuccess(res, {
        message: "Trunet API is healthy",
        data: {
            service: "Trunet Backend",
            status: "UP"
        }
    });
}