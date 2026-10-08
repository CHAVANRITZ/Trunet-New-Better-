import mongoose from "mongoose";

import StockPurchase from "../models/StockPurchase.js";
import OutletStock from "../models/OutletStock.js";
import Product from "../models/Product.js";
import Vendor from "../models/Vendor.js";
import Center from "../models/Center.js";

/**
 * Creates a new Stock Purchase.
 *
 * Business flow:
 * 1. Validate vendor.
 * 2. Validate outlet.
 * 3. Validate invoice number uniqueness.
 * 4. Validate products and serial numbers.
 * 5. Create StockPurchase.
 * 6. Add purchased stock to OutletStock.
 */
export async function createStockPurchase(stockPurchaseData) {
    const {
        type,
        date,
        invoiceNo,
        vendor,
        outlet,
        transportAmount = 0,
        remark = "",
        cgst = 0,
        sgst = 0,
        igst = 0,
        products
    } = stockPurchaseData;

    await validateVendor(vendor);
    await validateOutlet(outlet);
    await validateInvoiceNo(invoiceNo);
    await validateProducts(products);

    const purchaseProducts = products.map((item) => ({
        product: item.product,
        price: Number(item.price),
        availableQuantity: Number(item.purchasedQuantity),
        purchasedQuantity: Number(item.purchasedQuantity),
        serialNumbers: normalizeSerialNumbers(
            item.serialNumbers || []
        )
    }));

    const stockPurchase = await StockPurchase.create({
        type,
        date: date || Date.now(),
        invoiceNo,
        vendor,
        outlet,
        transportAmount,
        remark,
        cgst,
        sgst,
        igst,
        products: purchaseProducts
    });

    /*
     * Add the purchased quantity to OutletStock.
     *
     * OutletStock.updateStock() is already provided by the
     * new backend model for this purpose.
     */
    for (const productItem of stockPurchase.products) {
        const serialNumbers = productItem.serialNumbers.map(
            (serial) => serial.serialNumber
        );

        await OutletStock.updateStock(
            stockPurchase.outlet,
            productItem.product,
            productItem.purchasedQuantity,
            serialNumbers,
            stockPurchase._id
        );
    }

    return getStockPurchaseById(stockPurchase._id);
}

/**
 * Retrieves Stock Purchases using the legacy filtering,
 * pagination and sorting behavior.
 */
