import express from "express";

import { authMiddleware } from "../middlewares/authMiddleware.js";

import { authorizeAccess } from "../middlewares/authorizationMiddleware.js";

import {
  createReseller,
  getResellers,
  getResellerById,
  updateReseller,
  deleteReseller,
} from "../controllers/resellerController.js";

import {
  getResellerForwardedQty,
} from "../controllers/resellerQuantity.js";

const router = express.Router();

// --------------------------------------------------
// GET ALL RESELLERS
// GET /api/v1/resellers
// --------------------------------------------------
router.get(
  "/",
  authMiddleware,
  authorizeAccess(
    "Reseller",
    "view_all_reseller",
    "view_own_reseller"
  ),
  getResellers
);

// --------------------------------------------------
// CREATE RESELLER
// POST /api/v1/resellers
// --------------------------------------------------
router.post(
  "/",
  authMiddleware,
  authorizeAccess("Reseller", "create_reseller"),
  createReseller
);

// --------------------------------------------------
// RESELLER FORWARDED QUANTITY
// GET /api/v1/resellerStock/reseller-forwarded-qty
// Keep this BEFORE the generic /:id route.
// --------------------------------------------------
router.get(
  "/reseller-forwarded-qty",
  (req, res, next) => {
    console.log("========== FORWARDED QTY ROUTE HIT ==========");
    console.log("URL:", req.originalUrl);
    console.log("Query:", req.query);
    next();
  },
  authMiddleware,
  authorizeAccess(
    "Indent",
    "indent_all_center",
    "indent_own_center"
  ),
  getResellerForwardedQty
);

// --------------------------------------------------
// GET RESELLER BY ID
// GET /api/v1/resellers/:id
// --------------------------------------------------
router.get(
  "/:id",
  authMiddleware,
  authorizeAccess(
    "Reseller",
    "view_all_reseller",
    "view_own_reseller"
  ),
  getResellerById
);

// --------------------------------------------------
// UPDATE RESELLER
// PUT /api/v1/resellers/:id
// --------------------------------------------------
router.put(
  "/:id",
  authMiddleware,
  authorizeAccess("Reseller", "update_reseller"),
  updateReseller
);

// --------------------------------------------------
// DELETE RESELLER
// DELETE /api/v1/resellers/:id
// --------------------------------------------------
router.delete(
  "/:id",
  authMiddleware,
  authorizeAccess("Reseller", "delete_reseller"),
  deleteReseller
);

export default router;