import mongoose from "mongoose";

import StockUsage from "../models/StockUsage.js";
import CenterStock from "../models/CenterStock.js";
import Product from "../models/Product.js";
import EntityStockUsage from "../models/EntityStock.js";
import FaultyStock from "../models/FaultyStock.js";
import ReturnRecord from "../models/ReturnRecord.js";
import ReplacementRecord from "../models/ReplacementRecord.js";
import Center from "../models/Center.js";

/**
 * Create a Stock Usage entry.
 *
 * Legacy flow:
 * 1. Validate every product.
 * 2. Validate center stock availability.
 * 3. Capture old/new/total stock values.
 * 4. Validate serial numbers for serialized products.
 * 5. Save StockUsage.
 * 6. Immediately process stock movement.
 *
 * Damage usage is handled differently:
 * it reserves the stock and keeps the StockUsage pending
 * until approval/rejection.
 */

export const createStockUsage = async (usageData) => {
    const preparedItems = [];

    for (const item of usageData.items) {
        const product = await Product.findById(item.product);

        if (!product) {
            throw new Error(`Product not found: ${item.product}`);
        }

        const centerStock = await CenterStock.findOne({
            center: usageData.center,
            product: item.product,
        });


                if (!centerStock) {
            throw new Error(
                `Stock not found for product ${product.productTitle}`
            );
        }

        if (centerStock.availableQuantity < item.quantity) {
            throw new Error(
                `Insufficient stock for product ${product.productTitle}. ` +
                `Available: ${centerStock.availableQuantity}, ` +
                `Requested: ${item.quantity}`
            );
        }

        const preparedItem = {
            ...item,
            oldStock: centerStock.availableQuantity,
            newStock: centerStock.availableQuantity - item.quantity,
            totalStock: centerStock.totalQuantity,
        };

        if (
            product.trackSerialNumber === "Yes" &&
            item.serialNumbers?.length
        ) {
            const validSerials =
                await centerStock.validateAndGetSerials(
                    item.serialNumbers,
                    usageData.center
                );

            if (
                !validSerials ||
                validSerials.length !== item.serialNumbers.length
            ) {
                throw new Error(
                    `Invalid or unavailable serial numbers for product ${product.productTitle}`
                );
            }
        }

        preparedItems.push(preparedItem);
    }

    const stockUsage = new StockUsage({
        ...usageData,
        items: preparedItems,
    });

await stockUsage.save();



try {
    if (usageData.usageType === "Damage") {


        await processDamageUsage(stockUsage);


    } else if (usageData.usageType === "Damage Return") {
        await reserveStockForDamage(stockUsage);
    } else {
        await processStockDeduction(stockUsage);
    }

    return stockUsage;
} catch (error) {
    console.error("[StockUsage] Processing failed:", error);

    await StockUsage.findByIdAndDelete(stockUsage._id);
    throw error;
}
};


export const processDamageUsage = async (stockUsage) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const center = await Center.findById(stockUsage.center)
            .select("reseller")
            .session(session);

        if (!center) {
            throw new Error(
                `Center not found: ${stockUsage.center}`
            );
        }

        if (!center.reseller) {
            throw new Error(
                "Reseller could not be resolved for the selected center"
            );
        }

        if (!stockUsage.createdBy) {
            throw new Error(
                "Authenticated user ID is required to report damage"
            );
        }

        const toCenter = stockUsage.toCenter
            ? await Center.findById(stockUsage.toCenter).session(session)
            : null;

        for (const item of stockUsage.items) {
            const product = await Product.findById(item.product)
                .session(session);

            if (!product) {
                throw new Error(`Product not found: ${item.product}`);
            }

            const centerStock = await CenterStock.findOne({
                center: stockUsage.center,
                product: item.product,
            }).session(session);

            if (!centerStock) {
                throw new Error(
                    `Center stock not found for product ${product.productTitle}`
                );
            }

            const isSerialized = product.trackSerialNumber === "Yes";
            const serialNumbers = item.serialNumbers || [];

            if (isSerialized) {
                if (
                    serialNumbers.length !== item.quantity ||
                    new Set(serialNumbers).size !== serialNumbers.length
                ) {
                    throw new Error(
                        `Serial number count must match quantity and contain no duplicates for ${product.productTitle}`
                    );
                }
            }

            if (centerStock.availableQuantity < item.quantity) {
                throw new Error(
                    `Insufficient available stock for product ${product.productTitle}`
                );
            }

            if (isSerialized) {
                for (const serialNumber of serialNumbers) {
                    const serialEntry = centerStock.serialNumbers.find(
                        (entry) =>
                            entry.serialNumber === serialNumber &&
                            entry.status === "available" &&
                            String(entry.currentLocation || "") ===
                                String(stockUsage.center)
                    );

                    if (!serialEntry) {
                        throw new Error(
                            `Serial number ${serialNumber} is not available at this center`
                        );
                    }

                    serialEntry.status = "damaged";

                    serialEntry.transferHistory.push({
                        fromCenter: stockUsage.center,
                        toCenter: stockUsage.toCenter,
                        transferDate: new Date(),
                        transferType: "damage_reported",
                        usageType: stockUsage.usageType,
                        referenceId: stockUsage._id,
                        remark:
                            stockUsage.remark || stockUsage.damageReason,
                    });
                }

                // Legacy behavior: serialized damage reduces availability only.
                centerStock.availableQuantity -= item.quantity;
            } else {
                // Legacy behavior: non-serialized damage reduces both counters.
                centerStock.availableQuantity -= item.quantity;
                centerStock.totalQuantity -= item.quantity;
            }

            if (
                centerStock.availableQuantity < 0 ||
                centerStock.totalQuantity < 0
            ) {
                throw new Error(
                    `Insufficient stock for product ${product.productTitle}`
                );
            }

            centerStock.lastUpdated = new Date();
            await centerStock.save({ session });

            // Match the legacy lookup criteria exactly.
            const faultyStock = await FaultyStock.findOne({
                product: item.product,
                center: stockUsage.center,
                toCenter: stockUsage.toCenter,
                usageType: "Damage",
            }).session(session);

            if (faultyStock) {
                if (!faultyStock.pendingDamageHistory) {
                    faultyStock.pendingDamageHistory = [];
                }

                faultyStock.pendingDamageHistory.push({
                    date: new Date(),
                    quantity: item.quantity,
                    status: "pending",
                    remark: "New damage reported - pending verification",
                    reportedBy: stockUsage.createdBy,
                    usageReference: stockUsage._id,
                    serialNumbers: serialNumbers,
                });

                faultyStock.pendingDamageQty =
                    (faultyStock.pendingDamageQty || 0) + item.quantity;

                if (faultyStock.pendingDamageQty > 0) {
                    faultyStock.overallStatus = "pending_damage";
                }

                if (
                    isSerialized &&
                    serialNumbers.length > 0
                ) {
                    const existingSerials = (
                        faultyStock.serialNumbers || []
                    ).map((serial) => serial.serialNumber);

                    const newSerials = serialNumbers.filter(
                        (serialNumber) =>
                            !existingSerials.includes(serialNumber)
                    );

                    for (const serialNumber of newSerials) {
                        faultyStock.serialNumbers.push({
                            serialNumber,
                            status: "pending_damage",
                            quantity: 1,
                            repairedQty: 0,
                            irrepairedQty: 0,
                            underRepairQty: 0,
                            repairHistory: [
                                {
                                    date: new Date(),
                                    status: "pending_damage",
                                    remark:
                                        "Damage reported - pending verification",
                                    quantity: 1,
                                    repairedQty: 0,
                                    irrepairedQty: 0,
                                    updatedBy: stockUsage.createdBy,
                                },
                            ],
                        });
                    }
                }

                // Required for legacy serialized quantity/status recalculation.
                faultyStock.updateQuantitiesAndStatus();

                await faultyStock.save({ session });
            } else {
                const faultyStockData = {
                    date: stockUsage.date || new Date(),
                    usageReference: stockUsage._id,
                    center: stockUsage.center,
                    toCenter: stockUsage.toCenter,
                    reseller: center.reseller,
                    product: item.product,
                    quantity: isSerialized ? item.quantity : 0,
                    pendingDamageQty: item.quantity,
                    serialNumbers: [],
                    usageType: stockUsage.usageType,
                    remark:
                        stockUsage.remark ||
                        "Damage reported - pending verification",
                    reportedBy: stockUsage.createdBy,
                    overallStatus: "pending_damage",
                    damageDate: new Date(),
                    repairedQty: 0,
                    irrepairedQty: 0,
                    underRepairQty: 0,
                    transferredQty: 0,
                    damageQty: 0,
                    pendingDamageHistory: [
                        {
                            date: new Date(),
                            quantity: item.quantity,
                            status: "pending",
                            remark:
                                "Initial damage report - pending verification",
                            reportedBy: stockUsage.createdBy,
                            usageReference: stockUsage._id,
                            serialNumbers: serialNumbers,
                        },
                    ],
                    isSerialized,
                };

                if (isSerialized && serialNumbers.length > 0) {
                    faultyStockData.serialNumbers = serialNumbers.map(
                        (serialNumber) => ({
                            serialNumber,
                            status: "pending_damage",
                            quantity: 1,
                            repairedQty: 0,
                            irrepairedQty: 0,
                            underRepairQty: 0,
                            repairHistory: [
                                {
                                    date: new Date(),
                                    status: "pending_damage",
                                    remark:
                                        "Initial damage report - pending verification",
                                    quantity: 1,
                                    repairedQty: 0,
                                    irrepairedQty: 0,
                                    updatedBy: stockUsage.createdBy,
                                },
                            ],
                        })
                    );
                }

                const newFaultyStock = new FaultyStock(faultyStockData);

                // Preserve legacy behavior for initial record creation.
                newFaultyStock.$ignore("quantity");

                await newFaultyStock.save({ session });
            }
        }

        stockUsage.status = "completed";
        await stockUsage.save({ session });

        await session.commitTransaction();

        return stockUsage;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        await session.endSession();
    }
};


