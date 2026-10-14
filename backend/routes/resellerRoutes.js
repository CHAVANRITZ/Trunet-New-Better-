import express from "express";

import { authMiddleware as protect } from "../middlewares/authMiddleware.js";
import { authorizeAccess } from "../middlewares/authorizationMiddleware.js";

import { getResellerForwardedQty } from "../controllers/resellerQuantity.js";

const MODULE = "Indent";
const router = express.Router();

router.get(
  "/reseller-forwarded-qty",
  protect,
  authorizeAccess(
    MODULE,
    "indent_all_center",
    "indent_own_center"
  ),
  getResellerForwardedQty
);

export default router;