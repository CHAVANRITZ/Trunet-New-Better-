import express from "express";
import { getAuditLogs } from "../controllers/auditLogController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeAccess } from "../middlewares/authorizationMiddleware.js";

const router = express.Router();

// Match the Audit Logs permission actions present in the supplied role data.
// Super Admin bypass behavior is handled by the shared authorizeAccess middleware.
router.get(
    "/",
    authMiddleware,
    authorizeAccess(
        "Audit Logs",
        "view_audit_logs_all",
        "view_audit_logs_own_center",
        "view_audit_logs_own"
    ),
    getAuditLogs
);

export default router;
