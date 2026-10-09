import mongoose from "mongoose";

import RaisePO from "../models/RaisePO.js";
import User from "../models/User.js";
import Permission from "../models/Permission.js";
import { ApiError } from "../utils/ApiError.js";
import { isSuperAdmin } from "../utils/checkPermissions.js";

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

/**
 * Authenticated user's ID.
 * authMiddleware sets: { id, role, status, fullUser }.
 */
function getUserId(user) {
    return user?.fullUser?._id ?? user?.id ?? user?._id;
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertValidId(id, label = "ID") {
    if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(400, `Invalid ${label}`);
    }
}

/**
 * Normalizes role permissions.
 * Supports embedded groups ({ module, permissions: [] })
 * and ObjectId references to the Permission collection.
 */
async function normalizeRolePermissions(rolePermissions = []) {
    if (!Array.isArray(rolePermissions)) {
        return [];
    }

    const embedded = rolePermissions.filter(
        (permission) =>
            permission &&
            typeof permission === "object" &&
            !permission._bsontype &&
            permission.module
    );

    const permissionIds = rolePermissions.filter(
        (permission) =>
            permission &&
            (typeof permission === "string" ||
                permission._bsontype === "ObjectID" ||
                permission._bsontype === "ObjectId")
    );

    if (permissionIds.length === 0) {
        return embedded;
    }

    const referenced = await Permission.find({
        _id: { $in: permissionIds },
        status: "Enable",
    })
        .select("module action")
        .lean();

    const groups = [];

    for (const permission of referenced) {
        let group = groups.find(
            (item) =>
                item.module.toLowerCase() ===
                String(permission.module).toLowerCase()
        );

        if (!group) {
            group = { module: permission.module, permissions: [] };
            groups.push(group);
        }

        if (!group.permissions.includes(permission.action)) {
            group.permissions.push(permission.action);
        }
    }

    return [...embedded, ...groups];
}

/**
 * Checks Raise PO related Purchase permissions.
 */
async function checkStockPurchasePermissions(
    user,
    requiredPermissions = []
) {
    const userCenter = user?.fullUser?.center ?? user?.center;

    if (isSuperAdmin(user)) {
        return {
            hasAccess: true,
            permissions: {
                add_purchase_stock: true,
                view_own_purchase_stock: true,
                view_all_purchase_stock: true,
            },
            userCenter,
        };
    }

    const groups = await normalizeRolePermissions(
        user?.role?.permissions || []
    );

    const purchaseModule = groups.find(
        (group) => group.module?.toLowerCase() === "purchase"
    );

    if (!purchaseModule) {
        return {
            hasAccess: false,
            permissions: {},
        };
    }

    const granted = purchaseModule.permissions || [];

    const permissions = {
        add_purchase_stock: granted.includes("add_purchase_stock"),
        view_own_purchase_stock: granted.includes(
            "view_own_purchase_stock"
        ),
        view_all_purchase_stock: granted.includes(
            "view_all_purchase_stock"
        ),
    };

    return {
        hasAccess: requiredPermissions.some(
            (permission) => permissions[permission]
        ),
        permissions,
        userCenter,
    };
}

/**
 * Checks whether the authenticated user is an admin.
 */
function isAdmin(user) {
    return (
        isSuperAdmin(user) ||
        user?.role?.roleTitle?.toLowerCase() === "admin" ||
        user?.role?.isAdmin === true
    );
}

/**
 * Gets the user's outlet (center) ID.
 */
async function getUserOutletId(userId) {
    if (!userId) {
        throw new ApiError(401, "User ID is required");
    }

    const user = await User.findById(userId).select("center").lean();

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    if (!user.center) {
        throw new ApiError(400, "User center information not found");
    }

    return user.center;
}

/**
 * Validates that the user belongs to a center.
 */
async function validateUserOutletAccess(userId) {
    if (!userId) {
        throw new ApiError(401, "User authentication required");
    }

    const user = await User.findById(userId).select("center").lean();

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    if (!user.center) {
        throw new ApiError(
            400,
            "User is not associated with any center"
        );
    }

    return user.center;
}

