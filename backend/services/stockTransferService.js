import mongoose from "mongoose";

import StockTransfer from "../models/StockTransfer.js";
import Center from "../models/Center.js";
import User from "../models/User.js";
import StockRequest from "../models/StockRequest.js";
import StockPurchase from "../models/StockPurchase.js";
import StockUsage from "../models/StockUsage.js";
import CenterStock from "../models/CenterStock.js";
import Product from "../models/Product.js";
import OutletStock from "../models/OutletStock.js";

/**
 * Stock Transfer Service
 *
 * Responsibility:
 * - Contains Stock Transfer business logic.
 * - Performs database operations required by Stock Transfer workflows.
 * - Does not know about Express request/response objects.
 * - Does not define roles or permissions.
 *
 * Architecture:
 * Controller -> Service -> Model
 *
 * Authorization:
 * Controllers/middleware resolve database-driven permissions and pass the
 * resulting authorization context to this service.
 *
 * Legacy compatibility:
 * Existing Stock Transfer workflow, statuses, stock movement rules and
 * response data requirements are intentionally preserved.
 */

/**
 * Error class used by the service layer.
 *
 * Controllers can inspect:
 * - statusCode
 * - code
 * - details
 * - validationErrors
 *
 * without coupling the service to Express.
 */
export class StockTransferServiceError extends Error {
    constructor(
        message,
        {
            statusCode = 400,
            code = null,
            details = null,
            validationErrors = null,
        } = {}
    ) {
        super(message);

        this.name = "StockTransferServiceError";
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.validationErrors = validationErrors;

        Error.captureStackTrace?.(
            this,
            StockTransferServiceError
        );
    }
}

/**
 * Convert any value into a Mongo ObjectId when valid.
 *
 * Keeping this helper inside the service prevents repeated ObjectId
 * conversion logic throughout query builders.
 */
const toObjectId = (value) => {
    if (!value) return value;

    return mongoose.Types.ObjectId.isValid(value)
        ? new mongoose.Types.ObjectId(value)
        : value;
};

/**
 * Extract a center id from either:
 * - populated center document
 * - raw ObjectId
 */
const getCenterId = (center) => {
    if (!center) return null;

    return center._id || center;
};

/**
 * Compare two Mongo ids safely.
 */
const sameId = (first, second) => {
    if (!first || !second) return false;

    return first.toString() === second.toString();
};

/**
 * Normalize the authorization capability context supplied by the controller.
 *
 * IMPORTANT:
 * No role names or permission names are defined here; permission-name
 * resolution happens outside the service.
 *
 * Example controller context:
 *
 * {
 *     canManageAll: true,
 *     canManageOwn: false,
 *     canViewAll: true,
 *     canViewOwn: false,
 *     canDeleteAll: false,
 *     canDeleteOwn: true,
 *     canApprove: true,
 *     canIndentAll: true,
 *     canIndentOwn: false
 * }
 */
const normalizeAccessContext = (context = {}) => {
    const isSuperAdmin = Boolean(context.isSuperAdmin);

    // Capability flags are resolved outside the service; a super admin
    // holds every capability.
    const capability = (flag) =>
        isSuperAdmin || Boolean(flag);

    return {
        isSuperAdmin,
        canManageAll: capability(context.canManageAll),
        canManageOwn: capability(context.canManageOwn),
        canViewAll: capability(context.canViewAll),
        canViewOwn: capability(context.canViewOwn),
        canDeleteAll: capability(context.canDeleteAll),
        canDeleteOwn: capability(context.canDeleteOwn),
        canApprove: capability(context.canApprove),
        canIndentAll: capability(context.canIndentAll),
        canIndentOwn: capability(context.canIndentOwn),
    };
};
/**
 * Resolve the authenticated user's MongoDB id.
 *
 * authMiddleware may expose the authenticated user using either `_id`
 * or `id`, so the service accepts both representations.
 */
const getUserId = (user) => {
    return user?.id || user?._id || null;
};

/**
 * Resolve the requester's center.
 *
 * The authenticated user object does not always carry `center`. Own-center
 * access must never silently widen to all centers, so when the center is
 * missing it is loaded from the database before any center restriction is
 * applied.
 */
const resolveRequesterCenter = async (user) => {
    if (user?.center) return user.center;

    const requesterId = getUserId(user);

    if (!requesterId) return null;

    const requester = await User.findById(requesterId)
        .select("center")
        .lean();

    return requester?.center || null;
};

const parseBooleanFlag = (value) =>
    value === true || value === "true";

/**
 * Verify that a user can access a transfer involving a particular center.
 *
 * "All" access bypasses center matching.
 *
 * "Own" access allows a transfer when the authenticated user's center is
 * either the source or destination center.
 */
export const hasCenterAccess = (
    stockTransfer,
    userCenter,
    context = {}
) => {
    const access = normalizeAccessContext(context);

    if (
        access.canManageAll ||
        access.canViewAll ||
        access.canDeleteAll ||
        access.canIndentAll
    ) {
        return true;
    }

    const currentCenterId = getCenterId(userCenter);

    if (!currentCenterId) {
        return false;
    }

    const fromCenterId = getCenterId(
        stockTransfer?.fromCenter
    );

    const toCenterId = getCenterId(
        stockTransfer?.toCenter
    );

    return (
        sameId(currentCenterId, fromCenterId) ||
        sameId(currentCenterId, toCenterId)
    );
};

/**
 * Assert transfer access.
 *
 * Keeping authorization failures here makes the service safe even if a
 * controller accidentally calls it without performing a separate access
 * check.
 */
const assertCenterAccess = (
    stockTransfer,
    userCenter,
    context,
    message
) => {
    if (
        !hasCenterAccess(
            stockTransfer,
            userCenter,
            context
        )
    ) {
        throw new StockTransferServiceError(
            message ||
                "Access denied for this stock transfer.",
            {
                statusCode: 403,
                code: "TRANSFER_ACCESS_DENIED",
            }
        );
    }
};

/**
 * Verify that a source center belongs to the authenticated user's center
 * when the caller only has own-center management access.
 */
const assertOwnSourceCenter = (
    sourceCenterId,
    userCenter,
    context
) => {
    const access = normalizeAccessContext(context);

    if (access.canManageAll) {
        return;
    }

    if (!access.canManageOwn) {
        throw new StockTransferServiceError(
            "You do not have permission to manage this stock transfer.",
            {
                statusCode: 403,
                code: "TRANSFER_MANAGE_DENIED",
            }
        );
    }

    const currentCenterId = getCenterId(userCenter);

    if (
        !currentCenterId ||
        !sameId(currentCenterId, sourceCenterId)
    ) {
        throw new StockTransferServiceError(
            "Access denied. You can only manage transfers from your own center.",
            {
                statusCode: 403,
                code: "OWN_CENTER_ACCESS_DENIED",
            }
        );
    }
};

/**
 * Verify that the authenticated user's center can be the destination
 * when only own-center management is available.
 */
const assertOwnDestinationCenter = (
    destinationCenterId,
    userCenter,
    context
) => {
    const access = normalizeAccessContext(context);

    if (access.canManageAll) {
        return;
    }

    if (!access.canManageOwn) {
        throw new StockTransferServiceError(
            "You do not have permission to manage this stock transfer.",
            {
                statusCode: 403,
                code: "TRANSFER_MANAGE_DENIED",
            }
        );
    }

    const currentCenterId = getCenterId(userCenter);

    if (
        !currentCenterId ||
        !sameId(currentCenterId, destinationCenterId)
    ) {
        throw new StockTransferServiceError(
            "Access denied. You can only create transfers to your own center.",
            {
                statusCode: 403,
                code: "OWN_DESTINATION_ACCESS_DENIED",
            }
        );
    }
};

/**
 * Populate configuration used by the Stock Transfer APIs.
 *
 * These selections intentionally remain aligned with the legacy API so that
 * refactoring the backend does not unnecessarily change response payloads.
 */
const stockTransferPopulate = [
    {
        path: "fromCenter",
        select: "_id centerName centerCode centerType",
    },
    {
        path: "toCenter",
        select: "_id centerName centerCode centerType",
    },
    {
        path: "products.product",
        select:
            "_id productTitle productCode productImage trackSerialNumber",
    },
    {
        path: "createdBy",
        select: "_id fullName email",
    },
    {
        path: "updatedBy",
        select: "_id fullName email",
    },
    {
        path: "adminApproval.approvedBy",
        select: "_id fullName email",
    },
    {
        path: "adminApproval.rejectedBy",
        select: "_id fullName email",
    },
    {
        path: "centerApproval.approvedBy",
        select: "_id fullName email",
    },
    {
        path: "centerApproval.rejectedBy",
        select: "_id fullName email",
    },
    {
        path: "shippingInfo.shippedBy",
        select: "_id fullName email",
    },
    {
        path: "receivingInfo.receivedBy",
        select: "_id fullName email",
    },
    {
        path: "completionInfo.completedBy",
        select: "_id fullName email",
    },
    {
        path: "completionInfo.incompleteBy",
        select: "_id fullName email",
    },
];

/**
 * Apply the common Stock Transfer population configuration.
 */
const populateStockTransfer = (query) =>
    query.populate(stockTransferPopulate);

/**
 * Validate the reseller relationship between two centers.
 *
 * Legacy business rule:
 * - Center -> Center transfers must stay within the same reseller.
 * - Outlet-related transfers bypass this reseller restriction.
 */
export const validateResellerForTransfer = async (
    fromCenterId,
    toCenterId
) => {
    const [fromCenter, toCenter] = await Promise.all([
        Center.findById(fromCenterId).populate("reseller"),
        Center.findById(toCenterId).populate("reseller"),
    ]);

    if (!fromCenter || !toCenter) {
        throw new StockTransferServiceError(
            "One or both centers not found.",
            {
                statusCode: 404,
                code: "CENTER_NOT_FOUND",
            }
        );
    }

    const isCenterToCenter =
        fromCenter.centerType === "Center" &&
        toCenter.centerType === "Center";

    if (!isCenterToCenter) {
        return {
            isValid: true,
            requiresValidation: false,
        };
    }

    if (!fromCenter.reseller || !toCenter.reseller) {
        throw new StockTransferServiceError(
            "Reseller information not found for one or both centers.",
            {
                statusCode: 400,
                code: "RESELLER_NOT_FOUND",
            }
        );
    }

    if (
        !sameId(
            fromCenter.reseller._id,
            toCenter.reseller._id
        )
    ) {
        return {
            isValid: false,
            requiresValidation: true,

            fromCenter: {
                name: fromCenter.centerName,
                type: fromCenter.centerType,
                reseller:
                    fromCenter.reseller.resellerName,
            },

            toCenter: {
                name: toCenter.centerName,
                type: toCenter.centerType,
                reseller:
                    toCenter.reseller.resellerName,
            },
        };
    }

    return {
        isValid: true,
        requiresValidation: true,
        reseller: fromCenter.reseller.resellerName,
        fromCenterType: fromCenter.centerType,
        toCenterType: toCenter.centerType,
    };
};

/**
 * Validate the basic products payload used while creating/updating a
 * Stock Transfer.
 */
const validateProductsPayload = (products) => {
    if (!Array.isArray(products) || products.length === 0) {
        throw new StockTransferServiceError(
            "Products array is required and cannot be empty.",
            {
                statusCode: 400,
                code: "PRODUCTS_REQUIRED",
            }
        );
    }

    for (const product of products) {
        if (!product?.product) {
            throw new StockTransferServiceError(
                "Each product must have a product ID.",
                {
                    statusCode: 400,
                    code: "PRODUCT_ID_REQUIRED",
                }
            );
        }

        if (
            product.quantity === undefined ||
            product.quantity === null
        ) {
            throw new StockTransferServiceError(
                "Each product must have a quantity.",
                {
                    statusCode: 400,
                    code: "PRODUCT_QUANTITY_REQUIRED",
                }
            );
        }

        if (product.quantity <= 0) {
            throw new StockTransferServiceError(
                "Product quantity must be greater than 0.",
                {
                    statusCode: 400,
                    code: "INVALID_PRODUCT_QUANTITY",
                }
            );
        }
    }
};

/**
 * Validate and normalize a transfer date.
 */
const normalizeTransferDate = (date) => {
    if (!date) {
        return new Date();
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
        throw new StockTransferServiceError(
            "Invalid date format. Please provide a valid date.",
            {
                statusCode: 400,
                code: "INVALID_TRANSFER_DATE",
            }
        );
    }

    return parsedDate;
};

/**
 * Check source stock before submitting a transfer.
 *
 * This deliberately retains the legacy fallback sequence:
 *
 * CenterStock -> OutletStock -> serialized stock aggregation.
 */
const validateSourceStock = async (
    fromCenterId,
    products
) => {
    for (const productItem of products) {
        const product = await Product.findById(
            productItem.product
        );

        if (!product) {
            throw new StockTransferServiceError(
                `Product not found: ${productItem.product}`,
                {
                    statusCode: 404,
                    code: "PRODUCT_NOT_FOUND",
                }
            );
        }

        let availableQuantity = 0;

        let centerStock = await CenterStock.findOne({
            center: fromCenterId,
            product: productItem.product,
        });

        if (centerStock) {
            availableQuantity =
                centerStock.availableQuantity || 0;
        }

        if (availableQuantity === 0) {
            const outletStock = await OutletStock.findOne({
                outlet: fromCenterId,
                product: productItem.product,
            });

            if (outletStock) {
                availableQuantity =
                    outletStock.availableQuantity || 0;
            }
        }

        /**
         * Serialized products can have their available quantity represented
         * by individual serial records. Keep the legacy fallback.
         */
        if (
            availableQuantity === 0 &&
            product.trackSerialNumber === "Yes"
        ) {
            const serialCount =
                await CenterStock.aggregate([
                    {
                        $match: {
                            center: toObjectId(fromCenterId),
                            product: toObjectId(
                                productItem.product
                            ),
                        },
                    },
                    {
                        $unwind: "$serialNumbers",
                    },
                    {
                        $match: {
                            "serialNumbers.status":
                                "available",
                        },
                    },
                    {
                        $count: "totalAvailable",
                    },
                ]);

            availableQuantity =
                serialCount[0]?.totalAvailable || 0;
        }

        if (availableQuantity === 0) {
            const stockTotal =
                await CenterStock.aggregate([
                    {
                        $match: {
                            product: toObjectId(
                                productItem.product
                            ),
                        },
                    },
                    {
                        $group: {
                            _id: null,
                            total: {
                                $sum: "$totalQuantity",
                            },
                        },
                    },
                ]);

            const totalInSystem =
                stockTotal[0]?.total || 0;

            if (totalInSystem === 0) {
                throw new StockTransferServiceError(
                    `No stock found for product ${product.productTitle} at the source center.`,
                    {
                        statusCode: 400,
                        code: "NO_SOURCE_STOCK",
                        details: {
                            productId:
                                productItem.product,
                            productTitle:
                                product.productTitle,
                            fromCenter:
                                fromCenterId,
                            requestedQuantity:
                                productItem.quantity,
                            totalInSystem,
                        },
                    }
                );
            }

            throw new StockTransferServiceError(
                `Product ${product.productTitle} has stock in the system (${totalInSystem}) but not at this center. Please add stock to this center first.`,
                {
                    statusCode: 400,
                    code: "STOCK_NOT_AT_SOURCE",
                    details: {
                        productId:
                            productItem.product,
                        productTitle:
                            product.productTitle,
                        fromCenter:
                            fromCenterId,
                        requestedQuantity:
                            productItem.quantity,
                        totalInSystem,
                        availableAtSource: 0,
                    },
                }
            );
        }

        if (availableQuantity < productItem.quantity) {
            throw new StockTransferServiceError(
                `Insufficient stock for product ${product.productTitle}. Available: ${availableQuantity}, Requested: ${productItem.quantity}`,
                {
                    statusCode: 400,
                    code: "INSUFFICIENT_SOURCE_STOCK",
                    details: {
                        productId:
                            productItem.product,
                        productTitle:
                            product.productTitle,
                        availableQuantity,
                        requestedQuantity:
                            productItem.quantity,
                    },
                }
            );
        }
    }
};

