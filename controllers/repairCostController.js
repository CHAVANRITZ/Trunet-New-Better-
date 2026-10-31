import mongoose from "mongoose";
import RepairCost from "../models/RepairCost.js";
import Product from "../models/Product.js";
import csvParser from "csv-parser";
import { Readable } from "stream";

const PRODUCT_FIELDS =
  "productTitle productCode productPrice salePrice hsnCode trackSerialNumber";

const populateRepairCost = (query) =>
  query
    .populate("product", `_id ${PRODUCT_FIELDS}`)
    .populate("createdBy", "_id fullName email")
    .populate("updatedBy", "_id fullName email");

const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 100));

  return { page, limit, skip: (page - 1) * limit };
};

const parseRepairCost = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
};

const getUserId = (req) => req.user?.id || req.user?.fullUser?._id;

export const getAllRepairCosts = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);

    const [repairCosts, total] = await Promise.all([
      populateRepairCost(
        RepairCost.find({})
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
      ).lean(),
      RepairCost.countDocuments({})
    ]);

    return res.status(200).json({
      success: true,
      message: "Repair costs retrieved successfully",
      data: repairCosts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error("Get repair costs error:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving repair costs"
    });
  }
};

export const getRepairCostById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid repair cost ID"
      });
    }

    const repairCost = await populateRepairCost(
      RepairCost.findById(id)
    ).lean();

    if (!repairCost) {
      return res.status(404).json({
        success: false,
        message: "Repair cost not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Repair cost retrieved successfully",
      data: repairCost
    });
  } catch (error) {
    console.error("Get repair cost by ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving repair cost"
    });
  }
};

export const getRepairCostByProductId = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID"
      });
    }

    const product = await Product.findById(productId).lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const repairCost = await populateRepairCost(
      RepairCost.findOne({ product: productId })
    ).lean();

    if (!repairCost) {
      return res.status(200).json({
        success: true,
        message: "No specific repair cost found for this product. Using default.",
        data: {
          product,
          repairCost: 150,
          isDefault: true
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: "Repair cost retrieved successfully",
      data: repairCost
    });
  } catch (error) {
    console.error("Get repair cost by product error:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving repair cost"
    });
  }
};

export const createRepairCost = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required"
      });
    }

    const { product, repairCost: rawRepairCost } = req.body;
    const repairCost = parseRepairCost(rawRepairCost);

    if (!product || !mongoose.isValidObjectId(product)) {
      return res.status(400).json({
        success: false,
        message: "A valid product ID is required"
      });
    }

    if (repairCost === null) {
      return res.status(400).json({
        success: false,
        message: "Valid repair cost (greater than or equal to 0) is required"
      });
    }

    const productExists = await Product.findById(product);

    if (!productExists) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const existingRepairCost = await RepairCost.findOne({ product });

    if (existingRepairCost) {
      return res.status(409).json({
        success: false,
        message: "Repair cost already exists for this product. Use update instead."
      });
    }

    const newRepairCost = await RepairCost.create({
      product,
      repairCost,
      createdBy: userId,
      updatedBy: userId
    });

    const data = await populateRepairCost(
      RepairCost.findById(newRepairCost._id)
    );

    return res.status(201).json({
      success: true,
      message: "Repair cost created successfully",
      data
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((item) => item.message)
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Repair cost already exists for this product"
      });
    }

    console.error("Create repair cost error:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating repair cost"
    });
  }
};

export const updateRepairCost = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required"
      });
    }

    const { id } = req.params;
    const { repairCost: rawRepairCost } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid repair cost ID"
      });
    }

    if (rawRepairCost === undefined) {
      return res.status(400).json({
        success: false,
        message: "Repair cost is required"
      });
    }

    const repairCost = parseRepairCost(rawRepairCost);

    if (repairCost === null) {
      return res.status(400).json({
        success: false,
        message: "Repair cost must be a valid number greater than or equal to 0"
      });
    }

    const updatedRepairCost = await RepairCost.findByIdAndUpdate(
      id,
      {
        $set: {
          repairCost,
          updatedBy: userId
        }
      },
      { new: true, runValidators: true }
    );

    if (!updatedRepairCost) {
      return res.status(404).json({
        success: false,
        message: "Repair cost not found"
      });
    }

    const data = await populateRepairCost(
      RepairCost.findById(updatedRepairCost._id)
    );

    return res.status(200).json({
      success: true,
      message: "Repair cost updated successfully",
      data
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((item) => item.message)
      });
    }

    console.error("Update repair cost error:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating repair cost"
    });
  }
};

export const deleteRepairCost = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid repair cost ID"
      });
    }

    const repairCost = await RepairCost.findByIdAndDelete(id);

    if (!repairCost) {
      return res.status(404).json({
        success: false,
        message: "Repair cost not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Repair cost deleted successfully"
    });
  } catch (error) {
    console.error("Delete repair cost error:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting repair cost"
    });
  }
};