/* -------------------------------------------------------------------------- */
/*                              Voucher numbering                             */
/* -------------------------------------------------------------------------- */

/**
 * Generates a unique voucher number like STELE/01/26-27.
 *
 * Uses an atomic counter (separate collection, no model changes)
 * so concurrent requests never receive the same sequence.
 */
const generateVoucherNo = async () => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    const financialYear =
        currentMonth >= 4
            ? `${String(currentYear).slice(-2)}-${String(
                  currentYear + 1
              ).slice(-2)}`
            : `${String(currentYear - 1).slice(-2)}-${String(
                  currentYear
              ).slice(-2)}`;

    const existingVouchers = await RaisePO.find({
        voucherNo: {
            $regex: `^STELE\\/\\d{2,}\\/${financialYear}$`,
        },
    })
        .select("voucherNo")
        .lean();

    let maxSequence = 0;

    for (const v of existingVouchers) {
        const match = v.voucherNo.match(/^STELE\/(\d{2,})\//);

        if (match) {
            const seq = parseInt(match[1], 10);

            if (seq > maxSequence) {
                maxSequence = seq;
            }
        }
    }

    const counters = mongoose.connection.collection(
        "raisepo_voucher_counters"
    );
    const counterId = `STELE_${financialYear}`;

    // Keep counter at least as high as the highest existing voucher.
    for (let i = 0; i < 3; i++) {
        try {
            await counters.updateOne(
                { _id: counterId },
                { $max: { seq: maxSequence } },
                { upsert: true }
            );
            break;
        } catch (error) {
            // Concurrent upsert race: retry.
            if (error?.code !== 11000 || i === 2) {
                throw error;
            }
        }
    }

    for (let attempt = 0; attempt < 100; attempt++) {
        const result = await counters.findOneAndUpdate(
            { _id: counterId },
            { $inc: { seq: 1 } },
            { returnDocument: "after" }
        );

        const counterDoc = result?.value ?? result;
        const sequence = counterDoc?.seq;

        if (!Number.isInteger(sequence)) {
            throw new ApiError(
                500,
                "Unable to generate voucher number."
            );
        }

        const candidate = `STELE/${String(sequence).padStart(
            2,
            "0"
        )}/${financialYear}`;

        const exists = await RaisePO.exists({ voucherNo: candidate });

        if (!exists) {
            return candidate;
        }
    }

    throw new ApiError(
        500,
        "Unable to generate a unique voucher number. Please contact support."
    );
};

/* -------------------------------------------------------------------------- */
/*                                  Populate                                  */
/* -------------------------------------------------------------------------- */

const raisePOPopulateOptions = [
    {
        path: "vendor",
        select:
            "_id businessName name contactPerson phone mobile email gstNumber state",
    },
    {
        path: "outlet",
        select: "_id centerName centerCode centerType",
    },
    {
        path: "products.product",
        select:
            "_id productTitle productCode productPrice productImage productCategory trackSerialNumber",
    },
    {
        path: "createdBy",
        select: "_id fullName name email",
    },
    {
        path: "approvedBy",
        select: "_id fullName name email",
    },
];

/* -------------------------------------------------------------------------- */
/*                                Search helpers                              */
/* -------------------------------------------------------------------------- */

function getRefModel(schemaPath) {
    try {
        const ref = schemaPath?.options?.ref;

        return typeof ref === "string" ? mongoose.model(ref) : null;
    } catch {
        return null;
    }
}

async function findRefIds(Model, fields, regex) {
    if (!Model) {
        return [];
    }

    const validFields = fields.filter((field) =>
        Model.schema.path(field)
    );

    if (validFields.length === 0) {
        return [];
    }

    const docs = await Model.find({
        $or: validFields.map((field) => ({ [field]: regex })),
    })
        .select("_id")
        .limit(1000)
        .lean();

    return docs.map((doc) => doc._id);
}

/**
 * Builds the $or search conditions.
 * Populated fields cannot be queried directly, so matching
 * vendor / outlet / product IDs are resolved first.
 */
