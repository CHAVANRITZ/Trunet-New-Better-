import express from "express";

import {
    createTestingMaterialRequest,
    acceptTestingMaterialRequest,
    getAllTestingMaterialRequests,
    getTestingMaterialRequestById,
    getAllUnderTestingProducts,
    getUnderTestingSerialsByProduct,
} from "../controllers/testingMaterialController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeAccess } from "../middlewares/authorizationMiddleware.js";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";

import {
    createTestingMaterialValidator,
    acceptTestingMaterialValidator,
    testingMaterialIdValidator,
    productIdValidator,
    centerQueryValidator,
    listTestingMaterialValidator,
} from "../validators/testingMaterialValidator.js";

const router = express.Router();

/*
 * "Testing Material" is the legacy permission module.
 * Permission action names are preserved from the legacy API.
 */
const MODULE = "Testing Material";

router.use(authMiddleware);

router.post(
    "/",
    authorizeAccess(MODULE, "create_testing_request"),
    createTestingMaterialValidator,
    validationMiddleware,
    createTestingMaterialRequest
);

router.get(
    "/",
    authorizeAccess(MODULE, "view_testing_request"),
    listTestingMaterialValidator,
    validationMiddleware,
    getAllTestingMaterialRequests
);

router.get(
    "/under-testing-product",
    authorizeAccess(MODULE, "view_testing_request"),
    centerQueryValidator,
    validationMiddleware,
    getAllUnderTestingProducts
);

router.get(
    "/under-testing/product/:productId/serial",
    authorizeAccess(MODULE, "view_testing_request"),
    productIdValidator,
    centerQueryValidator,
    validationMiddleware,
    getUnderTestingSerialsByProduct
);

router.get(
    "/:id",
    authorizeAccess(MODULE, "view_testing_request"),
    testingMaterialIdValidator,
    validationMiddleware,
    getTestingMaterialRequestById
);

router.put(
    "/:id/accept",
    authorizeAccess(MODULE, "accept_testing_request"),
    acceptTestingMaterialValidator,
    validationMiddleware,
    acceptTestingMaterialRequest
);

export default router;