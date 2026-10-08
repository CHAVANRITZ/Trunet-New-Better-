

import RaisePO from "../models/RaisePO.js";
import User from "../models/User.js";

/**
 * Checks Raise PO related Purchase permissions.
 *
 * Preserved from the legacy Raise PO controller.
 */
function checkStockPurchasePermissions(user, requiredPermissions = []) {
    const userPermissions = user?.role?.permissions || [];

    const purchaseModule = userPermissions.find(
        (permission) => permission.module === "Purchase"
    );

    if (!purchaseModule) {
        return {
            hasAccess: false,
            permissions: {},
        };
    }

    const permissions = {
        add_purchase_stock:
            purchaseModule.permissions.includes("add_purchase_stock"),

        view_own_purchase_stock:
            purchaseModule.permissions.includes(
                "view_own_purchase_stock"
            ),

        view_all_purchase_stock:
            purchaseModule.permissions.includes(
                "view_all_purchase_stock"
            ),
    };

    const hasRequiredPermission = requiredPermissions.some(
        (permission) => permissions[permission]
    );

    return {
        hasAccess: hasRequiredPermission,
        permissions,
        userCenter: user.center,
    };
}

/**
 * Checks whether the authenticated user is an admin.
 *
 * Preserved from the legacy controller.
 */
function isAdmin(user) {
    return (
        user?.role?.roleTitle?.toLowerCase() === "admin" ||
        user?.role?.isAdmin === true
    );
}

/**
 * Gets the authenticated user's outlet.
 *
 * Preserved from the legacy controller.
 */
async function getUserOutletId(userId) {
    if (!userId) {
        throw new Error("User ID is required");
    }

    const user = await User.findById(userId).populate(
        "center",
        "centerName centerCode centerType"
    );

    if (!user) {
        throw new Error("User not found");
    }

    if (!user.center) {
        throw new Error("User center information not found");
    }

    return user.center._id;
}

/**
 * Validates that the authenticated user belongs to a center.
 *
 * Preserved from the legacy controller.
 */
async function validateUserOutletAccess(userId) {
    if (!userId) {
        throw new Error("User authentication required");
    }

    const user = await User.findById(userId).populate(
        "center",
        "centerName centerCode centerType"
    );

    if (!user) {
        throw new Error("User not found");
    }

    if (!user.center) {
        throw new Error("User is not associated with any center");
    }

    return user.center._id;
}

/**
 * Auto-generates unique voucher number like STELE/01/26-27
 *
 * Preserved from the legacy Raise PO controller.
 */
const generateVoucherNo = async () => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    let financialYear = "";

    if (currentMonth >= 4) {
        financialYear = `${currentYear
            .toString()
            .slice(-2)}-${(currentYear + 1)
            .toString()
            .slice(-2)}`;
    } else {
        financialYear = `${(currentYear - 1)
            .toString()
            .slice(-2)}-${currentYear
            .toString()
            .slice(-2)}`;
    }

    const existingVouchers = await RaisePO.find({
        voucherNo: {
            $regex: `^STELE\\/\\d{2}\\/${financialYear}$`,
        },
    })
        .select("voucherNo")
        .lean();

    let maxSequence = 0;

    for (const v of existingVouchers) {
        const match = v.voucherNo.match(/^STELE\/(\d{2})\//);

        if (match) {
            const seq = parseInt(match[1]);

            if (seq > maxSequence) {
                maxSequence = seq;
            }
        }
    }

    let nextSequence = maxSequence + 1;
    let voucherNo = "";
    let isUnique = false;

    for (let attempt = 0; attempt < 100; attempt++) {
        const padded = nextSequence
            .toString()
            .padStart(2, "0");

        const candidate = `STELE/${padded}/${financialYear}`;

        const exists = await RaisePO.findOne({
            voucherNo: candidate,
        }).lean();

        if (!exists) {
            voucherNo = candidate;
            isUnique = true;
            break;
        }

        nextSequence++;
    }

    if (!isUnique) {
        throw new Error(
            "Unable to generate a unique voucher number. Please contact support."
        );
    }

    return voucherNo;
};

