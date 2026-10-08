import {
    createControlRoomService,
    getControlRoomsService,
    getControlRoomByIdService,
    updateControlRoomService,
    deleteControlRoomService,
} from "../services/controlRoomService.js";

export const createControlRoom = async (req, res) => {
    try {
        const controlRoom =
            await createControlRoomService(
                req.user,
                req.body
            );

        return res.status(201).json({
            success: true,
            data: controlRoom,
        });
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: Object.values(
                    error.errors
                ).map((err) => err.message),
            });
        }

        if (error.statusCode) {
            return res
                .status(error.statusCode)
                .json({
                    success: false,
                    message: error.message,
                });
        }

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const getControlRooms = async (req, res) => {
    try {
        const result =
            await getControlRoomsService(
                req.user,
                req.query
            );

        return res.status(200).json({
            success: true,
            data: result.data,
            pagination: result.pagination,
        });
    } catch (error) {
        if (error.statusCode) {
            return res
                .status(error.statusCode)
                .json({
                    success: false,
                    message: error.message,
                });
        }

        return res.status(500).json({
            success: false,
            message: "Error fetching control rooms",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : "Internal server error",
        });
    }
};

export const getControlRoomById = async (req, res) => {
    try {
        const controlRoom =
            await getControlRoomByIdService(
                req.user,
                req.params.id
            );

        return res.status(200).json({
            success: true,
            data: controlRoom,
        });
    } catch (error) {
        if (error.statusCode) {
            return res
                .status(error.statusCode)
                .json({
                    success: false,
                    message: error.message,
                });
        }

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const updateControlRoom = async (req, res) => {
    try {
        const controlRoom =
            await updateControlRoomService(
                req.user,
                req.params.id,
                req.body
            );

        return res.status(200).json({
            success: true,
            data: controlRoom,
        });
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: "Validation error",
                errors: Object.values(
                    error.errors
                ).map((err) => err.message),
            });
        }

        if (error.statusCode) {
            return res
                .status(error.statusCode)
                .json({
                    success: false,
                    message: error.message,
                });
        }

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const deleteControlRoom = async (req, res) => {
    try {
        const result =
            await deleteControlRoomService(
                req.user,
                req.params.id
            );

        return res.status(200).json({
            success: true,
            message: result.message,
        });
    } catch (error) {
        if (error.statusCode) {
            return res
                .status(error.statusCode)
                .json({
                    success: false,
                    message: error.message,
                });
        }

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};