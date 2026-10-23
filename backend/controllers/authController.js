
import User from "../models/User.js";
import {
    login,
    refreshToken,
    logout,
    selectCenter,
    switchCenter
} from "../services/authService.js";
import Role from "../models/Role.js";
import Center from "../models/Center.js";
import { hashPassword } from "../utils/password.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { isSuperAdmin } from "../utils/checkPermissions.js";

function normalizeId(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    if (typeof value === "object") {
        return value._id ? String(value._id) : null;
    }

    return String(value);
}

function normalizeIdArray(values) {
    if (!Array.isArray(values)) {
        throw new ApiError(400, "Accessible centers must be an array.");
    }

    return [...new Set(values.map(normalizeId).filter(Boolean))];
}

/**
 * POST /api/v1/auth/login
 */
export async function loginController(req, res) {
    const result = await login({
        username: req.body.username,
        password: req.body.password,
        request: req
    });

    const needsCenter = Boolean(result.requiresCenterSelection);

    return res.status(200).json({
        success: true,
        message: needsCenter
            ? "Please select a center to continue."
            : "Login successful.",
        requiresCenterSelection: needsCenter,
        token: result.accessToken,
        data: result
    });
}

/**
 * POST /api/v1/auth/select-center
 */
export async function selectCenterController(req, res) {
    const result = await selectCenter({
        authorizationHeader: req.headers.authorization,
        centerId: req.body?.centerId
    });

    return res.status(200).json({
        success: true,
        message: "Center selected successfully.",
        token: result.accessToken,
        data: result
    });
}

/**
 * POST /api/v1/auth/switch-center
 */
export async function switchCenterController(req, res) {
    const result = await switchCenter({
        userId: req.user.id,
        centerId: req.body?.centerId
    });

    return res.status(200).json({
        success: true,
        message: "Center switched successfully.",
        token: result.accessToken,
        data: result
    });
}

/**
 * GET /api/v1/auth/me
 */
export async function getCurrentUser(req, res) {
    const user = await User.findById(req.user.id)
        .populate("role")
        .populate("center", "centerName centerCode centerType")
        .populate(
            "accessibleCenters",
            "centerName centerCode centerType status"
        );

    if (!user) {
        throw new ApiError(401, "Authenticated user no longer exists.");
    }

    if (user.status !== "Enable") {
        throw new ApiError(403, "User account is disabled.");
    }

    return sendSuccess(res, {
        message: "Current user retrieved successfully.",
        data: { user }
    });
}

/**
 * POST /api/v1/auth/refresh
 */
export async function refreshTokenController(req, res) {
    const result = await refreshToken(req.body.refreshToken);

    return sendSuccess(res, {
        statusCode: 200,
        message: "Token refreshed successfully.",
        data: result
    });
}

/**
 * POST /api/v1/auth/logout
 */
export async function logoutController(req, res) {
    await logout(req.body.refreshToken);

    return sendSuccess(res, {
        statusCode: 200,
        message: "Logout successful."
    });
}

/**
 * GET /api/v1/auth
 */
export async function getAllUsers(req, res) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
        100,
        Math.max(1, parseInt(req.query.limit, 10) || 10)
    );

    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.status) {
        if (!["Enable", "Disable"].includes(req.query.status)) {
            throw new ApiError(400, "Invalid status filter.");
        }

        filter.status = req.query.status;
    }

    if (req.query.search?.trim()) {
        const search = req.query.search.trim();
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        filter.$or = [
            { fullName: { $regex: escapedSearch, $options: "i" } },
            { username: { $regex: escapedSearch, $options: "i" } },
            { email: { $regex: escapedSearch, $options: "i" } },
            { mobile: { $regex: escapedSearch, $options: "i" } }
        ];
    }

    const [users, total] = await Promise.all([
        User.find(filter)
            .select("-password -loginAttempts -lockUntil")
            .populate("role")
            .populate("center", "centerName centerCode centerType")
            .populate(
                "accessibleCenters",
                "centerName centerCode centerType status"
            )
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        User.countDocuments(filter)
    ]);

    return sendSuccess(res, {
        message: "Users retrieved successfully.",
        data: {
            users,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1
            }
        }
    });
}

