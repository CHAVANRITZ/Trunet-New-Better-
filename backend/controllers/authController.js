import User from "../models/User.js";
import {
    login,
    refreshToken,
    logout
} from "../services/authService.js";
import Role from "../models/Role.js";
import Center from "../models/Center.js";
import { hashPassword } from "../utils/password.js";
import { sendSuccess } from "../utils/responseHandler.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Authenticates a user using username and password
 * and returns authentication tokens.
 */
export async function loginController(req, res) {
    const result = await login({
        username: req.body.username,
        password: req.body.password,
        request: req
    });

    return sendSuccess(res, {
        statusCode: 200,
        message: "Login successful.",
        data: result
    });
}

/**
 * Returns the currently authenticated user's profile.
 */
export async function getCurrentUser(req, res) {
    const user = await User.findById(req.user.id)
        .populate("role");

    if (!user) {
        throw new ApiError(
            401,
            "Authenticated user no longer exists."
        );
    }

    if (user.status !== "Enable") {
        throw new ApiError(
            403,
            "User account is disabled."
        );
    }

    return sendSuccess(res, {
        message: "Current user retrieved successfully.",
        data: {
            user
        }
    });
}

/**
 * Exchanges a valid refresh token for a new access token
 * and a rotated refresh token.
 */
export async function refreshTokenController(req, res) {
    const result = await refreshToken(
        req.body.refreshToken
    );

    return sendSuccess(res, {
        statusCode: 200,
        message: "Token refreshed successfully.",
        data: result
    });
}

/**
 * Logs out the current authentication session.
 */
export async function logoutController(req, res) {
    await logout(req.body.refreshToken);

    return sendSuccess(res, {
        statusCode: 200,
        message: "Logout successful."
    });
}

/**
 * Returns a paginated list of users.
 * Never returns password or account lockout fields.
 */
export async function getAllUsers(req, res) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
        100,
        Math.max(1, parseInt(req.query.limit, 10) || 10)
    );

    const skip = (page - 1) * limit;

    const filter = {};

    // Optional filters
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

export async function createUserController(req, res) {
    const {
        fullName,
        username,
        email,
        mobile,
        role,
        center,
        accessibleCenters = [],
        status,
        password
    } = req.body;

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
        $or: [
            { username: normalizedUsername },
            { email: normalizedEmail }
        ]
    });

    if (existingUser) {
        throw new ApiError(
            409,
            "Username or email already exists."
        );
    }

    const selectedRole = await Role.findById(role);

    if (!selectedRole) {
        throw new ApiError(400, "Selected role does not exist.");
    }

    if (selectedRole.isSuperAdmin) {
        throw new ApiError(
            403,
            "You cannot assign the Super Admin role through this endpoint."
        );
    }

    if (center) {
        const centerExists = await Center.exists({ _id: center });

        if (!centerExists) {
            throw new ApiError(400, "Selected center does not exist.");
        }
    }

    if (accessibleCenters.length > 0) {
        const matchingCenters = await Center.countDocuments({
            _id: { $in: accessibleCenters }
        });

        if (matchingCenters !== new Set(accessibleCenters).size) {
            throw new ApiError(
                400,
                "One or more accessible branches do not exist."
            );
        }
    }

    const hashedPassword = await hashPassword(password);

    const user = await User.create({
        fullName: fullName.trim(),
        username: normalizedUsername,
        email: normalizedEmail,
        mobile: mobile || undefined,
        role: selectedRole._id,
        center: center || null,
        accessibleCenters,
        status,
        password: hashedPassword
    });

    const createdUser = await User.findById(user._id)
        .select("-password -loginAttempts -lockUntil")
        .populate("role")
        .populate("center", "centerName centerCode centerType")
        .lean();

    return sendSuccess(res, {
        statusCode: 201,
        message: "User created successfully.",
        data: { user: createdUser }
    });
}


// new yachya mdhe login history add keli ahe fkt
// import User from "../models/User.js";

// import {
//     login,
//     refreshToken,
//     logout
// } from "../services/authService.js";

// import { sendSuccess } from "../utils/responseHandler.js";
// import { ApiError } from "../utils/ApiError.js";

// /**
//  * Authenticates a user using username and password
//  * and returns authentication tokens.
//  */
// export async function loginController(req, res) {
//     const result = await login({
//         username: req.body.username,
//         password: req.body.password
//     });

//     return sendSuccess(res, {
//         statusCode: 200,
//         message: "Login successful.",
//         data: result
//     });
// }

// /**
//  * Returns the currently authenticated user's profile.
//  */
// export async function getCurrentUser(req, res) {
//     const user = await User.findById(req.user.id)
//         .populate("role");

//     if (!user) {
//         throw new ApiError(
//             401,
//             "Authenticated user no longer exists."
//         );
//     }

//     if (user.status !== "Enable") {
//         throw new ApiError(
//             403,
//             "User account is disabled."
//         );
//     }

//     return sendSuccess(res, {
//         message: "Current user retrieved successfully.",
//         data: {
//             user
//         }
//     });
// }

// /**
//  * Exchanges a valid refresh token for a new access token
//  * and a rotated refresh token.
//  */
// export async function refreshTokenController(req, res) {
//     const result = await refreshToken(
//         req.body.refreshToken
//     );

//     return sendSuccess(res, {
//         statusCode: 200,
//         message: "Token refreshed successfully.",
//         data: result
//     });
// }

// /**
//  * Logs out the current authentication session.
//  */
// export async function logoutController(req, res) {
//     await logout(req.body.refreshToken);

//     return sendSuccess(res, {
//         statusCode: 200,
//         message: "Logout successful."
//     });
// }