async function buildSearchConditions(search) {
    const regex = {
        $regex: escapeRegex(search),
        $options: "i",
    };

    const conditions = [{ voucherNo: regex }];

    const productsSchema = RaisePO.schema.path("products")?.schema;

    const VendorModel = getRefModel(RaisePO.schema.path("vendor"));
    const OutletModel = getRefModel(RaisePO.schema.path("outlet"));
    const ProductModel = getRefModel(
        productsSchema?.path("product")
    );

    const [vendorIds, outletIds, productIds] = await Promise.all([
        findRefIds(
            VendorModel,
            [
                "businessName",
                "name",
                "email",
                "mobile",
                "phone",
                "contactPerson",
                "gstNumber",
            ],
            regex
        ),
        findRefIds(OutletModel, ["centerName", "centerCode"], regex),
        findRefIds(
            ProductModel,
            ["productTitle", "productCode"],
            regex
        ),
    ]);

    if (vendorIds.length) {
        conditions.push({ vendor: { $in: vendorIds } });
    }

    if (outletIds.length) {
        conditions.push({ outlet: { $in: outletIds } });
    }

    if (productIds.length) {
        conditions.push({ "products.product": { $in: productIds } });
    }

    const hasSerialNumbers = productsSchema
        ? Object.keys(productsSchema.paths).some((key) =>
              key.startsWith("serialNumbers")
          )
        : false;

    if (hasSerialNumbers) {
        conditions.push({
            "products.serialNumbers.serialNumber": regex,
        });
    }

    return conditions;
}

/* -------------------------------------------------------------------------- */
/*                                   Services                                 */
/* -------------------------------------------------------------------------- */

/**
 * Creates a Raise PO.
 */
export async function createRaisePO(user, data) {
    const { hasAccess } = await checkStockPurchasePermissions(user, [
        "add_purchase_stock",
    ]);

    if (!hasAccess) {
        throw new ApiError(
            403,
            "Access denied. add_purchase_stock permission required."
        );
    }

    const userId = getUserId(user);

    const { date, vendor, outlet, products } = data || {};

    if (!Array.isArray(products) || products.length === 0) {
        throw new ApiError(400, "At least one product is required");
    }

    let outletId = outlet;

    if (!outletId) {
        outletId = await getUserOutletId(userId);
    }

    const voucherNo = await generateVoucherNo();

    const processedProducts = products.map((product) => ({
        product: product.product,
        price: product.price,
        purchasedQuantity: product.purchasedQuantity,
        availableQuantity: product.purchasedQuantity,
    }));

    const raisePO = new RaisePO({
        date: date || new Date(),
        voucherNo,
        vendor,
        outlet: outletId,
        products: processedProducts,
        createdBy: userId,
        status: "pending",
    });

    const savedPO = await raisePO.save();

    return RaisePO.findById(savedPO._id).populate(
        raisePOPopulateOptions
    );
}

/**
 * Retrieves Raise POs.
 */
export async function getAllRaisePO(user, queryParams = {}) {
    const { hasAccess, permissions } =
        await checkStockPurchasePermissions(user, [
            "view_own_purchase_stock",
            "view_all_purchase_stock",
        ]);

    if (!hasAccess) {
        throw new ApiError(
            403,
            "Access denied. view_own_purchase_stock or view_all_purchase_stock permission required."
        );
    }

    const {
        page = 1,
        limit = 100,
        search,
        outlet,
        startDate,
        endDate,
        type,
        vendor,
    } = queryParams;

    const filter = {};

    if (permissions.view_all_purchase_stock) {
        if (outlet) {
            filter.outlet = outlet;
        }
    } else {
        filter.outlet = await validateUserOutletAccess(
            getUserId(user)
        );
    }

    if (startDate || endDate) {
        filter.date = {};

        if (startDate) {
            filter.date.$gte = new Date(startDate);
        }

        if (endDate) {
            const end = new Date(endDate);

            end.setHours(23, 59, 59, 999);

            filter.date.$lte = end;
        }
    }

    if (search && String(search).trim()) {
        filter.$or = await buildSearchConditions(
            String(search).trim()
        );
    }

    if (type) {
        filter.type = type;
    }

    if (vendor) {
        filter.vendor = vendor;
    }

    const currentPage = Math.max(parseInt(page, 10) || 1, 1);
    const pageLimit = Math.max(parseInt(limit, 10) || 100, 1);

    const total = await RaisePO.countDocuments(filter);

    const purchases = await RaisePO.find(filter)
        .populate(raisePOPopulateOptions)
        .sort({ date: -1, _id: -1 })
        .skip((currentPage - 1) * pageLimit)
        .limit(pageLimit)
        .lean();

    return {
        data: purchases,
        pagination: {
            currentPage,
            totalPages:
                purchases.length === 0
                    ? 0
                    : Math.ceil(total / pageLimit),
            totalItems: purchases.length === 0 ? 0 : total,
            itemsPerPage: pageLimit,
        },
    };
}

