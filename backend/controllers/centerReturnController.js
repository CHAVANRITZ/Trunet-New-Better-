import mongoose from "mongoose";

import Center from "../models/Center.js";
import CenterStock from "../models/CenterStock.js";
import ResellerStock from "../models/ResellerStock.js";
import Product from "../models/Product.js";
import User from "../models/User.js";

export const createCenterReturn = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const { date, remark, products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Products array is required and cannot be empty.",
      });
    }

    // Fetch user without populating center.
    const user = await User.findById(userId).select(
      "center fullName email"
    );

    if (!user || !user.center) {
      return res.status(400).json({
        success: false,
        message: "User center information not found.",
      });
    }

    const centerId = user.center;

    const center = await Center.findById(centerId).populate("reseller");

    if (!center) {
      return res.status(404).json({
        success: false,
        message: "Center not found.",
      });
    }

    if (!center.reseller) {
      return res.status(400).json({
        success: false,
        message: "Center does not have an associated reseller.",
      });
    }

    const resellerId = center.reseller._id || center.reseller;

    if (date && Number.isNaN(new Date(date).getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid return date.",
      });
    }

    const seenProducts = new Set();

    // Validate all products before modifying stock.
    for (const item of products) {
      if (!item?.product || !mongoose.isValidObjectId(item.product)) {
        return res.status(400).json({
          success: false,
          message: "A valid product ID is required for each product.",
        });
      }

      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: "Quantity must be a positive integer.",
        });
      }

      const productIdString = item.product.toString();

      if (seenProducts.has(productIdString)) {
        return res.status(400).json({
          success: false,
          message: "Duplicate product entries are not allowed.",
        });
      }

      seenProducts.add(productIdString);

      const product = await Product.findById(item.product);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product ${item.product} not found.`,
        });
      }

      if (product.trackSerialNumber === "Yes") {
        if (
          !Array.isArray(item.serialNumbers) ||
          item.serialNumbers.length !== item.quantity
        ) {
          return res.status(400).json({
            success: false,
            message:
              `Exactly ${item.quantity} serial numbers are required ` +
              `for product ${product.productTitle}.`,
          });
        }

        if (
          new Set(item.serialNumbers).size !== item.serialNumbers.length ||
          item.serialNumbers.some(
            (serialNumber) =>
              typeof serialNumber !== "string" || !serialNumber.trim()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              `Serial numbers must be non-empty and unique for product ` +
              `${product.productTitle}.`,
          });
        }
      } else if (
        item.serialNumbers !== undefined &&
        (!Array.isArray(item.serialNumbers) || item.serialNumbers.length > 0)
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Serial numbers must not be provided for product ` +
            `${product.productTitle}.`,
        });
      }
    }

    const returnDate = date ? new Date(date) : new Date();
    const processedProducts = [];

    for (const item of products) {
      const productId = item.product;
      const quantity = item.quantity;
      const serialNumbers = item.serialNumbers || [];

      const product = await Product.findById(productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product ${productId} not found.`,
        });
      }

      const centerStock = await CenterStock.findOne({
        center: centerId,
        product: productId,
      });

      if (!centerStock) {
        return res.status(400).json({
          success: false,
          message: `No stock found in center for product ${productId}.`,
        });
      }

      if (centerStock.availableQuantity < quantity) {
        return res.status(400).json({
          success: false,
          message:
            `Insufficient stock for product ${productId}. ` +
            `Available: ${centerStock.availableQuantity}, requested: ${quantity}.`,
        });
      }

      const processedItem = {
        product: productId,
        quantity,
        serialNumbers: [],
        centerStockBefore: {
          totalQuantity: centerStock.totalQuantity,
          availableQuantity: centerStock.availableQuantity,
          consumedQuantity: centerStock.consumedQuantity,
        },
      };

      if (product.trackSerialNumber === "Yes") {
        // Verify all serial numbers before changing any of them.
        for (const serialNumber of serialNumbers) {
          const serial = centerStock.serialNumbers.find(
            (entry) =>
              entry.serialNumber === serialNumber &&
              entry.status === "available" &&
              entry.currentLocation?.toString() === centerId.toString()
          );

          if (!serial) {
            return res.status(400).json({
              success: false,
              message:
                `Serial number ${serialNumber} is not available ` +
                `in center stock.`,
            });
          }
        }

        processedItem.serialNumbers = [...serialNumbers];

        for (const serialNumber of serialNumbers) {
          const serial = centerStock.serialNumbers.find(
            (entry) => entry.serialNumber === serialNumber
          );

          serial.status = "transferred";
          serial.currentLocation = resellerId;
          serial.transferredDate = new Date();
          serial.transferredBy = userId;

          if (!Array.isArray(serial.transferHistory)) {
            serial.transferHistory = [];
          }

          serial.transferHistory.push({
            fromCenter: centerId,
            toReseller: resellerId,
            transferDate: new Date(),
            transferType: "center_to_reseller_return",
            remark: `Returned to reseller: ${remark || "No remark"}`,
            transferredBy: userId,
          });
        }
      }

      centerStock.availableQuantity -= quantity;
      centerStock.totalQuantity -= quantity;
      centerStock.lastUpdated = new Date();

      await centerStock.save();

      processedItem.centerStockAfter = {
        totalQuantity: centerStock.totalQuantity,
        availableQuantity: centerStock.availableQuantity,
        consumedQuantity: centerStock.consumedQuantity,
      };

      await addToResellerStock(
        resellerId,
        productId,
        quantity,
        serialNumbers,
        centerId,
        userId,
        remark
      );

      processedProducts.push(processedItem);
    }

    return res.status(200).json({
      success: true,
      message: "Stock returned to reseller successfully.",
      data: {
        returnRecord: {
          date: returnDate,
          remark: remark || "",
          center: centerId,
          reseller: resellerId,
          products: processedProducts.map((item) => ({
            product: item.product,
            quantity: item.quantity,
            serialNumbers: item.serialNumbers,
          })),
          processedBy: userId,
          processedAt: new Date(),
          type: "center_to_reseller_return",
        },
        center: {
          _id: center._id,
          centerName: center.centerName,
          centerCode: center.centerCode,
        },
        reseller: {
          _id: center.reseller._id || center.reseller,
          businessName: center.reseller.businessName,
        },
        processedProducts,
        processedBy: {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

async function addToResellerStock(
  resellerId,
  productId,
  quantity,
  serialNumbers = [],
  sourceCenter,
  userId,
  remark = ""
) {
  let resellerStock = await ResellerStock.findOne({
    reseller: resellerId,
    product: productId,
  });

  if (!resellerStock) {
    resellerStock = new ResellerStock({
      reseller: resellerId,
      product: productId,
      availableQuantity: 0,
      totalQuantity: 0,
      consumedQuantity: 0,
      damagedQuantity: 0,
      repairQuantity: 0,
      centerReturns: [],
      sourceBreakdown: {
        damageRepairQuantity: 0,
        centerReturnQuantity: 0,
        directPurchaseQuantity: 0,
      },
      serialNumbers: [],
    });
  }

  const product = await Product.findById(productId);

  if (!product) {
    throw new Error(`Product ${productId} not found.`);
  }

  if (!Array.isArray(resellerStock.centerReturns)) {
    resellerStock.centerReturns = [];
  }

  if (!resellerStock.sourceBreakdown) {
    resellerStock.sourceBreakdown = {
      damageRepairQuantity: 0,
      centerReturnQuantity: 0,
      directPurchaseQuantity: 0,
    };
  }

  if (!Array.isArray(resellerStock.serialNumbers)) {
    resellerStock.serialNumbers = [];
  }

  const existingReturn = resellerStock.centerReturns.find(
    (entry) => entry.center?.toString() === sourceCenter.toString()
  );

  if (existingReturn) {
    existingReturn.quantity += quantity;
    existingReturn.date = new Date();
    existingReturn.remark = remark || existingReturn.remark;
  } else {
    resellerStock.centerReturns.push({
      center: sourceCenter,
      quantity,
      date: new Date(),
      sourceType: "center_return",
      remark: remark || "",
      addedBy: userId,
    });
  }

  if (product.trackSerialNumber === "Yes") {
    for (const serialNumber of serialNumbers) {
      const existingSerial = resellerStock.serialNumbers.find(
        (entry) => entry.serialNumber === serialNumber
      );

      if (existingSerial) {
        existingSerial.status = "available";
        existingSerial.sourceType = "center_return";
        existingSerial.currentLocation = resellerId;

        if (!Array.isArray(existingSerial.transferHistory)) {
          existingSerial.transferHistory = [];
        }

        existingSerial.transferHistory.push({
          fromCenter: sourceCenter,
          toReseller: resellerId,
          transferDate: new Date(),
          transferType: "center_to_reseller_return",
          sourceType: "center_return",
          referenceId: null,
          remark: `Returned from center: ${remark || "No remark"}`,
          transferredBy: userId,
        });
      } else {
        resellerStock.serialNumbers.push({
          serialNumber,
          status: "available",
          sourceType: "center_return",
          currentLocation: resellerId,
          transferHistory: [
            {
              fromCenter: sourceCenter,
              toReseller: resellerId,
              transferDate: new Date(),
              transferType: "center_to_reseller_return",
              sourceType: "center_return",
              referenceId: null,
              remark: `Returned from center: ${remark || "No remark"}`,
              transferredBy: userId,
            },
          ],
        });
      }
    }
  }

  resellerStock.availableQuantity += quantity;
  resellerStock.totalQuantity += quantity;
  resellerStock.sourceBreakdown.centerReturnQuantity += quantity;

  await resellerStock.save();
  return resellerStock;
}