/**
 * Deduct stock for a normal Stock Usage.
 *
 * Legacy behavior:
 * - non-serialized:
 *      availableQuantity -= quantity
 *      totalQuantity -= quantity
 *
 * - serialized:
 *      selected serials become consumed
 *      currentLocation becomes null
 *      consumed metadata is recorded
 *      transfer history is recorded
 *
 * - then stock is added to the destination entity.
 *
 * - usage becomes completed.
 */
export const processStockDeduction = async (stockUsage) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        for (const item of stockUsage.items) {
            const product = await Product.findById(item.product).session(
                session
            );

            if (!product) {
                throw new Error(`Product not found: ${item.product}`);
            }

            const centerStock = await CenterStock.findOne({
                center: stockUsage.center,
                product: item.product,
            }).session(session);

            if (!centerStock) {
                throw new Error(
                    `Center stock not found for product ${item.product}`
                );
            }

            if (product.trackSerialNumber === "Yes") {
                const serialNumbers = item.serialNumbers || [];

                if (serialNumbers.length !== item.quantity) {
                    throw new Error(
                        `Serial number count must match quantity for product ${product.productTitle}`
                    );
                }

                for (const serial of serialNumbers) {
                    const serialEntry =
                        centerStock.serialNumbers.find(
                            (entry) =>
                                entry.serialNumber === serial &&
                                entry.status === "available"
                        );

                    if (!serialEntry) {
                        throw new Error(
                            `Serial number ${serial} is not available`
                        );
                    }

                    serialEntry.status = "consumed";
                    serialEntry.currentLocation = null;
                    serialEntry.consumedDate = new Date();

                    serialEntry.transferHistory.push({
                        fromCenter: stockUsage.center,
                        toCenter: stockUsage.toCenter,
                        transferDate: new Date(),
                        transferType: "field_usage",
                        usageType: stockUsage.usageType,
                        referenceId: stockUsage._id,
                        remark: stockUsage.remark,
                    });
                }

                centerStock.availableQuantity -= item.quantity;
                centerStock.consumedQuantity += item.quantity;

                await centerStock.save({ session });
            } else {
                centerStock.totalQuantity -= item.quantity;
                centerStock.availableQuantity -= item.quantity;

                await centerStock.save({ session });
            }

            await addStockToEntity(stockUsage, item);
        }

        stockUsage.status = "completed";

        await stockUsage.save({ session });

        await session.commitTransaction();

        return stockUsage;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        await session.endSession();
    }
};


/**
 * Reserve stock for Damage usage.
 *
 * Damage is intentionally left pending.
 * The stock is removed from available stock immediately,
 * then approval/rejection determines the final state.
 */
export const reserveStockForDamage = async (stockUsage) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        for (const item of stockUsage.items) {
            const product = await Product.findById(item.product).session(
                session
            );

            if (!product) {
                throw new Error(`Product not found: ${item.product}`);
            }

            const centerStock = await CenterStock.findOne({
                center: stockUsage.center,
                product: item.product,
            }).session(session);

            if (!centerStock) {
                throw new Error(
                    `Center stock not found for product ${item.product}`
                );
            }

            if (product.trackSerialNumber === "Yes") {
                const serialNumbers = item.serialNumbers || [];

                if (serialNumbers.length !== item.quantity) {
                    throw new Error(
                        `Serial number count must match quantity for product ${product.productTitle}`
                    );
                }

                for (const serial of serialNumbers) {
                    const serialEntry =
                        centerStock.serialNumbers.find(
                            (entry) =>
                                entry.serialNumber === serial &&
                                entry.status === "available"
                        );

                    if (!serialEntry) {
                        throw new Error(
                            `Serial number ${serial} is not available`
                        );
                    }

                    serialEntry.status = "consumed";
                    serialEntry.currentLocation = null;
                    serialEntry.consumedDate = new Date();

                    serialEntry.transferHistory.push({
                        fromCenter: stockUsage.center,
                        toCenter: stockUsage.toCenter,
                        transferDate: new Date(),
                        transferType: "damage_reserved",
                        usageType: stockUsage.usageType,
                        referenceId: stockUsage._id,
                        remark: stockUsage.remark,
                    });
                }

                centerStock.availableQuantity -= item.quantity;
                centerStock.consumedQuantity += item.quantity;
            } else {
                centerStock.availableQuantity -= item.quantity;
                centerStock.totalQuantity -= item.quantity;
            }

            await centerStock.save({ session });
        }

        /*
         * Damage stays pending until approval/rejection.
         */
        stockUsage.status = "pending";

        await stockUsage.save({ session });

        await session.commitTransaction();

        return stockUsage;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        await session.endSession();
    }
};


/**
 * Add consumed stock to the relevant entity.
 *
 * Entity mapping follows the legacy implementation.
 */
export const addStockToEntity = async (stockUsage, item) => {
    const entityType = getEntityType(stockUsage.usageType);
    const entityId = getEntityId(stockUsage);

    if (!entityType || !entityId) {
        return null;
    }

    return EntityStockUsage.updateStock(
        entityType,
        entityId,
        item.product,
        item.quantity,
        item.serialNumbers || [],
        stockUsage._id,
        stockUsage.usageType
    );
};


/**
 * Resolve EntityStockUsage.entityType from usage type.
 */
export const getEntityType = (usageType) => {
    switch (usageType) {
        case "Customer":
            return "customer";

        case "Building":
        case "Building to Building":
            return "building";

        case "Control Room":
            return "controlRoom";

        case "Damage":
            return "damage";

        case "Stolen from Center":
        case "Stolen from Field":
            return "stolen";

        case "Other":
            return "other";

        default:
            return null;
    }
};


/**
 * Resolve EntityStockUsage.entityId from StockUsage.
 */
export const getEntityId = (stockUsage) => {
    switch (stockUsage.usageType) {
        case "Customer":
            return stockUsage.customer;

        case "Building":
        case "Building to Building":
            return stockUsage.fromBuilding;

        case "Control Room":
            return stockUsage.fromControlRoom;

        case "Damage":
        case "Stolen from Center":
        case "Stolen from Field":
        case "Other":
            return stockUsage.center;

        default:
            return null;
    }
};
/**
 * Get all Stock Usage records.
 *
 * Supports the same filters used by the legacy controller:
 * - center
 * - usageType
 * - date range
 * - customer
 * - building
 * - control room
 * - status
 * - pagination
 * - sorting
 */