/**
 * Changes an approved/rejected PO back to pending.
 * Admin only (same authority that approves/rejects).
 */
export async function changeRejectedToPending(user, id) {
    if (!isAdmin(user)) {
        throw new ApiError(
            403,
            "Access denied. Only admin can change PO status to pending."
        );
    }

    assertValidId(id, "Purchase Order ID");

    const raisePO = await RaisePO.findById(id);

    if (!raisePO) {
        throw new ApiError(404, "Purchase Order not found");
    }

    if (
        raisePO.status !== "rejected" &&
        raisePO.status !== "approved"
    ) {
        throw new ApiError(
            400,
            `Cannot change status from '${raisePO.status}' to pending. Only rejected or approved POs can be changed to pending.`
        );
    }

    raisePO.status = "pending";
    raisePO.approvedBy = undefined;
    raisePO.approvedAt = undefined;
    raisePO.updatedAt = new Date();

    await raisePO.save();

    return RaisePO.findById(id)
        .populate(raisePOPopulateOptions)
        .lean();
}

/**
 * Shared approve / reject transition (atomic, pending -> status).
 */
async function setPOStatus(user, id, status) {
    assertValidId(id, "Purchase Order ID");

    const updated = await RaisePO.findOneAndUpdate(
        { _id: id, status: "pending" },
        {
            $set: {
                status,
                approvedBy: getUserId(user),
                approvedAt: new Date(),
            },
        },
        { new: true }
    );

    if (!updated) {
        const po = await RaisePO.findById(id).select("status").lean();

        if (!po) {
            throw new ApiError(404, "Purchase order not found");
        }

        throw new ApiError(400, `PO is already ${po.status}`);
    }

    return updated;
}

/**
 * Approves a Raise PO.
 *
 * Stock update: OutletStock is not migrated yet, so it is
 * intentionally not connected here.
 */
export async function approveRaisePO(user, id) {
    if (!isAdmin(user)) {
        throw new ApiError(
            403,
            "Access denied. Only admin can approve POs."
        );
    }

    const approvedPO = await setPOStatus(user, id, "approved");

    return RaisePO.findById(approvedPO._id).populate(
        raisePOPopulateOptions
    );
}

/**
 * Rejects a Raise PO.
 */
export async function rejectRaisePO(user, id) {
    if (!isAdmin(user)) {
        throw new ApiError(
            403,
            "Access denied. Only admin can reject POs."
        );
    }

    return setPOStatus(user, id, "rejected");
}

/**
 * Deletes a Raise PO.
 * Admin can delete any outlet's PO; others only their own outlet's.
 *
 * Stock adjustment: OutletStock is not migrated yet, so it is
 * intentionally not connected here.
 */
export async function deletePO(user, id) {
    assertValidId(id, "Purchase Order ID");

    const query = { _id: id };

    if (!isAdmin(user)) {
        query.outlet = await validateUserOutletAccess(
            getUserId(user)
        );
    }

    const purchase = await RaisePO.findOne(query);

    if (!purchase) {
        throw new ApiError(
            404,
            "Stock purchase not found or access denied"
        );
    }

    const hasTransfers = purchase.products.some(
        (product) =>
            product.availableQuantity < product.purchasedQuantity
    );

    if (hasTransfers) {
        throw new ApiError(
            400,
            "Cannot delete stock purchase that has transferred stock"
        );
    }

    await RaisePO.deleteOne({ _id: purchase._id });

    return true;
}