export async function getStockPurchases(queryParams = {}) {
    const {
        search,
        type,
        vendor,
        outlet,
        startDate,
        endDate,
        page = 1,
        limit = 100,
        sortBy = "createdAt",
        sortOrder = "desc"
    } = queryParams;

    const filters = {};

    if (type) {
        filters.type = type;
    }

    if (vendor) {
        filters.vendor = vendor;
    }

    if (outlet) {
        filters.outlet = outlet;
    }

    if (startDate || endDate) {
        filters.date = {};

        if (startDate) {
            filters.date.$gte = new Date(startDate);
        }

        if (endDate) {
            const endDateValue = new Date(endDate);
            endDateValue.setHours(23, 59, 59, 999);

            filters.date.$lte = endDateValue;
        }
    }

    /*
     * Preserve the legacy searchable fields.
     *
     * Additional vendor/outlet/product/serial search is handled
     * below through matching IDs.
     */
    if (search) {
        const searchRegex = {
            $regex: search,
            $options: "i"
        };

        const [matchingVendors, matchingCenters, matchingProducts] =
            await Promise.all([
                Vendor.find({
                    $or: [
                        { businessName: searchRegex },
                        { name: searchRegex },
                        { email: searchRegex },
                        { contactNumber: searchRegex },
                        { mobile: searchRegex },
                        { gstNumber: searchRegex }
                    ]
                }).select("_id"),

                Center.find({
                    $or: [
                        { centerName: searchRegex },
                        { centerCode: searchRegex },
                        { email: searchRegex },
                        { mobile: searchRegex }
                    ]
                }).select("_id"),

                Product.find({
                    $or: [
                        { productName: searchRegex },
                        { productTitle: searchRegex },
                        { productCode: searchRegex }
                    ]
                }).select("_id")
            ]);

        const vendorIds = matchingVendors.map(
            (item) => item._id
        );

        const centerIds = matchingCenters.map(
            (item) => item._id
        );

        const productIds = matchingProducts.map(
            (item) => item._id
        );

        const searchConditions = [
            {
                invoiceNo: searchRegex
            },
            {
                remark: searchRegex
            }
        ];

        if (vendorIds.length > 0) {
            searchConditions.push({
                vendor: { $in: vendorIds }
            });
        }

        if (centerIds.length > 0) {
            searchConditions.push({
                outlet: { $in: centerIds }
            });
        }

        if (productIds.length > 0) {
            searchConditions.push({
                "products.product": {
                    $in: productIds
                }
            });
        }

        searchConditions.push({
            "products.serialNumbers.serialNumber": searchRegex
        });

        filters.$or = searchConditions;
    }

    const currentPage = Number(page);
    const pageLimit = Number(limit);

    const skip = (currentPage - 1) * pageLimit;

    const sort = {
        [sortBy]:
            sortOrder === "asc" || sortOrder === "1"
                ? 1
                : -1
    };

    const [totalStockPurchases, stockPurchases] =
        await Promise.all([
            StockPurchase.countDocuments(filters),

            StockPurchase.find(filters)
                .sort(sort)
                .skip(skip)
                .limit(pageLimit)
                .populate("vendor")
                .populate("outlet")
                .populate("products.product")
                .select("-__v")
        ]);

    const totalPages = Math.ceil(
        totalStockPurchases / pageLimit
    );

    return {
        stockPurchases,
        pagination: {
            currentPage,
            totalPages,
            totalStockPurchases,
            hasNextPage: currentPage < totalPages,
            hasPrevPage: currentPage > 1
        }
    };
}

/**
 * Retrieves a Stock Purchase by ID.
 */
export async function getStockPurchaseById(stockPurchaseId) {
    const stockPurchase =
        await StockPurchase.findById(stockPurchaseId)
            .populate("vendor")
            .populate("outlet")
            .populate("products.product");

    return stockPurchase;
}

/**
 * Updates an existing Stock Purchase.
 *
 * A purchase cannot be changed once its stock has already
 * been transferred/consumed.
 */
export async function updateStockPurchase(
    stockPurchaseId,
    stockPurchaseData
) {
    const existingPurchase =
        await StockPurchase.findById(stockPurchaseId);

    if (!existingPurchase) {
        return null;
    }

    /*
     * Existing stock must still be completely available.
     */
    validatePurchaseCanBeModified(existingPurchase);

    if (stockPurchaseData.vendor) {
        await validateVendor(stockPurchaseData.vendor);
    }

    if (stockPurchaseData.outlet) {
        await validateOutlet(stockPurchaseData.outlet);
    }

    if (
        stockPurchaseData.invoiceNo &&
        stockPurchaseData.invoiceNo.toLowerCase() !==
            existingPurchase.invoiceNo.toLowerCase()
    ) {
        await validateInvoiceNo(
            stockPurchaseData.invoiceNo,
            stockPurchaseId
        );
    }

    if (stockPurchaseData.products) {
        await validateProducts(
            stockPurchaseData.products,
            stockPurchaseId
        );
    }

    /*
     * Remove old stock from OutletStock first.
     */
    await removePurchaseStock(existingPurchase);

    /*
     * Prepare the replacement products.
     */
    if (stockPurchaseData.products) {
        stockPurchaseData.products =
            stockPurchaseData.products.map((item) => ({
                product: item.product,
                price: Number(item.price),
                availableQuantity:
                    Number(item.purchasedQuantity),
                purchasedQuantity:
                    Number(item.purchasedQuantity),
                serialNumbers:
                    normalizeSerialNumbers(
                        item.serialNumbers || []
                    )
            }));
    }

    Object.assign(
        existingPurchase,
        stockPurchaseData
    );

    /*
     * availableQuantity must represent the complete
     * purchased quantity when the purchase is edited.
     */
    if (stockPurchaseData.products) {
        for (const productItem of existingPurchase.products) {
            productItem.availableQuantity =
                productItem.purchasedQuantity;
        }
    }

    const updatedPurchase =
        await existingPurchase.save();

    /*
     * Add the new stock to OutletStock.
     */
    for (const productItem of updatedPurchase.products) {
        const serialNumbers =
            productItem.serialNumbers.map(
                (serial) => serial.serialNumber
            );

        await OutletStock.updateStock(
            updatedPurchase.outlet,
            productItem.product,
            productItem.purchasedQuantity,
            serialNumbers,
            updatedPurchase._id
        );
    }

    return getStockPurchaseById(updatedPurchase._id);
}