export const downloadRepairCostTemplate = async (req, res) => {
  try {
    const sampleProducts = await Product.find({})
      .select("productTitle")
      .limit(3)
      .lean();

    const sampleData = sampleProducts.length
      ? sampleProducts.map((product, index) => ({
          "Product Title": product.productTitle,
          "Repair Cost": (100 + index * 50).toFixed(2)
        }))
      : [
          { "Product Title": "Sample Product 1", "Repair Cost": "100.00" },
          { "Product Title": "Sample Product 2", "Repair Cost": "150.00" }
        ];

    const escapeCsv = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csvContent = [
      ["Product Title", "Repair Cost"].map(escapeCsv).join(","),
      ...sampleData.map((row) =>
        [row["Product Title"], row["Repair Cost"]]
          .map(escapeCsv)
          .join(",")
      )
    ].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Repair_Cost_Import_Template.csv"'
    );

    return res.status(200).send(csvContent);
  } catch (error) {
    console.error("Download repair cost template error:", error);
    return res.status(500).json({
      success: false,
      message: "Error generating CSV template"
    });
  }
};

const validateRepairCostRow = (row) => {
  const productTitle = String(row.productTitle ?? "").trim();
  const rawCost = String(row.repairCost ?? "").trim();

  if (!productTitle) {
    return { error: "Product Title is required" };
  }

  if (!rawCost) {
    return { error: "Repair Cost is required" };
  }

  const repairCost = Number(rawCost);

  if (!Number.isFinite(repairCost) || repairCost < 0) {
    return { error: "Repair Cost must be a valid non-negative number" };
  }

  return { productTitle, repairCost };
};

export const bulkImportRepairCosts = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "CSV file is required"
      });
    }

    const isCsv =
      req.file.mimetype === "text/csv" ||
      req.file.originalname?.toLowerCase().endsWith(".csv");

    if (!isCsv) {
      return res.status(400).json({
        success: false,
        message: "Invalid file type. Please upload a CSV file."
      });
    }

    const rows = [];

    await new Promise((resolve, reject) => {
      Readable.from(req.file.buffer.toString("utf8"))
        .pipe(csvParser())
        .on("data", (row) => rows.push(row))
        .on("end", resolve)
        .on("error", reject);
    });

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "The CSV file is empty or has no valid data rows."
      });
    }

    const headers = Object.keys(rows[0]);
    const productTitleHeader = headers.find(
      (header) => header.trim().toLowerCase() === "product title"
    );
    const repairCostHeader = headers.find(
      (header) => header.trim().toLowerCase() === "repair cost"
    );

    if (!productTitleHeader || !repairCostHeader) {
      return res.status(400).json({
        success: false,
        message: "CSV headers must be Product Title, Repair Cost",
        requiredFormat: "Product Title,Repair Cost"
      });
    }

    const productCache = new Map();
    const processedTitles = new Set();
    const errors = [];
    let successCount = 0;

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2;
      const validated = validateRepairCostRow({
        productTitle: rows[index][productTitleHeader],
        repairCost: rows[index][repairCostHeader]
      });

      if (validated.error) {
        errors.push({ row: rowNumber, error: validated.error });
        continue;
      }

      const titleKey = validated.productTitle.toLowerCase();

      if (processedTitles.has(titleKey)) {
        errors.push({
          row: rowNumber,
          productTitle: validated.productTitle,
          error: "Duplicate product title in this import file"
        });
        continue;
      }

      processedTitles.add(titleKey);

      try {
        let product = productCache.get(titleKey);

        if (product === undefined) {
          product = await Product.findOne({
            productTitle: {
              $regex: `^${validated.productTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
              $options: "i"
            }
          });

          productCache.set(titleKey, product || null);
        }

        if (!product) {
          errors.push({
            row: rowNumber,
            productTitle: validated.productTitle,
            error: "Product not found"
          });
          continue;
        }

        await RepairCost.findOneAndUpdate(
          { product: product._id },
          {
            $set: {
              repairCost: validated.repairCost,
              updatedBy: userId
            },
            $setOnInsert: {
              product: product._id,
              createdBy: userId
            }
          },
          { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        );

        successCount += 1;
      } catch (error) {
        errors.push({
          row: rowNumber,
          productTitle: validated.productTitle,
          error:
            error.name === "ValidationError"
              ? Object.values(error.errors).map((item) => item.message).join(", ")
              : error.message
        });
      }
    }

    const failedCount = errors.length;

    return res.status(200).json({
      success: failedCount === 0,
      message: `Import completed. Successfully processed ${successCount} repair costs, ${failedCount} failed.`,
      summary: {
        totalProcessed: rows.length,
        successCount,
        failedCount,
        successPercentage: Math.round((successCount / rows.length) * 100)
      },
      ...(failedCount > 0 ? { errors, totalErrors: failedCount } : {})
    });
  } catch (error) {
    console.error("Bulk import repair costs error:", error);
    return res.status(500).json({
      success: false,
      message: "Error importing repair costs",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error"
    });
  }
};