import express from "express";

import {
    bulkUploadCenterStock,
    downloadCenterStockSampleCSV
} from "../controllers/centerStockImportController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import upload from "../middlewares/upload.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

router.use(authMiddleware);

router.post(
    "/bulk-upload",
    upload.single("file"),
    asyncHandler(bulkUploadCenterStock)
);

router.get(
    "/download/sample",
    asyncHandler(downloadCenterStockSampleCSV)
);

export default router;