export const getAllStockUsage = async (filters = {}) => {
    const {
        center,
        usageType,
        date,
        startDate,
        endDate,
        customer,
        building,
        controlRoom,
        status,
        page = 1,
        limit = 10,
        sort = "-createdAt",
    } = filters;

    const query = {};

    if (center) {
        query.center = center;
    }

    if (usageType) {
        query.usageType = usageType;
    }

    if (customer) {
        query.customer = customer;
    }

    if (building) {
        query.$or = [
            { fromBuilding: building },
            { toBuilding: building },
        ];
    }

    if (controlRoom) {
        query.fromControlRoom = controlRoom;
    }

    if (status) {
        query.status = status;
    }

    /*
     * Preserve the legacy date filtering behavior:
     * exact date OR start/end range.
     */
    if (date) {
        const requestedDate = new Date(date);

        if (!Number.isNaN(requestedDate.getTime())) {
            const start = new Date(requestedDate);
            start.setHours(0, 0, 0, 0);

            const end = new Date(requestedDate);
            end.setHours(23, 59, 59, 999);

            query.date = {
                $gte: start,
                $lte: end,
            };
        }
    } else if (startDate || endDate) {
        query.date = {};

        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            query.date.$gte = start;
        }

        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.date.$lte = end;
        }
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 10, 1);
    const skip = (pageNumber - 1) * limitNumber;

    const [records, total] = await Promise.all([
        StockUsage.find(query)
            .populate("center")
            .populate("toCenter")
            .populate("customer")
            .populate("fromBuilding")
            .populate("toBuilding")
            .populate("fromControlRoom")
            .populate("createdBy")
            .populate("approvedBy")
            .populate("rejectedBy")
            .populate("items.product")
            .sort(sort)
            .skip(skip)
            .limit(limitNumber),

        StockUsage.countDocuments(query),
    ]);

    return {
        records,
        pagination: {
            total,
            page: pageNumber,
            limit: limitNumber,
            totalPages: Math.ceil(total / limitNumber),
        },
    };
};


/**
 * Get one Stock Usage record by ID.
 */
export const getStockUsageById = async (id) => {
    const stockUsage = await StockUsage.findById(id)
        .populate("center")
        .populate("toCenter")
        .populate("customer")
        .populate("fromBuilding")
        .populate("toBuilding")
        .populate("fromControlRoom")
        .populate("createdBy")
        .populate("approvedBy")
        .populate("rejectedBy")
        .populate("changedBy")
        .populate("revertedBy")
        .populate("items.product");

    if (!stockUsage) {
        throw new Error("Stock usage not found");
    }

    return stockUsage;
};


/**
 * Update an existing Stock Usage.
 *
 * This method intentionally does not re-process stock movement.
 * The legacy update flow updates the StockUsage document itself.
 */
export const updateStockUsage = async (id, updateData) => {
    const stockUsage = await StockUsage.findById(id);

    if (!stockUsage) {
        throw new Error("Stock usage not found");
    }

    /*
     * Keep the legacy document update behavior.
     */
    Object.keys(updateData).forEach((key) => {
        if (updateData[key] !== undefined) {
            stockUsage[key] = updateData[key];
        }
    });

    await stockUsage.save();

    return stockUsage;
};


/**
 * Delete a Stock Usage record.
 *
 * Legacy deletion is restricted to records that are not
 * already completed.
 */
export const deleteStockUsage = async (id) => {
    const stockUsage = await StockUsage.findById(id);

    if (!stockUsage) {
        throw new Error("Stock usage not found");
    }

    if (stockUsage.status === "completed") {
        throw new Error(
            "Completed stock usage cannot be deleted"
        );
    }

    await StockUsage.findByIdAndDelete(id);

    return {
        message: "Stock usage deleted successfully",
        id,
    };
};
/**
 * Approve a pending Damage Stock Usage.
 *
 * Legacy behavior:
 * - Only Damage records can be approved.
 * - Record must currently be pending.
 * - Serialized stock moves:
 *      consumed -> damaged
 * - Damage approval metadata is stored.
 * - Usage becomes completed.
 */
export const approveDamageRequest = async (
    id,
    approvalData = {}
) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const stockUsage = await StockUsage.findById(id).session(session);

        if (!stockUsage) {
            throw new Error("Stock usage not found");
        }

        if (stockUsage.usageType !== "Damage") {
            throw new Error(
                "Only damage requests can be approved"
            );
        }

        if (stockUsage.status !== "pending") {
            throw new Error(
                "Only pending damage requests can be approved"
            );
        }

        for (const item of stockUsage.items) {
            const product = await Product.findById(
                item.product
            ).session(session);

            if (!product) {
                throw new Error(
                    `Product not found: ${item.product}`
                );
            }

            const centerStock = await CenterStock.findOne({
                center: stockUsage.center,
                product: item.product,
            }).session(session);

            if (!centerStock) {
                throw new Error(
                    `Center stock not found for product ${item.product}`
                );
            }

            /*
             * Legacy serialized damage approval:
             * consumed -> damaged
             */
            if (product.trackSerialNumber === "Yes") {
                const serialNumbers = item.serialNumbers || [];

                for (const serial of serialNumbers) {
                    const serialEntry =
                        centerStock.serialNumbers.find(
                            (entry) =>
                                entry.serialNumber === serial &&
                                entry.status === "consumed"
                        );

                    if (!serialEntry) {
                        throw new Error(
                            `Consumed serial number ${serial} not found`
                        );
                    }

                    serialEntry.status = "damaged";

                    serialEntry.transferHistory.push({
                        fromCenter: stockUsage.center,
                        toCenter: stockUsage.toCenter,
                        transferDate: new Date(),
                        transferType: "damage_approved",
                        usageType: stockUsage.usageType,
                        referenceId: stockUsage._id,
                        remark: stockUsage.remark,
                    });
                }

                await centerStock.save({ session });
            }

            /*
             * IMPORTANT:
             * For non-serialized damage, the reservation
             * already removed the quantity from stock.
             *
             * Legacy approval does not deduct it again.
             */
        }

        stockUsage.status = "completed";
        stockUsage.approvedBy =
            approvalData.approvedBy || approvalData.userId;
        stockUsage.approvalRemark =
            approvalData.approvalRemark ||
            approvalData.remark;
        stockUsage.approvalDate = new Date();

        await stockUsage.save({ session });

        await session.commitTransaction();

        return stockUsage;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        await session.endSession();
    }
};


/**
 * Reject a pending Damage Stock Usage.
 *
 * Legacy behavior:
 * - Only Damage records can be rejected.
 * - Record must be pending.
 * - Serialized:
 *      consumed -> available
 * - Non-serialized:
 *      available += quantity
 *      total += quantity
 * - Usage becomes cancelled.
 */
export const rejectDamageRequest = async (
    id,
    rejectionData = {}
) => {
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const stockUsage = await StockUsage.findById(id).session(session);

        if (!stockUsage) {
            throw new Error("Stock usage not found");
        }

        if (stockUsage.usageType !== "Damage") {
            throw new Error(
                "Only damage requests can be rejected"
            );
        }

        if (stockUsage.status !== "pending") {
            throw new Error(
                "Only pending damage requests can be rejected"
            );
        }

        for (const item of stockUsage.items) {
            const product = await Product.findById(
                item.product
            ).session(session);

            if (!product) {
                throw new Error(
                    `Product not found: ${item.product}`
                );
            }

            const centerStock = await CenterStock.findOne({
                center: stockUsage.center,
                product: item.product,
            }).session(session);

            if (!centerStock) {
                throw new Error(
                    `Center stock not found for product ${item.product}`
                );
            }

            if (product.trackSerialNumber === "Yes") {
                const serialNumbers = item.serialNumbers || [];

                for (const serial of serialNumbers) {
                    const serialEntry =
                        centerStock.serialNumbers.find(
                            (entry) =>
                                entry.serialNumber === serial &&
                                entry.status === "consumed"
                        );

                    if (!serialEntry) {
                        throw new Error(
                            `Consumed serial number ${serial} not found`
                        );
                    }

                    serialEntry.status = "available";
                    serialEntry.currentLocation =
                        stockUsage.center;
                    serialEntry.consumedDate = null;
                    serialEntry.consumedBy = null;

                    serialEntry.transferHistory.push({
                        fromCenter: stockUsage.center,
                        toCenter: stockUsage.toCenter,
                        transferDate: new Date(),
                        transferType: "damage_rejected",
                        usageType: stockUsage.usageType,
                        referenceId: stockUsage._id,
                        remark: stockUsage.remark,
                    });
                }

                centerStock.availableQuantity +=
                    item.quantity;

                centerStock.consumedQuantity -=
                    item.quantity;
            } else {
                centerStock.availableQuantity +=
                    item.quantity;

                centerStock.totalQuantity +=
                    item.quantity;
            }

            await centerStock.save({ session });
        }

        stockUsage.status = "cancelled";
        stockUsage.rejectedBy =
            rejectionData.rejectedBy ||
            rejectionData.userId;
        stockUsage.rejectionRemark =
            rejectionData.rejectionRemark ||
            rejectionData.remark;
        stockUsage.rejectionDate = new Date();

        await stockUsage.save({ session });

        await session.commitTransaction();

        return stockUsage;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        await session.endSession();
    }
};


