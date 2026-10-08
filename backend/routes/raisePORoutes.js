import express from "express";

import {
    createRaisePOController,
    getAllRaisePOController,
    deletePOController,
    approveRaisePOController,
    rejectRaisePOController,
    changeRejectedToPendingController,
} from "../controllers/raisePOController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { validationMiddleware } from "../middlewares/validationMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import {
    createRaisePOValidator,
    getRaisePOValidator,
    raisePOIdValidator,
} from "../validators/raisePOValidator.js";


const router = express.Router();

router.post(
    "/",
    authMiddleware,
    createRaisePOValidator,
    validationMiddleware,
    asyncHandler(createRaisePOController)
);

router.get(
    "/",
    authMiddleware,
    getRaisePOValidator,
    validationMiddleware,
    asyncHandler(getAllRaisePOController)
);

router.delete(
    "/:id",
    authMiddleware,
    raisePOIdValidator,
    validationMiddleware,
    asyncHandler(deletePOController)
);

router.put(
    "/:id/approve",
    authMiddleware,
    raisePOIdValidator,
    validationMiddleware,
    asyncHandler(approveRaisePOController)
);

router.put(
    "/:id/reject",
    authMiddleware,
    raisePOIdValidator,
    validationMiddleware,
    asyncHandler(rejectRaisePOController)
);

router.patch(
    "/:id/change-to-pending",
    authMiddleware,
    raisePOIdValidator,
    validationMiddleware,
    asyncHandler(changeRejectedToPendingController)
);

export default router;