/**
 * Deletes a Stock Purchase.
 */
export async function deleteStockPurchase(stockPurchaseId) {
    const stockPurchase =
        await StockPurchase.findById(stockPurchaseId);

    if (!stockPurchase) {
        return null;
    }

    validatePurchaseCanBeModified(stockPurchase);

    /*
     * Remove stock that was originally created by this purchase.
     */
    await removePurchaseStock(stockPurchase);

    await StockPurchase.findByIdAndDelete(
        stockPurchaseId
    );

    return true;
}

/**
 * Retrieves purchases belonging to a specific vendor.
 */
export async function getPurchasesByVendor(
    vendorId,
    queryParams = {}
) {
    await validateVendor(vendorId);

    const {
        page = 1,
        limit = 100
    } = queryParams;

    const currentPage = Number(page);
    const pageLimit = Number(limit);

    const skip = (currentPage - 1) * pageLimit;

    const filters = {
        vendor: vendorId
    };

    const [totalStockPurchases, stockPurchases] =
        await Promise.all([
            StockPurchase.countDocuments(filters),

            StockPurchase.find(filters)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageLimit)
                .populate("vendor")
                .populate("outlet")
                .populate("products.product")
        ]);

    const totalPages = Math.ceil(
        totalStockPurchases / pageLimit
    );

    return {
        stockPurchases,
        pagination: {
            currentPage,
            totalPages,
            totalStockPurchases,
            hasNextPage: currentPage < totalPages,
            hasPrevPage: currentPage > 1
        }
    };
}

/**
 * Retrieves products along with their Outlet stock.
 *
 * Stock Purchase is an Outlet-level operation.
 */
export async function getAllProductsWithStock(
    queryParams = {}
) {
    const {
        outlet,
        page = 1,
        limit = 100,
        search
    } = queryParams;

    if (!outlet) {
        throw new Error("Outlet is required.");
    }

    await validateOutlet(outlet);

    const filters = {};

    if (search) {
        const searchRegex = {
            $regex: search,
            $options: "i"
        };

        filters.$or = [
            {
                productName: searchRegex
            },
            {
                productTitle: searchRegex
            },
            {
                productCode: searchRegex
            }
        ];
    }

    const currentPage = Number(page);
    const pageLimit = Number(limit);

    const skip = (currentPage - 1) * pageLimit;

    const [totalProducts, products] =
        await Promise.all([
            Product.countDocuments(filters),

            Product.find(filters)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageLimit)
                .select("-__v")
                .lean()
        ]);

    const data = [];

    for (const product of products) {
        const stock =
            await OutletStock.findOne({
                outlet,
                product: product._id
            }).lean();

        const purchaseSummary =
            await StockPurchase.aggregate([
                {
                    $match: {
                        outlet:
                            new mongoose.Types.ObjectId(
                                outlet
                            ),
                        status: {
                            $ne: "cancelled"
                        }
                    }
                },
                {
                    $unwind: "$products"
                },
                {
                    $match: {
                        "products.product":
                            product._id
                    }
                },
                {
                    $group: {
                        _id: null,
                        purchasedQuantity: {
                            $sum:
                                "$products.purchasedQuantity"
                        },
                        availableQuantity: {
                            $sum:
                                "$products.availableQuantity"
                        }
                    }
                }
            ]);

        data.push({
            ...product,
            stock,
            purchasedQuantity:
                purchaseSummary[0]
                    ?.purchasedQuantity || 0,
            availableQuantity:
                stock?.availableQuantity || 0
        });
    }

    const totalPages = Math.ceil(
        totalProducts / pageLimit
    );

    return {
        products: data,
        pagination: {
            currentPage,
            totalPages,
            totalProducts,
            hasNextPage: currentPage < totalPages,
            hasPrevPage: currentPage > 1
        }
    };
}