/**
 * Get pending Damage requests.
 */
export const getPendingDamageRequests = async (
    filters = {}
) => {
    const query = {
        usageType: "Damage",
        status: "pending",
    };

    if (filters.center) {
        query.center = filters.center;
    }

    if (filters.startDate || filters.endDate) {
        query.date = {};

        if (filters.startDate) {
            const start = new Date(filters.startDate);
            start.setHours(0, 0, 0, 0);
            query.date.$gte = start;
        }

        if (filters.endDate) {
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            query.date.$lte = end;
        }
    }

    return StockUsage.find(query)
        .populate("center")
        .populate("customer")
        .populate("fromBuilding")
        .populate("toBuilding")
        .populate("fromControlRoom")
        .populate("createdBy")
        .populate("items.product")
        .sort({ createdAt: -1 });
};


/**
 * Get Damage requests by status.
 */
export const getDamageRequestsByStatus = async (
    status,
    filters = {}
) => {
    const query = {
        usageType: "Damage",
        status,
    };

    if (filters.center) {
        query.center = filters.center;
    }

    if (filters.startDate || filters.endDate) {
        query.date = {};

        if (filters.startDate) {
            const start = new Date(filters.startDate);
            start.setHours(0, 0, 0, 0);
            query.date.$gte = start;
        }

        if (filters.endDate) {
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            query.date.$lte = end;
        }
    }

    return StockUsage.find(query)
        .populate("center")
        .populate("customer")
        .populate("fromBuilding")
        .populate("toBuilding")
        .populate("fromControlRoom")
        .populate("createdBy")
        .populate("approvedBy")
        .populate("rejectedBy")
        .populate("items.product")
        .sort({ createdAt: -1 });
};
/**
 * Get Stock Usage records for a customer.
 */
export const getStockUsageByCustomer = async (customerId) => {
    return StockUsage.find({
        customer: customerId,
    })
        .populate("center")
        .populate("customer")
        .populate("items.product")
        .populate("createdBy")
        .sort({ date: -1 });
};


/**
 * Get Stock Usage records for a building.
 *
 * A building can appear as either:
 * - fromBuilding
 * - toBuilding
 */
export const getStockUsageByBuilding = async (buildingId) => {
    return StockUsage.find({
        $or: [
            { fromBuilding: buildingId },
            { toBuilding: buildingId },
        ],
    })
        .populate("center")
        .populate("fromBuilding")
        .populate("toBuilding")
        .populate("items.product")
        .populate("createdBy")
        .sort({ date: -1 });
};


/**
 * Get Stock Usage records for a control room.
 */
export const getStockUsageByControlRoom = async (controlRoomId) => {
    return StockUsage.find({
        fromControlRoom: controlRoomId,
    })
        .populate("center")
        .populate("fromControlRoom")
        .populate("items.product")
        .populate("createdBy")
        .sort({ date: -1 });
};


/**
 * Get products/devices used by a customer.
 *
 * EntityStockUsage is the source for the current stock held
 * against the customer.
 */
export const getProductDevicesByCustomer = async (customerId) => {
    return EntityStockUsage.find({
        entityType: "customer",
        entityId: customerId,
    })
        .populate("product")
        .sort({ lastUpdated: -1 });
};


/**
 * Get products/devices used by a building.
 */
export const getProductDevicesByBuilding = async (buildingId) => {
    return EntityStockUsage.find({
        entityType: "building",
        entityId: buildingId,
    })
        .populate("product")
        .sort({ lastUpdated: -1 });
};


/**
 * Get products/devices used by a control room.
 */
