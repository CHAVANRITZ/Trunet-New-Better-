import express from "express";
import { getAllData } from "../controllers/getAllDataController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/all-data", authMiddleware, getAllData);

export default router;