/**
 * Retrieves currently available stock for a product
 * at an Outlet.
 */
export async function getAvailableStock(
    productId,
    outletId
) {
    await validateProduct(productId);
    await validateOutlet(outletId);

    const stock =
        await OutletStock.findOne({
            outlet: outletId,
            product: productId
        }).populate("product");

    if (!stock) {
        return {
            totalQuantity: 0,
            availableQuantity: 0,
            serialNumbers: []
        };
    }

    const availableSerials =
        stock.serialNumbers.filter(
            (serial) =>
                serial.status === "available" &&
                serial.currentLocation?.toString() ===
                    outletId.toString()
        );

    return {
        totalQuantity: stock.totalQuantity,
        availableQuantity:
            stock.availableQuantity,
        serialNumbers: availableSerials
    };
}

/**
 * Returns complete stock summary for an Outlet.
 */
export async function getOutletStockSummary(
    outletId
) {
    await validateOutlet(outletId);

    const stock =
        await OutletStock.find({
            outlet: outletId
        })
            .populate("product")
            .lean();

    return stock;
}

/**
 * Returns serial numbers available for an Outlet/Product.
 *
 * resellerId is accepted because it is part of the legacy
 * endpoint contract.
 */
export async function getOutletSerialNumbers(
    outletId,
    productId,
    resellerId = null
) {
    await validateOutlet(outletId);
    await validateProduct(productId);

    const stock =
        await OutletStock.findOne({
            outlet: outletId,
            product: productId
        }).lean();

    if (!stock) {
        return [];
    }

    let serialNumbers =
        stock.serialNumbers.filter(
            (serial) =>
                serial.status === "available"
        );

    /*
     * The supplied new OutletStock schema does not contain
     * a reseller field on serialNumbers.
     *
     * Therefore no reseller-specific filtering is added here.
     * The resellerId remains accepted for API compatibility.
     */
    if (resellerId) {
        serialNumbers = serialNumbers.filter(
            (serial) =>
                serial.transferredTo?.toString() ===
                resellerId.toString()
        );
    }

    return serialNumbers;
}

/**
 * Updates an Outlet serial number.
 */