/**
 * Populate configuration preserved from legacy Raise PO behavior.
 */
const raisePOPopulateOptions = [
    {
        path: "vendor",
        select:
            "_id businessName contactPerson phone email gstNumber state",
    },
    {
        path: "outlet",
        select: "_id centerName centerCode centerType",
    },
    {
        path: "products.product",
        select:
            "_id productTitle productCode productImage productCategory trackSerialNumber",
    },
    {
        path: "createdBy",
        select: "_id fullName email",
    },
    {
        path: "approvedBy",
        select: "_id fullName email",
    },
];

/**
 * Creates a Raise PO.
 *
 * Voucher number generation and business behavior
 * are preserved from the legacy controller.
 */
export async function createRaisePO(user, data) {
    const { hasAccess } = checkStockPurchasePermissions(
        user,
        ["add_purchase_stock"]
    );

    if (!hasAccess) {
        throw new Error(
            "Access denied. add_purchase_stock permission required."
        );
    }

    const userId = user.fullUser._id;

    const {
        date,
        vendor,
        outlet,
        products,
    } = data;

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

    return RaisePO.findById(savedPO._id)
        .populate(
            "vendor",
            "businessName name email mobile gstNumber"
        )
        .populate(
            "outlet",
            "_id centerName centerCode centerType"
        )
        .populate(
            "products.product",
            "productTitle productCode productPrice"
        )
        .populate("createdBy", "name email");
}

/**
 * Retrieves Raise POs.
 *
 * Preserves legacy filtering, pagination and
 * own/all outlet permission behavior.
 */