/**
 * Create a Stock Transfer.
 *
 * The service determines the destination from the authenticated user's
 * selected center, matching the legacy workflow.
 */
export const createStockTransfer = async ({
    user,
    accessContext,
    fromCenter,
    transferNumber,
    remark,
    products,
    date,
    status = "Draft",
    productApprovals = [],
}) => {
    const context =
        normalizeAccessContext(accessContext);

    if (!getUserId(user)) {
        throw new StockTransferServiceError(
            "User authentication required.",
            {
                statusCode: 401,
                code: "AUTHENTICATION_REQUIRED",
            }
        );
    }

    const authenticatedUser =
        await User.findById(getUserId(user)).populate("center");

    if (!authenticatedUser) {
        throw new StockTransferServiceError(
            "User not found.",
            {
                statusCode: 404,
                code: "USER_NOT_FOUND",
            }
        );
    }

    if (!authenticatedUser.center) {
        throw new StockTransferServiceError(
            "User center information not found.",
            {
                statusCode: 400,
                code: "USER_CENTER_NOT_FOUND",
            }
        );
    }

    const userCenterId =
        authenticatedUser.center._id;

    assertOwnSourceCenter(
        fromCenter,
        userCenterId,
        context
    );

    if (!transferNumber?.trim()) {
        throw new StockTransferServiceError(
            "Transfer number is required.",
            {
                statusCode: 400,
                code: "TRANSFER_NUMBER_REQUIRED",
            }
        );
    }

    if (!["Draft", "Submitted"].includes(status)) {
        throw new StockTransferServiceError(
            'Status must be either "Draft" or "Submitted" when creating a transfer.',
            {
                statusCode: 400,
                code: "INVALID_INITIAL_STATUS",
            }
        );
    }

    const existingTransfer =
        await StockTransfer.findOne({
            transferNumber: transferNumber.trim(),
        });

    if (existingTransfer) {
        throw new StockTransferServiceError(
            "Transfer number already exists. Please use a unique transfer number.",
            {
                statusCode: 409,
                code: "DUPLICATE_TRANSFER_NUMBER",
                details: {
                    duplicateTransferNumber:
                        transferNumber.trim(),
                    existingTransferId:
                        existingTransfer._id,
                },
            }
        );
    }

    const toCenterId = userCenterId;

    assertOwnDestinationCenter(
        toCenterId,
        userCenterId,
        context
    );

    const resellerValidation =
        await validateResellerForTransfer(
            fromCenter,
            toCenterId
        );

    if (!resellerValidation.isValid) {
        throw new StockTransferServiceError(
            "Stock transfer between Centers is only allowed within the same reseller.",
            {
                statusCode: 400,
                code: "CROSS_RESELLER_TRANSFER",
                details: {
                    error:
                        "Cannot transfer between Centers of different resellers.",
                    fromCenter:
                        resellerValidation.fromCenter,
                    toCenter:
                        resellerValidation.toCenter,
                    rule:
                        "Center-to-Center transfers require same reseller.",
                },
            }
        );
    }

    validateProductsPayload(products);

    const normalizedDate =
        normalizeTransferDate(date);

    if (status === "Submitted") {
        await validateSourceStock(
            fromCenter,
            products
        );
    }

    const stockTransfer =
        new StockTransfer({
            transferNumber: transferNumber.trim(),
            fromCenter,
            toCenter: toCenterId,
            remark: remark || "",
            products,
            date: normalizedDate,
            status,
            createdBy: getUserId(user),
        });

    if (status === "Submitted") {
        await stockTransfer.validateStockAvailability();

        if (
            Array.isArray(productApprovals) &&
            productApprovals.length > 0
        ) {
            const validationResults =
                await stockTransfer.validateSerialNumbers(
                    productApprovals
                );

            const invalidResults =
                validationResults.filter(
                    (result) => !result.valid
                );

            if (invalidResults.length > 0) {
                throw new StockTransferServiceError(
                    "Serial number validation failed.",
                    {
                        statusCode: 400,
                        code:
                            "SERIAL_VALIDATION_FAILED",
                        validationErrors:
                            invalidResults,
                    }
                );
            }

            stockTransfer.products =
                stockTransfer.products.map(
                    (productItem) => {
                        const approval =
                            productApprovals.find(
                                (item) =>
                                    sameId(
                                        item.productId,
                                        productItem.product
                                    )
                            );

                        if (!approval) {
                            return productItem;
                        }

                        productItem.approvedQuantity =
                            approval.approvedQuantity ??
                            productItem.quantity;

                        productItem.approvedRemark =
                            approval.approvedRemark || "";

                        productItem.approvedSerials =
                            approval.approvedSerials || [];

                        return productItem;
                    }
                );
        } else {
            stockTransfer.products.forEach(
                (productItem) => {
                    productItem.approvedQuantity =
                        productItem.quantity;
                }
            );
        }

        await stockTransfer.validateTransferSerialNumbers();
    }

    const savedTransfer =
        await stockTransfer.save();

    return await populateStockTransfer(
        StockTransfer.findById(
            savedTransfer._id
        )
    );
};

/**
 * Submit an existing Draft transfer.
 */
export const submitStockTransfer = async ({
    id,
    user,
    accessContext,
}) => {
    const context =
        normalizeAccessContext(accessContext);

    const stockTransfer =
        await StockTransfer.findById(id);

    if (!stockTransfer) {
        throw new StockTransferServiceError(
            "Stock transfer not found.",
            {
                statusCode: 404,
                code: "TRANSFER_NOT_FOUND",
            }
        );
    }

    assertCenterAccess(
        stockTransfer,
        await resolveRequesterCenter(user),
        context,
        "Access denied. You can only submit transfers involving your own center."
    );

    const submitted =
        await stockTransfer.submitTransfer();

    return await populateStockTransfer(
        StockTransfer.findById(submitted._id)
    );
};

/**
 * Approve a submitted transfer through the model workflow.
 */
