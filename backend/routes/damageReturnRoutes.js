import express from "express";
import { authMiddleware as protect } from "../middlewares/authMiddleware.js";
import {
  createDamageReturn,
  approveDamageReturn,
  rejectDamageReturn,
  getPendingDamageReturns,
  getAllDamageReturns
} from "../controllers/damageController.js";

const router = express.Router();

router.post("/", protect, createDamageReturn);
router.get("/", protect, getAllDamageReturns);
router.get("/pending", protect, getPendingDamageReturns);
router.patch("/:id/approve", protect, approveDamageReturn);
router.patch("/:id/reject", protect, rejectDamageReturn);

export default router;