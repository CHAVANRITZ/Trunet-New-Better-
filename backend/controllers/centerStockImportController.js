import mongoose from "mongoose";
import CenterStock from "../models/CenterStock.js";
import Center from "../models/Center.js";
import Product from "../models/Product.js";
import StockPurchase from "../models/StockPurchase.js";

/**
 * Parse CSV while supporting quoted values and escaped quotes.
 */
function parseCSV(buffer) {
    const text = buffer
        .toString("utf8")
        .replace(/^\uFEFF/, "");

    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '"') {
            if (quoted && text[i + 1] === '"') {
                value += '"';
                i++;
            } else {
                quoted = !quoted;
            }
        } else if (char === "," && !quoted) {
            row.push(value.trim());
            value = "";
        } else if ((char === "\n" || char === "\r") && !quoted) {
            if (char === "\r" && text[i + 1] === "\n") {
                i++;
            }

            row.push(value.trim());

            if (row.some(cell => cell !== "")) {
                rows.push(row);
            }

            row = [];
            value = "";
        } else {
            value += char;
        }
    }

    if (quoted) {
        throw new Error("CSV contains an unclosed quoted field.");
    }

    if (value !== "" || row.length > 0) {
        row.push(value.trim());

        if (row.some(cell => cell !== "")) {
            rows.push(row);
        }
    }

    if (rows.length < 2) {
        throw new Error(
            "CSV must contain a header and at least one data row."
        );
    }

    const headers = rows[0].map(header => header.trim());

    if (headers.some(header => !header)) {
        throw new Error("CSV contains an empty column header.");
    }

    if (new Set(headers).size !== headers.length) {
        throw new Error("CSV contains duplicate column headers.");
    }

    return rows.slice(1).map((cells, index) => {
        if (cells.length !== headers.length) {
            throw new Error(
                `CSV row ${index + 2} has ${cells.length} columns; expected ${headers.length}.`
            );
        }

        return Object.fromEntries(
            headers.map((header, i) => [header, cells[i]])
        );
    });
}

/**
 * Download a sample CSV template.
 * GET /api/v1/center-stock/download/sample
 */
export async function downloadCenterStockSampleCSV(req, res) {
    const csv = [
        "centerIdentifier,productIdentifier,availableQuantity,serialNumbers",
        'MAIN-CENTER,"Internet Package",3,""',
        'MAIN-CENTER,"Router Device",2,""'
    ].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
        "Content-Disposition",
        'attachment; filename="center_stock_sample.csv"'
    );

    return res.status(200).send(csv);
}

/**
 * Bulk-import stock into centers from CSV.
 * POST /api/v1/center-stock/bulk-upload
 *
 * Multipart field: file
 */