export const approveStockTransferByAdmin =
    async ({
        id,
        user,
        userId,
        accessContext,
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        const actingUserId =
            userId || getUserId(user);

        if (!getUserId(user)) {
            throw new StockTransferServiceError(
                "User authentication required.",
                {
                    statusCode: 401,
                    code:
                        "AUTHENTICATION_REQUIRED",
                }
            );
        }

        // Legacy admin approve/reject were authorized by the Stock Transfer
        // management permissions (enforced at the route), not by a separate
        // approval permission. This is defense-in-depth only.
        if (
            !context.canManageAll &&
            !context.canManageOwn
        ) {
            throw new StockTransferServiceError(
                "Access denied. You do not have permission to manage stock transfers.",
                {
                    statusCode: 403,
                    code:
                        "TRANSFER_MANAGE_DENIED",
                }
            );
        }

        const stockTransfer =
            await StockTransfer.findById(id);

        if (!stockTransfer) {
            throw new StockTransferServiceError(
                "Stock transfer not found.",
                {
                    statusCode: 404,
                    code:
                        "TRANSFER_NOT_FOUND",
                }
            );
        }

        assertCenterAccess(
            stockTransfer,
            await resolveRequesterCenter(user),
            context,
            "Access denied for this stock transfer."
        );

        const approved =
            await stockTransfer.approveByAdmin(
                actingUserId
            );

        return await populateStockTransfer(
            StockTransfer.findById(
                approved._id
            )
        );
    };

/**
 * Reject a transfer through the admin rejection workflow.
 */
export const rejectStockTransferByAdmin =
    async ({
        id,
        user,
        userId,
        accessContext,
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        const actingUserId =
            userId || getUserId(user);

        if (!getUserId(user)) {
            throw new StockTransferServiceError(
                "User authentication required.",
                {
                    statusCode: 401,
                    code:
                        "AUTHENTICATION_REQUIRED",
                }
            );
        }

        // Legacy admin approve/reject were authorized by the Stock Transfer
        // management permissions (enforced at the route), not by a separate
        // approval permission. This is defense-in-depth only.
        if (
            !context.canManageAll &&
            !context.canManageOwn
        ) {
            throw new StockTransferServiceError(
                "Access denied. You do not have permission to manage stock transfers.",
                {
                    statusCode: 403,
                    code:
                        "TRANSFER_MANAGE_DENIED",
                }
            );
        }

        const stockTransfer =
            await StockTransfer.findById(id);

        if (!stockTransfer) {
            throw new StockTransferServiceError(
                "Stock transfer not found.",
                {
                    statusCode: 404,
                    code:
                        "TRANSFER_NOT_FOUND",
                }
            );
        }

        assertCenterAccess(
            stockTransfer,
            await resolveRequesterCenter(user),
            context,
            "Access denied for this stock transfer."
        );

        const rejected =
            await stockTransfer.rejectByAdmin(
                actingUserId
            );

        return await populateStockTransfer(
            StockTransfer.findById(
                rejected._id
            )
        );
    };
    /**
 * Validate serial numbers assigned to products in a transfer.
 *
 * This delegates the actual serial-number business rules to the
 * StockTransfer model, which is the legacy source of truth for this
 * workflow.
 */
export const validateSerialNumbers = async ({
    id,
    productApprovals,
}) => {
    const stockTransfer =
        await StockTransfer.findById(id);

    if (!stockTransfer) {
        throw new StockTransferServiceError(
            "Stock transfer not found.",
            {
                statusCode: 404,
                code: "TRANSFER_NOT_FOUND",
            }
        );
    }

    const validationResults =
        await stockTransfer.validateSerialNumbers(
            productApprovals
        );

    const isValid = !validationResults.some(
        (result) => !result.valid
    );

    return {
        data: validationResults,
        isValid,
    };
};

/**
 * Retrieve serial numbers currently available for a transfer.
 */
export const getAvailableSerials = async ({
    id,
}) => {
    const stockTransfer =
        await StockTransfer.findById(id);

    if (!stockTransfer) {
        throw new StockTransferServiceError(
            "Stock transfer not found.",
            {
                statusCode: 404,
                code: "TRANSFER_NOT_FOUND",
            }
        );
    }

    return stockTransfer.getAvailableSerials();
};

/**
 * Validate product approvals before confirmation.
 *
 * Confirmation has stricter validation than creation because this is the
 * point where approved quantities and serial assignments are committed to
 * source-center in-transit stock.
 */
const validateConfirmationApprovals = async (
    stockTransfer,
    productApprovals
) => {
    if (
        !Array.isArray(productApprovals) ||
        productApprovals.length === 0
    ) {
        return;
    }

    for (const approval of productApprovals) {
        if (!approval.productId) {
            throw new StockTransferServiceError(
                "Each approval must have a productId.",
                {
                    statusCode: 400,
                    code:
                        "APPROVAL_PRODUCT_REQUIRED",
                }
            );
        }

        if (
            approval.approvedQuantity ===
                undefined ||
            approval.approvedQuantity === null
        ) {
            throw new StockTransferServiceError(
                "Each approval must have an approvedQuantity.",
                {
                    statusCode: 400,
                    code:
                        "APPROVED_QUANTITY_REQUIRED",
                }
            );
        }

        if (
            !Number.isInteger(
                approval.approvedQuantity
            )
        ) {
            throw new StockTransferServiceError(
                "Approved quantity must be an integer.",
                {
                    statusCode: 400,
                    code:
                        "INVALID_APPROVED_QUANTITY",
                }
            );
        }

        if (approval.approvedQuantity < 0) {
            throw new StockTransferServiceError(
                "Approved quantity cannot be negative.",
                {
                    statusCode: 400,
                    code:
                        "NEGATIVE_APPROVED_QUANTITY",
                }
            );
        }

        const productItem =
            stockTransfer.products.find(
                (item) =>
                    sameId(
                        item.product,
                        approval.productId
                    )
            );

        if (!productItem) {
            throw new StockTransferServiceError(
                `Product with ID ${approval.productId} not found in this transfer.`,
                {
                    statusCode: 400,
                    code:
                        "TRANSFER_PRODUCT_NOT_FOUND",
                }
            );
        }

        if (
            approval.approvedQuantity >
            productItem.quantity
        ) {
            throw new StockTransferServiceError(
                `Approved quantity (${approval.approvedQuantity}) cannot exceed requested quantity (${productItem.quantity}) for product.`,
                {
                    statusCode: 400,
                    code:
                        "APPROVED_QUANTITY_EXCEEDS_REQUEST",
                }
            );
        }

        const product =
            await Product.findById(
                approval.productId
            );

        if (!product) {
            throw new StockTransferServiceError(
                `Product with ID ${approval.productId} not found.`,
                {
                    statusCode: 404,
                    code: "PRODUCT_NOT_FOUND",
                }
            );
        }

        const tracksSerialNumbers =
            product.trackSerialNumber === "Yes";

        if (tracksSerialNumbers) {
            if (approval.approvedQuantity > 0) {
                if (
                    !Array.isArray(
                        approval.approvedSerials
                    )
                ) {
                    throw new StockTransferServiceError(
                        `Serial numbers are required for product ${product.productTitle}.`,
                        {
                            statusCode: 400,
                            code:
                                "SERIAL_NUMBERS_REQUIRED",
                        }
                    );
                }

                if (
                    approval.approvedSerials.length !==
                    approval.approvedQuantity
                ) {
                    throw new StockTransferServiceError(
                        `Number of serial numbers (${approval.approvedSerials.length}) must match approved quantity (${approval.approvedQuantity}) for product ${product.productTitle}.`,
                        {
                            statusCode: 400,
                            code:
                                "SERIAL_QUANTITY_MISMATCH",
                        }
                    );
                }

                const uniqueSerials = new Set(
                    approval.approvedSerials
                );

                if (
                    uniqueSerials.size !==
                    approval.approvedSerials.length
                ) {
                    throw new StockTransferServiceError(
                        `Duplicate serial numbers found for product ${product.productTitle}.`,
                        {
                            statusCode: 400,
                            code:
                                "DUPLICATE_SERIAL_NUMBERS",
                        }
                    );
                }

                if (
                    approval.approvedSerials.some(
                        (serial) =>
                            !serial ||
                            !serial.trim()
                    )
                ) {
                    throw new StockTransferServiceError(
                        `Serial numbers cannot be empty for product ${product.productTitle}.`,
                        {
                            statusCode: 400,
                            code:
                                "EMPTY_SERIAL_NUMBER",
                        }
                    );
                }
            } else if (
                approval.approvedSerials?.length > 0
            ) {
                throw new StockTransferServiceError(
                    `Serial numbers should not be provided when approved quantity is zero for product ${product.productTitle}.`,
                    {
                        statusCode: 400,
                        code:
                            "SERIALS_WITH_ZERO_QUANTITY",
                    }
                );
            }
        } else if (
            approval.approvedSerials?.length > 0
        ) {
            throw new StockTransferServiceError(
                `Serial numbers should not be provided for product ${product.productTitle} as it does not track serial numbers.`,
                {
                    statusCode: 400,
                    code:
                        "SERIALS_FOR_NON_SERIAL_PRODUCT",
                }
            );
        }

        if (
            approval.approvedQuantity === 0 &&
            (!approval.approvedRemark ||
                !approval.approvedRemark.trim())
        ) {
            throw new StockTransferServiceError(
                `Approval remark is required when approved quantity is zero for product ${product.productTitle}.`,
                {
                    statusCode: 400,
                    code:
                        "APPROVAL_REMARK_REQUIRED",
                }
            );
        }
    }

    /**
     * Validate only approvals which actually contain a quantity.
     * Zero-quantity approvals intentionally do not require serial validation.
     */
    const approvalsWithQuantity =
        productApprovals.filter(
            (approval) =>
                approval.approvedQuantity > 0
        );

    if (approvalsWithQuantity.length === 0) {
        return;
    }

    const validationResults =
        await stockTransfer.validateSerialNumbers(
            approvalsWithQuantity
        );

    const invalidResults =
        validationResults.filter(
            (result) => !result.valid
        );

    if (invalidResults.length > 0) {
        throw new StockTransferServiceError(
            "Serial number validation failed.",
            {
                statusCode: 400,
                code:
                    "SERIAL_VALIDATION_FAILED",
                validationErrors:
                    invalidResults.map(
                        (result) => ({
                            productId:
                                result.productId,
                            productName:
                                result.productName,
                            error: result.error,
                        })
                    ),
            }
        );
    }
};

/**
 * Confirm a Stock Transfer.
 *
 * The legacy workflow has two distinct responsibilities:
 *
 * 1. StockTransfer.confirmTransfer()
 *    - updates transfer approval/status information.
 *
 * 2. CenterStock update below
 *    - moves approved source stock from available -> in_transit.
 *
 * Both are intentionally retained here because the API behaviour depends
 * on this separation.
 */
export const confirmStockTransfer = async ({
    id,
    user,
    userId,
    accessContext,
    productApprovals,
}) => {
    const context =
        normalizeAccessContext(accessContext);

    const actingUserId =
        userId || getUserId(user);

    if (!getUserId(user)) {
        throw new StockTransferServiceError(
            "User authentication required.",
            {
                statusCode: 401,
                code: "AUTHENTICATION_REQUIRED",
            }
        );
    }

    if (
        !context.canManageAll &&
        !context.canManageOwn &&
        !context.canApprove
    ) {
        throw new StockTransferServiceError(
            "Access denied. You do not have permission to confirm stock transfers.",
            {
                statusCode: 403,
                code: "TRANSFER_CONFIRMATION_DENIED",
            }
        );
    }

    const stockTransfer =
        await StockTransfer.findById(id);

    if (!stockTransfer) {
        throw new StockTransferServiceError(
            "Stock transfer not found.",
            {
                statusCode: 404,
                code: "TRANSFER_NOT_FOUND",
            }
        );
    }

    assertCenterAccess(
        stockTransfer,
        await resolveRequesterCenter(user),
        context,
        "Access denied. You can only confirm transfers involving your own center."
    );

    await validateConfirmationApprovals(
        stockTransfer,
        productApprovals
    );

    /*
     * The legacy model supports two confirmation paths:
     *
     * 1. Explicit productApprovals are supplied.
     * 2. No productApprovals are supplied, in which case the legacy
     *    confirmTransfer() method approves the requested quantity
     *    for every product.
     *
     * The stock reservation must follow the same resulting
     * approved quantities in both cases.
     */
    const confirmed =
        await stockTransfer.confirmTransfer(
            actingUserId,
            productApprovals
        );

    /*
     * Build the quantities that need to be moved into in-transit stock.
     *
     * When productApprovals are provided, use those values.
     *
     * When productApprovals are omitted, confirmTransfer() has already
     * populated approvedQuantity on each transfer product, so use the
     * resulting transfer data.
     */
    const approvalsToReserve =
        Array.isArray(productApprovals) &&
        productApprovals.length > 0
            ? productApprovals
            : stockTransfer.products.map(
                  (productItem) => ({
                      productId:
                          productItem.product,
                      approvedQuantity:
                          productItem.approvedQuantity ||
                          productItem.quantity,
                      approvedSerials:
                          productItem.approvedSerials ||
                          [],
                  })
              );

    /**
     * Reserve approved source stock.
     *
     * Non-serialized products:
     *   availableQuantity -= approvedQuantity
     *   inTransitQuantity += approvedQuantity
     *
     * Serialized products:
     *   available -> in_transit
     *   transfer history is recorded.
     */
    for (const approval of approvalsToReserve) {
        const approvedQuantity =
            approval.approvedQuantity || 0;

        if (approvedQuantity <= 0) {
            continue;
        }

        const product =
            await Product.findById(
                approval.productId
            );

        const tracksSerialNumbers =
            product?.trackSerialNumber === "Yes";

        const centerStock =
            await CenterStock.findOne({
                center: stockTransfer.fromCenter,
                product: approval.productId,
            });

        if (!centerStock) {
            throw new StockTransferServiceError(
                `No stock found for product ${
                    product?.productTitle ||
                    approval.productId
                } in source center.`,
                {
                    statusCode: 400,
                    code: "SOURCE_STOCK_NOT_FOUND",
                }
            );
        }

        if (
            centerStock.availableQuantity <
            approvedQuantity
        ) {
            throw new StockTransferServiceError(
                `Insufficient stock for product ${
                    product?.productTitle ||
                    approval.productId
                }. Available: ${centerStock.availableQuantity}, Approved: ${approvedQuantity}`,
                {
                    statusCode: 400,
                    code: "INSUFFICIENT_SOURCE_STOCK",
                }
            );
        }

        /*
         * Serialized products require the exact number of approved
         * serial numbers and every serial must currently be available
         * in the source center.
         */
        if (tracksSerialNumbers) {
            if (
                !Array.isArray(
                    approval.approvedSerials
                ) ||
                approval.approvedSerials.length !==
                    approvedQuantity
            ) {
                throw new StockTransferServiceError(
                    `Number of serial numbers must match approved quantity for product ${product.productTitle}.`,
                    {
                        statusCode: 400,
                        code:
                            "SERIAL_QUANTITY_MISMATCH",
                    }
                );
            }

            for (const serialNumber of
                approval.approvedSerials) {
                const serial =
                    centerStock.serialNumbers.find(
                        (item) =>
                            item.serialNumber ===
                            serialNumber
                    );

                if (
                    !serial ||
                    serial.status !== "available"
                ) {
                    throw new StockTransferServiceError(
                        `Serial number ${serialNumber} not available for product ${product.productTitle}.`,
                        {
                            statusCode: 400,
                            code:
                                "SERIAL_NOT_AVAILABLE",
                        }
                    );
                }

                serial.status = "in_transit";

                serial.transferHistory.push({
                    fromCenter:
                        stockTransfer.fromCenter,
                    toCenter:
                        stockTransfer.toCenter,
                    transferDate:
                        new Date(),
                    transferType:
                        "outbound_transfer",
                });
            }
        }

        /*
         * Reserve the approved quantity in the source center.
         */
        centerStock.availableQuantity -=
            approvedQuantity;

        centerStock.inTransitQuantity +=
            approvedQuantity;

        await centerStock.save();
    }

    /*
     * Re-fetch the transfer so the response contains the same populated
     * representation returned by the other stock-transfer endpoints.
     */
    const populatedTransfer =
        await populateStockTransfer(
            StockTransfer.findById(
                confirmed._id
            )
        );

    const data =
        await populatedTransfer;

    let message =
        "Stock transfer confirmed successfully";

    let hasQuantityAdjustments = false;
    let hasSerialAssignments = false;

    /*
     * Keep the existing response behavior for explicit product
     * approvals. We do not add stockUpdates for the implicit
     * confirmation path because that would change the existing API
     * response contract unnecessarily.
     */
    if (
        Array.isArray(productApprovals) &&
        productApprovals.length > 0
    ) {
        const quantityAdjustments =
            productApprovals.filter(
                (item) =>
                    item.approvedQuantity !==
                        undefined &&
                    item.approvedQuantity > 0
            ).length;

        const serialAssignments =
            productApprovals.filter(
                (item) =>
                    Array.isArray(
                        item.approvedSerials
                    ) &&
                    item.approvedSerials.length > 0
            ).length;

        if (quantityAdjustments > 0) {
            hasQuantityAdjustments = true;

            message +=
                ` with ${quantityAdjustments} product quantity adjustment(s)`;
        }

        if (serialAssignments > 0) {
            hasSerialAssignments = true;

            message +=
                ` and ${serialAssignments} serial number assignment(s) marked as in transit`;
        }
    }

    const response = {
        message,
        data,
    };

    if (
        hasQuantityAdjustments ||
        hasSerialAssignments
    ) {
        response.stockUpdates =
            productApprovals
                .filter(
                    (item) =>
                        item.approvedQuantity > 0
                )
                .map((item) => {
                    const productItem =
                        data.products.find(
                            (product) =>
                                sameId(
                                    product.product?._id,
                                    item.productId
                                )
                        );

                    return {
                        productId:
                            item.productId,

                        productName:
                            productItem?.product
                                ?.productTitle ||
                            "Unknown Product",

                        approvedQuantity:
                            item.approvedQuantity,

                        assignedSerials:
                            item.approvedSerials
                                ?.length || 0,

                        stockStatus:
                            "in_transit",

                        updatedFields: [
                            "availableQuantity",
                            "inTransitQuantity",
                        ],
                    };
                });
    }

    return response;
};

/**
 * Complete a transfer normally.
 *
 * Stock movement is delegated to StockTransfer.completeTransfer(), matching
 * the existing model workflow.
 */
export const completeStockTransfer =
    async ({
        id,
        user,
        userId,
        accessContext,
        productReceipts,
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        const actingUserId =
            userId || getUserId(user);

        if (!getUserId(user)) {
            throw new StockTransferServiceError(
                "User authentication required.",
                {
                    statusCode: 401,
                    code:
                        "AUTHENTICATION_REQUIRED",
                }
            );
        }

        const stockTransfer =
            await StockTransfer.findById(id)
                .populate(
                    "fromCenter",
                    "_id centerName centerCode"
                )
                .populate(
                    "toCenter",
                    "_id centerName centerCode"
                )
                .populate(
                    "products.product",
                    "_id productTitle productCode trackSerialNumber"
                );

        if (!stockTransfer) {
            throw new StockTransferServiceError(
                "Stock transfer not found.",
                {
                    statusCode: 404,
                    code:
                        "TRANSFER_NOT_FOUND",
                }
            );
        }

        assertCenterAccess(
            stockTransfer,
            await resolveRequesterCenter(user),
            context,
            "Access denied. You can only complete transfers involving your own center."
        );

        if (
            Array.isArray(productReceipts) &&
            productReceipts.length > 0
        ) {
            for (const receipt of
                productReceipts) {
                const productItem =
                    stockTransfer.products.find(
                        (item) =>
                            sameId(
                                item.product?._id ||
                                    item.product,
                                receipt.productId
                            )
                    );

                if (!productItem) {
                    throw new StockTransferServiceError(
                        `Product ${receipt.productId} not found in transfer.`,
                        {
                            statusCode: 400,
                            code:
                                "TRANSFER_PRODUCT_NOT_FOUND",
                        }
                    );
                }

                const approvedQuantity =
                    productItem.approvedQuantity ||
                    0;

                if (
                    receipt.receivedQuantity >
                    approvedQuantity
                ) {
                    throw new StockTransferServiceError(
                        `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${approvedQuantity}) for product.`,
                        {
                            statusCode: 400,
                            code:
                                "RECEIVED_QUANTITY_EXCEEDED",
                        }
                    );
                }

                productItem.receivedQuantity =
                    receipt.receivedQuantity;

                productItem.receivedRemark =
                    receipt.receivedRemark || "";
            }
        } else {
            stockTransfer.products.forEach(
                (productItem) => {
                    productItem.receivedQuantity =
                        productItem.approvedQuantity ||
                        0;
                }
            );
        }

        const completed =
            await stockTransfer.completeTransfer(
                actingUserId,
                productReceipts
            );

        return await populateStockTransfer(
            StockTransfer.findById(
                completed._id
            )
                .populate(
                    "receivingInfo.receivedBy",
                    "_id fullName email"
                )
                .populate(
                    "completionInfo.completedBy",
                    "_id fullName email"
                )
        );
    };

/**
 * Ship a confirmed transfer.
 *
 * Before invoking the model workflow, serialized products are checked against
 * source-center stock so invalid serial assignments fail before shipping.
 */
export const shipStockTransfer = async ({
    id,
    user,
    userId,
    accessContext,
    shippedDate,
    expectedDeliveryDate,
    shipmentDetails,
    carrierInfo,
}) => {
    const context =
        normalizeAccessContext(accessContext);

    const actingUserId =
        userId || getUserId(user);

    if (!getUserId(user)) {
        throw new StockTransferServiceError(
            "User authentication required.",
            {
                statusCode: 401,
                code: "AUTHENTICATION_REQUIRED",
            }
        );
    }

    const stockTransfer =
        await StockTransfer.findById(id)
            .populate(
                "fromCenter",
                "_id centerName centerCode"
            )
            .populate(
                "toCenter",
                "_id centerName centerCode"
            )
            .populate(
                "products.product",
                "_id productTitle productCode trackSerialNumber"
            );

    if (!stockTransfer) {
        throw new StockTransferServiceError(
            "Stock transfer not found.",
            {
                statusCode: 404,
                code: "TRANSFER_NOT_FOUND",
            }
        );
    }

    assertCenterAccess(
        stockTransfer,
        await resolveRequesterCenter(user),
        context,
        "Access denied. You can only ship transfers involving your own center."
    );

    const serializedApprovals = [];

    const shippingDetails = {};

    if (shippedDate) {
        shippingDetails.shippedDate =
            new Date(shippedDate);
    }

    if (expectedDeliveryDate) {
        shippingDetails.expectedDeliveryDate =
            new Date(expectedDeliveryDate);
    }

    if (shipmentDetails) {
        shippingDetails.shipmentDetails =
            shipmentDetails;
    }

    if (carrierInfo) {
        shippingDetails.carrierInfo =
            carrierInfo;
    }

    for (const productItem of
        stockTransfer.products) {
        const product =
            await Product.findById(
                productItem.product?._id ||
                    productItem.product
            );

        const requiresSerialNumbers =
            product?.trackSerialNumber ===
            "Yes";

        if (!requiresSerialNumbers) {
            continue;
        }

        const centerStock =
            await CenterStock.findOne({
                center:
                    stockTransfer.fromCenter._id,
                product:
                    productItem.product._id ||
                    productItem.product,
            });

        if (!centerStock) {
            throw new StockTransferServiceError(
                `No source stock found for product "${product?.productTitle}".`,
                {
                    statusCode: 400,
                    code:
                        "SOURCE_STOCK_NOT_FOUND",
                }
            );
        }

        if (
            !Array.isArray(
                productItem.approvedSerials
            ) ||
            productItem.approvedSerials.length === 0
        ) {
            throw new StockTransferServiceError(
                `No serial numbers assigned for product "${product?.productTitle}". Please assign serial numbers during confirmation.`,
                {
                    statusCode: 400,
                    code:
                        "SERIAL_ASSIGNMENT_REQUIRED",
                    details: {
                        product:
                            product?.productTitle,
                        requiredQuantity:
                            productItem.approvedQuantity ||
                            productItem.quantity,
                    },
                }
            );
        }

        serializedApprovals.push({
            productId:
                productItem.product?._id ||
                productItem.product,
            approvedSerials:
                productItem.approvedSerials,
        });
    }

    if (serializedApprovals.length > 0) {
        /**
         * The model validator is used instead of
         * CenterStock.validateAndGetSerials(): that helper accepts only
         * "available" serials, but confirmation has already moved the
         * assigned serials to "in_transit", so it would reject every valid
         * shipment. A non-populated document is used because the model
         * compares fromCenter as an id.
         */
        const validationTransfer =
            await StockTransfer.findById(
                stockTransfer._id
            );

        const validationResults =
            await validationTransfer.validateSerialNumbers(
                serializedApprovals
            );

        const invalidResults =
            validationResults.filter(
                (result) => !result.valid
            );

        if (invalidResults.length > 0) {
            throw new StockTransferServiceError(
                `Serial number validation failed: ${invalidResults
                    .map((result) => result.error)
                    .join(", ")}`,
                {
                    statusCode: 400,
                    code:
                        "SERIAL_VALIDATION_FAILED",
                    validationErrors:
                        invalidResults,
                }
            );
        }
    }

    const shipped =
        await stockTransfer.shipTransfer(
            actingUserId,
            shippingDetails
        );

    return await populateStockTransfer(
        StockTransfer.findById(
            shipped._id
        ).populate(
            "shippingInfo.shippedBy",
            "_id fullName email"
        )
    );
};

/**
 * Mark a transfer as incomplete.
 */
export const markStockTransferAsIncomplete =
    async ({
        id,
        user,
        userId,
        accessContext,
        incompleteRemark,
        receivedProducts,
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        const actingUserId =
            userId || getUserId(user);

        if (!getUserId(user)) {
            throw new StockTransferServiceError(
                "User authentication required.",
                {
                    statusCode: 401,
                    code:
                        "AUTHENTICATION_REQUIRED",
                }
            );
        }

        const stockTransfer =
            await StockTransfer.findById(id);

        if (!stockTransfer) {
            throw new StockTransferServiceError(
                "Stock transfer not found.",
                {
                    statusCode: 404,
                    code:
                        "TRANSFER_NOT_FOUND",
                }
            );
        }

        assertCenterAccess(
            stockTransfer,
            await resolveRequesterCenter(user),
            context,
            "Access denied. You can only mark transfers involving your own center as incomplete."
        );

        if (
            Array.isArray(receivedProducts)
        ) {
            stockTransfer.products =
                stockTransfer.products.map(
                    (productItem) => {
                        const receivedProduct =
                            receivedProducts.find(
                                (item) =>
                                    sameId(
                                        item.productId,
                                        productItem.product
                                    )
                            );

                        if (
                            !receivedProduct
                        ) {
                            return productItem;
                        }

                        productItem.receivedQuantity =
                            receivedProduct.receivedQuantity ||
                            0;

                        productItem.receivedRemark =
                            receivedProduct.receivedRemark ||
                            "";

                        productItem.productInStock =
                            receivedProduct.productInStock ||
                            0;

                        productItem.productRemark =
                            receivedProduct.productRemark ||
                            "";

                        return productItem;
                    }
                );
        }

        const incomplete =
            await stockTransfer.markAsIncomplete(
                actingUserId,
                incompleteRemark
            );

        return await populateStockTransfer(
            StockTransfer.findById(
                incomplete._id
            ).populate(
                "completionInfo.incompleteBy",
                "_id fullName email"
            )
        );
    };

/**
 * Complete an Incompleted transfer.
 *
 * This is intentionally implemented separately from normal completion
 * because the legacy workflow performs explicit stock reconciliation here.
 */
export const completeIncompleteStockTransfer =
    async ({
        id,
        user,
        userId,
        accessContext,
        productApprovals,
        productReceipts,
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        const actingUserId =
            userId || getUserId(user);

        if (!getUserId(user)) {
            throw new StockTransferServiceError(
                "User authentication required.",
                {
                    statusCode: 401,
                    code:
                        "AUTHENTICATION_REQUIRED",
                }
            );
        }

        const stockTransfer =
            await StockTransfer.findById(id)
                .populate(
                    "products.product",
                    "_id productTitle productCode trackSerialNumber"
                );

        if (!stockTransfer) {
            throw new StockTransferServiceError(
                "Stock transfer not found.",
                {
                    statusCode: 404,
                    code:
                        "TRANSFER_NOT_FOUND",
                }
            );
        }

        assertCenterAccess(
            stockTransfer,
            await resolveRequesterCenter(user),
            context,
            "Access denied. You can only complete incomplete transfers involving your own center."
        );

        if (
            stockTransfer.status !==
            "Incompleted"
        ) {
            throw new StockTransferServiceError(
                "Only incomplete stock transfers can be completed.",
                {
                    statusCode: 400,
                    code:
                        "INVALID_TRANSFER_STATUS",
                }
            );
        }

        const productsToComplete =
            Array.isArray(productReceipts) &&
            productReceipts.length > 0
                ? productReceipts
                : productApprovals;

        if (
            !Array.isArray(
                productsToComplete
            ) ||
            productsToComplete.length === 0
        ) {
            throw new StockTransferServiceError(
                "Product approvals or receipts are required.",
                {
                    statusCode: 400,
                    code:
                        "PRODUCT_RECEIPTS_REQUIRED",
                }
            );
        }

        for (const productData of
            productsToComplete) {
            const productId =
                productData.productId;

            const receivedQuantity =
                productData.receivedQuantity ??
                productData.approvedQuantity ??
                0;

            const receivedRemark =
                productData.receivedRemark ??
                productData.approvedRemark ??
                "";

            if (receivedQuantity === 0) {
                continue;
            }

            const productItem =
                stockTransfer.products.find(
                    (item) =>
                        sameId(
                            item.product?._id ||
                                item.product,
                            productId
                        )
                );

            if (!productItem) {
                throw new StockTransferServiceError(
                    `Product ${productId} not found in stock transfer.`,
                    {
                        statusCode: 400,
                        code:
                            "TRANSFER_PRODUCT_NOT_FOUND",
                    }
                );
            }

            const product =
                await Product.findById(
                    productId
                );

            const tracksSerialNumbers =
                product?.trackSerialNumber ===
                "Yes";

            let sourceStock =
                await CenterStock.findOne({
                    center:
                        stockTransfer.fromCenter,
                    product: productId,
                });

            let destinationStock =
                await CenterStock.findOne({
                    center:
                        stockTransfer.toCenter,
                    product: productId,
                });

            if (!sourceStock) {
                throw new StockTransferServiceError(
                    `No source stock found for product ${
                        product?.productTitle ||
                        productId
                    }.`,
                    {
                        statusCode: 400,
                        code:
                            "SOURCE_STOCK_NOT_FOUND",
                    }
                );
            }

            /**
             * Serialized reconciliation:
             * in_transit -> transferred at source,
             * then a matching available serial is created/retained at
             * destination.
             */
            if (tracksSerialNumbers) {
                const approvedSerials =
                    productItem.approvedSerials ||
                    [];

                const serialsToTransfer =
                    approvedSerials.slice(
                        0,
                        receivedQuantity
                    );

                let transferredCount = 0;

                for (const serialNumber of
                    serialsToTransfer) {
                    const sourceSerial =
                        sourceStock.serialNumbers.find(
                            (serial) =>
                                serial.serialNumber ===
                                serialNumber
                        );

                    if (
                        sourceSerial &&
                        sourceSerial.status ===
                            "in_transit"
                    ) {
                        sourceSerial.status =
                            "transferred";

                        sourceSerial.currentLocation =
                            stockTransfer.toCenter;

                        transferredCount++;
                    } else if (
                        sourceSerial &&
                        sourceSerial.status ===
                            "transferred"
                    ) {
                        transferredCount++;
                    }
                }

                sourceStock.inTransitQuantity =
                    Math.max(
                        0,
                        sourceStock.inTransitQuantity -
                            transferredCount
                    );

                if (!destinationStock) {
                    destinationStock =
                        new CenterStock({
                            center:
                                stockTransfer.toCenter,
                            product:
                                productId,
                            totalQuantity: 0,
                            availableQuantity: 0,
                            inTransitQuantity: 0,
                            consumedQuantity: 0,
                            serialNumbers: [],
                        });
                }

                for (const serialNumber of
                    serialsToTransfer) {
                    const alreadyExists =
                        destinationStock.serialNumbers.some(
                            (serial) =>
                                serial.serialNumber ===
                                serialNumber
                        );

                    if (alreadyExists) {
                        continue;
                    }

                    const sourceSerial =
                        sourceStock.serialNumbers.find(
                            (serial) =>
                                serial.serialNumber ===
                                serialNumber
                        );

                    // CenterStock requires purchaseId; without the source
                    // serial there is none to copy (the model skips these too).
                    if (!sourceSerial) {
                        continue;
                    }

                    destinationStock.serialNumbers.push(
                        {
                            serialNumber,
                            purchaseId:
                                sourceSerial?.purchaseId,
                            originalOutlet:
                                sourceSerial?.originalOutlet ||
                                stockTransfer.fromCenter,
                            status: "available",
                            currentLocation:
                                stockTransfer.toCenter,
                            transferHistory: [
                                ...(sourceSerial?.transferHistory ||
                                    []),
                                {
                                    fromCenter:
                                        stockTransfer.fromCenter,
                                    toCenter:
                                        stockTransfer.toCenter,
                                    transferDate:
                                        new Date(),
                                    transferType:
                                        "inbound_transfer",
                                },
                            ],
                        }
                    );
                }

                destinationStock.totalQuantity +=
                    transferredCount;

                destinationStock.availableQuantity +=
                    transferredCount;
            } else {
                /**
                 * Non-serialized reconciliation consumes in-transit stock
                 * first, then falls back to available stock.
                 */
                let remainingQuantity =
                    receivedQuantity;

                const quantityToDeduct =
                    receivedQuantity;

                const inTransitQuantity =
                    Math.min(
                        remainingQuantity,
                        sourceStock.inTransitQuantity
                    );

                if (inTransitQuantity > 0) {
                    sourceStock.inTransitQuantity -=
                        inTransitQuantity;

                    remainingQuantity -=
                        inTransitQuantity;
                }

                if (remainingQuantity > 0) {
                    const availableQuantity =
                        Math.min(
                            remainingQuantity,
                            sourceStock.availableQuantity
                        );

                    if (availableQuantity > 0) {
                        sourceStock.availableQuantity -=
                            availableQuantity;

                        remainingQuantity -=
                            availableQuantity;
                    }
                }

                // Like processSourceDeduction(), the source total shrinks by
                // what actually left the source (in-transit + available).
                sourceStock.totalQuantity =
                    Math.max(
                        0,
                        sourceStock.totalQuantity -
                            (quantityToDeduct -
                                remainingQuantity)
                    );

                if (!destinationStock) {
                    destinationStock =
                        new CenterStock({
                            center:
                                stockTransfer.toCenter,
                            product:
                                productId,
                            totalQuantity: 0,
                            availableQuantity: 0,
                            inTransitQuantity: 0,
                            consumedQuantity: 0,
                            serialNumbers: [],
                        });
                }

                destinationStock.totalQuantity +=
                    receivedQuantity;

                destinationStock.availableQuantity +=
                    receivedQuantity;
            }

            await sourceStock.save();
            await destinationStock.save();

            productItem.receivedQuantity =
                receivedQuantity;

            productItem.receivedRemark =
                receivedRemark;
        }

        // Record that this path moved the stock, so a later reversal or
        // completion cannot process the same movement again.
        stockTransfer.stockStatus.sourceDeducted = true;
        stockTransfer.stockStatus.deductedAt = new Date();
        stockTransfer.stockStatus.destinationAdded = true;
        stockTransfer.stockStatus.addedAt = new Date();
        stockTransfer.stockStatus.lastStockCheck = new Date();

        stockTransfer.status =
            "Completed";

        stockTransfer.receivingInfo = {
            receivedAt: new Date(),
            receivedBy: actingUserId,
        };

        stockTransfer.completionInfo = {
            completedOn: new Date(),
            completedBy: actingUserId,
        };

        stockTransfer.updatedBy = actingUserId;

        const completedTransfer =
            await stockTransfer.save();

        return await populateStockTransfer(
            StockTransfer.findById(
                completedTransfer._id
            )
                .populate(
                    "updatedBy",
                    "_id fullName email"
                )
                .populate(
                    "receivingInfo.receivedBy",
                    "_id fullName email"
                )
                .populate(
                    "completionInfo.completedBy",
                    "_id fullName email"
                )
        );
    };
    /**
 * Reject a Stock Transfer.
 *
 * The legacy implementation determined whether the rejection was an
 * "admin" or "center" rejection from role strings.
 *
 * The new implementation deliberately avoids hardcoded role names.
 * The workflow state determines which model rejection operation is valid:
 *
 * Submitted     -> admin rejection
 * Admin_Approved -> center rejection
 *
 * This keeps the service compatible with the transfer state machine while
 * keeping role definitions inside the database-driven RBAC layer.
 */
export const rejectStockTransfer = async ({
    id,
    user,
    userId,
    accessContext,
}) => {
    const context =
        normalizeAccessContext(accessContext);

    const actingUserId =
        userId || getUserId(user);

    if (!getUserId(user)) {
        throw new StockTransferServiceError(
            "User authentication required.",
            {
                statusCode: 401,
                code: "AUTHENTICATION_REQUIRED",
            }
        );
    }

    const stockTransfer =
        await StockTransfer.findById(id);

    if (!stockTransfer) {
        throw new StockTransferServiceError(
            "Stock transfer not found.",
            {
                statusCode: 404,
                code: "TRANSFER_NOT_FOUND",
            }
        );
    }

    assertCenterAccess(
        stockTransfer,
        await resolveRequesterCenter(user),
        context,
        "Access denied. You can only reject transfers involving your own center."
    );

    /**
     * Determine the rejection operation from the transfer state rather than
     * from a hardcoded role string.
     */
    let rejectionType;

    if (stockTransfer.status === "Submitted") {
        if (!context.canApprove) {
            throw new StockTransferServiceError(
                "Access denied. You do not have approval permission.",
                {
                    statusCode: 403,
                    code:
                        "TRANSFER_APPROVAL_DENIED",
                }
            );
        }

        rejectionType = "admin";
    } else if (
        // rejectByCenter() accepts these states; Confirmed/Shipped are the
        // states in which stock was reserved in transit at confirmation.
        ["Admin_Approved", "Confirmed", "Shipped"].includes(
            stockTransfer.status
        )
    ) {
        if (
            !context.canManageAll &&
            !context.canManageOwn
        ) {
            throw new StockTransferServiceError(
                "Access denied. You do not have permission to reject this transfer.",
                {
                    statusCode: 403,
                    code:
                        "TRANSFER_REJECTION_DENIED",
                }
            );
        }

        rejectionType = "center";
    } else {
        throw new StockTransferServiceError(
            "Stock transfer cannot be rejected in its current status.",
            {
                statusCode: 400,
                code:
                    "INVALID_REJECTION_STATUS",
            }
        );
    }

    let restoredSerializedItems = 0;
    let restoredNonSerializedUnits = 0;

    /**
     * Confirmation (service) reserves stock as in-transit; the model only
     * consumes it at completion (processSourceDeduction). So in-transit
     * stock exists only for Confirmed/Shipped transfers whose source has
     * not been deducted yet. Once stockStatus.sourceDeducted is true the
     * model's reverseSourceDeduction() below owns the reversal, so the
     * manual restore is skipped to avoid reversing the same units twice.
     */
    const restoreReservedStock =
        ["Confirmed", "Shipped"].includes(
            stockTransfer.status
        ) && !stockTransfer.stockStatus?.sourceDeducted;

    for (const productItem of
        restoreReservedStock
            ? stockTransfer.products
            : []) {
        const product =
            await Product.findById(
                productItem.product
            );

        const requiresSerialNumbers =
            product?.trackSerialNumber ===
            "Yes";

        const approvedQuantity =
            productItem.approvedQuantity ??
            productItem.quantity;

        /**
         * Serialized stock restoration.
         */
        if (
            requiresSerialNumbers &&
            Array.isArray(
                productItem.approvedSerials
            ) &&
            productItem.approvedSerials.length > 0
        ) {
            const centerStock =
                await CenterStock.findOne({
                    center:
                        stockTransfer.fromCenter,
                    product:
                        productItem.product,
                });

            if (!centerStock) {
                continue;
            }

            let restoredCount = 0;

            for (const serialNumber of
                productItem.approvedSerials) {
                const serial =
                    centerStock.serialNumbers.find(
                        (item) =>
                            item.serialNumber ===
                            serialNumber
                    );

                if (
                    serial &&
                    (serial.status ===
                        "in_transit" ||
                        serial.status ===
                            "transferred")
                ) {
                    serial.status =
                        "available";

                    serial.currentLocation =
                        stockTransfer.fromCenter;

                    restoredCount++;

                    serial.transferHistory.push(
                        {
                            fromCenter:
                                stockTransfer.fromCenter,
                            toCenter:
                                stockTransfer.toCenter,
                            transferDate:
                                new Date(),
                            transferType:
                                "transfer_rejected",
                        }
                    );
                }
            }

            if (restoredCount > 0) {
                centerStock.inTransitQuantity =
                    Math.max(
                        0,
                        centerStock.inTransitQuantity -
                            restoredCount
                    );

                centerStock.availableQuantity +=
                    restoredCount;

                await centerStock.save();

                restoredSerializedItems +=
                    restoredCount;
            }

            continue;
        }

        /**
         * Non-serialized stock restoration.
         */
        if (
            !requiresSerialNumbers &&
            approvedQuantity > 0
        ) {
            const centerStock =
                await CenterStock.findOne({
                    center:
                        stockTransfer.fromCenter,
                    product:
                        productItem.product,
                });

            if (!centerStock) {
                continue;
            }

            /**
             * Confirmation moved the approved quantity from available to
             * in-transit, so only that in-transit quantity can be released.
             * Never release more than is currently held in transit.
             */
            const quantityToRestore =
                Math.min(
                    approvedQuantity,
                    centerStock.inTransitQuantity
                );

            centerStock.availableQuantity +=
                quantityToRestore;

            centerStock.inTransitQuantity -=
                quantityToRestore;

            restoredNonSerializedUnits +=
                quantityToRestore;

            await centerStock.save();
        }
    }

    /**
     * If the transfer itself already recorded stock deduction, allow the
     * model to reverse its corresponding stock operation.
     *
     * This preserves the legacy stockStatus-driven workflow.
     */
    if (
        stockTransfer.stockStatus
            ?.sourceDeducted
    ) {
        await stockTransfer.reverseSourceDeduction();
    }

    if (
        stockTransfer.stockStatus
            ?.destinationAdded
    ) {
        await stockTransfer.reverseDestinationAddition();
    }

    let rejectedTransfer;

    if (rejectionType === "admin") {
        rejectedTransfer =
            await stockTransfer.rejectByAdmin(
                actingUserId
            );
    } else {
        rejectedTransfer =
            await stockTransfer.rejectByCenter(
                actingUserId
            );
    }

    const populatedTransfer =
        await populateStockTransfer(
            StockTransfer.findById(
                rejectedTransfer._id
            )
                .populate(
                    "adminApproval.rejectedBy",
                    "_id fullName email"
                )
                .populate(
                    "centerApproval.rejectedBy",
                    "_id fullName email"
                )
        );

    let message =
        `Stock transfer rejected by ${rejectionType} successfully. `;

    if (restoredSerializedItems > 0) {
        message +=
            `${restoredSerializedItems} serialized items restored to available status. `;
    }

    if (restoredNonSerializedUnits > 0) {
        message +=
            `${restoredNonSerializedUnits} non-serialized units regained. `;
    }

    if (
        restoredSerializedItems === 0 &&
        restoredNonSerializedUnits === 0
    ) {
        message +=
            "No stock adjustments were needed.";
    }

    return {
        message: message.trim(),
        data: await populatedTransfer,
        restorationSummary: {
            serializedItemsRestored:
                restoredSerializedItems,

            nonSerializedUnitsRegained:
                restoredNonSerializedUnits,

            totalItemsRestored:
                restoredSerializedItems +
                restoredNonSerializedUnits,

            rejectionType,

            rejectedByName:
                user.fullName || null,
        },
    };
};

/**
 * Date-range helper used by the Stock Transfer list endpoint.
 */
const getDateRange = (
    rangeType,
    customStartDate,
    customEndDate
) => {
    const now = new Date();

    let start = new Date(now);
    let end = new Date(now);

    switch (rangeType) {
        case "Today":
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            break;

        case "Yesterday":
            start.setDate(
                now.getDate() - 1
            );
            start.setHours(0, 0, 0, 0);

            end.setDate(
                now.getDate() - 1
            );
            end.setHours(23, 59, 59, 999);
            break;

        case "This Week":
            start.setDate(
                now.getDate() - now.getDay()
            );
            start.setHours(0, 0, 0, 0);

            end.setHours(23, 59, 59, 999);
            break;

        case "Last Week":
            start.setDate(
                now.getDate() -
                    now.getDay() -
                    7
            );
            start.setHours(0, 0, 0, 0);

            end.setDate(
                now.getDate() -
                    now.getDay() -
                    1
            );
            end.setHours(23, 59, 59, 999);
            break;

        case "This Month":
            start = new Date(
                now.getFullYear(),
                now.getMonth(),
                1
            );
            start.setHours(0, 0, 0, 0);

            end = new Date(
                now.getFullYear(),
                now.getMonth() + 1,
                0
            );
            end.setHours(23, 59, 59, 999);
            break;

        case "Last Month":
            start = new Date(
                now.getFullYear(),
                now.getMonth() - 1,
                1
            );
            start.setHours(0, 0, 0, 0);

            end = new Date(
                now.getFullYear(),
                now.getMonth(),
                0
            );
            end.setHours(23, 59, 59, 999);
            break;

        case "This Year":
            start = new Date(
                now.getFullYear(),
                0,
                1
            );
            start.setHours(0, 0, 0, 0);

            end = new Date(
                now.getFullYear(),
                11,
                31
            );
            end.setHours(23, 59, 59, 999);
            break;

        case "Last Year":
            start = new Date(
                now.getFullYear() - 1,
                0,
                1
            );
            start.setHours(0, 0, 0, 0);

            end = new Date(
                now.getFullYear() - 1,
                11,
                31
            );
            end.setHours(23, 59, 59, 999);
            break;

        case "Custom":
            if (customStartDate) {
                start = new Date(
                    customStartDate
                );
            }

            if (customEndDate) {
                end = new Date(
                    customEndDate
                );
            }

            break;

        default:
            return null;
    }

    return {
        start,
        end,
    };
};

/**
 * Convert comma-separated query parameters into either:
 * - a direct value
 * - Mongo $in filter
 */
const buildArrayFilter = (value) => {
    if (!value) {
        return null;
    }

    if (typeof value !== "string") {
        return value;
    }

    if (!value.includes(",")) {
        return value.trim();
    }

    return {
        $in: value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
    };
};

/**
 * Build a Mongo date filter.
 */
const buildDateFilter = (
    dateFilter,
    customStartDate,
    customEndDate,
    startDate,
    endDate
) => {
    if (dateFilter) {
        const range = getDateRange(
            dateFilter,
            customStartDate,
            customEndDate
        );

        if (range) {
            return {
                $gte: range.start,
                $lte: range.end,
            };
        }
    }

    if (startDate || endDate) {
        const filter = {};

        if (startDate) {
            filter.$gte = new Date(
                startDate
            );
        }

        if (endDate) {
            filter.$lte = new Date(
                endDate
            );
        }

        return filter;
    }

    return null;
};

/**
 * Build the Stock Transfer list filter.
 *
 * The field names here intentionally follow the legacy controller so the
 * frontend can continue using the same query parameters.
 */
export const buildStockTransferFilter = (
    query = {}
) => {
    const {
        status,
        fromCenter,
        toCenter,
        startDate,
        endDate,
        createdAtStart,
        createdAtEnd,
        transferNumber,
        search,
        dateFilter,
        customStartDate,
        customEndDate,
        outlet,
        center,
        statusChanged,
        statusStartDate,
        statusEndDate,
    } = query;

    const filter = {};

    const statusFilter =
        buildArrayFilter(status);

    if (statusFilter) {
        filter.status = statusFilter;
    }

    if (
        statusChanged &&
        statusChanged !== "Any Status"
    ) {
        filter.status = statusChanged;
    }

    const fromCenterFilter =
        buildArrayFilter(fromCenter);

    if (fromCenterFilter) {
        if (
            Array.isArray(
                fromCenterFilter.$in
            )
        ) {
            filter.fromCenter = {
                $in:
                    fromCenterFilter.$in.map(
                        toObjectId
                    ),
            };
        } else if (
            mongoose.Types.ObjectId.isValid(
                fromCenterFilter
            )
        ) {
            filter.fromCenter =
                new mongoose.Types.ObjectId(
                    fromCenterFilter
                );
        } else {
            filter.fromCenter =
                fromCenterFilter;
        }
    }

    const toCenterFilter =
        buildArrayFilter(toCenter);

    if (toCenterFilter) {
        if (
            Array.isArray(
                toCenterFilter.$in
            )
        ) {
            filter.toCenter = {
                $in:
                    toCenterFilter.$in.map(
                        toObjectId
                    ),
            };
        } else if (
            mongoose.Types.ObjectId.isValid(
                toCenterFilter
            )
        ) {
            filter.toCenter =
                new mongoose.Types.ObjectId(
                    toCenterFilter
                );
        } else {
            filter.toCenter =
                toCenterFilter;
        }
    }

    /**
     * Legacy outlet filtering operates against fromCenter.
     */
    const outletFilter =
        buildArrayFilter(outlet);

    if (outletFilter) {
        if (
            Array.isArray(
                outletFilter.$in
            )
        ) {
            filter.fromCenter = {
                $in:
                    outletFilter.$in.map(
                        toObjectId
                    ),
            };
        } else if (
            mongoose.Types.ObjectId.isValid(
                outletFilter
            )
        ) {
            filter.fromCenter =
                new mongoose.Types.ObjectId(
                    outletFilter
                );
        } else {
            filter.fromCenter =
                outletFilter;
        }
    }

    /**
     * A center filter matches either side of a transfer.
     */
    const centerFilter =
        buildArrayFilter(center);

    if (centerFilter) {
        if (
            Array.isArray(
                centerFilter.$in
            )
        ) {
            const centerIds =
                centerFilter.$in.map(
                    toObjectId
                );

            filter.$or = [
                {
                    fromCenter: {
                        $in: centerIds,
                    },
                },
                {
                    toCenter: {
                        $in: centerIds,
                    },
                },
            ];
        } else if (
            mongoose.Types.ObjectId.isValid(
                centerFilter
            )
        ) {
            const centerId =
                new mongoose.Types.ObjectId(
                    centerFilter
                );

            filter.$or = [
                {
                    fromCenter: centerId,
                },
                {
                    toCenter: centerId,
                },
            ];
        } else {
            filter.$or = [
                {
                    fromCenter:
                        centerFilter,
                },
                {
                    toCenter:
                        centerFilter,
                },
            ];
        }
    }

    if (
        statusStartDate &&
        statusEndDate
    ) {
        filter.date = {
            $gte: new Date(
                statusStartDate
            ),
            $lte: new Date(
                statusEndDate
            ),
        };
    } else if (
        startDate &&
        endDate
    ) {
        filter.date = {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
        };
    } else {
        const dateFilterObject =
            buildDateFilter(
                dateFilter,
                customStartDate,
                customEndDate,
                startDate,
                endDate
            );

        if (dateFilterObject) {
            filter.date =
                dateFilterObject;
        }
    }

    if (
        createdAtStart ||
        createdAtEnd
    ) {
        filter.createdAt = {};

        if (createdAtStart) {
            filter.createdAt.$gte =
                new Date(
                    createdAtStart
                );
        }

        if (createdAtEnd) {
            filter.createdAt.$lte =
                new Date(
                    createdAtEnd
                );
        }
    }

    const transferNumberFilter =
        buildArrayFilter(
            transferNumber
        );

    if (transferNumberFilter) {
        filter.transferNumber =
            typeof transferNumberFilter ===
            "object"
                ? transferNumberFilter
                : {
                      $regex:
                          transferNumberFilter,
                      $options: "i",
                  };
    }

    /**
     * Search intentionally replaces the existing $or, matching the legacy
     * controller behaviour.
     */
    if (search) {
        filter.$or = [
            {
                transferNumber: {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                remark: {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                "products.productRemark":
                    {
                        $regex: search,
                        $options: "i",
                    },
            },
            {
                "adminApproval.approvalRemark":
                    {
                        $regex: search,
                        $options: "i",
                    },
            },
            {
                "adminApproval.rejectionRemark":
                    {
                        $regex: search,
                        $options: "i",
                    },
            },
            {
                "centerApproval.approvalRemark":
                    {
                        $regex: search,
                        $options: "i",
                    },
            },
            {
                "centerApproval.rejectionRemark":
                    {
                        $regex: search,
                        $options: "i",
                    },
            },
            {
                "shippingInfo.shippingRemark":
                    {
                        $regex: search,
                        $options: "i",
                    },
            },
            {
                "receivingInfo.receivingRemark":
                    {
                        $regex: search,
                        $options: "i",
                    },
            },
        ];
    }

    return filter;
};

/**
 * Build validated sort options.
 *
 * Only known fields are accepted so arbitrary request values cannot become
 * Mongo sort paths.
 */
export const buildStockTransferSortOptions = (
    sortBy = "createdAt",
    sortOrder = "desc"
) => {
    const validSortFields = [
        "createdAt",
        "updatedAt",
        "date",
        "transferNumber",
        "status",
        "adminApproval.approvedAt",
        "adminApproval.rejectedAt",
        "centerApproval.approvedAt",
        "centerApproval.rejectedAt",
        "shippingInfo.shippedAt",
        "receivingInfo.receivedAt",
    ];

    const actualSortBy =
        validSortFields.includes(sortBy)
            ? sortBy
            : "createdAt";

    return {
        [actualSortBy]:
            sortOrder === "desc"
                ? -1
                : 1,
    };
};

/**
 * Retrieve paginated Stock Transfers.
 */
export const getAllStockTransfers =
    async ({
        user,
        accessContext,
        page = 1,
        limit = 100,
        sortBy = "createdAt",
        sortOrder = "desc",
        filterParams = {},
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        const filter =
            buildStockTransferFilter(
                filterParams
            );

        /**
         * Own-center access restricts the list to transfers where the user's
         * center is either the source or destination.
         */
        if (!context.canViewAll) {
            if (!context.canViewOwn) {
                throw new StockTransferServiceError(
                    "Access denied. You do not have permission to view stock transfers.",
                    {
                        statusCode: 403,
                        code: "TRANSFER_VIEW_DENIED",
                    }
                );
            }

            const userCenterId =
                getCenterId(
                    await resolveRequesterCenter(user)
                );

            if (!userCenterId) {
                throw new StockTransferServiceError(
                    "User center information not found.",
                    {
                        statusCode: 400,
                        code: "USER_CENTER_NOT_FOUND",
                    }
                );
            }

            const ownCenterFilter = {
                $or: [
                    {
                        fromCenter:
                            userCenterId,
                    },
                    {
                        toCenter:
                            userCenterId,
                    },
                ],
            };

            /**
             * If the request already has a $or condition, use $and so the
             * user-center restriction cannot accidentally broaden access.
             */
            if (filter.$or) {
                filter.$and = [
                    {
                        $or: filter.$or,
                    },
                    ownCenterFilter,
                ];

                delete filter.$or;
            } else {
                filter.$or =
                    ownCenterFilter.$or;
            }
        }

        const numericPage =
            Math.max(
                parseInt(page, 10) || 1,
                1
            );

        const numericLimit =
            Math.max(
                parseInt(limit, 10) || 100,
                1
            );

        const sortOptions =
            buildStockTransferSortOptions(
                sortBy,
                sortOrder
            );

        const [
            stockTransfers,
            total,
            statusCounts,
        ] = await Promise.all([
            StockTransfer.find(filter)
                .populate(
                    stockTransferPopulate
                )
                .sort(sortOptions)
                .limit(numericLimit)
                .skip(
                    (numericPage - 1) *
                        numericLimit
                )
                .lean(),

            StockTransfer.countDocuments(
                filter
            ),

            StockTransfer.aggregate([
                {
                    $match: filter,
                },
                {
                    $group: {
                        _id: "$status",
                        count: {
                            $sum: 1,
                        },
                    },
                },
            ]),
        ]);

        if (stockTransfers.length === 0) {
            return {
                stockTransfers: [],
                empty: true,

                pagination: {
                    currentPage: 0,
                    totalPages: 0,
                    totalItems: 0,
                    itemsPerPage:
                        numericLimit,
                },

                filters: {
                    status: {},
                    total: 0,
                },
            };
        }

        const statusStats =
            statusCounts.reduce(
                (result, item) => {
                    result[item._id] =
                        item.count;

                    return result;
                },
                {}
            );

        return {
            stockTransfers,
            empty: false,

            pagination: {
                currentPage:
                    numericPage,

                totalPages: Math.ceil(
                    total /
                        numericLimit
                ),

                totalItems: total,

                itemsPerPage:
                    numericLimit,
            },

            filters: {
                status:
                    statusStats,
                total,
            },
        };
    };

/**
 * Retrieve one Stock Transfer by id.
 */
export const getStockTransferById =
    async ({
        id,
        user,
        accessContext,
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        if (
            !mongoose.Types.ObjectId.isValid(
                id
            )
        ) {
            throw new StockTransferServiceError(
                "Invalid stock transfer ID.",
                {
                    statusCode: 400,
                    code:
                        "INVALID_TRANSFER_ID",
                }
            );
        }

        const stockTransfer =
            await StockTransfer.findById(id)
                .populate(
                    "fromCenter",
                    "_id centerName centerCode centerType email addressLine1 addressLine2 city state"
                )
                .populate(
                    "toCenter",
                    "_id centerName centerCode centerType email addressLine1 addressLine2 city state"
                )
                .populate(
                    "products.product",
                    "_id productTitle salePrice trackSerialNumber"
                )
                .populate(
                    "createdBy",
                    "_id fullName email"
                )
                .populate(
                    "updatedBy",
                    "_id fullName email"
                )
                .populate(
                    "adminApproval.approvedBy",
                    "_id fullName email"
                )
                .populate(
                    "adminApproval.rejectedBy",
                    "_id fullName email"
                )
                .populate(
                    "centerApproval.approvedBy",
                    "_id fullName email"
                )
                .populate(
                    "centerApproval.rejectedBy",
                    "_id fullName email"
                )
                .populate(
                    "shippingInfo.shippedBy",
                    "_id fullName email"
                )
                .populate(
                    "receivingInfo.receivedBy",
                    "_id fullName email"
                )
                .populate(
                    "completionInfo.completedBy",
                    "_id fullName email"
                )
                .populate(
                    "completionInfo.incompleteBy",
                    "_id fullName email"
                )
                .lean();

        if (!stockTransfer) {
            throw new StockTransferServiceError(
                "Stock transfer not found.",
                {
                    statusCode: 404,
                    code:
                        "TRANSFER_NOT_FOUND",
                }
            );
        }

        assertCenterAccess(
            stockTransfer,
            await resolveRequesterCenter(user),
            context,
            "Access denied. You can only view transfers involving your own center."
        );

        return stockTransfer;
    };

/**
 * Update a Draft Stock Transfer.
 */
export const updateStockTransfer =
    async ({
        id,
        user,
        accessContext,
        fromCenter,
        transferNumber,
        remark,
        products,
        date,
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        if (!getUserId(user)) {
            throw new StockTransferServiceError(
                "User authentication required.",
                {
                    statusCode: 401,
                    code:
                        "AUTHENTICATION_REQUIRED",
                }
            );
        }

        const existingTransfer =
            await StockTransfer.findById(id);

        if (!existingTransfer) {
            throw new StockTransferServiceError(
                "Stock transfer not found.",
                {
                    statusCode: 404,
                    code:
                        "TRANSFER_NOT_FOUND",
                }
            );
        }

        assertCenterAccess(
            existingTransfer,
            await resolveRequesterCenter(user),
            context,
            "Access denied. You can only update transfers involving your own center."
        );

        if (
            existingTransfer.status !==
            "Draft"
        ) {
            throw new StockTransferServiceError(
                "Only draft transfers can be updated.",
                {
                    statusCode: 400,
                    code:
                        "TRANSFER_NOT_DRAFT",
                }
            );
        }

        if (
            fromCenter &&
            !sameId(
                existingTransfer.fromCenter,
                fromCenter
            )
        ) {
            assertOwnSourceCenter(
                fromCenter,
                await resolveRequesterCenter(user),
                context
            );
        }

        if (products !== undefined) {
            validateProductsPayload(
                products
            );
        }

        if (date) {
            normalizeTransferDate(date);
        }

        const updateData = {
            updatedBy: getUserId(user),
        };

        if (fromCenter) {
            updateData.fromCenter =
                fromCenter;
        }

        if (transferNumber) {
            updateData.transferNumber =
                transferNumber.trim();
        }

        if (remark !== undefined) {
            updateData.remark = remark;
        }

        if (date) {
            updateData.date =
                new Date(date);
        }

        if (products) {
            updateData.products =
                products;
        }

        try {
            return await StockTransfer.findByIdAndUpdate(
                id,
                updateData,
                {
                    new: true,
                    runValidators: true,
                }
            )
                .populate(
                    "fromCenter",
                    "_id centerName centerCode"
                )
                .populate(
                    "toCenter",
                    "_id centerName centerCode"
                )
                .populate(
                    "products.product",
                    "_id productTitle productCode trackSerialNumber"
                )
                .populate(
                    "createdBy",
                    "_id fullName email"
                )
                .populate(
                    "updatedBy",
                    "_id fullName email"
                );
        } catch (error) {
            if (
                error?.code === 11000
            ) {
                throw new StockTransferServiceError(
                    "Transfer number already exists. Please use a unique transfer number.",
                    {
                        statusCode: 409,
                        code:
                            "DUPLICATE_TRANSFER_NUMBER",
                    }
                );
            }

            throw error;
        }
    };

/**
 * Delete a Stock Transfer.
 *
 * Legacy rule:
 * Completed, Shipped and Rejected transfers cannot be deleted.
 */
export const deleteStockTransfer =
    async ({
        id,
        user,
        accessContext,
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        if (
            !context.canDeleteAll &&
            !context.canDeleteOwn
        ) {
            throw new StockTransferServiceError(
                "Access denied. You do not have permission to delete stock transfers.",
                {
                    statusCode: 403,
                    code:
                        "TRANSFER_DELETE_DENIED",
                }
            );
        }

        const stockTransfer =
            await StockTransfer.findById(id);

        if (!stockTransfer) {
            throw new StockTransferServiceError(
                "Stock transfer not found.",
                {
                    statusCode: 404,
                    code:
                        "TRANSFER_NOT_FOUND",
                }
            );
        }

        assertCenterAccess(
            stockTransfer,
            await resolveRequesterCenter(user),
            context,
            "Access denied. You can only delete transfers involving your own center."
        );

        if (
            [
                "Completed",
                "Shipped",
                "Rejected",
            ].includes(
                stockTransfer.status
            )
        ) {
            /**
             * Preserve the legacy message exactly because clients may depend
             * on the existing API error text.
             */
            throw new StockTransferServiceError(
                "Only Completed, Shipped, Rejected transfers can not be deleted",
                {
                    statusCode: 400,
                    code:
                        "TRANSFER_DELETE_BLOCKED",
                }
            );
        }

        await StockTransfer.findByIdAndDelete(
            id
        );
    };
    /**
 * Get transfers pending admin approval.
 *
 * The legacy implementation had an undefined local `filter` variable in
 * this workflow. The service fixes that internal error while preserving the
 * intended API result: submitted transfers waiting for admin approval.
 */
export const getPendingAdminApprovalTransfers =
    async ({
        user,
        accessContext,
        query = {},
        page,
        limit,
        sortBy,
        sortOrder,
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        if (
            !context.canIndentAll &&
            !context.canIndentOwn
        ) {
            throw new StockTransferServiceError(
                "Access denied. You do not have permission to view pending stock transfers.",
                {
                    statusCode: 403,
                    code:
                        "PENDING_TRANSFER_ACCESS_DENIED",
                }
            );
        }

        const numericPage =
            Math.max(
                parseInt(page ?? query.page, 10) || 1,
                1
            );

        const numericLimit =
            Math.max(
                parseInt(limit ?? query.limit, 10) || 100,
                1
            );

        const filter = {
            status: "Submitted",
            $or: [
                {
                    "adminApproval.status":
                        {
                            $exists: false,
                        },
                },
                {
                    "adminApproval.status":
                        null,
                },
            ],
        };

        /**
         * Own-center users only see transfers involving their center.
         */
        if (
            context.canIndentOwn &&
            !context.canIndentAll
        ) {
            const userCenterId =
                getCenterId(
                    await resolveRequesterCenter(user)
                );

            if (!userCenterId) {
                throw new StockTransferServiceError(
                    "User center information not found.",
                    {
                        statusCode: 400,
                        code:
                            "USER_CENTER_NOT_FOUND",
                    }
                );
            }

            filter.$and = [
                {
                    $or: filter.$or,
                },
                {
                    $or: [
                        {
                            fromCenter:
                                userCenterId,
                        },
                        {
                            toCenter:
                                userCenterId,
                        },
                    ],
                },
            ];

            delete filter.$or;
        }

        const sortOptions =
            buildStockTransferSortOptions(
                sortBy ?? query.sortBy ?? "createdAt",
                sortOrder ?? query.sortOrder ?? "desc"
            );

        const [
            transfers,
            total,
        ] = await Promise.all([
            StockTransfer.find(filter)
                .populate(
                    stockTransferPopulate
                )
                .sort(sortOptions)
                .skip(
                    (numericPage - 1) *
                        numericLimit
                )
                .limit(numericLimit)
                .lean(),

            StockTransfer.countDocuments(
                filter
            ),
        ]);

        return {
            transfers,

            pagination: {
                currentPage:
                    numericPage,

                totalPages:
                    total > 0
                        ? Math.ceil(
                              total /
                                  numericLimit
                          )
                        : 0,

                totalItems: total,

                itemsPerPage:
                    numericLimit,
            },
        };
    };

/**
 * Retrieve transfer statistics for the authenticated user's center.
 *
 * The actual statistical calculation remains in the StockTransfer model
 * because it is already part of the legacy model API.
 */
export const getTransferStats =
    async ({
        user,
        accessContext,
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        if (
            !context.canViewAll &&
            !context.canViewOwn
        ) {
            throw new StockTransferServiceError(
                "Access denied. You do not have permission to view transfer statistics.",
                {
                    statusCode: 403,
                    code:
                        "TRANSFER_STATS_ACCESS_DENIED",
                }
            );
        }

        const authenticatedUser =
            await User.findById(
                getUserId(user)
            ).populate("center");

        if (!authenticatedUser) {
            throw new StockTransferServiceError(
                "User not found.",
                {
                    statusCode: 404,
                    code:
                        "USER_NOT_FOUND",
                }
            );
        }

        if (!authenticatedUser.center) {
            throw new StockTransferServiceError(
                "User center information not found.",
                {
                    statusCode: 400,
                    code:
                        "USER_CENTER_NOT_FOUND",
                }
            );
        }

        const centerId =
            authenticatedUser.center._id;

        // Legacy behaviour: statistics are always computed for the
        // authenticated user's own center, never for all centers.
        return StockTransfer.getTransferStats(centerId);
    };

/**
 * Update shipping information for a transfer.
 *
 * Legacy rules:
 * - Shipping information can only be changed for Confirmed/Shipped transfers.
 * - The existing shippingInfo object is preserved and only supplied fields
 *   are changed.
 */
export const updateShippingInfo =
    async ({
        id,
        user,
        accessContext,
        shippedDate,
        expectedDeliveryDate,
        shipmentDetails,
        carrierInfo,
        documents,
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        if (
            !context.canManageAll &&
            !context.canManageOwn
        ) {
            throw new StockTransferServiceError(
                "Access denied. You do not have permission to update shipping information.",
                {
                    statusCode: 403,
                    code:
                        "SHIPPING_UPDATE_DENIED",
                }
            );
        }

        const stockTransfer =
            await StockTransfer.findById(id);

        if (!stockTransfer) {
            throw new StockTransferServiceError(
                "Stock transfer not found.",
                {
                    statusCode: 404,
                    code:
                        "TRANSFER_NOT_FOUND",
                }
            );
        }

        if (
            ![
                "Shipped",
                "Confirmed",
            ].includes(
                stockTransfer.status
            )
        ) {
            throw new StockTransferServiceError(
                "Shipping information can only be updated for Confirmed or Shipped transfers.",
                {
                    statusCode: 400,
                    code:
                        "INVALID_SHIPPING_UPDATE_STATUS",
                }
            );
        }

        assertCenterAccess(
            stockTransfer,
            await resolveRequesterCenter(user),
            context,
            "Access denied. You can only update shipping information for transfers involving your own center."
        );

        if (!getUserId(user)) {
            throw new StockTransferServiceError(
                "User authentication required.",
                {
                    statusCode: 401,
                    code:
                        "AUTHENTICATION_REQUIRED",
                }
            );
        }

        const currentShippingInfo =
            stockTransfer.shippingInfo
                ? stockTransfer.shippingInfo.toObject
                    ? stockTransfer.shippingInfo.toObject()
                    : {
                          ...stockTransfer.shippingInfo,
                      }
                : {};

        if (shippedDate) {
            currentShippingInfo.shippedDate =
                new Date(shippedDate);
        }

        if (expectedDeliveryDate) {
            currentShippingInfo.expectedDeliveryDate =
                new Date(
                    expectedDeliveryDate
                );
        }

        if (
            shipmentDetails !==
            undefined
        ) {
            currentShippingInfo.shipmentDetails =
                shipmentDetails;
        }

        if (carrierInfo !== undefined) {
            currentShippingInfo.carrierInfo =
                carrierInfo;
        }

        if (documents !== undefined) {
            currentShippingInfo.documents =
                documents;
        }

        currentShippingInfo.shippedBy =
            stockTransfer.shippingInfo
                ?.shippedBy ||
            getUserId(user);

        currentShippingInfo.updatedAt =
            new Date();

        try {
            const updatedTransfer =
                await StockTransfer.findByIdAndUpdate(
                    id,
                    {
                        shippingInfo:
                            currentShippingInfo,
                        updatedBy: getUserId(user),
                    },
                    {
                        new: true,
                        runValidators: true,
                    }
                )
                    .populate(
                        stockTransferPopulate
                    );

            return updatedTransfer;
        } catch (error) {
            /**
             * Legacy compatibility:
             *
             * Some legacy shipping subdocument validation could reject a
             * partial update. The old controller retried without Mongoose
             * validators and then performed manual validation.
             *
             * Preserve that fallback rather than silently changing the
             * shipping workflow.
             */
            if (
                error?.name !==
                "ValidationError"
            ) {
                throw error;
            }

            const updatedTransfer =
                await StockTransfer.findByIdAndUpdate(
                    id,
                    {
                        shippingInfo:
                            currentShippingInfo,
                        updatedBy: getUserId(user),
                    },
                    {
                        new: true,
                        runValidators: false,
                    }
                )
                    .populate(
                        stockTransferPopulate
                    );

            return updatedTransfer;
        }
    };

/**
 * Reject shipping and return the transfer to Confirmed status.
 *
 * This is different from rejecting the transfer itself.
 *
 * Shipping rejection:
 *
 *     Shipped -> Confirmed
 *
 * and any source stock deduction is reverted.
 */
export const rejectShipping =
    async ({
        id,
        user,
        accessContext,
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        if (
            !context.canManageAll &&
            !context.canManageOwn
        ) {
            throw new StockTransferServiceError(
                "Access denied. You do not have permission to reject shipping.",
                {
                    statusCode: 403,
                    code:
                        "SHIPPING_REJECTION_DENIED",
                }
            );
        }

        if (!getUserId(user)) {
            throw new StockTransferServiceError(
                "User authentication required.",
                {
                    statusCode: 401,
                    code:
                        "AUTHENTICATION_REQUIRED",
                }
            );
        }

        const stockTransfer =
            await StockTransfer.findById(id);

        if (!stockTransfer) {
            throw new StockTransferServiceError(
                "Stock transfer not found.",
                {
                    statusCode: 404,
                    code:
                        "TRANSFER_NOT_FOUND",
                }
            );
        }

        if (
            stockTransfer.status !==
            "Shipped"
        ) {
            throw new StockTransferServiceError(
                "Only shipped transfers can have shipping rejected.",
                {
                    statusCode: 400,
                    code:
                        "INVALID_SHIPPING_REJECTION_STATUS",
                }
            );
        }

        assertCenterAccess(
            stockTransfer,
            await resolveRequesterCenter(user),
            context,
            "Access denied. You can only reject shipping for transfers involving your own center."
        );

        const previousShippingInfo =
            stockTransfer.shippingInfo
                ? stockTransfer.shippingInfo.toObject
                    ? stockTransfer.shippingInfo.toObject()
                    : {
                          ...stockTransfer.shippingInfo,
                      }
                : {};

        /**
         * Revert source stock if the transfer already deducted it during
         * shipping.
         */
        if (
            stockTransfer.stockStatus
                ?.sourceDeducted
        ) {
            await stockTransfer.reverseSourceDeduction();
        }

        const updateData = {
            status: "Confirmed",

            shippingInfo: {
                ...previousShippingInfo,
                shippedDate: null,
                expectedDeliveryDate:
                    null,
                shipmentDetails: null,
                documents: [],
                carrierInfo: null,
            },

            shipmentRejected: {
                rejected: true,
                rejectedAt: new Date(),
                rejectedBy: getUserId(user),
            },

            stockStatus: {
                ...(stockTransfer.stockStatus
                    ? stockTransfer.stockStatus.toObject
                        ? stockTransfer.stockStatus.toObject()
                        : stockTransfer.stockStatus
                    : {}),

                sourceDeducted: false,
                deductedAt: null,
                lastStockCheck: new Date(),
            },

            updatedBy: getUserId(user),
        };

        const updatedTransfer =
            await StockTransfer.findByIdAndUpdate(
                id,
                updateData,
                {
                    new: true,
                    runValidators: true,
                }
            )
                .populate(
                    stockTransferPopulate
                );

        return updatedTransfer;
    };

/**
 * Get the most recently created transfer number.
 *
 * Used by clients that need the latest transfer-number sequence reference.
 */
export const getMostRecentTransferNumber =
    async () => {
        const latestTransfer =
            await StockTransfer.findOne()
                .sort({
                    createdAt: -1,
                })
                .select(
                    "transferNumber createdAt"
                )
                .lean();

        if (!latestTransfer) {
            throw new StockTransferServiceError(
                "No stock transfers found.",
                {
                    statusCode: 404,
                    code:
                        "NO_TRANSFERS_FOUND",
                }
            );
        }

        return {
            transferNumber:
                latestTransfer.transferNumber,

            createdAt:
                latestTransfer.createdAt,
        };
    };

/**
 * Restore selected serialized items to available stock.
 *
 * Used when an approved serial assignment is changed before shipment.
 */
const restoreSerialsToAvailable = async ({
    centerStock,
    serialsToRestore,
    fromCenter,
    toCenter,
}) => {
    if (
        !Array.isArray(
            serialsToRestore
        ) ||
        serialsToRestore.length === 0
    ) {
        return 0;
    }

    let restoredCount = 0;

    for (const serialNumber of
        serialsToRestore) {
        const serial =
            centerStock.serialNumbers.find(
                (item) =>
                    item.serialNumber ===
                    serialNumber
            );

        if (!serial) {
            continue;
        }

        serial.status = "available";
        serial.currentLocation =
            fromCenter;

        serial.transferHistory.push({
            fromCenter,
            toCenter,
            transferDate: new Date(),
            transferType:
                "transfer_updated",
        });

        restoredCount++;
    }

    return restoredCount;
};

/**
 * Move selected available serials into in-transit state.
 *
 * This helper is used when an approved serial assignment is increased or
 * replaced.
 */
const markSerialsAsInTransit = async ({
    centerStock,
    serials,
    fromCenter,
    toCenter,
}) => {
    if (
        !Array.isArray(serials) ||
        serials.length === 0
    ) {
        return 0;
    }

    let movedCount = 0;

    for (const serialNumber of serials) {
        const serial =
            centerStock.serialNumbers.find(
                (item) =>
                    item.serialNumber ===
                        serialNumber &&
                    item.status ===
                        "available"
            );

        if (!serial) {
            throw new StockTransferServiceError(
                `Serial number ${serialNumber} is not available at the source center.`,
                {
                    statusCode: 400,
                    code:
                        "SERIAL_NOT_AVAILABLE",
                }
            );
        }

        serial.status =
            "in_transit";

        serial.currentLocation =
            fromCenter;

        serial.transferHistory.push({
            fromCenter,
            toCenter,
            transferDate: new Date(),
            transferType:
                "transfer_updated",
        });

        movedCount++;
    }

    return movedCount;
};

/**
 * Update approved quantities and serial assignments.
 *
 * This workflow is intentionally kept separate from confirmation because
 * the legacy API allows approved quantities/serials to be adjusted after
 * the initial approval.
 */
export const updateApprovedQuantities =
    async ({
        id,
        user,
        accessContext,
        productApprovals,
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        if (!user?.id) {
            throw new StockTransferServiceError(
                "User authentication required.",
                {
                    statusCode: 401,
                    code:
                        "AUTHENTICATION_REQUIRED",
                }
            );
        }

        if (
            !context.canManageAll &&
            !context.canManageOwn
        ) {
            throw new StockTransferServiceError(
                "Access denied. You do not have permission to update approved quantities.",
                {
                    statusCode: 403,
                    code:
                        "APPROVED_QUANTITY_UPDATE_DENIED",
                }
            );
        }

        if (
            !Array.isArray(productApprovals) ||
            productApprovals.length === 0
        ) {
            throw new StockTransferServiceError(
                "Product approvals are required.",
                {
                    statusCode: 400,
                    code:
                        "PRODUCT_APPROVALS_REQUIRED",
                }
            );
        }

        const stockTransfer =
            await StockTransfer.findById(id);

        if (!stockTransfer) {
            throw new StockTransferServiceError(
                "Stock transfer not found.",
                {
                    statusCode: 404,
                    code:
                        "TRANSFER_NOT_FOUND",
                }
            );
        }

        assertCenterAccess(
            stockTransfer,
            user.center,
            context,
            "Access denied. You can only update transfers involving your own center."
        );

        /*
         * Approval quantities can only be changed before confirmation.
         * Once stock has been confirmed/reserved, changing the approval
         * here could make the transfer and stock state inconsistent.
         */
        if (
            ![
                "Submitted",
                "Admin_Approved",
            ].includes(stockTransfer.status)
        ) {
            throw new StockTransferServiceError(
                `Approved quantities cannot be updated when transfer status is ${stockTransfer.status}.`,
                {
                    statusCode: 400,
                    code:
                        "APPROVED_QUANTITY_UPDATE_NOT_ALLOWED",
                }
            );
        }

        /*
         * Validate every approval before modifying the transfer.
         * This keeps the operation atomic from the application layer:
         * invalid approval data will not partially update products.
         */
        const validatedApprovals = [];

        for (const approval of productApprovals) {
            if (!approval.productId) {
                throw new StockTransferServiceError(
                    "Product ID is required for each approval.",
                    {
                        statusCode: 400,
                        code:
                            "APPROVAL_PRODUCT_REQUIRED",
                    }
                );
            }

            if (
                approval.approvedQuantity ===
                    undefined ||
                approval.approvedQuantity ===
                    null
            ) {
                throw new StockTransferServiceError(
                    "Approved quantity is required for each product.",
                    {
                        statusCode: 400,
                        code:
                            "APPROVED_QUANTITY_REQUIRED",
                    }
                );
            }

            if (
                approval.approvedQuantity < 0
            ) {
                throw new StockTransferServiceError(
                    "Approved quantity cannot be negative.",
                    {
                        statusCode: 400,
                        code:
                            "NEGATIVE_APPROVED_QUANTITY",
                    }
                );
            }

            const transferProduct =
                stockTransfer.products.find(
                    (item) =>
                        sameId(
                            item.product,
                            approval.productId
                        )
                );

            if (!transferProduct) {
                throw new StockTransferServiceError(
                    `Product ${approval.productId} not found in this transfer.`,
                    {
                        statusCode: 400,
                        code:
                            "TRANSFER_PRODUCT_NOT_FOUND",
                    }
                );
            }

            if (
                approval.approvedQuantity >
                transferProduct.quantity
            ) {
                throw new StockTransferServiceError(
                    `Approved quantity cannot exceed requested quantity for product ${approval.productId}.`,
                    {
                        statusCode: 400,
                        code:
                            "APPROVED_QUANTITY_EXCEEDS_REQUEST",
                    }
                );
            }

            const product =
                await Product.findById(
                    approval.productId
                );

            if (!product) {
                throw new StockTransferServiceError(
                    `Product ${approval.productId} not found.`,
                    {
                        statusCode: 404,
                        code:
                            "PRODUCT_NOT_FOUND",
                    }
                );
            }

            const requiresSerialNumbers =
                product.trackSerialNumber ===
                "Yes";

            const approvedSerials =
                Array.isArray(
                    approval.approvedSerials
                )
                    ? approval.approvedSerials
                    : [];

            /*
             * Serialized products must have exactly one serial
             * assignment for every approved unit.
             */
            if (
                requiresSerialNumbers &&
                approval.approvedQuantity > 0
            ) {
                if (
                    approvedSerials.length !==
                    approval.approvedQuantity
                ) {
                    throw new StockTransferServiceError(
                        `Serial number count must match approved quantity for product ${product.productTitle}.`,
                        {
                            statusCode: 400,
                            code:
                                "SERIAL_QUANTITY_MISMATCH",
                        }
                    );
                }

                const uniqueSerials =
                    new Set(
                        approvedSerials
                    );

                if (
                    uniqueSerials.size !==
                    approvedSerials.length
                ) {
                    throw new StockTransferServiceError(
                        `Duplicate serial numbers found for product ${product.productTitle}.`,
                        {
                            statusCode: 400,
                            code:
                                "DUPLICATE_SERIAL_NUMBERS",
                        }
                    );
                }
            }

            /*
             * Non-serialized products must not contain serial assignments.
             */
            if (
                !requiresSerialNumbers &&
                approvedSerials.length > 0
            ) {
                throw new StockTransferServiceError(
                    `Product ${product.productTitle} does not track serial numbers.`,
                    {
                        statusCode: 400,
                        code:
                            "SERIALS_FOR_NON_SERIAL_PRODUCT",
                    }
                );
            }

            validatedApprovals.push({
                transferProduct,
                approvedQuantity:
                    approval.approvedQuantity,
                approvedSerials,
                approvedRemark:
                    approval.approvedRemark || "",
                requiresSerialNumbers,
            });
        }

        /*
         * IMPORTANT:
         * This function only updates the approval information.
         *
         * No CenterStock document is modified here.
         *
         * Stock reservation is intentionally handled by
         * confirmStockTransfer(), so the stock movement has one
         * clear owner in the transfer lifecycle.
         */
        for (const approval of validatedApprovals) {
            approval.transferProduct.approvedQuantity =
                approval.approvedQuantity;

            approval.transferProduct.approvedRemark =
                approval.approvedRemark;

            approval.transferProduct.approvedSerials =
                approval.approvedSerials;

            approval.transferProduct.requiresSerialNumbers =
                approval.requiresSerialNumbers;
        }

        stockTransfer.updatedBy =
            user.id;

        const updatedTransfer =
            await stockTransfer.save();

        return populateStockTransfer(
            StockTransfer.findById(
                updatedTransfer._id
            )
        );
    };
    /**
 * Build the current stock summary for a product at a warehouse/center.
 *
 * The legacy Stock Transfer controller combines information from:
 *
 * - CenterStock
 * - OutletStock
 * - StockPurchase
 * - StockRequest
 * - StockUsage
 *
 * This helper keeps those data sources separate so the final summary can
 * expose the same combined information expected by the existing API.
 */
const getCurrentProductStock = async ({
    centerId,
    productId,
    isOutlet,
}) => {
    if (isOutlet) {
        const outletStock =
            await OutletStock.findOne({
                outlet: centerId,
                product: productId,
            }).lean();

        return {
            totalQuantity:
                outletStock?.totalQuantity || 0,

            availableQuantity:
                outletStock?.availableQuantity ||
                0,

            inTransitQuantity:
                outletStock?.inTransitQuantity ||
                0,

            consumedQuantity:
                outletStock?.consumedQuantity ||
                0,

            serialNumbers:
                outletStock?.serials || [],
        };
    }

    const centerStock =
        await CenterStock.findOne({
            center: centerId,
            product: productId,
        }).lean();

    return {
        totalQuantity:
            centerStock?.totalQuantity || 0,

        availableQuantity:
            centerStock?.availableQuantity ||
            0,

        inTransitQuantity:
            centerStock?.inTransitQuantity ||
            0,

        consumedQuantity:
            centerStock?.consumedQuantity ||
            0,

        serialNumbers:
            centerStock?.serialNumbers || [],
    };
};

/**
 * Aggregate serialized stock distributed from an outlet/warehouse to
 * individual centers.
 *
 * `originalOutlet` is used as the relationship between the original
 * warehouse/outlet stock and the center where the stock currently resides.
 */
const getDistributedCenterStock = async ({
    warehouseId,
    productId,
}) => {
    return CenterStock.aggregate([
        {
            $match: {
                "serialNumbers.originalOutlet":
                    toObjectId(warehouseId),

                product:
                    toObjectId(productId),
            },
        },

        {
            $unwind:
                "$serialNumbers",
        },

        {
            $match: {
                "serialNumbers.originalOutlet":
                    toObjectId(warehouseId),

                "serialNumbers.status": {
                    $in: [
                        "available",
                        "in_transit",
                        "transferred",
                        "consumed",
                        "damaged",
                        "damage_pending",
                        "pending_return",
                    ],
                },
            },
        },

        {
            $group: {
                _id: "$center",

                totalQuantity: {
                    $sum: 1,
                },

                availableQuantity: {
                    $sum: {
                        $cond: [
                            {
                                $eq: [
                                    "$serialNumbers.status",
                                    "available",
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },

                inTransitQuantity: {
                    $sum: {
                        $cond: [
                            {
                                $eq: [
                                    "$serialNumbers.status",
                                    "in_transit",
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },

                transferredQuantity: {
                    $sum: {
                        $cond: [
                            {
                                $eq: [
                                    "$serialNumbers.status",
                                    "transferred",
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },

                serials: {
                    $push: "$serialNumbers",
                },
            },
        },

        {
            $lookup: {
                from: "centers",
                localField: "_id",
                foreignField: "_id",
                as: "center",
            },
        },

        {
            $unwind: {
                path: "$center",
                preserveNullAndEmptyArrays:
                    true,
            },
        },

        {
            $project: {
                _id: 0,

                centerId: "$_id",

                centerName:
                    "$center.centerName",

                centerCode:
                    "$center.centerCode",

                totalQuantity: 1,
                availableQuantity: 1,
                inTransitQuantity: 1,
                transferredQuantity: 1,
                serials: 1,
            },
        },
    ]);
};

/**
 * Retrieve historical stock purchase information.
 */
const getStockPurchaseSummary = async ({
    warehouseId,
    productId,
    startDate,
    endDate,
    isOutlet,
}) => {
    const match = {
        product: toObjectId(productId),
    };

    /**
     * StockPurchase uses the warehouse/outlet relationship in the legacy
     * workflow. Keep the field selection tolerant because the old data may
     * contain either outlet or warehouse references depending on the record.
     */
    if (isOutlet) {
        match.outlet =
            toObjectId(warehouseId);
    } else {
        match.warehouse =
            toObjectId(warehouseId);
    }

    if (startDate || endDate) {
        match.createdAt = {};

        if (startDate) {
            match.createdAt.$gte =
                new Date(startDate);
        }

        if (endDate) {
            match.createdAt.$lte =
                new Date(endDate);
        }
    }

    return StockPurchase.find(match)
        .sort({
            createdAt: -1,
        })
        .lean();
};

/**
 * Retrieve completed stock requests for the requested product.
 */
const getStockRequestSummary = async ({
    warehouseId,
    productId,
    startDate,
    endDate,
    isOutlet,
}) => {
    const match = {
        product: toObjectId(productId),
        status: "Completed",
    };

    if (isOutlet) {
        match.outlet =
            toObjectId(warehouseId);
    } else {
        match.center =
            toObjectId(warehouseId);
    }

    if (startDate || endDate) {
        match.createdAt = {};

        if (startDate) {
            match.createdAt.$gte =
                new Date(startDate);
        }

        if (endDate) {
            match.createdAt.$lte =
                new Date(endDate);
        }
    }

    return StockRequest.find(match)
        .sort({
            createdAt: -1,
        })
        .lean();
};

/**
 * Retrieve completed usage records for a center.
 */
const getCenterUsageSummary = async ({
    centerId,
    productId,
    startDate,
    endDate,
}) => {
    const match = {
        center: toObjectId(centerId),
        product: toObjectId(productId),
        status: "completed",
    };

    if (startDate || endDate) {
        match.createdAt = {};

        if (startDate) {
            match.createdAt.$gte =
                new Date(startDate);
        }

        if (endDate) {
            match.createdAt.$lte =
                new Date(endDate);
        }
    }

    return StockUsage.find(match)
        .sort({
            createdAt: -1,
        })
        .lean();
};

/**
 * Calculate numeric totals from historical collections.
 *
 * Because the legacy collections may use slightly different quantity field
 * names, the calculation checks the known legacy quantity fields without
 * modifying the stored schema.
 */
const calculateHistoricalTotals = (
    records = []
) => {
    return records.reduce(
        (totals, record) => {
            const quantity = Number(
                record.quantity ??
                    record.totalQuantity ??
                    record.approvedQuantity ??
                    record.receivedQuantity ??
                    0
            );

            if (
                Number.isFinite(quantity)
            ) {
                totals.quantity += quantity;
            }

            return totals;
        },
        {
            quantity: 0,
        }
    );
};

/**
 * Get product summary for a warehouse/center.
 *
 * This preserves the legacy response concept:
 *
 * - currentStock
 * - distributedCenters
 * - historical purchase information
 * - stock requests
 * - stock usage
 * - summary totals
 * - stock status
 * - period
 * - data sources
 */
export const getWarehouseProductSummary =
    async ({
        user,
        accessContext,
        query = {},
        warehouseId: warehouseIdParam,
        productId: productIdParam,
        startDate: startDateParam,
        endDate: endDateParam,
        includeDetails: includeDetailsParam,
    }) => {
        const context =
            normalizeAccessContext(
                accessContext
            );

        const warehouseId =
            warehouseIdParam ?? query.warehouseId;
        const productId =
            productIdParam ?? query.productId;
        const startDate =
            startDateParam ?? query.startDate;
        const endDate =
            endDateParam ?? query.endDate;
        const includeDetails = parseBooleanFlag(
            includeDetailsParam ?? query.includeDetails
        );

        if (
            !context.canViewAll &&
            !context.canViewOwn
        ) {
            throw new StockTransferServiceError(
                "Access denied. You do not have permission to view warehouse product summaries.",
                {
                    statusCode: 403,
                    code:
                        "WAREHOUSE_SUMMARY_ACCESS_DENIED",
                }
            );
        }

        if (!warehouseId) {
            throw new StockTransferServiceError(
                "Warehouse ID is required.",
                {
                    statusCode: 400,
                    code:
                        "WAREHOUSE_ID_REQUIRED",
                }
            );
        }

        if (!productId) {
            throw new StockTransferServiceError(
                "Product ID is required.",
                {
                    statusCode: 400,
                    code:
                        "PRODUCT_ID_REQUIRED",
                }
            );
        }

        if (
            !mongoose.Types.ObjectId.isValid(
                warehouseId
            )
        ) {
            throw new StockTransferServiceError(
                "Invalid warehouse ID.",
                {
                    statusCode: 400,
                    code:
                        "INVALID_WAREHOUSE_ID",
                }
            );
        }

        if (
            !mongoose.Types.ObjectId.isValid(
                productId
            )
        ) {
            throw new StockTransferServiceError(
                "Invalid product ID.",
                {
                    statusCode: 400,
                    code:
                        "INVALID_PRODUCT_ID",
                }
            );
        }

        const authenticatedUser =
            await User.findById(
                getUserId(user)
            ).populate("center");

        if (!authenticatedUser) {
            throw new StockTransferServiceError(
                "User not found.",
                {
                    statusCode: 404,
                    code:
                        "USER_NOT_FOUND",
                }
            );
        }

        if (!authenticatedUser.center) {
            throw new StockTransferServiceError(
                "User center information not found.",
                {
                    statusCode: 400,
                    code:
                        "USER_CENTER_NOT_FOUND",
                }
            );
        }

        /**
         * Determine whether the authenticated user's center is an Outlet.
         *
         * Legacy stock-summary behaviour uses OutletStock for outlets and
         * CenterStock for regular centers.
         */
        const userCenter =
            authenticatedUser.center;

        const isUserOutlet =
            userCenter.centerType ===
            "Outlet";

        let targetCenter;

        if (isUserOutlet) {
            targetCenter =
                await Center.findById(
                    warehouseId
                ).lean();

            if (!targetCenter) {
                throw new StockTransferServiceError(
                    "Warehouse or outlet center not found.",
                    {
                        statusCode: 404,
                        code:
                            "WAREHOUSE_NOT_FOUND",
                    }
                );
            }

            if (
                targetCenter.centerType !==
                "Outlet"
            ) {
                throw new StockTransferServiceError(
                    "Selected warehouse must be an Outlet.",
                    {
                        statusCode: 400,
                        code:
                            "INVALID_WAREHOUSE_TYPE",
                    }
                );
            }
        } else {
            /**
             * For regular centers the authenticated user's center is the
             * target unless all-center access explicitly requests another
             * center.
             */
            if (
                context.canViewAll
            ) {
                targetCenter =
                    await Center.findById(
                        warehouseId
                    ).lean();
            } else {
                targetCenter =
                    await Center.findById(
                        userCenter._id
                    ).lean();
            }

            if (!targetCenter) {
                throw new StockTransferServiceError(
                    "Center not found.",
                    {
                        statusCode: 404,
                        code:
                            "CENTER_NOT_FOUND",
                    }
                );
            }

            if (
                targetCenter.centerType !==
                "Center"
            ) {
                throw new StockTransferServiceError(
                    "Selected location must be a Center.",
                    {
                        statusCode: 400,
                        code:
                            "INVALID_CENTER_TYPE",
                    }
                );
            }
        }

        const targetCenterId =
            targetCenter._id;

        const [
            product,
            currentStock,
            distributedCenters,
            purchases,
            requests,
            usage,
        ] = await Promise.all([
            Product.findById(
                productId
            ).lean(),

            getCurrentProductStock({
                centerId:
                    targetCenterId,
                productId,
                isOutlet:
                    targetCenter.centerType ===
                    "Outlet",
            }),

            getDistributedCenterStock({
                warehouseId:
                    targetCenterId,
                productId,
            }),

            getStockPurchaseSummary({
                warehouseId:
                    targetCenterId,
                productId,
                startDate,
                endDate,
                isOutlet:
                    targetCenter.centerType ===
                    "Outlet",
            }),

            getStockRequestSummary({
                warehouseId:
                    targetCenterId,
                productId,
                startDate,
                endDate,
                isOutlet:
                    targetCenter.centerType ===
                    "Outlet",
            }),

            getCenterUsageSummary({
                centerId:
                    targetCenterId,
                productId,
                startDate,
                endDate,
            }),
        ]);

        if (!product) {
            throw new StockTransferServiceError(
                "Product not found.",
                {
                    statusCode: 404,
                    code:
                        "PRODUCT_NOT_FOUND",
                }
            );
        }

        const purchaseTotals =
            calculateHistoricalTotals(
                purchases
            );

        const requestTotals =
            calculateHistoricalTotals(
                requests
            );

        const usageTotals =
            calculateHistoricalTotals(
                usage
            );

        const distributedTotals =
            distributedCenters.reduce(
                (totals, center) => {
                    totals.totalQuantity +=
                        center.totalQuantity ||
                        0;

                    totals.availableQuantity +=
                        center.availableQuantity ||
                        0;

                    totals.inTransitQuantity +=
                        center.inTransitQuantity ||
                        0;

                    totals.transferredQuantity +=
                        center.transferredQuantity ||
                        0;

                    return totals;
                },
                {
                    totalQuantity: 0,
                    availableQuantity: 0,
                    inTransitQuantity: 0,
                    transferredQuantity: 0,
                }
            );

        const summaryTotals = {
            currentStock:
                currentStock.totalQuantity,

            currentAvailable:
                currentStock.availableQuantity,

            currentInTransit:
                currentStock.inTransitQuantity,

            currentConsumed:
                currentStock.consumedQuantity,

            distributed:
                distributedTotals.totalQuantity,

            distributedAvailable:
                distributedTotals.availableQuantity,

            distributedInTransit:
                distributedTotals.inTransitQuantity,

            purchased:
                purchaseTotals.quantity,

            requested:
                requestTotals.quantity,

            used:
                usageTotals.quantity,
        };

        const summary = {
            product: {
                _id: product._id,
                productTitle:
                    product.productTitle,
                productCode:
                    product.productCode,
                trackSerialNumber:
                    product.trackSerialNumber,
            },

            currentStock,

            distributedCenters,

            historical: {
                purchases:
                    includeDetails
                        ? purchases
                        : undefined,

                stockRequests:
                    includeDetails
                        ? requests
                        : undefined,

                stockUsage:
                    includeDetails
                        ? usage
                        : undefined,
            },

            summaryTotals,

            details: includeDetails
                ? {
                      purchases,
                      stockRequests:
                          requests,
                      stockUsage:
                          usage,
                  }
                : undefined,
        };

        /**
         * Remove undefined historical fields when details were not requested.
         */
        if (!includeDetails) {
            delete summary.historical
                .purchases;

            delete summary.historical
                .stockRequests;

            delete summary.historical
                .stockUsage;
        }

        return {
            warehouse: {
                _id:
                    targetCenter._id,

                name:
                    targetCenter.centerName,

                code:
                    targetCenter.centerCode,

                type:
                    targetCenter.centerType,
            },

            center:
                targetCenter.centerType ===
                "Center"
                    ? {
                          _id:
                              targetCenter._id,

                          name:
                              targetCenter.centerName,

                          code:
                              targetCenter.centerCode,
                      }
                    : null,

            userCenter: {
                _id:
                    userCenter._id,

                centerName:
                    userCenter.centerName,

                centerCode:
                    userCenter.centerCode,

                centerType:
                    userCenter.centerType,
            },

            summary,

            summaryTotals,

            stockStatus: {
                available:
                    currentStock.availableQuantity,

                inTransit:
                    currentStock.inTransitQuantity,

                consumed:
                    currentStock.consumedQuantity,

                total:
                    currentStock.totalQuantity,
            },

            period: {
                startDate:
                    startDate || null,

                endDate:
                    endDate || null,
            },

            generatedAt: new Date(),

            dataSources: [
                "CenterStock",
                "OutletStock",
                "StockPurchase",
                "StockRequest",
                "StockUsage",
            ],
        };
    };

/**
 * Get product distribution across centers.
 *
 * This is the lightweight distribution endpoint. Unlike
 * getWarehouseProductSummary(), it focuses specifically on serialized
 * stock distributed from a warehouse/outlet to centers.
 */
export const getProductDistribution =
    async ({
        query = {},
        warehouseId: warehouseIdParam,
        productId: productIdParam,
    }) => {
        const warehouseId =
            warehouseIdParam ?? query.warehouseId;
        const productId =
            productIdParam ?? query.productId;

        if (!warehouseId) {
            throw new StockTransferServiceError(
                "Warehouse ID is required.",
                {
                    statusCode: 400,
                    code:
                        "WAREHOUSE_ID_REQUIRED",
                }
            );
        }

        if (!productId) {
            throw new StockTransferServiceError(
                "Product ID is required.",
                {
                    statusCode: 400,
                    code:
                        "PRODUCT_ID_REQUIRED",
                }
            );
        }

        if (
            !mongoose.Types.ObjectId.isValid(
                warehouseId
            )
        ) {
            throw new StockTransferServiceError(
                "Invalid warehouse ID.",
                {
                    statusCode: 400,
                    code:
                        "INVALID_WAREHOUSE_ID",
                }
            );
        }

        if (
            !mongoose.Types.ObjectId.isValid(
                productId
            )
        ) {
            throw new StockTransferServiceError(
                "Invalid product ID.",
                {
                    statusCode: 400,
                    code:
                        "INVALID_PRODUCT_ID",
                }
            );
        }

        const distribution =
            await getDistributedCenterStock({
                warehouseId,
                productId,
            });

        const summary =
            distribution.reduce(
                (result, item) => {
                    result.totalQuantity +=
                        item.totalQuantity ||
                        0;

                    result.availableQuantity +=
                        item.availableQuantity ||
                        0;

                    result.inTransitQuantity +=
                        item.inTransitQuantity ||
                        0;

                    result.transferredQuantity +=
                        item.transferredQuantity ||
                        0;

                    return result;
                },
                {
                    totalQuantity: 0,
                    availableQuantity: 0,
                    inTransitQuantity: 0,
                    transferredQuantity: 0,
                }
            );

        const utilization =
            summary.totalQuantity > 0
                ? (
                      (summary.transferredQuantity /
                          summary.totalQuantity) *
                      100
                  ).toFixed(2)
                : "0.00";

        return {
            distribution,

            summary: {
                ...summary,
                utilization:
                    Number(utilization),
            },
        };
    };

/**
 * Public service API.
 *
 * Keeping a single exported object makes the controller imports explicit
 * and prevents accidental exposure of internal helpers.
 */
export const stockTransferService = {
    createStockTransfer,

    submitStockTransfer,

    approveStockTransferByAdmin,

    rejectStockTransferByAdmin,

    validateSerialNumbers,

    getAvailableSerials,

    confirmStockTransfer,

    completeStockTransfer,

    shipStockTransfer,

    markStockTransferAsIncomplete,

    completeIncompleteStockTransfer,

    rejectStockTransfer,

    getAllStockTransfers,

    getStockTransferById,

    updateStockTransfer,

    deleteStockTransfer,

    getPendingAdminApprovalTransfers,

    getTransferStats,

    updateShippingInfo,

    rejectShipping,

    getMostRecentTransferNumber,

    updateApprovedQuantities,

    getWarehouseProductSummary,

    getProductDistribution,
};

export default stockTransferService;