export const getProductDevicesByControlRoom = async (
    controlRoomId
) => {
    return EntityStockUsage.find({
        entityType: "controlRoom",
        entityId: controlRoomId,
    })
        .populate("product")
        .sort({ lastUpdated: -1 });
};
export const changeToDamageReturn = async ({
    id,
    remark,
    changedBy,
}) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error("Invalid stock usage ID");
    }

    const existingUsage = await StockUsage.findById(id);

    if (!existingUsage) {
        throw new Error("Stock usage record not found");
    }

    if (existingUsage.usageType === "Damage Return") {
        throw new Error("This entry is already a Damage Return");
    }

    const originalUsageType = existingUsage.usageType;

    existingUsage.usageType = "Damage Return";
    existingUsage.originalUsageType = originalUsageType;
    existingUsage.remark =
        remark ||
        `Changed from ${originalUsageType} to Damage Return`;
    existingUsage.changedBy = changedBy;
    existingUsage.changeDate = new Date();
    existingUsage.status = "pending";

    await existingUsage.save();

    return StockUsage.findById(existingUsage._id)
        .populate("center", "name centerType")
        .populate("customer", "username name mobile")
        .populate("fromBuilding", "buildingName displayName")
        .populate("toBuilding", "buildingName displayName")
        .populate("fromControlRoom", "buildingName displayName")
        .populate({
            path: "items.product",
            select: "productTitle productCode trackSerialNumber",
        })
        .populate("createdBy", "name email")
        .populate("changedBy", "name email");
};
export const getDamageReturnRecordsWithStats = async ({
    center,
    startDate,
    endDate,
    status,
    page = 1,
    limit = 100,
    sortBy = "date",
    sortOrder = "desc",
    userCenter,
    canViewAllCenters = false,
}) => {
    const filter = {
        usageType: "Damage Return",
    };

    if (!canViewAllCenters && userCenter) {
        filter.center = userCenter;
    } else if (center) {
        filter.center = center;
    }

    if (startDate || endDate) {
        filter.date = {};

        if (startDate) {
            filter.date.$gte = new Date(startDate);
        }

        if (endDate) {
            filter.date.$lte = new Date(endDate);
        }
    }

    if (status) {
        filter.status = status;
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const sort = {
        [sortBy]: sortOrder === "desc" ? -1 : 1,
    };

    const [
        damageReturnRecords,
        total,
        stats,
        statusStats,
        originalTypeStats,
    ] = await Promise.all([
        StockUsage.find(filter)
            .populate("center", "name centerType centerName")
            .populate("customer", "username name mobile")
            .populate("fromBuilding", "buildingName displayName")
            .populate("toBuilding", "buildingName displayName")
            .populate("fromControlRoom", "buildingName displayName")
            .populate({
                path: "items.product",
                select:
                    "productTitle productCode category trackSerialNumber",
            })
            .populate("createdBy", "name email")
            .populate("changedBy", "name email")
            .sort(sort)
            .skip(skip)
            .limit(limitNum),

        StockUsage.countDocuments(filter),

        StockUsage.aggregate([
            { $match: filter },
            { $unwind: "$items" },
            {
                $group: {
                    _id: null,
                    totalItems: {
                        $sum: "$items.quantity",
                    },
                    totalValue: {
                        $sum: {
                            $multiply: [
                                "$items.quantity",
                                "$items.productPrice",
                            ],
                        },
                    },
                    uniqueProducts: {
                        $addToSet: "$items.product",
                    },
                },
            },
            {
                $project: {
                    totalItems: 1,
                    totalValue: 1,
                    uniqueProductCount: {
                        $size: "$uniqueProducts",
                    },
                },
            },
        ]),

        StockUsage.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                },
            },
        ]),

        StockUsage.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: "$originalUsageType",
                    count: { $sum: 1 },
                },
            },
        ]),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return {
        data: damageReturnRecords,

        statistics: {
            totalRecords: total,
            totalItems: stats[0]?.totalItems || 0,
            totalValue: stats[0]?.totalValue || 0,
            uniqueProducts:
                stats[0]?.uniqueProductCount || 0,
            statusDistribution: statusStats,
            originalTypeDistribution: originalTypeStats,
        },

        pagination: {
            currentPage: pageNum,
            totalPages,
            totalRecords: total,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1,
        },
    };
};
export const returnProductSerial = async ({
    usageId,
    productId,
    serialNumber,
    remark = "Product return",
    returnedBy,
    userCenterId,
}) => {
    if (!usageId || !productId || !serialNumber) {
        throw new Error(
            "All fields are required: usageId, productId, serialNumber"
        );
    }

    if (
        !mongoose.Types.ObjectId.isValid(usageId) ||
        !mongoose.Types.ObjectId.isValid(productId)
    ) {
        throw new Error("Invalid ID format");
    }

    const originalUsage = await StockUsage.findById(usageId)
        .populate("customer", "name mobile")
        .populate("fromBuilding", "buildingName displayName")
        .populate("toBuilding", "buildingName displayName")
        .populate("fromControlRoom", "buildingName displayName")
        .populate({
            path: "items.product",
            select:
                "productTitle productCode trackSerialNumber",
        });

    if (!originalUsage) {
        throw new Error(
            `Original stock usage record not found with ID: ${usageId}`
        );
    }

    if (
        originalUsage.center.toString() !==
        userCenterId.toString()
    ) {
        throw new Error(
            "You can only return products from your own center"
        );
    }

    const originalItem = originalUsage.items.find(
        (item) =>
            item.product._id.toString() ===
            productId.toString()
    );

    if (!originalItem) {
        throw new Error(
            "Product not found in the original usage record"
        );
    }

    if (!originalItem.serialNumbers.includes(serialNumber)) {
        throw new Error(
            `Serial number '${serialNumber}' was not found in the original usage for this product`
        );
    }

    const currentCenterStock = await CenterStock.findOne({
        center: userCenterId,
        product: productId,
    });

    if (!currentCenterStock) {
        throw new Error(
            `Center stock not found for product: ${productId}`
        );
    }

    const centerStockUpdate =
        await CenterStock.findOneAndUpdate(
            {
                center: userCenterId,
                product: productId,
                "serialNumbers.serialNumber": serialNumber,
                "serialNumbers.status": "consumed",
            },
            {
                $set: {
                    "serialNumbers.$[elem].status":
                        "available",
                    "serialNumbers.$[elem].currentLocation":
                        userCenterId,
                    "serialNumbers.$[elem].consumedDate":
                        null,
                    "serialNumbers.$[elem].consumedBy":
                        null,
                },

                $push: {
                    "serialNumbers.$[elem].transferHistory": {
                        fromCenter: null,
                        toCenter: userCenterId,
                        transferDate: new Date(),
                        transferType: "return_from_field",
                        referenceId: usageId,
                        remark:
                            `Returned from ${originalUsage.usageType} - ${remark}`,
                        returnedBy,
                    },
                },

                $inc: {
                    availableQuantity: 1,
                    consumedQuantity: -1,
                },

                lastUpdated: new Date(),
            },
            {
                arrayFilters: [
                    {
                        "elem.serialNumber":
                            serialNumber,
                        "elem.status": "consumed",
                    },
                ],
                new: true,
            }
        );

    /*
     * Preserve the legacy fallback update.
     */
    if (!centerStockUpdate) {
        const existingCenterStock =
            await CenterStock.findOne({
                center: userCenterId,
                product: productId,
            });

        if (!existingCenterStock) {
            throw new Error(
                `Center stock not found for product: ${productId}`
            );
        }

        const serialIndex =
            existingCenterStock.serialNumbers.findIndex(
                (sn) =>
                    sn.serialNumber === serialNumber &&
                    sn.status === "consumed"
            );

        if (serialIndex === -1) {
            throw new Error(
                `Serial number '${serialNumber}' not found in consumed status`
            );
        }

        const serial =
            existingCenterStock.serialNumbers[serialIndex];

        serial.status = "available";
        serial.currentLocation = userCenterId;
        serial.consumedDate = null;
        serial.consumedBy = null;

        serial.transferHistory.push({
            fromCenter: null,
            toCenter: userCenterId,
            transferDate: new Date(),
            transferType: "return_from_field",
            referenceId: usageId,
            remark:
                `Returned from ${originalUsage.usageType} - ${remark}`,
            returnedBy,
        });

        existingCenterStock.availableQuantity += 1;

        existingCenterStock.consumedQuantity = Math.max(
            0,
            existingCenterStock.consumedQuantity - 1
        );

        existingCenterStock.lastUpdated = new Date();

        await existingCenterStock.save();
    }

    const entityType = getEntityType(
        originalUsage.usageType
    );

    const entityId = getEntityId(originalUsage);

    if (entityType && entityId) {
        const entityStock =
            await EntityStockUsage.findOne({
                entityType,
                entityId,
                product: productId,
                "serialNumbers.serialNumber":
                    serialNumber,
            });

        if (entityStock) {
            const serialIndex =
                entityStock.serialNumbers.findIndex(
                    (sn) =>
                        sn.serialNumber === serialNumber &&
                        sn.status === "assigned"
                );

            if (serialIndex !== -1) {
                entityStock.serialNumbers[
                    serialIndex
                ].status = "available";

                entityStock.serialNumbers[
                    serialIndex
                ].assignedDate = new Date();

                await entityStock.save();
            }
        }
    }

    const returnData = {
        date: new Date(),
        originalUsageId: usageId,
        center: userCenterId,
        usageType: originalUsage.usageType,
        type: "return",

        customer: originalUsage.customer,
        fromBuilding: originalUsage.fromBuilding,
        toBuilding: originalUsage.toBuilding,
        fromControlRoom:
            originalUsage.fromControlRoom,

        items: [
            {
                product: productId,
                quantity: 1,
                serialNumber,
                oldStock:
                    currentCenterStock.availableQuantity,
                newStock:
                    currentCenterStock.availableQuantity +
                    1,
                totalStock:
                    currentCenterStock.totalQuantity,
            },
        ],

        remark,
        returnedBy,
        status: "completed",
    };

    const returnRecord =
        new ReturnRecord(returnData);

    await returnRecord.save();

    const populatedReturn =
        await ReturnRecord.findById(returnRecord._id)
            .populate("center", "name centerType")
            .populate(
                "customer",
                "username name mobile"
            )
            .populate(
                "fromBuilding",
                "buildingName displayName"
            )
            .populate(
                "toBuilding",
                "buildingName displayName"
            )
            .populate(
                "fromControlRoom",
                "buildingName displayName"
            )
            .populate({
                path: "items.product",
                select:
                    "productTitle productCode trackSerialNumber",
            })
            .populate("returnedBy", "name email")
            .populate(
                "originalUsageId",
                "usageType date remark"
            );

    return {
        returnRecord: populatedReturn,

        summary: {
            serialNumberReturned: serialNumber,
            productId,
            originalUsageType:
                originalUsage.usageType,
            entityType,
            entityId,

            stockChanges: {
                availableQuantity:
                    `${currentCenterStock.availableQuantity} → ` +
                    `${currentCenterStock.availableQuantity + 1}`,

                consumedQuantity:
                    `${currentCenterStock.consumedQuantity} → ` +
                    `${Math.max(
                        0,
                        currentCenterStock.consumedQuantity - 1
                    )}`,
            },
        },
    };
};
export const replaceProductSerial = async ({
    originalUsageId,
    productId,
    oldSerialNumber,
    newSerialNumber,
    statusReason = "Replacement",
    replacedBy,
    userCenterId,
}) => {
    if (
        !originalUsageId ||
        !productId ||
        !oldSerialNumber ||
        !newSerialNumber
    ) {
        throw new Error(
            "All fields are required: originalUsageId, productId, oldSerialNumber, newSerialNumber"
        );
    }

    if (!mongoose.Types.ObjectId.isValid(originalUsageId)) {
        throw new Error("Invalid originalUsageId format");
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
        throw new Error("Invalid productId format");
    }

    const originalUsage = await StockUsage.findById(
        originalUsageId
    )
        .populate("customer", "name mobile")
        .populate(
            "fromBuilding",
            "buildingName displayName"
        )
        .populate(
            "toBuilding",
            "buildingName displayName"
        )
        .populate(
            "fromControlRoom",
            "buildingName displayName"
        );

    if (!originalUsage) {
        throw new Error(
            `Original stock usage record not found with ID: ${originalUsageId}`
        );
    }

    if (
        originalUsage.center.toString() !==
        userCenterId.toString()
    ) {
        throw new Error(
            "You can only replace products from your own center"
        );
    }

    const centerStock = await CenterStock.findOne({
        center: userCenterId,
        product: productId,
    });

    if (!centerStock) {
        throw new Error(
            `Center stock not found for product: ${productId}`
        );
    }

    const oldSerial = centerStock.serialNumbers.find(
        (sn) =>
            sn.serialNumber === oldSerialNumber &&
            sn.status === "consumed"
    );

    if (!oldSerial) {
        throw new Error(
            `Old serial number '${oldSerialNumber}' not found or not in consumed status. It might be already available or assigned to someone else.`
        );
    }

    const newSerial = centerStock.serialNumbers.find(
        (sn) =>
            sn.serialNumber === newSerialNumber &&
            sn.status === "available"
    );

    if (!newSerial) {
        throw new Error(
            `New serial number '${newSerialNumber}' not found or not available. It might be already consumed or assigned.`
        );
    }

    const product = await Product.findById(productId);

    if (!product) {
        throw new Error(
            `Product not found with ID: ${productId}`
        );
    }

    const entityType = getEntityType(
        originalUsage.usageType
    );

    const entityId = getEntityId(originalUsage);

    const replacementData = {
        date: new Date(),

        usageType: originalUsage.usageType,

        customer: originalUsage.customer,

        fromBuilding: originalUsage.fromBuilding,
        toBuilding: originalUsage.toBuilding,

        fromControlRoom:
            originalUsage.fromControlRoom,

        connectionType:
            originalUsage.connectionType,

        reason: originalUsage.reason,

        packageAmount:
            originalUsage.packageAmount || 0,

        packageDuration:
            originalUsage.packageDuration,

        onuCharges:
            originalUsage.onuCharges || 0,

        installationCharges:
            originalUsage.installationCharges || 0,

        shiftingAmount:
            originalUsage.shiftingAmount || 0,

        wireChangeAmount:
            originalUsage.wireChangeAmount || 0,

        product: productId,

        productType: "replace",

        replaceFor: oldSerialNumber,

        replaceProductName:
            product.productTitle,

        qty: 1,

        damageQty: 0,

        statusReason,

        oldSerialNumber,

        newSerialNumber,

        originalUsageId,

        productId,

        center: userCenterId,

        replacedBy,

        entityType,
        entityId,

        replacementDetails: {
            oldSerialStatus: {
                from: "consumed",
                to: "available",
            },

            newSerialStatus: {
                from: "available",
                to: "consumed",
            },
        },
    };

    /*
     * OLD SERIAL:
     * consumed -> available
     */
    oldSerial.status = "available";
    oldSerial.currentLocation = userCenterId;
    oldSerial.consumedDate = null;
    oldSerial.consumedBy = null;

    oldSerial.transferHistory.push({
        fromCenter: null,
        toCenter: userCenterId,
        transferDate: new Date(),
        transferType: "replacement_return",
        referenceId: originalUsageId,
        remark:
            `Returned to stock - Replaced by ${newSerialNumber}`,
        replacedBy,
    });

    /*
     * NEW SERIAL:
     * available -> consumed
     */
    newSerial.status = "consumed";
    newSerial.currentLocation = null;
    newSerial.consumedDate = new Date();
    newSerial.consumedBy = replacedBy;

    newSerial.transferHistory.push({
        fromCenter: userCenterId,
        transferDate: new Date(),
        transferType: "replacement_issue",
        referenceId: originalUsageId,
        remark:
            `Issued as replacement for ${oldSerialNumber}`,
        replacedBy,
    });

    await centerStock.save();

    /*
     * Update EntityStockUsage.
     */
    if (entityType && entityId) {
        const entityStock =
            await EntityStockUsage.findOne({
                entityType,
                entityId,
                product: productId,
            });

        if (entityStock) {
            const entitySerial =
                entityStock.serialNumbers.find(
                    (sn) =>
                        sn.serialNumber ===
                        oldSerialNumber
                );

            if (entitySerial) {
                entitySerial.serialNumber =
                    newSerialNumber;

                entitySerial.assignedDate =
                    new Date();
            } else {
                entityStock.serialNumbers.push({
                    serialNumber: newSerialNumber,
                    status: "used",
                    assignedDate: new Date(),
                    usageReference:
                        originalUsageId,
                    usageType:
                        originalUsage.usageType,
                });

                entityStock.totalQuantity += 1;
                entityStock.availableQuantity += 1;
            }

            await entityStock.save();
        }
    }

    /*
     * Update original StockUsage serial.
     */
    let serialUpdated = false;

    for (const item of originalUsage.items) {
        if (
            item.product.toString() ===
                productId.toString() &&
            item.serialNumbers &&
            item.serialNumbers.includes(
                oldSerialNumber
            )
        ) {
            const serialIndex =
                item.serialNumbers.indexOf(
                    oldSerialNumber
                );

            if (serialIndex !== -1) {
                item.serialNumbers[
                    serialIndex
                ] = newSerialNumber;

                serialUpdated = true;
                break;
            }
        }
    }

    if (!serialUpdated) {
        throw new Error(
            `Could not find old serial number '${oldSerialNumber}' in the original stock usage record`
        );
    }

    await originalUsage.save();

    /*
     * Create ReplacementRecord.
     *
     * NOTE:
     * replacementDetails exists in the legacy controller
     * payload, but it is NOT defined in the supplied
     * ReplacementRecord schema. Mongoose strict mode will
     * therefore not persist that field.
     */
    const replacementRecord =
        new ReplacementRecord(replacementData);

    await replacementRecord.save();

    return {
        replacementDetails: {
            oldSerialNumber,
            newSerialNumber,
            productId,
            originalUsageId,
            entityType,
            entityId,
            replacedBy,
            replacedAt: new Date(),
            replacementRecordId:
                replacementRecord._id,
            connectionType:
                originalUsage.connectionType,
            reason: originalUsage.reason,
        },

        statusChanges: {
            oldSerial: {
                from: "consumed",
                to: "available",
            },

            newSerial: {
                from: "available",
                to: "consumed",
            },
        },
    };
};
/**
 * Get faulty stock records.
 *
 * Preserves the legacy filtering, pagination and statistics.
 */