export async function bulkUploadCenterStock(req, res) {
    if (!req.file?.buffer) {
        return res.status(400).json({
            success: false,
            message: "Please upload a CSV file using the field name 'file'."
        });
    }

    let rows;

    try {
        rows = parseCSV(req.file.buffer);
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    const requiredHeaders = [
        "centerIdentifier",
        "productIdentifier",
        "availableQuantity",
        "serialNumbers"
    ];

    const headers = Object.keys(rows[0] || {});
    const missingHeaders = requiredHeaders.filter(
        header => !headers.includes(header)
    );

    if (missingHeaders.length) {
        return res.status(400).json({
            success: false,
            message: "CSV is missing required headers.",
            missingHeaders,
            requiredHeaders
        });
    }

    const centers = await Center.find({
        centerType: "Center"
    }).select("_id centerName centerCode centerType").lean();

    const products = await Product.find({})
        .select("_id productTitle productCode trackSerialNumber")
        .lean();

    const successfulUploads = [];
    const errors = [];
    const warnings = [];

    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const rowNumber = index + 2;

        try {
            const centerIdentifier = row.centerIdentifier
                .trim()
                .toLowerCase();

            const productIdentifier = row.productIdentifier
                .trim()
                .toLowerCase();

            if (!centerIdentifier || !productIdentifier) {
                throw new Error(
                    "centerIdentifier and productIdentifier are required."
                );
            }

const center = centers.find(item =>
    item.centerName?.trim().toLowerCase() === centerIdentifier ||
    item.centerCode?.trim().toLowerCase() === centerIdentifier ||
    item._id.toString() === row.centerIdentifier.trim()
);

const product = products.find(item =>
    item.productTitle?.trim().toLowerCase() === productIdentifier ||
    item.productCode?.trim().toLowerCase() === productIdentifier ||
    item._id.toString() === row.productIdentifier.trim()
);

            if (!center) {
                throw new Error("Center not found or is not a valid Center.");
            }

            if (!product) {
                throw new Error("Product not found.");
            }

            const quantity = Number(row.availableQuantity);

            if (!Number.isInteger(quantity) || quantity <= 0) {
                throw new Error(
                    "availableQuantity must be a positive integer."
                );
            }

            const serials = row.serialNumbers
                .split(",")
                .map(serial => serial.trim())
                .filter(Boolean);

            if (product.trackSerialNumber === "Yes") {
                if (serials.length !== quantity) {
                    throw new Error(
                        `Expected ${quantity} serial numbers, received ${serials.length}.`
                    );
                }

                if (new Set(serials).size !== serials.length) {
                    throw new Error(
                        "Duplicate serial numbers found in this CSV row."
                    );
                }

                // Serial numbers must be linked to a real purchase.
                const purchase = await StockPurchase.findOne({
                    outlet: center._id,
                    products: {
                        $elemMatch: {
                            product: product._id,
                            "serialNumbers.serialNumber": {
                                $in: serials
                            }
                        }
                    }
                });

                if (!purchase) {
                    throw new Error(
                        "No matching stock purchase was found for these serial numbers and center."
                    );
                }

                const purchaseProduct = purchase.products.find(
                    item =>
                        item.product.toString() === product._id.toString()
                );

                const purchaseSerials = new Set(
                    (purchaseProduct?.serialNumbers || []).map(
                        item => item.serialNumber
                    )
                );

                if (!serials.every(serial => purchaseSerials.has(serial))) {
                    throw new Error(
                        "Some serial numbers do not belong to the matched purchase."
                    );
                }

                // Prevent serials from being imported twice anywhere
                // in center stock.
                const duplicateStock = await CenterStock.findOne({
                    "serialNumbers.serialNumber": {
                        $in: serials
                    }
                }).select("_id");

                if (duplicateStock) {
                    throw new Error(
                        "One or more serial numbers already exist in center stock."
                    );
                }

                const serialEntries = serials.map(serialNumber => ({
                    serialNumber,
                    purchaseId: purchase._id,
                    originalOutlet: center._id,
                    status: "available",
                    currentLocation: center._id,
                    transferHistory: [{
                        fromCenter: null,
                        toCenter: center._id,
                        transferDate: new Date(),
                        transferType: "inbound_transfer"
                    }]
                }));

                // Atomic quantity increment avoids overwriting
                // consumed and in-transit quantities.
                const updatedStock = await CenterStock.findOneAndUpdate(
                    {
                        center: center._id,
                        product: product._id
                    },
                    {
                        $inc: {
                            totalQuantity: quantity,
                            availableQuantity: quantity
                        },
                        $push: {
                            serialNumbers: {
                                $each: serialEntries
                            }
                        },
                        $set: {
                            lastUpdated: new Date()
                        },
                        $setOnInsert: {
                            inTransitQuantity: 0,
                            consumedQuantity: 0
                        }
                    },
                    {
                        upsert: true,
                        new: true,
                        runValidators: true
                    }
                );

                successfulUploads.push({
                    row: rowNumber,
                    center: center.centerName,
                    product: product.productTitle,
                    quantity,
                    stockId: updatedStock._id
                });
            } else {
                if (serials.length > 0) {
                    warnings.push({
                        row: rowNumber,
                        message:
                            "Serial numbers were ignored because this product does not use serial tracking."
                    });
                }

                const updatedStock = await CenterStock.findOneAndUpdate(
                    {
                        center: center._id,
                        product: product._id
                    },
                    {
                        $inc: {
                            totalQuantity: quantity,
                            availableQuantity: quantity
                        },
                        $set: {
                            lastUpdated: new Date()
                        },
                        $setOnInsert: {
                            inTransitQuantity: 0,
                            consumedQuantity: 0
                        }
                    },
                    {
                        upsert: true,
                        new: true,
                        runValidators: true
                    }
                );

                successfulUploads.push({
                    row: rowNumber,
                    center: center.centerName,
                    product: product.productTitle,
                    quantity,
                    stockId: updatedStock._id
                });
            }
        } catch (error) {
            errors.push({
                row: rowNumber,
                centerIdentifier: row.centerIdentifier,
                productIdentifier: row.productIdentifier,
                message: error.message
            });
        }
    }

    return res.status(200).json({
        success: errors.length === 0,
        message: "Center stock CSV import completed.",
        data: {
            totalProcessed: rows.length,
            successful: successfulUploads.length,
            failed: errors.length,
            warnings: warnings.length,
            successfulUploads,
            errors,
            warningDetails: warnings
        }
    });
}