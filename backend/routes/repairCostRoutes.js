import express from "express";
import multer from "multer";

import {
    getAllRepairCosts,
    getRepairCostById,
    getRepairCostByProductId,
    createRepairCost,
    updateRepairCost,
    deleteRepairCost,
    downloadRepairCostTemplate,
    bulkImportRepairCosts,
} from "../controllers/repairCostController.js";

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
    },
});

// List repair costs with pagination.
router.get("/", getAllRepairCosts);

// Download CSV import template.
router.get("/template", downloadRepairCostTemplate);

// Import repair costs from CSV.
router.post("/import", upload.single("file"), bulkImportRepairCosts);

// Get repair cost for a particular product.
router.get("/product/:productId", getRepairCostByProductId);

// Create a repair cost.
router.post("/", createRepairCost);

// Get, update, and delete a repair cost by ID.
router.get("/:id", getRepairCostById);
router.put("/:id", updateRepairCost);
router.delete("/:id", deleteRepairCost);

export default router;