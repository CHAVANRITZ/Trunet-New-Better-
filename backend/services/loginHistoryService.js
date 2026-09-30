import LoginHistory from "../models/LoginHistory.js";

function getClientIP(req) {
    const forwarded = req.headers["x-forwarded-for"];

    if (forwarded) {
        const clientIP = forwarded
            .split(",")[0]
            .trim();

        return clientIP === "::1"
            ? "127.0.0.1"
            : clientIP;
    }

    const realIP = req.headers["x-real-ip"];

    if (realIP) {
        return realIP === "::1"
            ? "127.0.0.1"
            : realIP;
    }

    const remoteAddress =
        req.socket?.remoteAddress ||
        req.connection?.remoteAddress ||
        req.connection?.socket?.remoteAddress;

    if (!remoteAddress) {
        return "Unknown";
    }

    if (remoteAddress === "::1") {
        return "127.0.0.1";
    }

    if (remoteAddress.startsWith("::ffff:")) {
        return remoteAddress.substring(7);
    }

    return remoteAddress;
}

function getBrowserInfo(userAgent) {
    if (!userAgent) {
        return "Unknown";
    }

    let browser = "Unknown";
    let version = "";

    if (
        userAgent.includes("Chrome") &&
        !userAgent.includes("Edg") &&
        !userAgent.includes("OPR")
    ) {
        browser = "Chrome";

        const match = userAgent.match(
            /Chrome\/([0-9.]+)/
        );

        version = match ? match[1] : "";
    } else if (userAgent.includes("Edg")) {
        browser = "Edge";

        const match = userAgent.match(
            /Edg\/([0-9.]+)/
        );

        version = match ? match[1] : "";
    } else if (userAgent.includes("Firefox")) {
        browser = "Firefox";

        const match = userAgent.match(
            /Firefox\/([0-9.]+)/
        );

        version = match ? match[1] : "";
    } else if (
        userAgent.includes("Safari") &&
        !userAgent.includes("Chrome")
    ) {
        browser = "Safari";

        const match = userAgent.match(
            /Version\/([0-9.]+)/
        );

        version = match ? match[1] : "";
    } else if (userAgent.includes("OPR")) {
        browser = "Opera";

        const match = userAgent.match(
            /OPR\/([0-9.]+)/
        );

        version = match ? match[1] : "";
    }

    if (!version) {
        return browser;
    }

    const versionParts = version.split(".");

    const majorVersion = versionParts
        .slice(0, 2)
        .join(".");

    return `${browser} ${majorVersion}`;
}

/**
 * Records the latest login information for a user.
 *
 * Preserves the old backend behavior:
 * one LoginHistory document per user,
 * updated on every successful login.
 */
export async function recordLoginHistory(user, req) {
    const browser = getBrowserInfo(
        req.headers["user-agent"]
    );

    const ip = getClientIP(req);

    return LoginHistory.findOneAndUpdate(
        {
            user: user._id
        },
        {
            user: user._id,
            name: user.fullName,
            email: user.email,
            browser,
            ip,
            date: new Date()
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
        }
    );
}

/**
 * Fetches login history with pagination
 * and optional user filtering.
 */
export async function getLoginHistory({
    page = 1,
    limit = 50,
    userId
} = {}) {
    const pageNumber = Number.parseInt(
        page,
        10
    );

    const limitNumber = Number.parseInt(
        limit,
        10
    );

    const safePage =
        Number.isInteger(pageNumber) &&
        pageNumber > 0
            ? pageNumber
            : 1;

    const safeLimit =
        Number.isInteger(limitNumber) &&
        limitNumber > 0
            ? limitNumber
            : 50;

    const filter = {};

    if (userId) {
        filter.user = userId;
    }

    const skip =
        (safePage - 1) * safeLimit;

    const [
        loginHistory,
        totalRecords
    ] = await Promise.all([
        LoginHistory.find(filter)
            .populate(
                "user",
                "fullName username email mobile status"
            )
            .sort({
                date: -1
            })
            .skip(skip)
            .limit(safeLimit)
            .lean(),

        LoginHistory.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(
        totalRecords / safeLimit
    );

    const formattedHistory =
        loginHistory.map((record) => ({
            _id: record._id,

            user: record.user
                ? {
                      _id: record.user._id,
                      fullName:
                          record.user.fullName,
                      username:
                          record.user.username,
                      email:
                          record.user.email,
                      mobile:
                          record.user.mobile,
                      status:
                          record.user.status
                  }
                : {
                      fullName:
                          record.name,
                      email:
                          record.email
                  },

            browser: record.browser,
            ip: record.ip,
            date: record.date
        }));

    return {
        loginHistory:
            formattedHistory,

        pagination: {
            currentPage: safePage,
            totalPages,
            totalRecords,

            hasNextPage:
                safePage < totalPages,

            hasPrevPage:
                safePage > 1
        }
    };
}

/**
 * Deletes login history belonging
 * to a specific user.
 *
 * Used when a user is deleted.
 */
export async function deleteLoginHistoryByUser(
    userId
) {
    return LoginHistory.deleteMany({
        user: userId
    });
}