/**
 * POST /api/v1/auth/register
 */
export async function createUserController(req, res) {
    const {
        fullName,
        username,
        email,
        mobile,
        role,
        center,
        centers,
        accessibleCenters,
        status,
        password
    } = req.body;

    const normalizedUsername = String(username || "")
        .trim()
        .toLowerCase();

    const normalizedEmail = String(email || "")
        .trim()
        .toLowerCase();

    if (!normalizedUsername || !normalizedEmail) {
        throw new ApiError(400, "Username and email are required.");
    }

    const existingUser = await User.findOne({
        $or: [
            { username: normalizedUsername },
            { email: normalizedEmail }
        ]
    });

    if (existingUser) {
        throw new ApiError(409, "Username or email already exists.");
    }

    const selectedRole = await Role.findById(role);

    if (!selectedRole) {
        throw new ApiError(400, "Selected role does not exist.");
    }

    if (selectedRole.isSuperAdmin && !isSuperAdmin(req.user)) {
        throw new ApiError(
            403,
            "You cannot assign the Super Admin role through this endpoint."
        );
    }

    const submittedCenters =
        centers !== undefined
            ? centers
            : accessibleCenters !== undefined
                ? accessibleCenters
                : center
                    ? [center]
                    : [];

    if (!Array.isArray(submittedCenters)) {
        throw new ApiError(400, "Centers must be provided as an array.");
    }

    const centerIds = [
        ...new Set(
            submittedCenters
                .map(value => {
                    if (value && typeof value === "object") {
                        return value._id ? String(value._id) : null;
                    }

                    return value ? String(value) : null;
                })
                .filter(Boolean)
        )
    ];

    if (centerIds.length > 0) {
        const matchingCount = await Center.countDocuments({
            _id: { $in: centerIds }
        });

        if (matchingCount !== centerIds.length) {
            throw new ApiError(
                400,
                "One or more selected branches do not exist."
            );
        }
    }

    const primaryCenterId = center
        ? normalizeId(center)
        : centerIds[0] || null;

    if (primaryCenterId) {
        const primaryExists = await Center.exists({
            _id: primaryCenterId
        });

        if (!primaryExists) {
            throw new ApiError(
                400,
                "Selected primary center does not exist."
            );
        }
    }

    if (!password) {
        throw new ApiError(400, "Password is required.");
    }

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
        fullName: String(fullName || "").trim(),
        username: normalizedUsername,
        email: normalizedEmail,
        mobile: mobile || undefined,
        role: selectedRole._id,
        center: primaryCenterId,
        accessibleCenters: centerIds,
        status: status || "Enable",
        password: hashedPassword
    });

    const createdUser = await User.findById(user._id)
        .select("-password -loginAttempts -lockUntil")
        .populate("role")
        .populate("center", "centerName centerCode centerType")
        .populate(
            "accessibleCenters",
            "centerName centerCode centerType status"
        )
        .lean();

    return sendSuccess(res, {
        statusCode: 201,
        message: "User created successfully.",
        data: { user: createdUser }
    });
}

/**
 * GET /api/v1/auth/user/:id and GET /api/v1/auth/:id
 */
export async function getUserById(req, res) {
    const user = await User.findById(req.params.id)
        .select("-password -loginAttempts -lockUntil")
        .populate("role")
        .populate("center", "centerName centerCode centerType")
        .populate(
            "accessibleCenters",
            "centerName centerCode centerType status"
        )
        .lean();

    if (!user) {
        throw new ApiError(404, "User not found.");
    }

    return sendSuccess(res, {
        statusCode: 200,
        message: "User retrieved successfully.",
        data: { user }
    });
}

/**
 * PUT /api/v1/auth/user/:id and PUT /api/v1/auth/:id
 */
