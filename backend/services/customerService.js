import mongoose from "mongoose";
import csv from "csv-parser";
import stream from "stream";
import Customer from "../models/Customer.js";
import Center from "../models/Center.js";

/**
 * Parse a CSV buffer using the existing
 * project CSV implementation.
 */
const parseCSVBuffer = (buffer) =>
    new Promise((resolve, reject) => {
        const rows = [];

        const readableStream =
            new stream.Readable();

        readableStream._read = () => {};

        readableStream.push(buffer);
        readableStream.push(null);

        readableStream
            .pipe(csv())
            .on("data", (row) => {
                rows.push(row);
            })
            .on("end", () => {
                resolve(rows);
            })
            .on("error", (error) => {
                reject(error);
            });
    });

const MODULE = "Customer";

/**
 * Get normalized permissions for the Customer module.
 *
 * New auth middleware provides:
 * req.user.role.permissions
 *
 * Legacy Customer permissions are preserved exactly.
 */
const getCustomerPermissions = (user) => {
    const permissions = user?.role?.permissions || [];

    return permissions.find(
        (permission) =>
            permission?.module?.toLowerCase() ===
            MODULE.toLowerCase()
    );
};

/**
 * Check whether user has a specific Customer permission.
 */
const hasCustomerPermission = (
    user,
    permission
) => {
    const modulePermissions =
        getCustomerPermissions(user);

    return !!modulePermissions?.permissions?.includes(
        permission
    );
};

/**
 * Get the user's operational center.
 *
 * New auth stores the complete User document
 * in req.user.fullUser.
 *
 * selectedCenterId is used when a center-selection
 * token exists.
 */
const getUserCenterId = (user) => {
    if (user?.selectedCenterId) {
        return user.selectedCenterId;
    }

    if (user?.fullUser?.center) {
        return (
            user.fullUser.center?._id ||
            user.fullUser.center
        );
    }

    return null;
};

/**
 * Check whether user has Super Admin access.
 *
 * New authorization middleware already handles
 * Super Admin at route level. This helper exists
 * only for service-level compatibility.
 */
const isSuperAdmin = (user) => {
    return Boolean(
        user?.role?.isSuperAdmin === true
    );
};

/**
 * Ensure user has at least one of the
 * supplied Customer permissions.
 */
const requireCustomerPermission = (
    user,
    permissions,
    message
) => {
    if (isSuperAdmin(user)) {
        return;
    }

    const hasPermission = permissions.some(
        (permission) =>
            hasCustomerPermission(
                user,
                permission
            )
    );

    if (!hasPermission) {
        const error = new Error(message);
        error.statusCode = 403;
        throw error;
    }
};

/**
 * Build the Customer center population
 * used by the legacy API.
 */
const customerCenterPopulate = {
    path: "center",
    select: "centerName centerType area reseller",
    populate: [
        {
            path: "reseller",
            select: "businessName",
        },
        {
            path: "area",
            select: "areaName",
        },
    ],
};

/**
 * Create Customer.
 */
export const createCustomer = async (
    data,
    user
) => {
    requireCustomerPermission(
        user,
        [
            "manage_customer_all_center",
            "manage_customer_own_center",
        ],
        "Access denied. manage_customer_own_center or manage_customer_all_center permission required."
    );

    const {
        username,
        name,
        mobile,
        email,
        center,
        address1,
        address2,
        city,
        state,
    } = data;

    // Legacy API uses `center`, while the service internally
    // works with `centerId`.
    const centerId = center;

    const hasManageAll =
        isSuperAdmin(user) ||
        hasCustomerPermission(
            user,
            "manage_customer_all_center"
        );

    const hasManageOwn =
        hasCustomerPermission(
            user,
            "manage_customer_own_center"
        );

    const userCenterId =
        getUserCenterId(user);

    if (
        !hasManageAll &&
        hasManageOwn &&
        userCenterId
    ) {
        if (
            !centerId ||
            userCenterId.toString() !==
                centerId.toString()
        ) {
            const error = new Error(
                "Access denied. You can only create customers in your own center."
            );

            error.statusCode = 403;
            throw error;
        }
    }

    const centerDocument =
        await Center.findById(centerId);

    if (!centerDocument) {
        const error = new Error(
            "Center not found"
        );

        error.statusCode = 404;
        throw error;
    }

    const existingCustomer =
        await Customer.findOne({
            username,
        });

    if (existingCustomer) {
        const error = new Error(
            "Username already exists. Please choose a different username."
        );

        error.statusCode = 400;
        error.field = "username";
        error.value = username;

        throw error;
    }

    const customer =
        new Customer({
            username,
            name,
            mobile,
            email,
            center: centerId,
            address1,
            address2,
            city,
            state,
        });

    try {
        return await customer.save();
    } catch (error) {
        if (
            error.code === 11000 &&
            error.keyPattern?.username
        ) {
            const duplicateValue =
                error.keyValue?.username ||
                username;

            const duplicateError =
                new Error(
                    `Username "${duplicateValue}" is already taken. Please choose a different username.`
                );

            duplicateError.statusCode = 400;
            duplicateError.field = "username";
            duplicateError.value =
                duplicateValue;

            throw duplicateError;
        }

        if (
            error.name ===
            "ValidationError"
        ) {
            const validationError =
                new Error(
                    "Validation error"
                );

            validationError.statusCode = 400;
            validationError.errors =
                Object.values(
                    error.errors
                ).map(
                    (err) => err.message
                );

            throw validationError;
        }

        throw error;
    }
};

