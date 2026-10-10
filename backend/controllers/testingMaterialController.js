import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/responseHandler.js";
import * as testingMaterialService from "../services/testingMaterialService.js";

/**
 * asyncHandler + legacy error extras.
 *
 * Some legacy error responses carry extra fields (for example
 * unavailableSerials). Errors with `extras` are answered here;
 * everything else goes to the central errorMiddleware.
 */
const handle = (handler) =>
    asyncHandler(async (req, res, next) => {
        try {
            await handler(req, res, next);
        } catch (error) {
            if (error.extras) {
                return res.status(error.statusCode || 400).json({
                    success: false,
                    message: error.message,
                    ...error.extras,
                });
            }
            throw error;
        }
    });

export const createTestingMaterialRequest = handle(async (req, res) => {
    const data = await testingMaterialService.createRequest(req.user, req.body);

    return sendSuccess(res, {
        statusCode: 201,
        message: "Testing material request created successfully",
        data,
    });
});

export const acceptTestingMaterialRequest = handle(async (req, res) => {
    const data = await testingMaterialService.acceptRequest(
        req.user,
        req.params.id,
        req.body || {}
    );

    return sendSuccess(res, {
        message: "Testing material request accepted successfully",
        data,
    });
});

export const getAllTestingMaterialRequests = handle(async (req, res) => {
    const { data, pagination, filters } =
        await testingMaterialService.getAllRequests(req.user, req.query);

    return res.status(200).json({
        success: true,
        message: "Testing material requests retrieved successfully",
        data,
        pagination,
        filters,
    });
});

export const getTestingMaterialRequestById = handle(async (req, res) => {
    const data = await testingMaterialService.getRequestById(
        req.user,
        req.params.id
    );

    return sendSuccess(res, {
        message: "Testing material request retrieved successfully",
        data,
    });
});

export const getAllUnderTestingProducts = handle(async (req, res) => {
    const data = await testingMaterialService.getAllUnderTestingProducts(
        req.user,
        req.query
    );

    return sendSuccess(res, {
        message: "Under testing products retrieved successfully",
        data,
    });
});

export const getUnderTestingSerialsByProduct = handle(async (req, res) => {
    const result = await testingMaterialService.getUnderTestingSerialsByProduct(
        req.user,
        req.params.productId,
        req.query
    );

    if (!result.found) {
        return res.status(404).json({
            success: false,
            message: "No testing stock found for this product",
            data: result.data,
        });
    }

    return sendSuccess(res, {
        message: "Under testing serials retrieved successfully",
        data: result.data,
    });
});