export async function updateOutletSerialNumber(
    productId,
    serialNumber,
    serialData
) {
    await validateProduct(productId);

    const stock =
        await OutletStock.findOne({
            product: productId,
            "serialNumbers.serialNumber":
                serialNumber
        });

    if (!stock) {
        return null;
    }

    const serial =
        stock.serialNumbers.find(
            (item) =>
                item.serialNumber ===
                serialNumber
        );

    if (!serial) {
        return null;
    }

    /*
     * Only fields supplied by the request are updated.
     */
    if (serialData.status !== undefined) {
        serial.status = serialData.status;
    }

    if (
        serialData.currentLocation !== undefined
    ) {
        serial.currentLocation =
            serialData.currentLocation;
    }

    if (
        serialData.transferredTo !== undefined
    ) {
        /*
         * Keep compatibility if the incoming API still
         * supplies transferredTo.
         *
         * The current new OutletStock serial schema does not
         * define this field, so Mongoose will not persist it
         * unless the schema is changed.
         */
        serial.transferredTo =
            serialData.transferredTo;
    }

    if (
        serialData.transferDate !== undefined
    ) {
        serial.transferDate =
            serialData.transferDate;
    }

    if (
        serialData.consumedDate !== undefined
    ) {
        serial.consumedDate =
            serialData.consumedDate;
    }

    stock.lastUpdated = new Date();

    await stock.save();

    /*
     * Keep the StockPurchase serial state synchronized.
     */
    const purchase =
        await StockPurchase.findOne({
            "products.product": productId,
            "products.serialNumbers.serialNumber":
                serialNumber
        });

    if (purchase) {
        for (const productItem of purchase.products) {
            const purchaseSerial =
                productItem.serialNumbers.find(
                    (item) =>
                        item.serialNumber ===
                        serialNumber
                );

            if (purchaseSerial) {
                if (
                    serialData.status !== undefined
                ) {
                    purchaseSerial.status =
                        serialData.status;
                }

                if (
                    serialData.currentLocation !==
                    undefined
                ) {
                    purchaseSerial.currentLocation =
                        serialData.currentLocation;
                }

                if (
                    serialData.transferDate !==
                    undefined
                ) {
                    purchaseSerial.transferDate =
                        serialData.transferDate;
                }

                if (
                    serialData.consumedDate !==
                    undefined
                ) {
                    purchaseSerial.consumedDate =
                        serialData.consumedDate;
                }
            }
        }

        await purchase.save();
    }

    return stock;
}

/**
 * Deletes an Outlet serial number.
 */
export async function deleteOutletSerialNumber(
    productId,
    serialNumber
) {
    await validateProduct(productId);

    const stock =
        await OutletStock.findOne({
            product: productId,
            "serialNumbers.serialNumber":
                serialNumber
        });

    if (!stock) {
        return null;
    }

    const serial =
        stock.serialNumbers.find(
            (item) =>
                item.serialNumber ===
                serialNumber
        );

    if (!serial) {
        return null;
    }

    if (serial.status !== "available") {
        throw new Error(
            "Only available serial numbers can be deleted."
        );
    }

    /*
     * Find the purchase before removing the serial.
     */
    const purchase =
        await StockPurchase.findOne({
            "products.product": productId,
            "products.serialNumbers.serialNumber":
                serialNumber
        });

    /*
     * Remove serial from OutletStock.
     */
    stock.serialNumbers =
        stock.serialNumbers.filter(
            (item) =>
                item.serialNumber !==
                serialNumber
        );

    stock.totalQuantity = Math.max(
        0,
        stock.totalQuantity - 1
    );

    stock.availableQuantity = Math.max(
        0,
        stock.availableQuantity - 1
    );

    stock.lastUpdated = new Date();

    await stock.save();

    /*
     * Keep StockPurchase synchronized.
     */
    if (purchase) {
        for (const productItem of purchase.products) {
            const serialExists =
                productItem.serialNumbers.some(
                    (item) =>
                        item.serialNumber ===
                        serialNumber
                );

            if (serialExists) {
                productItem.serialNumbers =
                    productItem.serialNumbers.filter(
                        (item) =>
                            item.serialNumber !==
                            serialNumber
                    );

                productItem.availableQuantity =
                    Math.max(
                        0,
                        productItem.availableQuantity - 1
                    );

                /*
                 * purchasedQuantity represents what was
                 * actually purchased, so it is intentionally
                 * not reduced here.
                 */
            }
        }

        await purchase.save();
    }

    return true;
}

/* ============================================================
 * PRIVATE SERVICE HELPERS
 * ============================================================
 */

/**
 * Validates Vendor existence.
 */
