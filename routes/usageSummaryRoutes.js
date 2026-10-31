
import express from "express";
import { getUsageSummary } from "../controllers/usageSummaryController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
    authorizeAccess,
    attachAuthorizationContext,
} from "../middlewares/authorizationMiddleware.js";

const router = express.Router();

router.get(
    "/reports/indent-usage-summary",
    authMiddleware,
    authorizeAccess(
        "Usage",
        "view_usage_own_center",
        "view_usage_all_center"
    ),
    attachAuthorizationContext("Usage"),
    getUsageSummary
);

export default router;