/**
 * Build Customer listing filter.
 */
const buildCustomerFilter = (
    query,
    user
) => {
    const {
        search,
        center,
    } = query;

    const filter = {};

    const hasViewAll =
        isSuperAdmin(user) ||
        hasCustomerPermission(
            user,
            "view_customer_all_center"
        );

    const hasViewOwn =
        hasCustomerPermission(
            user,
            "view_customer_own_center"
        );

    if (
        !hasViewAll &&
        hasViewOwn
    ) {
        const userCenterId =
            getUserCenterId(user);

        if (userCenterId) {
            filter.center =
                userCenterId;
        }
    } else if (center) {
        filter.center = center;
    }

    if (search) {
        filter.$or = [
            {
                username: {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                name: {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                mobile: {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                email: {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                city: {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                state: {
                    $regex: search,
                    $options: "i",
                },
            },
        ];
    }

    return filter;
};

/**
 * Get Customers with pagination.
 */
export const getCustomers = async (
    query,
    user
) => {
    requireCustomerPermission(
        user,
        [
            "view_customer_own_center",
            "view_customer_all_center",
        ],
        "Access denied. view_customer_own_center or view_customer_all_center permission required."
    );

    const {
        page = 1,
        limit = 100,
        sortBy = "createdAt",
        sortOrder = "desc",
    } = query;

    const filter =
        buildCustomerFilter(
            query,
            user
        );

    const skip =
        (Number(page) - 1) *
        Number(limit);

    const sort = {
        [sortBy]:
            sortOrder === "desc"
                ? -1
                : 1,
    };

    const [
        customers,
        totalCustomers,
    ] = await Promise.all([
        Customer.find(filter)
            .populate(
                customerCenterPopulate
            )
            .sort(sort)
            .skip(skip)
            .limit(Number(limit))
            .select("-__v"),

        Customer.countDocuments(filter),
    ]);

    return {
        customers,
        pagination: {
            currentPage: Number(page),
            totalPages: Math.ceil(
                totalCustomers /
                    Number(limit)
            ),
            totalCustomers,
            itemsPerPage: Number(limit),
        },
    };
};

/**
 * Get all Customers without pagination.
 */
export const getCustomersWithoutPagination =
    async (
        query,
        user
    ) => {
        requireCustomerPermission(
            user,
            [
                "view_customer_own_center",
                "view_customer_all_center",
            ],
            "Access denied. view_customer_own_center or view_customer_all_center permission required."
        );

        const {
            sortBy = "createdAt",
            sortOrder = "desc",
        } = query;

        const filter =
            buildCustomerFilter(
                query,
                user
            );

        const sort = {
            [sortBy]:
                sortOrder === "desc"
                    ? -1
                    : 1,
        };

        const customers =
            await Customer.find(filter)
                .populate(
                    customerCenterPopulate
                )
                .sort(sort)
                .select("-__v");

        return {
            customers,
            totalCustomers:
                customers.length,
        };
    };

/**
 * Get Customer by ID.
 */
export const getCustomerById = async (
    customerId,
    user
) => {
    const customer =
        await Customer.findById(
            customerId
        ).populate({
            path: "center",
            populate: [
                {
                    path: "reseller",
                    select: "businessName",
                },
                {
                    path: "area",
                    select: "areaName",
                },
            ],
        });

    if (!customer) {
        const error = new Error(
            "Customer not found"
        );

        error.statusCode = 404;
        throw error;
    }

    requireCustomerPermission(
        user,
        [
            "view_customer_own_center",
            "view_customer_all_center",
        ],
        "Access denied. view_customer_own_center or view_customer_all_center permission required."
    );

    const hasViewAll =
        isSuperAdmin(user) ||
        hasCustomerPermission(
            user,
            "view_customer_all_center"
        );

    const hasViewOwn =
        hasCustomerPermission(
            user,
            "view_customer_own_center"
        );

    if (
        !hasViewAll &&
        hasViewOwn
    ) {
        const userCenterId =
            getUserCenterId(user);

        if (
            userCenterId &&
            customer.center?._id
                ?.toString() !==
                userCenterId.toString()
        ) {
            const error = new Error(
                "Access denied. You can only view customers in your own center."
            );

            error.statusCode = 403;
            throw error;
        }
    }

    return customer;
};

/**
 * Update Customer.
 */
export const updateCustomer = async (
    customerId,
    data,
    user
) => {
    const customer =
        await Customer.findById(
            customerId
        );

    if (!customer) {
        const error = new Error(
            "Customer not found"
        );

        error.statusCode = 404;
        throw error;
    }

    requireCustomerPermission(
        user,
        [
            "manage_customer_all_center",
            "manage_customer_own_center",
        ],
        "Access denied. manage_customer_own_center or manage_customer_all_center permission required."
    );

    const hasManageAll =
        isSuperAdmin(user) ||
        hasCustomerPermission(
            user,
            "manage_customer_all_center"
        );

    const hasManageOwn =
        hasCustomerPermission(
            user,
            "manage_customer_own_center"
        );

    const userCenterId =
        getUserCenterId(user);

    if (
        !hasManageAll &&
        hasManageOwn &&
        userCenterId &&
        customer.center?.toString() !==
            userCenterId.toString()
    ) {
        const error = new Error(
            "Access denied. You can only manage customers in your own center."
        );

        error.statusCode = 403;
        throw error;
    }

    if (data.centerId) {
        if (
            !hasManageAll &&
            hasManageOwn &&
            userCenterId &&
            data.centerId.toString() !==
                userCenterId.toString()
        ) {
            const error = new Error(
                "Access denied. You can only assign customers to your own center."
            );

            error.statusCode = 403;
            throw error;
        }

        const center =
            await Center.findById(
                data.centerId
            );

        if (!center) {
            const error = new Error(
                "Center not found"
            );

            error.statusCode = 404;
            throw error;
        }
    }

    if (
        data.username &&
        data.username !==
            customer.username
    ) {
        const existingCustomer =
            await Customer.findOne({
                username: data.username,
                _id: {
                    $ne: customerId,
                },
            });

        if (existingCustomer) {
            const error = new Error(
                `Username "${data.username}" is already taken. Please choose a different username.`
            );

            error.statusCode = 400;
            throw error;
        }
    }

    const updateData = {
        ...data,
    };

    if (data.centerId) {
        updateData.center =
            data.centerId;

        delete updateData.centerId;
    }

    try {
        const updatedCustomer =
            await Customer.findByIdAndUpdate(
                customerId,
                updateData,
                {
                    new: true,
                    runValidators: true,
                }
            ).populate({
                path: "center",
                populate: [
                    {
                        path: "reseller",
                        select: "businessName",
                    },
                    {
                        path: "area",
                        select: "areaName",
                    },
                ],
            });

        return updatedCustomer;
    } catch (error) {
        if (
            error.code === 11000 &&
            error.keyPattern?.username
        ) {
            const duplicateValue =
                error.keyValue?.username ||
                data.username;

            const duplicateError =
                new Error(
                    `Username "${duplicateValue}" is already taken. Please choose a different username.`
                );

            duplicateError.statusCode = 400;
            duplicateError.field = "username";
            duplicateError.value =
                duplicateValue;

            throw duplicateError;
        }

        if (
            error.name ===
            "ValidationError"
        ) {
            const validationError =
                new Error(
                    "Validation error"
                );

            validationError.statusCode = 400;
            validationError.errors =
                Object.values(
                    error.errors
                ).map(
                    (err) => err.message
                );

            throw validationError;
        }

        throw error;
    }
};

/**
 * Delete Customer.
 */
export const deleteCustomer = async (
    customerId,
    user
) => {
    const customer =
        await Customer.findById(
            customerId
        );

    if (!customer) {
        const error = new Error(
            "Customer not found"
        );

        error.statusCode = 404;
        throw error;
    }

    requireCustomerPermission(
        user,
        [
            "manage_customer_all_center",
            "manage_customer_own_center",
        ],
        "Access denied. manage_customer_own_center or manage_customer_all_center permission required."
    );

    const hasManageAll =
        isSuperAdmin(user) ||
        hasCustomerPermission(
            user,
            "manage_customer_all_center"
        );

    const hasManageOwn =
        hasCustomerPermission(
            user,
            "manage_customer_own_center"
        );

    const userCenterId =
        getUserCenterId(user);

    if (
        !hasManageAll &&
        hasManageOwn &&
        userCenterId &&
        customer.center?.toString() !==
            userCenterId.toString()
    ) {
        const error = new Error(
            "Access denied. You can only delete customers in your own center."
        );

        error.statusCode = 403;
        throw error;
    }

    await Customer.findByIdAndDelete(
        customerId
    );

    return true;
};

/**
 * Import Customers from CSV.
 *
 * Uses the existing project's
 * csv-parser + memory buffer approach.
 */
export const importCustomers = async (
    file
) => {
    if (!file) {
        const error = new Error(
            "No file uploaded. Please upload a CSV file."
        );

        error.statusCode = 400;
        throw error;
    }

    const fileName =
        file.originalname || "";

    const mimeType =
        file.mimetype || "";

    if (
        mimeType !== "text/csv" &&
        !fileName
            .toLowerCase()
            .endsWith(".csv")
    ) {
        const error = new Error(
            "Invalid file type. Please upload CSV (.csv) file only."
        );

        error.statusCode = 400;
        throw error;
    }

    let customersData = [];

    try {
        customersData =
            await parseCSVBuffer(
                file.buffer
            );
    } catch (error) {
        const importError = new Error(
            "Error reading CSV file. Please ensure it's a valid CSV file."
        );

        importError.statusCode = 400;
        importError.details =
            error.message;

        throw importError;
    }

    if (!customersData.length) {
        const error = new Error(
            "The file appears to be empty or has no valid data rows."
        );

        error.statusCode = 400;
        throw error;
    }

    const firstRow =
        customersData[0] || {};

    const centerField =
        Object.prototype.hasOwnProperty.call(
            firstRow,
            "center"
        )
            ? "center"
            : Object.prototype.hasOwnProperty.call(
                  firstRow,
                  "center_title"
              )
            ? "center_title"
            : null;

    if (!centerField) {
        const error = new Error(
            "Required field missing. CSV must contain a 'center' or 'center_title' column."
        );

        error.statusCode = 400;

        error.requiredFormat = [
            "center",
            "username",
            "name",
            "mobile",
            "email",
            "address1",
            "address2",
            "city",
            "state",
        ];

        error.note =
            "Center can be specified using Center ID, Center Name, or Center Code.";

        throw error;
    }

    if (
        !firstRow[centerField] ||
        !firstRow.username
    ) {
        const error = new Error(
            "Required fields missing. Each row must contain at least 'center' and 'username'."
        );

        error.statusCode = 400;

        error.requiredFormat = [
            centerField,
            "username",
        ];

        throw error;
    }

    /**
     * Center cache.
     */
    const centerCache =
        new Map();

    const findCenter = async (
        centerValue
    ) => {
        if (!centerValue) {
            return null;
        }

        const normalized =
            centerValue
                .toString()
                .trim();

        if (!normalized) {
            return null;
        }

        const cacheKey =
            normalized.toLowerCase();

        if (
            centerCache.has(
                cacheKey
            )
        ) {
            return centerCache.get(
                cacheKey
            );
        }

        let center = null;

        const escapedValue =
            normalized.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );

        if (
            mongoose.Types.ObjectId.isValid(
                normalized
            )
        ) {
            center =
                await Center.findOne({
                    _id: normalized,
                    status: "Enable",
                });
        }

        if (!center) {
            center =
                await Center.findOne({
                    centerName: {
                        $regex:
                            `^${escapedValue}$`,
                        $options: "i",
                    },
                    status: "Enable",
                });
        }

        if (!center) {
            center =
                await Center.findOne({
                    centerName: {
                        $regex:
                            escapedValue,
                        $options: "i",
                    },
                    status: "Enable",
                });
        }

        if (!center) {
            center =
                await Center.findOne({
                    centerCode: {
                        $regex:
                            `^${escapedValue}$`,
                        $options: "i",
                    },
                    status: "Enable",
                });
        }

        centerCache.set(
            cacheKey,
            center
        );

        return center;
    };

    /**
     * Normalize mobile number.
     */
    const normalizeMobile = (
        mobile
    ) => {
        if (
            mobile === undefined ||
            mobile === null ||
            mobile
                .toString()
                .trim() === ""
        ) {
            return "0000000000";
        }

        let digits =
            mobile
                .toString()
                .replace(
                    /\D/g,
                    ""
                );

        if (!digits) {
            return "0000000000";
        }

        if (digits.length === 10) {
            return digits;
        }

        if (digits.length < 10) {
            return digits.padEnd(
                10,
                "0"
            );
        }

        return digits.substring(
            0,
            10
        );
    };

    /**
     * Validate email.
     */
    const isValidEmail = (
        email
    ) => {
        return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(
            email
        );
    };

    /**
     * Normalize email.
     */
    const normalizeEmail = (
        email
    ) => {
        if (!email) {
            return "";
        }

        let normalized =
            email
                .toString()
                .trim();

        normalized =
            normalized.replace(
                /^(e-mail|email|mail)\s*[:\-]?\s*/i,
                ""
            );

        normalized =
            normalized.replace(
                /\s+/g,
                ""
            );

        normalized =
            normalized.replace(
                /@gmail\.con$/i,
                "@gmail.com"
            );

        normalized =
            normalized.replace(
                /@gmail\.co$/i,
                "@gmail.com"
            );

        normalized =
            normalized.replace(
                /@rediffmail\.con$/i,
                "@rediffmail.com"
            );

        normalized =
            normalized.replace(
                /@yahoo\.con$/i,
                "@yahoo.com"
            );

        return normalized;
    };

    /**
     * Generate a unique fallback email.
     */
    const generateUniqueEmail = async (
        username,
        index
    ) => {
        const baseEmail =
            `${username}@example.com`;

        let emailExists =
            await Customer.exists({
                email: baseEmail,
            });

        if (!emailExists) {
            return baseEmail;
        }

        let counter = 1;

        while (emailExists) {
            const generatedEmail =
                `${username}${Date.now()}${index}${counter}@example.com`;

            emailExists =
                await Customer.exists({
                    email: generatedEmail,
                });

            if (!emailExists) {
                return generatedEmail;
            }

            counter++;
        }
    };

    /**
     * Prepare existing username lookup.
     */
    let existingUsernames =
        null;

    if (
        customersData.length > 1000
    ) {
        const existingCustomers =
            await Customer.find({})
                .select("username")
                .lean();

        existingUsernames =
            new Set(
                existingCustomers.map(
                    (customer) =>
                        customer.username
                )
            );
    }

    const errors = [];

    const processedUsernames =
        new Set();

    let successCount = 0;
    let failedCount = 0;

    const invalidEmailRows = [];
    const defaultMobileRows = [];

    /**
     * Process every CSV row independently.
     */
    for (
        let index = 0;
        index < customersData.length;
        index++
    ) {
        const row =
            customersData[index];

        const rowNumber =
            index + 2;

        try {
            const username =
                row.username
                    ?.toString()
                    .trim();

            const centerValue =
                row.center ||
                row.center_title;

            const centerInput =
                centerValue
                    ?.toString()
                    .trim();

            const name =
                row.name
                    ?.toString()
                    .trim();

            const address1 =
                row.address1
                    ?.toString()
                    .trim();

            const address2 =
                row.address2
                    ?.toString()
                    .trim();

            const city =
                row.city
                    ?.toString()
                    .trim();

            const state =
                row.state
                    ?.toString()
                    .trim();

            if (!username) {
                errors.push({
                    row: rowNumber,
                    username: "",
                    error:
                        "Username is required.",
                });

                failedCount++;
                continue;
            }

            if (!centerInput) {
                errors.push({
                    row: rowNumber,
                    username,
                    error:
                        "Center is required.",
                });

                failedCount++;
                continue;
            }

            if (
                processedUsernames.has(
                    username
                )
            ) {
                errors.push({
                    row: rowNumber,
                    username,
                    error:
                        "Duplicate username found in the import file.",
                });

                failedCount++;
                continue;
            }

            let usernameExists;

            if (existingUsernames) {
                usernameExists =
                    existingUsernames.has(
                        username
                    );
            } else {
                usernameExists =
                    await Customer.exists({
                        username,
                    });
            }

            if (usernameExists) {
                errors.push({
                    row: rowNumber,
                    username,
                    error:
                        "Username already exists.",
                });

                failedCount++;
                continue;
            }

            const center =
                await findCenter(
                    centerInput
                );

            if (!center) {
                errors.push({
                    row: rowNumber,
                    username,
                    error:
                        `Center "${centerInput}" not found or is disabled.`,
                });

                failedCount++;
                continue;
            }

            let email =
                normalizeEmail(
                    row.email
                );

            if (
                !email ||
                !isValidEmail(email)
            ) {
                email =
                    await generateUniqueEmail(
                        username,
                        index
                    );

                invalidEmailRows.push({
                    row: rowNumber,
                    username,
                });
            }

            const rawMobile =
                row.mobile;

            const mobile =
                normalizeMobile(
                    rawMobile
                );

            const mobileWasDefault =
                !rawMobile ||
                rawMobile
                    .toString()
                    .trim() === "" ||
                !/\d/.test(
                    rawMobile.toString()
                );

            if (
                mobileWasDefault
            ) {
                defaultMobileRows.push({
                    row: rowNumber,
                    username,
                });
            }

            const customer =
                new Customer({
                    username,
                    name: name || "",
                    mobile,
                    email,
                    center: center._id,
                    address1:
                        address1 || "",
                    address2:
                        address2 || "",
                    city: city || "",
                    state: state || "",
                    mobileWasDefault,
                });

            await customer.save();

            processedUsernames.add(
                username
            );

            if (existingUsernames) {
                existingUsernames.add(
                    username
                );
            }

            successCount++;
        } catch (error) {
            errors.push({
                row: rowNumber,
                username:
                    row.username || "",
                error:
                    error.message ||
                    "Failed to import customer.",
            });

            failedCount++;
        }
    }

    const totalProcessed =
        customersData.length;

    const successPercentage =
        totalProcessed > 0
            ? Number(
                  (
                      (successCount /
                          totalProcessed) *
                      100
                  ).toFixed(2)
              )
            : 0;

    const response = {
        success: true,

        message: `Import completed. Successfully imported ${successCount} customers, ${failedCount} failed.`,

        summary: {
            totalProcessed,
            successCount,
            failedCount,
            successPercentage,
        },

        notes: [
            `Email handling: ${invalidEmailRows.length} rows had invalid/missing emails and were auto-generated.`,

            `Mobile numbers that were missing or invalid were normalized. ${defaultMobileRows.length} rows received default mobile number.`,

            "Center names are matched against enabled centers only.",

            "Duplicate usernames are prevented but duplicate mobile numbers are allowed.",

            `Processed ${customersData.length} records in total.`,
        ],
    };

    if (errors.length > 0) {
        response.errors = errors;
        response.totalErrors =
            errors.length;

        const errorStatistics = {};

        errors.forEach(
            (item) => {
                const key =
                    item.error ||
                    "Unknown error";

                errorStatistics[key] =
                    (errorStatistics[key] ||
                        0) + 1;
            }
        );

        response.errorStatistics =
            errorStatistics;
    }

    if (
        defaultMobileRows.length > 0
    ) {
        response.defaultMobileSummary = {
            count:
                defaultMobileRows.length,
            rows: defaultMobileRows,
        };
    }

    if (
        invalidEmailRows.length > 0
    ) {
        response.invalidEmailSummary = {
            count:
                invalidEmailRows.length,
            rows: invalidEmailRows,
        };
    }

    return response;
};