export const getAllFaultyStock = async ({
    center,
    startDate,
    endDate,
    status,
    product,
    usageType,
    page = 1,
    limit = 100,
    sortBy = "date",
    sortOrder = "desc",
    search,
    userCenter,
    canViewAllCenters = false,
}) => {
    const filter = {};

    if (!canViewAllCenters && userCenter) {
        filter.center = userCenter;
    } else if (center) {
        filter.center = center;
    }

    if (startDate || endDate) {
        filter.date = {};

        if (startDate) {
            filter.date.$gte = new Date(startDate);
        }

        if (endDate) {
            filter.date.$lte = new Date(endDate);
        }
    }

    if (status && status !== "all") {
        if (
            [
                "damaged",
                "under_repair",
                "repaired",
                "irreparable",
                "partially_repaired",
            ].includes(status)
        ) {
            filter.overallStatus = status;
        } else {
            filter.overallStatus = status;
        }
    } else {
        filter.$or = [
            { overallStatus: "damaged" },
            { overallStatus: "partially_repaired" },
            {
                $and: [
                    { isSerialized: true },
                    {
                        "serialNumbers.status":
                            "damaged",
                    },
                ],
            },
        ];
    }

    if (product) {
        filter.product = product;
    }

    if (usageType && usageType !== "all") {
        filter.usageType = usageType;
    }

    /*
     * Preserve legacy behavior:
     * search replaces the default $or filter.
     */
    if (search) {
        filter.$or = [
            {
                "serialNumbers.serialNumber": {
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
        ];
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const sort = {
        [sortBy]: sortOrder === "desc" ? -1 : 1,
    };

    const faultyStockRecords =
        await FaultyStock.find(filter)
            .populate(
                "center",
                "centerName centerCode centerType"
            )
            .populate(
                "toCenter",
                "centerName centerCode centerType"
            )
            .populate(
                "product",
                "productTitle productCode productPrice salePrice trackSerialNumber"
            )
            .populate(
                "usageReference",
                "usageType"
            )
            .populate(
                "reportedBy",
                "name email"
            )
            .sort(sort)
            .skip(skip)
            .limit(limitNum);

    const processedRecords =
        faultyStockRecords
            .map((record) => {
                const damagedQuantity =
                    record.damagedQty || 0;

                const availableForTransfer =
                    damagedQuantity > 0;

                let damagedSerialNumbers = [];

                if (
                    record.product?.trackSerialNumber ===
                    "Yes"
                ) {
                    const damagedSerials =
                        record.serialNumbers?.filter(
                            (sn) =>
                                sn.status === "damaged"
                        ) || [];

                    damagedSerialNumbers =
                        damagedSerials.map(
                            (sn) => sn.serialNumber
                        );
                }

                const statusBreakdown = {
                    damaged: damagedQuantity,
                    underRepair: 0,
                    repaired: 0,
                    irreparable: 0,
                };

                if (
                    record.product?.trackSerialNumber ===
                    "Yes"
                ) {
                    statusBreakdown.underRepair =
                        record.serialNumbers?.filter(
                            (sn) =>
                                sn.status ===
                                "under_repair"
                        ).length || 0;

                    statusBreakdown.repaired =
                        record.serialNumbers?.filter(
                            (sn) =>
                                sn.status ===
                                "repaired"
                        ).length || 0;

                    statusBreakdown.irreparable =
                        record.serialNumbers?.filter(
                            (sn) =>
                                sn.status ===
                                "irreparable"
                        ).length || 0;
                } else {
                    statusBreakdown.underRepair =
                        record.underRepairQty || 0;

                    statusBreakdown.repaired =
                        record.repairedQty || 0;

                    statusBreakdown.irreparable =
                        record.irrepairedQty || 0;
                }

                return {
                    ...record.toObject(),

                    damagedQty:
                        damagedQuantity,

                    availableForTransfer,

                    damagedSerialNumbers,

                    totalDamagedSerials:
                        damagedSerialNumbers.length,

                    statusBreakdown,
                };
            })
            .filter(
                (record) =>
                    record.availableForTransfer
            );

    const total =
        await FaultyStock.countDocuments(filter);

    const totalFiltered =
        processedRecords.length;

    const totalPages =
        Math.ceil(totalFiltered / limitNum);

    let totalDamagedItems = 0;
    let totalUnderRepairItems = 0;
    let totalRepairedItems = 0;
    let totalIrreparableItems = 0;
    let totalValue = 0;

    processedRecords.forEach((record) => {
        totalDamagedItems +=
            record.damagedQty || 0;

        totalUnderRepairItems +=
            record.statusBreakdown?.underRepair ||
            0;

        totalRepairedItems +=
            record.statusBreakdown?.repaired ||
            0;

        totalIrreparableItems +=
            record.statusBreakdown?.irreparable ||
            0;

        if (
            record.product?.productPrice &&
            record.damagedQty
        ) {
            totalValue +=
                record.product.productPrice *
                record.damagedQty;
        }
    });

    const uniqueProducts = [
        ...new Set(
            processedRecords
                .map((record) =>
                    record.product?._id?.toString()
                )
                .filter(Boolean)
        ),
    ];

    const statusStats = {
        damaged: processedRecords.filter(
            (record) =>
                record.overallStatus === "damaged"
        ).length,

        partially_repaired:
            processedRecords.filter(
                (record) =>
                    record.overallStatus ===
                    "partially_repaired"
            ).length,

        under_repair: processedRecords.filter(
            (record) =>
                record.overallStatus ===
                "under_repair"
        ).length,

        repaired: processedRecords.filter(
            (record) =>
                record.overallStatus === "repaired"
        ).length,

        irreparable: processedRecords.filter(
            (record) =>
                record.overallStatus ===
                "irreparable"
        ).length,
    };

    const usageTypeCounts = {};

    processedRecords.forEach((record) => {
        const type =
            record.usageType || "Damage";

        usageTypeCounts[type] =
            (usageTypeCounts[type] || 0) + 1;
    });

    const usageTypeStats = Object.entries(
        usageTypeCounts
    ).map(([type, count]) => ({
        _id: type,
        count,

        totalQuantity:
            processedRecords
                .filter(
                    (record) =>
                        record.usageType === type
                )
                .reduce(
                    (sum, record) =>
                        sum +
                        (record.damagedQty || 0),
                    0
                ),
    }));

    return {
        data: processedRecords,

        statistics: {
            totalRecords: total,
            totalFilteredRecords: totalFiltered,
            totalDamagedItems,
            totalUnderRepairItems,
            totalRepairedItems,
            totalIrreparableItems,
            totalValue,
            uniqueProducts:
                uniqueProducts.length,

            statusDistribution:
                Object.entries(statusStats).map(
                    ([statusName, count]) => ({
                        _id: statusName,
                        count,

                        totalQuantity:
                            processedRecords
                                .filter(
                                    (record) =>
                                        record.overallStatus ===
                                        statusName
                                )
                                .reduce(
                                    (
                                        sum,
                                        record
                                    ) =>
                                        sum +
                                        (record.damagedQty ||
                                            0),
                                    0
                                ),
                    })
                ),

            usageTypeDistribution:
                usageTypeStats,
        },

        pagination: {
            currentPage: pageNum,
            totalPages,
            totalRecords: total,
            totalFiltered: totalFiltered,
            hasNext:
                pageNum < totalPages,
            hasPrev: pageNum > 1,
            limit: limitNum,
        },

        filters: {
            center: center || "all",
            startDate: startDate || null,
            endDate: endDate || null,
            status:
                status || "damaged_only",
            product: product || "all",
            usageType:
                usageType || "all",
            search: search || "",
        },
    };
};
export const checkRevertEligibility = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error("Invalid stock usage ID");
    }

    const stockUsage =
        await StockUsage.findById(id).populate(
            "items.product",
            "productTitle productCode trackSerialNumber"
        );

    if (!stockUsage) {
        throw new Error(
            "Stock usage record not found"
        );
    }

    if (stockUsage.usageType !== "Damage") {
        return {
            eligible: false,
            message:
                "Only damage entries can be reverted",
            reason: "wrong_type",
        };
    }

    if (stockUsage.status !== "completed") {
        return {
            eligible: false,
            message:
                "Only completed damage entries can be reverted",
            reason: "not_completed",
        };
    }

    const eligibilityDetails = [];
    let canRevert = true;

    for (const item of stockUsage.items) {
        const product =
            await Product.findById(item.product);

        const faultyStock =
            await FaultyStock.findOne({
                usageReference: stockUsage._id,
                product: item.product,
                center: stockUsage.center,
            });

        if (faultyStock) {
            if (
                product?.trackSerialNumber === "Yes" &&
                item.serialNumbers
            ) {
                const serialStatuses = [];
                let allSerialsPending = true;

                for (const serialNumber of item.serialNumbers) {
                    const serialInFaulty =
                        faultyStock.serialNumbers.find(
                            (sn) =>
                                sn.serialNumber ===
                                serialNumber
                        );

                    if (serialInFaulty) {
                        serialStatuses.push({
                            serial: serialNumber,
                            status:
                                serialInFaulty.status,
                        });

                        if (
                            serialInFaulty.status !==
                            "pending_damage"
                        ) {
                            allSerialsPending = false;
                        }
                    } else {
                        serialStatuses.push({
                            serial: serialNumber,
                            status:
                                "not_in_faulty",
                        });
                    }
                }

                if (!allSerialsPending) {
                    canRevert = false;
                }

                eligibilityDetails.push({
                    product:
                        product?.productTitle ||
                        item.product,

                    status: allSerialsPending
                        ? "pending_damage"
                        : "processed",

                    message: allSerialsPending
                        ? "All serials in pending state - eligible for revert"
                        : "Some serials have been processed in faulty stock",

                    serialStatuses,
                });
            } else {
                if (
                    faultyStock.overallStatus !==
                    "pending_damage"
                ) {
                    canRevert = false;

                    eligibilityDetails.push({
                        product:
                            product?.productTitle ||
                            item.product,

                        status:
                            faultyStock.overallStatus,

                        message:
                            `Product is in "${faultyStock.overallStatus}" status - cannot revert`,
                    });
                } else {
                    eligibilityDetails.push({
                        product:
                            product?.productTitle ||
                            item.product,

                        status:
                            "pending_damage",

                        message:
                            "Eligible for revert",
                    });
                }
            }
        } else {
            eligibilityDetails.push({
                product:
                    product?.productTitle ||
                    item.product,

                status: "no_faulty_record",

                message:
                    "No faulty stock record found - eligible for revert",
            });
        }
    }

    return {
        eligible: canRevert,

        message: canRevert
            ? "This damage entry can be reverted"
            : "This damage entry cannot be reverted",

        details: {
            usageId: id,
            usageType:
                stockUsage.usageType,
            status: stockUsage.status,
            items: eligibilityDetails,
        },
    };
};


export const revertDamageEntry = async ({
    id,
    revertedBy,
    revertRemark,
    userCenter = null,
    canManageAllCenters = false,
}) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error("Invalid stock usage ID");
    }

    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        const stockUsage = await StockUsage.findById(id).session(session);

        if (!stockUsage) {
            throw new Error("Stock usage record not found");
        }

        if (stockUsage.usageType !== "Damage") {
            throw new Error("Only damage entries can be reverted");
        }

        if (stockUsage.status !== "completed") {
            throw new Error(
                "Only completed damage entries can be reverted"
            );
        }

        if (!revertedBy) {
            throw new Error("Authenticated user ID is required");
        }

        if (
            !canManageAllCenters &&
            userCenter &&
            stockUsage.center.toString() !== userCenter.toString()
        ) {
            throw new Error(
                "You can only revert damage entries from your own center"
            );
        }

        const revertedAt = new Date();

        for (const item of stockUsage.items) {
            const product = await Product.findById(item.product)
                .session(session);

            if (!product) {
                throw new Error(`Product not found: ${item.product}`);
            }

            // Supports both legacy standalone records and merged records.
            const faultyStock = await FaultyStock.findOne({
                product: item.product,
                center: stockUsage.center,
                toCenter: stockUsage.toCenter,
                usageType: "Damage",
                overallStatus: "pending_damage",
                pendingDamageHistory: {
                    $elemMatch: {
                        usageReference: stockUsage._id,
                        status: "pending",
                    },
                },
            }).session(session);

            if (!faultyStock) {
                throw new Error(
                    `Pending FaultyStock history not found for product ${product.productTitle} and this usage`
                );
            }

            const history = faultyStock.pendingDamageHistory.find(
                (entry) =>
                    entry.status === "pending" &&
                    entry.usageReference?.toString() ===
                        stockUsage._id.toString()
            );

            if (!history) {
                throw new Error(
                    `Pending damage history not found for product ${product.productTitle}`
                );
            }

            const centerStock = await CenterStock.findOne({
                center: stockUsage.center,
                product: item.product,
            }).session(session);

            if (!centerStock) {
                throw new Error(
                    `CenterStock not found for product ${product.productTitle}`
                );
            }

            const isSerialized = product.trackSerialNumber === "Yes";

            if (isSerialized) {
                const serialNumbers = item.serialNumbers || [];

                if (
                    serialNumbers.length !== item.quantity ||
                    new Set(serialNumbers).size !== serialNumbers.length
                ) {
                    throw new Error(
                        `Serial numbers do not match quantity for ${product.productTitle}`
                    );
                }

                const historySerials = history.serialNumbers || [];

                for (const serialNumber of serialNumbers) {
                    if (!historySerials.includes(serialNumber)) {
                        throw new Error(
                            `Serial ${serialNumber} is not pending for this usage`
                        );
                    }

                    const faultySerial = faultyStock.serialNumbers.find(
                        (serial) => serial.serialNumber === serialNumber
                    );

                    if (
                        !faultySerial ||
                        faultySerial.status !== "pending_damage"
                    ) {
                        throw new Error(
                            `Serial ${serialNumber} is not pending damage`
                        );
                    }

                    const centerSerial = centerStock.serialNumbers.find(
                        (serial) => serial.serialNumber === serialNumber
                    );

                    if (
                        !centerSerial ||
                        centerSerial.status !== "damaged"
                    ) {
                        throw new Error(
                            `Serial ${serialNumber} is not in damaged state at the center`
                        );
                    }

                    centerSerial.status = "available";
                    centerSerial.currentLocation = stockUsage.center;
                    centerSerial.consumedDate = null;
                    centerSerial.consumedBy = null;

                    centerSerial.transferHistory.push({
                        fromCenter: stockUsage.center,
                        toCenter: stockUsage.center,
                        transferDate: revertedAt,
                        transferType: "damage_reverted",
                        referenceId: stockUsage._id,
                        remark: revertRemark,
                    });
                }

                centerStock.availableQuantity += serialNumbers.length;

                // Preserve the legacy serialized revert counter behavior.
                centerStock.totalQuantity += serialNumbers.length;

                faultyStock.serialNumbers = faultyStock.serialNumbers.filter(
                    (serial) =>
                        !serialNumbers.includes(serial.serialNumber)
                );

                history.serialNumbers = historySerials.filter(
                    (serial) => !serialNumbers.includes(serial)
                );

                history.quantity = Math.max(
                    0,
                    (history.quantity || 0) - serialNumbers.length
                );

                if (history.quantity === 0) {
                    history.status = "rejected";
                    history.rejectedBy = revertedBy;
                    history.rejectedAt = revertedAt;
                    history.remark = revertRemark;
                }

                faultyStock.pendingDamageQty = Math.max(
                    0,
                    (faultyStock.pendingDamageQty || 0) -
                        serialNumbers.length
                );
            } else {
                if (
                    (history.quantity || 0) < item.quantity ||
                    (faultyStock.pendingDamageQty || 0) < item.quantity
                ) {
                    throw new Error(
                        `Insufficient pending damage quantity for ${product.productTitle}`
                    );
                }

                centerStock.availableQuantity += item.quantity;
                centerStock.totalQuantity += item.quantity;

                history.quantity -= item.quantity;

                if (history.quantity === 0) {
                    history.status = "rejected";
                    history.rejectedBy = revertedBy;
                    history.rejectedAt = revertedAt;
                    history.remark = revertRemark;
                }

                faultyStock.pendingDamageQty -= item.quantity;
            }

            // Recalculate merged record totals from its remaining serials.
            if (faultyStock.isSerialized) {
                faultyStock.updateQuantitiesAndStatus();
            } else if (faultyStock.pendingDamageQty > 0) {
                faultyStock.overallStatus = "pending_damage";
            }

            centerStock.lastUpdated = revertedAt;
            await centerStock.save({ session });

            const hasPendingHistory = (
                faultyStock.pendingDamageHistory || []
            ).some((entry) => entry.status === "pending");

            const hasPendingSerials = (
                faultyStock.serialNumbers || []
            ).some((serial) => serial.status === "pending_damage");

            if (
                faultyStock.pendingDamageQty === 0 &&
                !hasPendingHistory &&
                !hasPendingSerials
            ) {
                await FaultyStock.deleteOne({
                    _id: faultyStock._id,
                }).session(session);
            } else {
                await faultyStock.save({ session });
            }
        }

        stockUsage.status = "cancelled";
        stockUsage.revertedBy = revertedBy;
        stockUsage.revertRemark = revertRemark;
        stockUsage.revertDate = revertedAt;

        await stockUsage.save({ session });
        await session.commitTransaction();

        return {
            message: "Damage entry reverted successfully",
            stockUsage,
        };
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        await session.endSession();
    }
};