async function validateVendor(vendorId) {
    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
        throw new Error("Invalid vendor ID.");
    }

    const vendor =
        await Vendor.findById(vendorId);

    if (!vendor) {
        throw new Error("Vendor not found.");
    }

    return vendor;
}

/**
 * Validates Product existence.
 */
async function validateProduct(productId) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw new Error("Invalid product ID.");
    }

    const product =
        await Product.findById(productId);

    if (!product) {
        throw new Error("Product not found.");
    }

    return product;
}

/**
 * Validates that the supplied Center is actually an Outlet.
 */
async function validateOutlet(outletId) {
    if (!mongoose.Types.ObjectId.isValid(outletId)) {
        throw new Error("Invalid outlet ID.");
    }

    const outlet =
        await Center.findById(outletId);

    if (!outlet) {
        throw new Error("Outlet not found.");
    }

    if (outlet.centerType !== "Outlet") {
        throw new Error(
            "Selected center must be an Outlet."
        );
    }

    return outlet;
}

/**
 * Validates Invoice Number uniqueness.
 */
async function validateInvoiceNo(
    invoiceNo,
    excludeId = null
) {
    const filters = {
        invoiceNo: {
            $regex: `^${escapeRegex(invoiceNo)}$`,
            $options: "i"
        }
    };

    if (excludeId) {
        filters._id = {
            $ne: excludeId
        };
    }

    const existingPurchase =
        await StockPurchase.findOne(filters);

    if (existingPurchase) {
        throw new Error(
            `Invoice number ${invoiceNo} already exists.`
        );
    }
}

/**
 * Validates products and their serial-number rules.
 */
async function validateProducts(
    products,
    excludePurchaseId = null
) {
    if (
        !Array.isArray(products) ||
        products.length === 0
    ) {
        throw new Error(
            "At least one product is required."
        );
    }

    for (const productItem of products) {
        await validateProduct(
            productItem.product
        );

        if (
            productItem.price === undefined ||
            Number(productItem.price) < 0
        ) {
            throw new Error(
                `Invalid price for product ${productItem.product}.`
            );
        }

        if (
            productItem.purchasedQuantity ===
                undefined ||
            Number(
                productItem.purchasedQuantity
            ) < 1
        ) {
            throw new Error(
                `Purchased quantity must be at least 1 for product ${productItem.product}.`
            );
        }

        const product =
            await Product.findById(
                productItem.product
            );

        const serialNumbers =
            productItem.serialNumbers || [];

        if (
            product.trackSerialNumber === "Yes"
        ) {
            if (serialNumbers.length === 0) {
                throw new Error(
                    `Serial numbers are required for product ${productItem.product}.`
                );
            }

            if (
                serialNumbers.length !==
                Number(
                    productItem.purchasedQuantity
                )
            ) {
                throw new Error(
                    `Serial numbers count must match purchased quantity for product ${productItem.product}.`
                );
            }

            const serialSet = new Set();

            for (const serial of serialNumbers) {
                const serialNumber =
                    typeof serial === "object"
                        ? serial.serialNumber
                        : serial;

                if (
                    !serialNumber ||
                    !String(serialNumber).trim()
                ) {
                    throw new Error(
                        `Serial number cannot be empty.`
                    );
                }

                const normalizedSerial =
                    String(serialNumber).trim();

                if (
                    serialSet.has(
                        normalizedSerial
                    )
                ) {
                    throw new Error(
                        `Duplicate serial number ${normalizedSerial}.`
                    );
                }

                serialSet.add(
                    normalizedSerial
                );

                /*
                 * Do not allow the same serial to exist
                 * in another StockPurchase.
                 */
                const purchaseFilter = {
                    "products.serialNumbers.serialNumber":
                        normalizedSerial
                };

                if (excludePurchaseId) {
                    purchaseFilter._id = {
                        $ne: excludePurchaseId
                    };
                }

                const existingPurchase =
                    await StockPurchase.findOne(
                        purchaseFilter
                    );

                if (existingPurchase) {
                    throw new Error(
                        `Serial number ${normalizedSerial} already exists in another stock purchase.`
                    );
                }

                /*
                 * Do not allow an existing OutletStock serial
                 * to be duplicated.
                 */
                const existingOutletStock =
                    await OutletStock.findOne({
                        "serialNumbers.serialNumber":
                            normalizedSerial
                    });

                if (existingOutletStock) {
                    /*
                     * During an update, the existing purchase's
                     * stock is still present until service removes it.
                     *
                     * Therefore the existing purchase ID is
                     * checked through the serial's purchaseId.
                     */
                    const existingSerial =
                        existingOutletStock.serialNumbers.find(
                            (item) =>
                                item.serialNumber ===
                                normalizedSerial
                        );

                    if (
                        !excludePurchaseId ||
                        !existingSerial ||
                        existingSerial.purchaseId?.toString() !==
                            excludePurchaseId.toString()
                    ) {
                        throw new Error(
                            `Serial number ${normalizedSerial} already exists in outlet stock.`
                        );
                    }
                }
            }
        } else if (serialNumbers.length > 0) {
            throw new Error(
                `Serial numbers are not allowed for product ${productItem.product}.`
            );
        }
    }
}