export async function updateUserController(req, res) {
    const user = await User.findById(req.params.id);

    if (!user) {
        throw new ApiError(404, "User not found.");
    }

    const {
        fullName,
        username,
        email,
        mobile,
        role,
        center,
        accessibleCenters,
        status,
        password
    } = req.body;

    const normalizedUsername =
        username !== undefined
            ? String(username).trim().toLowerCase()
            : user.username;

    const normalizedEmail =
        email !== undefined
            ? String(email).trim().toLowerCase()
            : user.email;

    if (!normalizedUsername || !normalizedEmail) {
        throw new ApiError(400, "Username and email are required.");
    }

    if (username !== undefined || email !== undefined) {
        const duplicate = await User.findOne({
            _id: { $ne: user._id },
            $or: [
                { username: normalizedUsername },
                { email: normalizedEmail }
            ]
        });

        if (duplicate) {
            throw new ApiError(409, "Username or email already exists.");
        }

        user.username = normalizedUsername;
        user.email = normalizedEmail;
    }

    if (role !== undefined && role !== null && role !== "") {
        const selectedRole = await Role.findById(normalizeId(role));

        if (!selectedRole) {
            throw new ApiError(400, "Selected role does not exist.");
        }

        if (selectedRole.isSuperAdmin && !isSuperAdmin(req.user)) {
            throw new ApiError(
                403,
                "You cannot assign the Super Admin role through this endpoint."
            );
        }

        user.role = selectedRole._id;
    }

    if (center !== undefined) {
        const centerId = normalizeId(center);

        if (
            centerId &&
            !(await Center.exists({ _id: centerId }))
        ) {
            throw new ApiError(400, "Selected center does not exist.");
        }

        user.center = centerId;
    }

    if (accessibleCenters !== undefined) {
        const centerIds = normalizeIdArray(accessibleCenters);

        if (centerIds.length > 0) {
            const matchingCount = await Center.countDocuments({
                _id: { $in: centerIds }
            });

            if (matchingCount !== centerIds.length) {
                throw new ApiError(
                    400,
                    "One or more accessible branches do not exist."
                );
            }
        }

        user.accessibleCenters = centerIds;
    }

    if (fullName !== undefined) {
        const value = String(fullName).trim();

        if (!value) {
            throw new ApiError(400, "Full name cannot be empty.");
        }

        user.fullName = value;
    }

    if (mobile !== undefined) {
        user.mobile = mobile || undefined;
    }

    if (status !== undefined) {
        if (!["Enable", "Disable"].includes(status)) {
            throw new ApiError(400, "Invalid user status.");
        }

        user.status = status;
    }

    if (password) {
        user.password = await hashPassword(password);
    }

    await user.save();

    const updatedUser = await User.findById(user._id)
        .select("-password -loginAttempts -lockUntil")
        .populate("role")
        .populate("center", "centerName centerCode centerType")
        .populate(
            "accessibleCenters",
            "centerName centerCode centerType status"
        )
        .lean();

    return sendSuccess(res, {
        statusCode: 200,
        message: "User updated successfully.",
        data: { user: updatedUser }
    });
}

/**
 * DELETE /api/v1/auth/user/:id and DELETE /api/v1/auth/:id
 */
export async function deleteUserController(req, res) {
    const { id } = req.params;

    if (String(req.user?.id || req.user?._id) === String(id)) {
        throw new ApiError(400, "You cannot delete your own account.");
    }

    const user = await User.findById(id).populate("role");

    if (!user) {
        throw new ApiError(404, "User not found.");
    }

    const targetIsSuperAdmin = Boolean(
        user.isSuperAdmin ||
        user.role?.isSuperAdmin ||
        String(user.role?.roleTitle || "").trim().toLowerCase() === "superadmin"
    );

    if (targetIsSuperAdmin) {
        if (!isSuperAdmin(req.user)) {
            throw new ApiError(
                403,
                "Only a Super Admin can delete a Super Admin account."
            );
        }

        const superRoleIds = await Role.find({
            isSuperAdmin: true
        }).distinct("_id");

        const remaining = await User.countDocuments({
            _id: { $ne: user._id },
            $or: [
                { role: { $in: superRoleIds } },
                { isSuperAdmin: true }
            ]
        });

        if (remaining === 0) {
            throw new ApiError(
                400,
                "You cannot delete the last Super Admin."
            );
        }
    }

    await User.deleteOne({ _id: user._id });

    return sendSuccess(res, {
        statusCode: 200,
        message: "User deleted successfully.",
        data: {}
    });
}
