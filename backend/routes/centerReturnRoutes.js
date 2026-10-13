
import express from "express";
import { createCenterReturn } from "../controllers/centerReturnController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeAccess } from "../middlewares/authorizationMiddleware.js";

const router = express.Router();

router.post(
  "/",
  authMiddleware,
  authorizeAccess("CenterReturn", "create_center_return"),
  createCenterReturn
);

export default router;
