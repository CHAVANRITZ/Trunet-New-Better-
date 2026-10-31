import {
    getLoginHistory as getLoginHistoryService
} from "../services/loginHistoryService.js";

import { sendSuccess } from "../utils/responseHandler.js";

export async function getLoginHistory(
    req,
    res
) {
    const result =
        await getLoginHistoryService({
            page: req.query.page,
            limit: req.query.limit,
            userId: req.query.userId
        });

    return sendSuccess(res, {
        statusCode: 200,
        message: "Login history retrieved successfully.",
        data: result
    });
}