import express from "express";

import {
    createControlRoom,
    getControlRooms,
    getControlRoomById,
    updateControlRoom,
    deleteControlRoom,
} from "../controllers/controlRoomController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeAccess } from "../middlewares/authorizationMiddleware.js";

import {
    createControlRoomValidator,
    updateControlRoomValidator,
    controlRoomIdValidator,
} from "../validators/controlRoomValidator.js";

const router = express.Router();

const MODULE = "Settings";

router.use(authMiddleware);

router.post(
    "/",
    authorizeAccess(
        MODULE,
        "manage_control_room_all_center",
        "manage_control_room_own_center"
    ),
    createControlRoomValidator,
    createControlRoom
);

router.get(
    "/",
    authorizeAccess(
        MODULE,
        "view_control_room_own_center",
        "view_control_room_all_center"
    ),
    getControlRooms
);

router.get(
    "/:id",
    authorizeAccess(
        MODULE,
        "view_control_room_own_center",
        "view_control_room_all_center"
    ),
    controlRoomIdValidator,
    getControlRoomById
);

router.put(
    "/:id",
    authorizeAccess(
        MODULE,
        "manage_control_room_own_center",
        "manage_control_room_all_center"
    ),
    updateControlRoomValidator,
    updateControlRoom
);

router.delete(
    "/:id",
    authorizeAccess(
        MODULE,
        "manage_control_room_all_center",
        "manage_control_room_own_center"
    ),
    controlRoomIdValidator,
    deleteControlRoom
);

export default router;