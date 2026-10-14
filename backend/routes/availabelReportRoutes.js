import express from "express";

import {
  getCenterAllStock,
  getAllAvailableProductsWithStock,
  getStockUsageByCenter,
} from "../controllers/availableReportController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";

import {
  authorizeAccess,
  attachAuthorizationContext,
} from "../middlewares/authorizationMiddleware.js";

const router = express.Router();

const MODULE = "Available Stock";

const viewPermissions = [
  "available_stock_own_center",
  "available_stock_all_center",
];

const authorizeAvailableStock = (...permissions) => [
  authMiddleware,
  authorizeAccess(MODULE, ...permissions),
  attachAuthorizationContext(MODULE),
];

router.get(
  "/centerstock",
  ...authorizeAvailableStock(...viewPermissions),
  getCenterAllStock
);

router.get(
  "/availableStock",
  ...authorizeAvailableStock(...viewPermissions),
  getAllAvailableProductsWithStock
);

router.get(
  "/transactions",
  ...authorizeAvailableStock(...viewPermissions),
  getStockUsageByCenter
);

export default router;