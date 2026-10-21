import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_PAGE = 1_000_000;
const MAX_SEARCH_LENGTH = 150;

function parsePositiveInteger(
    value,
    fallback,
    max = Number.MAX_SAFE_INTEGER
) {
    const parsed = Number.parseInt(value, 10);

    return Number.isInteger(parsed) && parsed > 0
        ? Math.min(parsed, max)
        : fallback;
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function buildDateFilter(fromValue, toValue) {
    const dateRange = {};

    if (fromValue !== undefined) {
        const from = validDate(fromValue);

        if (!from) {
            return {
                error: "'from' must be a valid date."
            };
        }

        dateRange.$gte = from;
    }

    if (toValue !== undefined) {
        const to = validDate(toValue);

        if (!to) {
            return {
                error: "'to' must be a valid date."
            };
        }

        dateRange.$lte = to;
    }

    if (
        dateRange.$gte &&
        dateRange.$lte &&
        dateRange.$gte > dateRange.$lte
    ) {
        return {
            error: "'from' date must be before or equal to 'to' date."
        };
    }

    return { dateRange };
}

function buildSearchFilter(value) {
    const search = String(value ?? "")
        .trim()
        .slice(0, MAX_SEARCH_LENGTH);

    if (!search) {
        return null;
    }

    const regex = new RegExp(escapeRegex(search), "i");

    return {
        $or: [
            { action: regex },
            { entity: regex },
            { entityType: regex },
            { details: regex },
            { reason: regex },
            { ipAddress: regex },
            { userAgent: regex },
            { status: regex },
            { errorMessage: regex },
            { performedBy: regex }
        ]
    };
}

export async function getAuditLogs(req, res, next) {
    const requestStartedAt = Date.now();
    const requestId = `audit-${requestStartedAt}-${Math.random()
        .toString(36)
        .slice(2, 7)}`;

    const logTiming = (step, startedAt, extra = {}) => {
        console.info("[AuditLogs timing]", {
            requestId,
            step,
            durationMs: Date.now() - startedAt,
            ...extra
        });
    };

    try {
        const parseStartedAt = Date.now();

        const page = parsePositiveInteger(
            req.query.page,
            1,
            MAX_PAGE
        );

        const limit = parsePositiveInteger(
            req.query.limit,
            DEFAULT_LIMIT,
            MAX_LIMIT
        );

        const skip = (page - 1) * limit;

        const allowedSortFields = new Set([
            "timestamp",
            "createdAt",
            "action",
            "entity",
            "entityType",
            "status"
        ]);

        const requestedSort = String(
            req.query.sortBy || "timestamp"
        );

        const sortBy = allowedSortFields.has(requestedSort)
            ? requestedSort
            : "timestamp";

        const sortOrder =
            String(
                req.query.sortOrder ||
                req.query.order ||
                "desc"
            ).toLowerCase() === "asc"
                ? 1
                : -1;

        const filter = {};

        for (const field of [
            "action",
            "entity",
            "entityType",
            "status"
        ]) {
            const value = req.query[field];

            if (
                value !== undefined &&
                String(value).trim()
            ) {
                filter[field] = String(value).trim();
            }
        }

        if (req.query.userId) {
            if (
                !mongoose.isValidObjectId(
                    String(req.query.userId)
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid userId filter."
                });
            }

            filter.user = new mongoose.Types.ObjectId(
                String(req.query.userId)
            );
        }

        if (
            req.query.from !== undefined ||
            req.query.to !== undefined
        ) {
            const result = buildDateFilter(
                req.query.from,
                req.query.to
            );

            if (result.error) {
                return res.status(400).json({
                    success: false,
                    message: result.error
                });
            }

            filter.timestamp = result.dateRange;
        }

        const searchFilter = buildSearchFilter(
            req.query.search
        );

        if (searchFilter) {
            filter.$and = [
                ...(filter.$and || []),
                searchFilter
            ];
        }

        const sort = {
            [sortBy]: sortOrder,
            _id: -1
        };

        logTiming("parse-and-build-filter", parseStartedAt, {
            page,
            limit,
            sortBy,
            sortOrder,
            hasSearch: Boolean(req.query.search)
        });

        // Query only the current page before performing user lookups.
        const pipeline = [
            { $match: filter },
            { $sort: sort },
            { $skip: skip },
            { $limit: limit },

            {
                $addFields: {
                    _userObjectId: {
                        $convert: {
                            input: "$user",
                            to: "objectId",
                            onError: null,
                            onNull: null
                        }
                    },
                    _performedByObjectId: {
                        $convert: {
                            input: "$performedBy",
                            to: "objectId",
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },

            {
                $lookup: {
                    from: "users",
                    localField: "_userObjectId",
                    foreignField: "_id",
                    pipeline: [
                        {
                            $project: {
                                fullName: 1,
                                username: 1,
                                email: 1
                            }
                        }
                    ],
                    as: "_userDetails"
                }
            },

            {
                $lookup: {
                    from: "users",
                    localField: "_performedByObjectId",
                    foreignField: "_id",
                    pipeline: [
                        {
                            $project: {
                                fullName: 1,
                                username: 1,
                                email: 1
                            }
                        }
                    ],
                    as: "_performedByDetails"
                }
            },

            {
                $addFields: {
                    user: {
                        $cond: [
                            {
                                $ne: [
                                    "$_userObjectId",
                                    null
                                ]
                            },
                            {
                                $ifNull: [
                                    {
                                        $arrayElemAt: [
                                            "$_userDetails",
                                            0
                                        ]
                                    },
                                    "$user"
                                ]
                            },
                            "$user"
                        ]
                    },

                    performedBy: {
                        $cond: [
                            {
                                $ne: [
                                    "$_performedByObjectId",
                                    null
                                ]
                            },
                            {
                                $ifNull: [
                                    {
                                        $arrayElemAt: [
                                            "$_performedByDetails",
                                            0
                                        ]
                                    },
                                    "$performedBy"
                                ]
                            },
                            "$performedBy"
                        ]
                    }
                }
            },

            {
                $project: {
                    _userObjectId: 0,
                    _performedByObjectId: 0,
                    _userDetails: 0,
                    _performedByDetails: 0
                }
            }
        ];

        // Time the records query separately.
        const recordsStartedAt = Date.now();

        const logs = await AuditLog.aggregate(pipeline)
            .option({ maxTimeMS: 15000 })
            .exec();

        logTiming("aggregate-query", recordsStartedAt, {
            returnedRecords: logs.length
        });

        // Count separately so a slow count can be identified.
        const countStartedAt = Date.now();

        const total = await AuditLog.countDocuments(filter)
            .maxTimeMS(10000)
            .exec();

        logTiming("count-query", countStartedAt, {
            totalRecords: total
        });

        const response = {
            success: true,
            message: "Audit logs retrieved successfully.",
            data: logs,
            pagination: {
                currentPage: page,
                itemsPerPage: limit,
                totalRecords: total,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPrevPage: page > 1
            }
        };

        logTiming("request-complete", requestStartedAt);

        return res.status(200).json(response);
    } catch (error) {
        logTiming("request-error", requestStartedAt, {
            errorName: error.name,
            errorMessage: error.message
        });

        console.error(
            "[AuditLogs] Failed to retrieve audit logs:",
            error
        );

        return next(error);
    }
}