/**
 * Ensures that a purchase has not already been partially
 * transferred/consumed.
 */
function validatePurchaseCanBeModified(
    stockPurchase
) {
    for (const productItem of stockPurchase.products) {
        if (
            productItem.availableQuantity <
            productItem.purchasedQuantity
        ) {
            throw new Error(
                "Stock purchase cannot be modified because some stock has already been transferred or consumed."
            );
        }

        const hasUnavailableSerial =
            productItem.serialNumbers?.some(
                (serial) =>
                    serial.status !== "available"
            );

        if (hasUnavailableSerial) {
            throw new Error(
                "Stock purchase cannot be modified because some serial numbers are no longer available."
            );
        }
    }
}

/**
 * Removes stock belonging to a Stock Purchase from OutletStock.
 *
 * This is intentionally separate from OutletStock.updateStock()
 * because updateStock() adds serial records using $push.
 */
async function removePurchaseStock(
    stockPurchase
) {
    for (const productItem of stockPurchase.products) {
        const stock =
            await OutletStock.findOne({
                outlet: stockPurchase.outlet,
                product: productItem.product
            });

        if (!stock) {
            continue;
        }

        stock.totalQuantity = Math.max(
            0,
            stock.totalQuantity -
                productItem.purchasedQuantity
        );

        stock.availableQuantity = Math.max(
            0,
            stock.availableQuantity -
                productItem.purchasedQuantity
        );

        const purchaseId =
            stockPurchase._id.toString();

        stock.serialNumbers =
            stock.serialNumbers.filter(
                (serial) =>
                    serial.purchaseId?.toString() !==
                    purchaseId
            );

        stock.lastUpdated = new Date();

        /*
         * Remove empty stock documents.
         */
        if (
            stock.totalQuantity === 0 &&
            stock.serialNumbers.length === 0
        ) {
            await OutletStock.findByIdAndDelete(
                stock._id
            );
        } else {
            await stock.save();
        }
    }
}

/**
 * Converts incoming serial strings/objects into the
 * structure expected by StockPurchase.
 */
function normalizeSerialNumbers(
    serialNumbers
) {
    return serialNumbers.map((serial) => {
        if (typeof serial === "string") {
            return {
                serialNumber: serial.trim()
            };
        }

        return {
            serialNumber:
                serial.serialNumber?.trim(),
            status:
                serial.status || "available",
            currentLocation:
                serial.currentLocation || null,
            transferredTo:
                serial.transferredTo || null,
            transferDate:
                serial.transferDate || null,
            consumedDate:
                serial.consumedDate || null
        };
    });
}

/**
 * Escapes a string before using it inside a RegExp.
 */
function escapeRegex(value) {
    return String(value).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}