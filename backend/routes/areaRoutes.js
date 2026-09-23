import express from "express";

import {
    createArea,
    getAreas,
    getAreasByReseller,
    getAreaById,
    updateArea,
    deleteArea,
} from "../controllers/areaController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/", createArea);

router.get("/", getAreas);

router.get(
    "/reseller/:resellerId",
    getAreasByReseller
);

router.get("/:id", getAreaById);

router.put(
    "/:id",
    authMiddleware,
    updateArea
);

router.delete(
    "/:id",
    authMiddleware,
    deleteArea
);

export default router;