export async function getAllRaisePO(user, queryParams = {}) {
    const {
        hasAccess,
        permissions,
    } = checkStockPurchasePermissions(user, [
        "view_own_purchase_stock",
        "view_all_purchase_stock",
    ]);

    if (!hasAccess) {
        throw new Error(
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

    if (
        permissions.view_all_purchase_stock &&
        outlet
    ) {
        filter.outlet = outlet;
    } else if (
        permissions.view_own_purchase_stock &&
        !permissions.view_all_purchase_stock
    ) {
        const userOutletId =
            await validateUserOutletAccess(user._id);

        filter.outlet = userOutletId;
    } else if (outlet) {
        filter.outlet = outlet;
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

    if (search) {
        filter.$or = [
            {
                voucherNo: {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                "vendor.businessName": {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                "vendor.name": {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                "vendor.email": {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                "vendor.mobile": {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                "outlet.centerName": {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                "outlet.centerCode": {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                "products.product.productTitle": {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                "products.product.productCode": {
                    $regex: search,
                    $options: "i",
                },
            },
            {
                "products.serialNumbers.serialNumber": {
                    $regex: search,
                    $options: "i",
                },
            },
        ];
    }

    if (type) {
        filter.type = type;
    }

    if (vendor) {
        filter.vendor = vendor;
    }

    const currentPage = Number(page);
    const pageLimit = Number(limit);

    const total = await RaisePO.countDocuments(filter);

    const purchases = await RaisePO.find(filter)
        .populate(raisePOPopulateOptions)
        .limit(pageLimit)
        .skip((currentPage - 1) * pageLimit)
        .lean();

    return {
        data: purchases,
        pagination: {
            currentPage,
            totalPages:
                purchases.length === 0
                    ? 0
                    : Math.ceil(total / pageLimit),
            totalItems:
                purchases.length === 0
                    ? 0
                    : total,
            itemsPerPage: pageLimit,
        },
    };
}

/**
 * Changes an approved/rejected PO back to pending.
 *
 * Preserved from legacy behavior.
 */
export async function changeRejectedToPending(user, id) {
    const raisePO = await RaisePO.findById(id)
        .populate("vendor")
        .populate("outlet")
        .populate("products.product")
        .populate("createdBy")
        .populate("approvedBy");

    if (!raisePO) {
        throw new Error("Purchase Order not found");
    }

    if (
        raisePO.status !== "rejected" &&
        raisePO.status !== "approved"
    ) {
        throw new Error(
            `Cannot change status from '${raisePO.status}' to pending. Only rejected or approved POs can be changed to pending.`
        );
    }

    raisePO.status = "pending";
    raisePO.approvedBy = undefined;
    raisePO.approvedAt = undefined;
    raisePO.updatedAt = new Date();

    await raisePO.save();

    return RaisePO.findById(id)
        .populate("vendor")
        .populate("outlet")
        .populate("products.product")
        .populate("createdBy")
        .populate("approvedBy")
        .lean();
}

/**
 * Approves a Raise PO.
 *
 * Stock update is intentionally not implemented here yet because
 * OutletStock has not been migrated to the new backend.
 */
export async function approveRaisePO(user, id) {
    if (!isAdmin(user)) {
        throw new Error(
            "Access denied. Only admin can approve POs."
        );
    }

    const po = await RaisePO.findById(id);

    if (!po) {
        throw new Error("Purchase order not found");
    }

    if (po.status !== "pending") {
        throw new Error(`PO is already ${po.status}`);
    }

    po.status = "approved";
    po.approvedBy = user._id;
    po.approvedAt = new Date();

    const approvedPO = await po.save();

    /*
     * Legacy behavior:
     *
     * OutletStock.updateStock(
     *     po.outlet,
     *     productItem.product,
     *     productItem.purchasedQuantity,
     *     approvedPO._id
     * );
     *
     * This will be connected after OutletStock is migrated.
     */

    return RaisePO.findById(approvedPO._id)
        .populate("vendor", "businessName name email mobile gstNumber")
        .populate(
            "outlet",
            "_id centerName centerCode centerType"
        )
        .populate(
            "products.product",
            "productTitle productCode productPrice"
        )
        .populate("createdBy", "name email")
        .populate("approvedBy", "name email");
}

/**
 * Rejects a Raise PO.
 */
export async function rejectRaisePO(user, id) {
    if (!isAdmin(user)) {
        throw new Error(
            "Access denied. Only admin can reject POs."
        );
    }

    const po = await RaisePO.findById(id);

    if (!po) {
        throw new Error("Purchase order not found");
    }

    if (po.status !== "pending") {
        throw new Error(`PO is already ${po.status}`);
    }

    po.status = "rejected";
    po.approvedBy = user._id;
    po.approvedAt = new Date();

    return po.save();
}

/**
 * Deletes a Raise PO.
 *
 * Stock adjustment is intentionally not implemented yet because
 * OutletStock has not been migrated to the new backend.
 */
export async function deletePO(user, id) {
    const outletId =
        await validateUserOutletAccess(user._id);

    const purchase = await RaisePO.findOne({
        _id: id,
        outlet: outletId,
    });

    if (!purchase) {
        throw new Error(
            "Stock purchase not found or access denied"
        );
    }

    const hasTransfers = purchase.products.some(
        (product) =>
            product.availableQuantity <
            product.purchasedQuantity
    );

    if (hasTransfers) {
        throw new Error(
            "Cannot delete stock purchase that has transferred stock"
        );
    }

    /*
     * Legacy behavior:
     *
     * OutletStock is updated here to decrease:
     * - totalQuantity
     * - availableQuantity
     *
     * and purchase serial numbers are pulled.
     *
     * This will be connected after OutletStock migration.
     */

    await RaisePO.findOneAndDelete({
        _id: id,
        outlet: outletId,
    });

    return true;
}
// import RaisePO from "../models/RaisePO.js";
// import User from "../models/User.js";

// /**
//  * Checks Raise PO related Purchase permissions.
//  *
//  * Preserved from the legacy Raise PO controller.
//  */
// function checkStockPurchasePermissions(user, requiredPermissions = []) {
//     const userPermissions = user?.role?.permissions || [];

//     const purchaseModule = userPermissions.find(
//         (permission) => permission.module === "Purchase"
//     );

//     if (!purchaseModule) {
//         return {
//             hasAccess: false,
//             permissions: {},
//         };
//     }

//     const permissions = {
//         add_purchase_stock:
//             purchaseModule.permissions.includes("add_purchase_stock"),

//         view_own_purchase_stock:
//             purchaseModule.permissions.includes(
//                 "view_own_purchase_stock"
//             ),

//         view_all_purchase_stock:
//             purchaseModule.permissions.includes(
//                 "view_all_purchase_stock"
//             ),
//     };

//     const hasRequiredPermission = requiredPermissions.some(
//         (permission) => permissions[permission]
//     );

//     return {
//         hasAccess: hasRequiredPermission,
//         permissions,
//         userCenter: user.center,
//     };
// }

// /**
//  * Checks whether the authenticated user is an admin.
//  *
//  * Preserved from the legacy controller.
//  */
// function isAdmin(user) {
//     return (
//         user?.role?.roleTitle?.toLowerCase() === "admin" ||
//         user?.role?.isAdmin === true
//     );
// }

// /**
//  * Gets the authenticated user's outlet.
//  *
//  * Preserved from the legacy controller.
//  */
// async function getUserOutletId(userId) {
//     if (!userId) {
//         throw new Error("User ID is required");
//     }

//     const user = await User.findById(userId).populate(
//         "center",
//         "centerName centerCode centerType"
//     );

//     if (!user) {
//         throw new Error("User not found");
//     }

//     if (!user.center) {
//         throw new Error("User center information not found");
//     }

//     return user.center._id;
// }

// /**
//  * Validates that the authenticated user belongs to a center.
//  *
//  * Preserved from the legacy controller.
//  */
// async function validateUserOutletAccess(userId) {
//     if (!userId) {
//         throw new Error("User authentication required");
//     }

//     const user = await User.findById(userId).populate(
//         "center",
//         "centerName centerCode centerType"
//     );

//     if (!user) {
//         throw new Error("User not found");
//     }

//     if (!user.center) {
//         throw new Error("User is not associated with any center");
//     }

//     return user.center._id;
// }

// /**
//  * Populate configuration preserved from legacy Raise PO behavior.
//  */
// const raisePOPopulateOptions = [
//     {
//         path: "vendor",
//         select:
//             "_id businessName contactPerson phone email gstNumber state",
//     },
//     {
//         path: "outlet",
//         select: "_id centerName centerCode centerType",
//     },
//     {
//         path: "products.product",
//         select:
//             "_id productTitle productCode productImage productCategory trackSerialNumber",
//     },
//     {
//         path: "createdBy",
//         select: "_id fullName email",
//     },
//     {
//         path: "approvedBy",
//         select: "_id fullName email",
//     },
// ];

// /**
//  * Creates a Raise PO.
//  *
//  * Voucher number is generated by the RaisePO model.
//  */
// export async function createRaisePO(user, data) {
//     const { hasAccess } = checkStockPurchasePermissions(
//         user,
//         ["add_purchase_stock"]
//     );

//     if (!hasAccess) {
//         throw new Error(
//             "Access denied. add_purchase_stock permission required."
//         );
//     }

//     const {
//         date,
//         vendor,
//         outlet,
//         products,
//     } = data;

//     let outletId = outlet;

//     if (!outletId) {
//         outletId = await getUserOutletId(user._id);
//     }

//     const processedProducts = products.map((product) => ({
//         product: product.product,
//         price: product.price,
//         purchasedQuantity: product.purchasedQuantity,
//         availableQuantity: product.purchasedQuantity,
//     }));

//     const raisePO = new RaisePO({
//         date: date || new Date(),
//         vendor,
//         outlet: outletId,
//         products: processedProducts,
//         createdBy: user._id,
//         status: "pending",
//     });

//     const savedPO = await raisePO.save();

//     return RaisePO.findById(savedPO._id).populate(
//         raisePOPopulateOptions
//     );
// }

// /**
//  * Retrieves Raise POs.
//  *
//  * Preserves legacy filtering, pagination and
//  * own/all outlet permission behavior.
//  */
// export async function getAllRaisePO(user, queryParams = {}) {
//     const {
//         hasAccess,
//         permissions,
//     } = checkStockPurchasePermissions(user, [
//         "view_own_purchase_stock",
//         "view_all_purchase_stock",
//     ]);

//     if (!hasAccess) {
//         throw new Error(
//             "Access denied. view_own_purchase_stock or view_all_purchase_stock permission required."
//         );
//     }

//     const {
//         page = 1,
//         limit = 100,
//         search,
//         outlet,
//         startDate,
//         endDate,
//         type,
//         vendor,
//     } = queryParams;

//     const filter = {};

//     if (
//         permissions.view_all_purchase_stock &&
//         outlet
//     ) {
//         filter.outlet = outlet;
//     } else if (
//         permissions.view_own_purchase_stock &&
//         !permissions.view_all_purchase_stock
//     ) {
//         const userOutletId =
//             await validateUserOutletAccess(user._id);

//         filter.outlet = userOutletId;
//     } else if (outlet) {
//         filter.outlet = outlet;
//     }

//     if (startDate || endDate) {
//         filter.date = {};

//         if (startDate) {
//             filter.date.$gte = new Date(startDate);
//         }

//         if (endDate) {
//             const end = new Date(endDate);

//             end.setHours(23, 59, 59, 999);

//             filter.date.$lte = end;
//         }
//     }

//     if (search) {
//         filter.$or = [
//             {
//                 voucherNo: {
//                     $regex: search,
//                     $options: "i",
//                 },
//             },
//             {
//                 "vendor.businessName": {
//                     $regex: search,
//                     $options: "i",
//                 },
//             },
//             {
//                 "vendor.name": {
//                     $regex: search,
//                     $options: "i",
//                 },
//             },
//             {
//                 "vendor.email": {
//                     $regex: search,
//                     $options: "i",
//                 },
//             },
//             {
//                 "vendor.mobile": {
//                     $regex: search,
//                     $options: "i",
//                 },
//             },
//             {
//                 "outlet.centerName": {
//                     $regex: search,
//                     $options: "i",
//                 },
//             },
//             {
//                 "outlet.centerCode": {
//                     $regex: search,
//                     $options: "i",
//                 },
//             },
//             {
//                 "products.product.productTitle": {
//                     $regex: search,
//                     $options: "i",
//                 },
//             },
//             {
//                 "products.product.productCode": {
//                     $regex: search,
//                     $options: "i",
//                 },
//             },
//             {
//                 "products.serialNumbers.serialNumber": {
//                     $regex: search,
//                     $options: "i",
//                 },
//             },
//         ];
//     }

//     if (type) {
//         filter.type = type;
//     }

//     if (vendor) {
//         filter.vendor = vendor;
//     }

//     const currentPage = Number(page);
//     const pageLimit = Number(limit);

//     const total = await RaisePO.countDocuments(filter);

//     const purchases = await RaisePO.find(filter)
//         .populate(raisePOPopulateOptions)
//         .limit(pageLimit)
//         .skip((currentPage - 1) * pageLimit)
//         .lean();

//     return {
//         data: purchases,
//         pagination: {
//             currentPage,
//             totalPages:
//                 purchases.length === 0
//                     ? 0
//                     : Math.ceil(total / pageLimit),
//             totalItems:
//                 purchases.length === 0
//                     ? 0
//                     : total,
//             itemsPerPage: pageLimit,
//         },
//     };
// }

// /**
//  * Changes an approved/rejected PO back to pending.
//  *
//  * Preserved from legacy behavior.
//  */
// export async function changeRejectedToPending(user, id) {
//     const raisePO = await RaisePO.findById(id)
//         .populate("vendor")
//         .populate("outlet")
//         .populate("products.product")
//         .populate("createdBy")
//         .populate("approvedBy");

//     if (!raisePO) {
//         throw new Error("Purchase Order not found");
//     }

//     if (
//         raisePO.status !== "rejected" &&
//         raisePO.status !== "approved"
//     ) {
//         throw new Error(
//             `Cannot change status from '${raisePO.status}' to pending. Only rejected or approved POs can be changed to pending.`
//         );
//     }

//     raisePO.status = "pending";
//     raisePO.approvedBy = undefined;
//     raisePO.approvedAt = undefined;
//     raisePO.updatedAt = new Date();

//     await raisePO.save();

//     return RaisePO.findById(id)
//         .populate("vendor")
//         .populate("outlet")
//         .populate("products.product")
//         .populate("createdBy")
//         .populate("approvedBy")
//         .lean();
// }

// /**
//  * Approves a Raise PO.
//  *
//  * Stock update is intentionally not implemented here yet because
//  * OutletStock has not been migrated to the new backend.
//  */
// export async function approveRaisePO(user, id) {
//     if (!isAdmin(user)) {
//         throw new Error(
//             "Access denied. Only admin can approve POs."
//         );
//     }

//     const po = await RaisePO.findById(id);

//     if (!po) {
//         throw new Error("Purchase order not found");
//     }

//     if (po.status !== "pending") {
//         throw new Error(`PO is already ${po.status}`);
//     }

//     po.status = "approved";
//     po.approvedBy = user._id;
//     po.approvedAt = new Date();

//     const approvedPO = await po.save();

//     /*
//      * Legacy behavior:
//      *
//      * OutletStock.updateStock(
//      *     po.outlet,
//      *     productItem.product,
//      *     productItem.purchasedQuantity,
//      *     approvedPO._id
//      * );
//      *
//      * This will be connected after OutletStock is migrated.
//      */

//     return RaisePO.findById(approvedPO._id)
//         .populate("vendor", "businessName name email mobile gstNumber")
//         .populate(
//             "outlet",
//             "_id centerName centerCode centerType"
//         )
//         .populate(
//             "products.product",
//             "productTitle productCode productPrice"
//         )
//         .populate("createdBy", "name email")
//         .populate("approvedBy", "name email");
// }

// /**
//  * Rejects a Raise PO.
//  */
// export async function rejectRaisePO(user, id) {
//     if (!isAdmin(user)) {
//         throw new Error(
//             "Access denied. Only admin can reject POs."
//         );
//     }

//     const po = await RaisePO.findById(id);

//     if (!po) {
//         throw new Error("Purchase order not found");
//     }

//     if (po.status !== "pending") {
//         throw new Error(`PO is already ${po.status}`);
//     }

//     po.status = "rejected";
//     po.approvedBy = user._id;
//     po.approvedAt = new Date();

//     return po.save();
// }

// /**
//  * Deletes a Raise PO.
//  *
//  * Stock adjustment is intentionally not implemented yet because
//  * OutletStock has not been migrated to the new backend.
//  */
// export async function deletePO(user, id) {
//     const outletId =
//         await validateUserOutletAccess(user._id);

//     const purchase = await RaisePO.findOne({
//         _id: id,
//         outlet: outletId,
//     });

//     if (!purchase) {
//         throw new Error(
//             "Stock purchase not found or access denied"
//         );
//     }

//     const hasTransfers = purchase.products.some(
//         (product) =>
//             product.availableQuantity <
//             product.purchasedQuantity
//     );

//     if (hasTransfers) {
//         throw new Error(
//             "Cannot delete stock purchase that has transferred stock"
//         );
//     }

//     /*
//      * Legacy behavior:
//      *
//      * OutletStock is updated here to decrease:
//      * - totalQuantity
//      * - availableQuantity
//      *
//      * and purchase serial numbers are pulled.
//      *
//      * This will be connected after OutletStock migration.
//      */

//     await RaisePO.findOneAndDelete({
//         _id: id,
//         outlet: outletId,
//     });

//     return true;
// }