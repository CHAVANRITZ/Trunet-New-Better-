import StockRequest from "../models/StockRequest.js";
import Center from "../models/Center.js";
import User from "../models/User.js";
import StockPurchase from "../models/StockPurchase.js";
import CenterStock from "../models/CenterStock.js";
import OutletStock from "../models/OutletStock.js";
import ResellerStock from "../models/ResellerStock.js";
import Product from "../models/Product.js";
import mongoose from "mongoose";
import fs from "fs";
import csv from "csv-parser";
import { Readable } from "stream";
// import { normalizePermissions } from "../middlewares/authorizationMiddleware.js";

// ===========================================================================
// PRIVATE HELPERS — verbatim from legacy active code
// ===========================================================================

const syncReceivedQuantityToCenterStock = async ({
  centerId,
  productId,
  oldReceivedQuantity = 0,
  newReceivedQuantity = 0,
}) => {
  const ProductModel = mongoose.model("Product");
  const oldQty = Number(oldReceivedQuantity) || 0;
  const newQty = Number(newReceivedQuantity) || 0;
  const delta = newQty - oldQty;

  if (delta === 0) return null;

  const product = await ProductModel.findById(productId).select(
    "_id productTitle trackSerialNumber"
  );
  if (!product) throw new Error(`Product ${productId} not found`);

  if (product.trackSerialNumber === "Yes") {
    throw new Error(
      `Received quantity for serialized product "${product.productTitle}" must be updated through the completion endpoint so serial numbers remain synchronized.`
    );
  }

  if (delta > 0) {
    return CenterStock.findOneAndUpdate(
      { center: centerId, product: productId },
      {
        $inc: { totalQuantity: delta, availableQuantity: delta },
        $set: { lastUpdated: new Date() },
        $setOnInsert: {
          center: centerId,
          product: productId,
          inTransitQuantity: 0,
          consumedQuantity: 0,
          serialNumbers: [],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const removeQuantity = Math.abs(delta);
  const stock = await CenterStock.findOne({ center: centerId, product: productId });
  if (!stock) {
    throw new Error(
      `Center stock record not found for product ${product.productTitle} while reducing received quantity by ${removeQuantity}.`
    );
  }
  if ((stock.availableQuantity || 0) < removeQuantity) {
    throw new Error(
      `Cannot reduce received quantity for "${product.productTitle}". Center available stock is ${stock.availableQuantity || 0}, but ${removeQuantity} units must be removed.`
    );
  }
  stock.totalQuantity = Math.max(0, (stock.totalQuantity || 0) - removeQuantity);
  stock.availableQuantity = Math.max(0, (stock.availableQuantity || 0) - removeQuantity);
  stock.lastUpdated = new Date();
  return stock.save();
};

const syncReceivedQuantityChanges = async ({ stockRequest, nextProducts }) => {
  if (!Array.isArray(nextProducts)) return;
  const ProductModel = mongoose.model("Product");

  for (const nextProduct of nextProducts) {
    const existingProduct = stockRequest.products.find(
      (p) => p.product?.toString() === nextProduct.product?.toString()
    );
    if (!existingProduct) continue;

    const oldReceived = Number(existingProduct.receivedQuantity) || 0;
    const newReceived = Number(nextProduct.receivedQuantity) || 0;
    if (oldReceived === newReceived) continue;

    const product = await ProductModel.findById(nextProduct.product).select(
      "_id productTitle trackSerialNumber"
    );
    if (!product) throw new Error(`Product ${nextProduct.product} not found`);

    if (product.trackSerialNumber === "Yes") {
      throw new Error(
        `Cannot change received quantity for serialized product "${product.productTitle}" from the generic update endpoint. Use the complete stock request endpoint so serial numbers remain synchronized.`
      );
    }

    await syncReceivedQuantityToCenterStock({
      centerId: stockRequest.center,
      productId: nextProduct.product,
      oldReceivedQuantity: oldReceived,
      newReceivedQuantity: newReceived,
    });
  }
};

const checkStockRequestPermissions = async (user, requiredPermissions = []) => {
  const rolePermissions = user?.role?.permissions || [];

  const indentModule = rolePermissions.find(
    (perm) => perm?.module === "Indent"
  );

  if (!indentModule) {
    return {
      hasAccess: false,
      permissions: {},
      userCenter: user?.center || user?.fullUser?.center
    };
  }

  const permissions = {
    manage_indent: indentModule.permissions?.includes("manage_indent") || false,
    indent_all_center: indentModule.permissions?.includes("indent_all_center") || false,
    indent_own_center: indentModule.permissions?.includes("indent_own_center") || false,
    delete_indent_all_center:
      indentModule.permissions?.includes("delete_indent_all_center") || false,
    delete_indent_own_center:
      indentModule.permissions?.includes("delete_indent_own_center") || false,
    stock_transfer_approve_from_outlet:
      indentModule.permissions?.includes("stock_transfer_approve_from_outlet") || false,
    complete_indent:
      indentModule.permissions?.includes("complete_indent") || false,
  };

  const hasRequiredPermission = requiredPermissions.some(
    (permission) => permissions[permission]
  );

  return {
    hasAccess: hasRequiredPermission,
    permissions,
    userCenter: user?.center || user?.fullUser?.center
  };
};

const checkCenterAccess = (stockRequest, userCenter, permissions) => {
  if (permissions.indent_all_center) return true;
  if (permissions.indent_own_center && userCenter) {
    const userCenterId = userCenter._id || userCenter;
    const requestCenterId = stockRequest.center._id || stockRequest.center;
    return userCenterId.toString() === requestCenterId.toString();
  }
  return false;
};

const getOutletStockForRequests = async (warehouseId, productIds) => {
  const OutletStockModel = mongoose.model("OutletStock");
  const outletStockData = await OutletStockModel.find({
    outlet: warehouseId,
    product: { $in: productIds },
  })
    .populate("outlet", "centerName centerCode")
    .select("product totalQuantity availableQuantity inTransitQuantity serialNumbers");

  const outletStockMap = new Map();
  outletStockData.forEach((item) => {
    const availableSerials = item.serialNumbers
      .filter((sn) => sn.status === "available")
      .map((sn) => sn.serialNumber);
    outletStockMap.set(item.product.toString(), {
      totalQuantity: item.totalQuantity,
      availableQuantity: item.availableQuantity,
      inTransitQuantity: item.inTransitQuantity,
      hasSerialNumbers: item.serialNumbers.length > 0,
      availableSerials,
      availableSerialsCount: availableSerials.length,
      outletName: item.outlet?.centerName || "Unknown Outlet",
    });
  });
  return outletStockMap;
};

const getDateRange = (rangeType, customStartDate, customEndDate) => {
  const now = new Date();
  let start = new Date();
  let end = new Date();
  switch (rangeType) {
    case "Today":
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "Yesterday":
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case "This Week":
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "Last Week":
      start.setDate(now.getDate() - now.getDay() - 7);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - now.getDay() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case "This Month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "Last Month":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "This Year":
      start = new Date(now.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now.getFullYear(), 11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    case "Last Year":
      start = new Date(now.getFullYear() - 1, 0, 1);
      start.setHours(0, 0, 0, 0);
      end = new Date(now.getFullYear() - 1, 11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    case "Custom":
      if (customStartDate) start = new Date(customStartDate);
      if (customEndDate) end = new Date(customEndDate);
      break;
    default:
      return null;
  }
  return { start, end };
};

const buildArrayFilter = (value) => {
  if (!value) return null;
  return value.includes(",")
    ? { $in: value.split(",").map((item) => item.trim()) }
    : value;
};

const buildDateFilter = (dateFilter, customStartDate, customEndDate, startDate, endDate) => {
  if (dateFilter) {
    const dateRange = getDateRange(dateFilter, customStartDate, customEndDate);
    if (dateRange) return { $gte: dateRange.start, $lte: dateRange.end };
  }
  if (startDate || endDate) {
    const df = {};
    if (startDate) df.$gte = new Date(startDate);
    if (endDate) df.$lte = new Date(endDate);
    return df;
  }
  return null;
};

const getBulkCenterStock = async (requests) => {
  const centerProductMap = new Map();
  requests.forEach((request) => {
    if (!request.center?._id) return;
    const centerId = request.center._id.toString();
    const productIds = request.products.map((p) => p.product?._id).filter(Boolean);
    if (productIds.length > 0) {
      centerProductMap.set(centerId, [
        ...(centerProductMap.get(centerId) || []),
        ...productIds,
      ]);
    }
  });

  const centerStocks = await StockPurchase.aggregate([
    {
      $match: {
        center: {
          $in: Array.from(centerProductMap.keys()).map(
            (id) => new mongoose.Types.ObjectId(id)
          ),
        },
      },
    },
    {
      $group: {
        _id: { center: "$center", product: "$product" },
        totalQuantity: { $sum: "$quantity" },
      },
    },
  ]);

  const stockMap = new Map();
  centerStocks.forEach((stock) => {
    const key = `${stock._id.center}_${stock._id.product}`;
    stockMap.set(key, stock.totalQuantity);
  });
  return stockMap;
};

const buildFilter = (query) => {
  const {
    status, center, outlet, warehouse, startDate, endDate,
    createdAtStart, createdAtEnd, orderNumber, search,
    dateFilter, customStartDate, customEndDate, product,
  } = query;

  const filter = {};
  const statusFilter = buildArrayFilter(status);
  if (statusFilter) filter.status = statusFilter;

  const centerFilter = buildArrayFilter(center);
  if (centerFilter) {
    if (Array.isArray(centerFilter.$in)) {
      filter.center = {
        $in: centerFilter.$in.map((id) =>
          mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
        ),
      };
    } else if (mongoose.Types.ObjectId.isValid(centerFilter)) {
      filter.center = new mongoose.Types.ObjectId(centerFilter);
    } else {
      filter.center = centerFilter;
    }
  }

  const warehouseParam = outlet || warehouse;
  if (warehouseParam) {
    const warehouseFilter = buildArrayFilter(warehouseParam);
    if (warehouseFilter) {
      if (Array.isArray(warehouseFilter.$in)) {
        filter.warehouse = {
          $in: warehouseFilter.$in.map((id) =>
            mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
          ),
        };
      } else if (mongoose.Types.ObjectId.isValid(warehouseFilter)) {
        filter.warehouse = new mongoose.Types.ObjectId(warehouseFilter);
      } else {
        filter.warehouse = warehouseFilter;
      }
    }
  }

  const dateFilterObj = buildDateFilter(dateFilter, customStartDate, customEndDate, startDate, endDate);
  if (dateFilterObj) filter.date = dateFilterObj;
  if (createdAtStart || createdAtEnd) {
    filter.createdAt = {};
    if (createdAtStart) filter.createdAt.$gte = new Date(createdAtStart);
    if (createdAtEnd) filter.createdAt.$lte = new Date(createdAtEnd);
  }

  const orderNumberFilter = buildArrayFilter(orderNumber);
  if (orderNumberFilter) {
    filter.orderNumber =
      typeof orderNumberFilter === "object"
        ? orderNumberFilter
        : { $regex: orderNumberFilter, $options: "i" };
  }

  if (product) {
    if (mongoose.Types.ObjectId.isValid(product)) {
      filter["products.product"] = new mongoose.Types.ObjectId(product);
    }
  }

  if (search) {
    filter.$or = [
      { orderNumber: { $regex: search, $options: "i" } },
      { remark: { $regex: search, $options: "i" } },
      { "products.productRemark": { $regex: search, $options: "i" } },
      { "approvalInfo.approvedRemark": { $regex: search, $options: "i" } },
      { "receivingInfo.receivedRemark": { $regex: search, $options: "i" } },
    ];
  }

  console.log("Final filter:", JSON.stringify(filter, null, 2));
  return filter;
};

const buildSortOptions = (sortBy = "createdAt", sortOrder = "desc") => {
  const validSortFields = [
    "challanNo", "challanDate", "createdAt", "updatedAt", "date",
    "orderNumber", "status", "approvalInfo.approvedAt",
    "shippingInfo.shippedAt", "receivingInfo.receivedAt",
  ];
  const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "createdAt";
  return { [actualSortBy]: sortOrder === "desc" ? -1 : 1 };
};

const populateOptions = [
  { path: "warehouse", select: "_id centerName centerCode centerType" },
  {
    path: "center",
    select: "_id centerName centerCode centerType",
    populate: [
      { path: "reseller", select: "_id businessName contactNumber name mobile email gstNumber panNumber address1 address2 city state " },
      { path: "area", select: "_id areaName" },
    ],
  },
  { path: "products.product", select: "_id productTitle productCode productPrice salePrice hsnCode" },
  { path: "createdBy", select: "_id fullName email" },
  { path: "updatedBy", select: "_id fullName email" },
  { path: "approvalInfo.approvedBy", select: "_id fullName email" },
  { path: "approvalInfo.warehouseChallanApprovedBy", select: "_id fullName email" },
  { path: "approvalInfo.centerChallanApprovedBy", select: "_id fullName email" },
  { path: "shippingInfo.shippedBy", select: "_id fullName email" },
  { path: "receivingInfo.receivedBy", select: "_id fullName email" },
  { path: "completionInfo.completedBy", select: "_id fullName email" },
  { path: "incompleteInfo.incompleteBy", select: "_id fullName email" },
];

const revertStockForRejectedRequest = async (stockRequest) => {
  const OutletStockModel = mongoose.model("OutletStock");
  const CenterStockModel = mongoose.model("CenterStock");

  for (const productItem of stockRequest.products) {
    const outletStock = await OutletStockModel.findOne({
      outlet: stockRequest.warehouse,
      product: productItem.product,
    });

    if (!outletStock) {
      console.log(`No outlet stock found for product ${productItem.product}`);
      continue;
    }

    console.log(`\n========== Processing product ${productItem.product} ==========`);
    console.log(`BEFORE - Total: ${outletStock.totalQuantity}, Available: ${outletStock.availableQuantity}, InTransit: ${outletStock.inTransitQuantity}`);
    console.log(`Product approved quantity: ${productItem.approvedQuantity || 0}`);
    console.log(`Has approvedSerials: ${productItem.approvedSerials?.length || 0} serials`);

    if (productItem.approvedSerials && productItem.approvedSerials.length > 0) {
      let revertedCount = 0;
      let transferredSerials = [];
      let inTransitSerialsCount = 0;

      for (const serialNumber of productItem.approvedSerials) {
        const serial = outletStock.serialNumbers.find((sn) => sn.serialNumber === serialNumber);
        if (serial) {
          if (serial.status === "in_transit") {
            serial.status = "available";
            serial.currentLocation = stockRequest.warehouse;
            inTransitSerialsCount++;
            if (serial.transferHistory.length > 0) {
              const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
              if (lastTransfer && lastTransfer.status === "in_transit") {
                serial.transferHistory.pop();
              }
            }
            revertedCount++;
            console.log(`✅ Reverted serial ${serialNumber} from IN_TRANSIT to AVAILABLE`);
          } else if (serial.status === "transferred") {
            serial.status = "available";
            serial.currentLocation = stockRequest.warehouse;
            serial.transferHistory = serial.transferHistory.filter(
              (transfer) => transfer.toCenter?.toString() !== stockRequest.center.toString()
            );
            transferredSerials.push(serialNumber);
            revertedCount++;
            console.log(`✅ Reverted serial ${serialNumber} from TRANSFERRED to AVAILABLE`);
          } else if (serial.status === "available") {
            console.log(`⚠️ Serial ${serialNumber} is already AVAILABLE, no change needed`);
          }
        } else {
          console.log(`⚠️ Serial ${serialNumber} not found in outlet stock`);
        }
      }

      if (revertedCount > 0) {
        outletStock.availableQuantity += revertedCount;
        const inTransitToSubtract = Math.min(inTransitSerialsCount, outletStock.inTransitQuantity);
        outletStock.inTransitQuantity -= inTransitToSubtract;
        if (inTransitSerialsCount > inTransitToSubtract) {
          console.log(`⚠️ Tried to subtract ${inTransitSerialsCount} from inTransit but only ${inTransitToSubtract} was available`);
        }
        if (transferredSerials.length > 0) {
          outletStock.totalQuantity += transferredSerials.length;
          const centerStock = await CenterStockModel.findOne({
            center: stockRequest.center,
            product: productItem.product,
          });
          if (centerStock) {
            const serialsToRemove = transferredSerials.filter((serial) =>
              centerStock.serialNumbers.some((sn) => sn.serialNumber === serial)
            );
            centerStock.serialNumbers = centerStock.serialNumbers.filter(
              (sn) => !transferredSerials.includes(sn.serialNumber)
            );
            const removeCount = serialsToRemove.length;
            centerStock.totalQuantity = Math.max(0, centerStock.totalQuantity - removeCount);
            centerStock.availableQuantity = Math.max(0, centerStock.availableQuantity - removeCount);
            await centerStock.save();
            console.log(`✅ Removed ${removeCount} items from center stock`);
          }
        }
        if (outletStock.inTransitQuantity < 0) {
          console.log(`⚠️ inTransitQuantity was ${outletStock.inTransitQuantity}, resetting to 0`);
          outletStock.inTransitQuantity = 0;
        }
        if (outletStock.availableQuantity < 0) {
          console.log(`⚠️ availableQuantity was ${outletStock.availableQuantity}, resetting to 0`);
          outletStock.availableQuantity = 0;
        }
        if (outletStock.totalQuantity < 0) {
          console.log(`⚠️ totalQuantity was ${outletStock.totalQuantity}, resetting to 0`);
          outletStock.totalQuantity = 0;
        }
        await outletStock.save();
        console.log(`✅ Reverted ${revertedCount} serialized items for product ${productItem.product}`);
      }
    } else if (productItem.approvedQuantity && productItem.approvedQuantity > 0) {
      console.log(`\n📦 Handling NON-SERIALIZED product`);
      console.log(`Approved quantity to revert: ${productItem.approvedQuantity}`);
      let currentInTransit = outletStock.inTransitQuantity || 0;
      let currentAvailable = outletStock.availableQuantity || 0;
      let currentTotal = outletStock.totalQuantity || 0;
      console.log(`Current - InTransit: ${currentInTransit}, Available: ${currentAvailable}, Total: ${currentTotal}`);
      const quantityToRevert = productItem.approvedQuantity;
      let revertedFromInTransit = 0;
      let revertedFromCenter = 0;
      if (currentInTransit > 0) {
        revertedFromInTransit = Math.min(quantityToRevert, currentInTransit);
        outletStock.inTransitQuantity -= revertedFromInTransit;
        outletStock.availableQuantity += revertedFromInTransit;
        console.log(`✅ Reverted ${revertedFromInTransit} units from IN_TRANSIT to AVAILABLE`);
      }
      let remainingToRevert = quantityToRevert - revertedFromInTransit;
      if (remainingToRevert > 0) {
        const centerStock = await CenterStockModel.findOne({
          center: stockRequest.center,
          product: productItem.product,
        });
        if (centerStock) {
          const centerAvailable = centerStock.availableQuantity || 0;
          const centerTotal = centerStock.totalQuantity || 0;
          console.log(`Center stock - Available: ${centerAvailable}, Total: ${centerTotal}`);
          if (centerAvailable > 0) {
            revertedFromCenter = Math.min(remainingToRevert, centerAvailable);
            centerStock.availableQuantity = Math.max(0, centerStock.availableQuantity - revertedFromCenter);
            centerStock.totalQuantity = Math.max(0, centerStock.totalQuantity - revertedFromCenter);
            outletStock.totalQuantity += revertedFromCenter;
            await centerStock.save();
            console.log(`✅ Removed ${revertedFromCenter} units from CENTER stock`);
            remainingToRevert -= revertedFromCenter;
          }
        }
      }
      if (remainingToRevert > 0) {
        console.log(`⚠️ WARNING: ${remainingToRevert} units could not be reverted (not found in in_transit or center stock)`);
      }
      if (outletStock.inTransitQuantity < 0) {
        console.log(`⚠️ inTransitQuantity was ${outletStock.inTransitQuantity}, resetting to 0`);
        outletStock.inTransitQuantity = 0;
      }
      if (outletStock.availableQuantity < 0) {
        console.log(`⚠️ availableQuantity was ${outletStock.availableQuantity}, resetting to 0`);
        outletStock.availableQuantity = 0;
      }
      if (outletStock.totalQuantity < 0) {
        console.log(`⚠️ totalQuantity was ${outletStock.totalQuantity}, resetting to 0`);
        outletStock.totalQuantity = 0;
      }
      await outletStock.save();
      console.log(`AFTER - Total: ${outletStock.totalQuantity}, Available: ${outletStock.availableQuantity}, InTransit: ${outletStock.inTransitQuantity}`);
      console.log(`✅ Reverted summary: ${revertedFromInTransit} from in_transit, ${revertedFromCenter} from center`);
    }

    productItem.approvedQuantity = 0;
    productItem.approvedSerials = [];
    productItem.transferredSerials = [];
    productItem.receivedQuantity = 0;
    productItem.receivedRemark = "";
  }

  await stockRequest.save();
  console.log("\n✅ Successfully reverted stock for rejected request\n");
};

const formatStockRequestToNotification = (stockRequest) => {
  const formatDate = (date) =>
    new Date(date).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });

  let title = "";
  let message = "";
  let notificationType = "";
  let timestamp = stockRequest.createdAt;

  const centerName = stockRequest.center?.centerName || "Unknown Center";
  const orderNumber = stockRequest.orderNumber || "N/A";
  const createdByName = stockRequest.createdBy?.fullName || "Unknown User";

  switch (stockRequest.status) {
    case "Submitted":
      notificationType = "new_request";
      title = "New Stock Request Submitted";
      message = `New Stock Request No. ${orderNumber} had been Submitted From ${centerName} By ${createdByName} - ${formatDate(stockRequest.createdAt)}`;
      break;
    case "Completed": {
      notificationType = "request_completed";
      title = "Stock Request Completed";
      const completedBy = stockRequest.completionInfo?.completedBy?.fullName ||
        stockRequest.receivingInfo?.receivedBy?.fullName || "System";
      message = `Your indent Request No. ${orderNumber} had been Completed From ${centerName} By ${completedBy} - ${formatDate(stockRequest.completionInfo?.completedOn || stockRequest.updatedAt)}`;
      timestamp = stockRequest.completionInfo?.completedOn || stockRequest.updatedAt;
      break;
    }
    case "Confirmed": {
      notificationType = "request_approved";
      title = "Stock Request Approved";
      const approvedBy = stockRequest.approvalInfo?.approvedBy?.fullName || "System";
      message = `Stock Request No. ${orderNumber} has been Approved From ${centerName} By ${approvedBy} - ${formatDate(stockRequest.approvalInfo?.approvedAt || stockRequest.updatedAt)}`;
      timestamp = stockRequest.approvalInfo?.approvedAt || stockRequest.updatedAt;
      break;
    }
    case "Shipped": {
      notificationType = "request_shipped";
      title = "Stock Request Shipped";
      const shippedBy = stockRequest.shippingInfo?.shippedBy?.fullName || "System";
      message = `Stock Request No. ${orderNumber} has been Shipped From ${centerName} By ${shippedBy} - ${formatDate(stockRequest.shippingInfo?.shippedAt || stockRequest.updatedAt)}`;
      timestamp = stockRequest.shippingInfo?.shippedAt || stockRequest.updatedAt;
      break;
    }
    case "Incompleted": {
      notificationType = "request_incompleted";
      title = "Stock Request Incompleted";
      const incompletedBy = stockRequest.completionInfo?.incompleteBy?.fullName || "System";
      message = `Stock Request No. ${orderNumber} has been Marked Incomplete From ${centerName} By ${incompletedBy} - ${formatDate(stockRequest.completionInfo?.incompleteOn || stockRequest.updatedAt)}`;
      timestamp = stockRequest.completionInfo?.incompleteOn || stockRequest.updatedAt;
      break;
    }
    case "Rejected":
      notificationType = "request_rejected";
      title = "Stock Request Rejected";
      message = `Stock Request No. ${orderNumber} has been Rejected From ${centerName} - ${formatDate(stockRequest.updatedAt)}`;
      break;
    default:
      notificationType = "status_updated";
      title = "Stock Request Updated";
      message = `Stock Request No. ${orderNumber} status updated to ${stockRequest.status} From ${centerName} - ${formatDate(stockRequest.updatedAt)}`;
      timestamp = stockRequest.updatedAt;
  }

  return {
    id: stockRequest._id,
    type: notificationType,
    title, message,
    stockRequestId: stockRequest._id,
    orderNumber: stockRequest.orderNumber,
    center: stockRequest.center,
    status: stockRequest.status,
    timestamp,
    createdAt: stockRequest.createdAt,
    isRead: false,
  };
};

const generateBulkOrderNumber = async (centerName, date) => {
  const cleanCenterName = centerName.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const month = date.getMonth() + 1;
  const year = date.getFullYear().toString().slice(-2);
  const monthYear = `${month.toString().padStart(2, "0")}${year}`;
  const prefix = `SR/${cleanCenterName}/${monthYear}/`;
  const lastOrder = await StockRequest.findOne({
    orderNumber: new RegExp(`^${prefix}`),
  }).sort({ orderNumber: -1 });
  let sequence = 1;
  if (lastOrder && lastOrder.orderNumber) {
    const lastSequence = parseInt(lastOrder.orderNumber.split("/").pop());
    if (!isNaN(lastSequence)) sequence = lastSequence + 1;
  }
  return `${prefix}${sequence}`;
};

// ===========================================================================
// PUBLIC SERVICE FUNCTIONS
// Every function returns { statusCode, body }
// ===========================================================================

export const createStockRequest = async (user, body) => {
  try {
    const { hasAccess, permissions } = await checkStockRequestPermissions(user, ["manage_indent"]);
    if (!hasAccess) {
      return {
        statusCode: 403,
        body: { success: false, message: "Access denied. manage_indent permission required." },
      };
    }

    const { warehouse, remark, products, status = "Draft", orderNumber, date } = body;

    if (!orderNumber || orderNumber.trim() === "") {
      return { statusCode: 400, body: { success: false, message: "Order number is required" } };
    }
    const trimmedOrderNumber = orderNumber.trim();

    const existingRequest = await StockRequest.findOne({ orderNumber: trimmedOrderNumber });
    if (existingRequest) {
      return {
        statusCode: 409,
        body: {
          success: false,
          message: "Order number already exists. Please use a unique order number.",
          duplicateOrderNumber: trimmedOrderNumber,
          existingRequestId: existingRequest._id,
        },
      };
    }

    let requestDate = new Date();
    if (date) {
      requestDate = new Date(date);
      if (isNaN(requestDate.getTime())) {
        return {
          statusCode: 400,
          body: { success: false, message: "Invalid date format. Please provide a valid date." },
        };
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const providedDate = new Date(requestDate);
      providedDate.setHours(0, 0, 0, 0);
    }

    const userDoc = await User.findById(user.id).populate("center");
    if (!userDoc || !userDoc.center) {
      return {
        statusCode: 400,
        body: { success: false, message: "User center information not found" },
      };
    }
    const centerId = userDoc.center._id;

    if (permissions.indent_own_center && !permissions.indent_all_center) {
      const userCenterId = userDoc.center._id || userDoc.center;
      // Legacy: variable set but unused. Preserved.
    }

    const centerExists = await Center.findById(centerId);
    if (!centerExists) {
      return { statusCode: 404, body: { success: false, message: "Center not found" } };
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
      return {
        statusCode: 400,
        body: { success: false, message: "Products array is required and cannot be empty" },
      };
    }

    for (const product of products) {
      if (!product.product || !product.quantity) {
        return {
          statusCode: 400,
          body: { success: false, message: "Each product must have product ID and quantity" },
        };
      }
      if (product.quantity <= 0) {
        return {
          statusCode: 400,
          body: { success: false, message: "Product quantity must be greater than 0" },
        };
      }
    }

    const stockRequest = new StockRequest({
      orderNumber: trimmedOrderNumber,
      warehouse, center: centerId,
      remark: remark || "",
      products, date: requestDate, status,
      centerChallanApproval: "pending",
      warehouseChallanApproval: "pending",
      createdBy: user.id,
    });

    const savedStockRequest = await stockRequest.save();

    const populatedRequest = await StockRequest.findById(savedStockRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("createdBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("approvalInfo.warehouseChallanApprovedBy", "_id fullName email")
      .populate("approvalInfo.centerChallanApprovedBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email");

    return {
      statusCode: 201,
      body: {
        success: true,
        message: "Stock request created successfully",
        data: populatedRequest,
      },
    };
  } catch (error) {
    console.error("Error creating stock request:", error);

    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern)[0];
      if (duplicateField === "orderNumber") {
        return {
          statusCode: 409,
          body: {
            success: false,
            message: "Order number already exists. Please use a unique order number.",
            duplicateOrderNumber: body.orderNumber,
          },
        };
      }
    }
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return { statusCode: 400, body: { success: false, message: "Validation error", errors } };
    }
    if (error.name === "CastError") {
      return {
        statusCode: 400,
        body: { success: false, message: `Invalid ${error.path}: ${error.value}` },
      };
    }
    return {
      statusCode: 500,
      body: {
        success: false,
        message: "Error creating stock request",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      },
    };
  }
};

export const getAllStockRequests = async (user, query) => {
  try {
    const { hasAccess, permissions, userCenter } = await checkStockRequestPermissions(user, [
      "indent_all_center", "indent_own_center",
    ]);
    if (!hasAccess) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message: "Access denied. indent_own_center or indent_all_center permission required.",
        },
      };
    }

    const {
      page = 1, limit = 100, sortBy = "createdAt", sortOrder = "desc",
      ...filterParams
    } = query;

    console.log("=== getAllStockRequests - Query Parameters ===");
    console.log("filterParams:", filterParams);
    console.log("product filter:", filterParams.product);
    console.log("==============================================");

    let filter = buildFilter(filterParams);

    if (filterParams.reseller) {
      const resellerFilter = buildArrayFilter(filterParams.reseller);
      const centerFilter = {};
      if (resellerFilter) {
        if (Array.isArray(resellerFilter.$in)) {
          centerFilter.reseller = {
            $in: resellerFilter.$in.map((id) =>
              mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
            ),
          };
        } else if (mongoose.Types.ObjectId.isValid(resellerFilter)) {
          centerFilter.reseller = new mongoose.Types.ObjectId(resellerFilter);
        } else {
          centerFilter.reseller = resellerFilter;
        }

        const matchingCenters = await Center.find(centerFilter).select("_id");
        const centerIds = matchingCenters.map((c) => c._id);

        if (centerIds.length > 0) {
          if (filter.center) {
            if (filter.center.$in) {
              filter.center.$in = filter.center.$in.filter((centerId) =>
                centerIds.some((matchingId) => matchingId.toString() === centerId.toString())
              );
            } else {
              if (!centerIds.some((id) => id.toString() === filter.center.toString())) {
                filter.center = { $in: [] };
              }
            }
          } else {
            filter.center = { $in: centerIds };
          }
        } else {
          filter.center = { $in: [] };
        }
      }
    }

    if (permissions.indent_own_center && !permissions.indent_all_center && userCenter) {
      const userCenterId = userCenter._id || userCenter;
      if (filter.center) {
        if (filter.center.$in) {
          filter.center.$in = filter.center.$in.filter(
            (centerId) => centerId.toString() === userCenterId.toString()
          );
        } else {
          if (filter.center.toString() !== userCenterId.toString()) {
            filter.center = { $in: [] };
          }
        }
      } else {
        filter.center = userCenterId;
      }
    }

    const sortOptions = buildSortOptions(sortBy, sortOrder);
    console.log("Final filter for query:", JSON.stringify(filter, null, 2));

    const [stockRequests, total, statusCounts] = await Promise.all([
      StockRequest.find(filter)
        .populate(populateOptions)
        .sort(sortOptions)
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean(),
      StockRequest.countDocuments(filter),
      StockRequest.aggregate([
        { $match: filter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    if (stockRequests.length === 0) {
      return {
        statusCode: 200,
        body: {
          success: true,
          message: "No stock requests found",
          data: [],
          pagination: {
            currentPage: parseInt(page),
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: parseInt(limit),
          },
          filters: { status: {}, total: 0 },
        },
      };
    }

    const stockMap = await getBulkCenterStock(stockRequests);

    const resellerStockMap = new Map();
    const centerToResellerMap = new Map();

    const centerIds = stockRequests.map((r) => r.center?._id).filter(Boolean);
    const allProductIds = [];
    stockRequests.forEach((request) => {
      request.products.forEach((product) => {
        if (product.product?._id) allProductIds.push(product.product._id.toString());
      });
    });
    const uniqueProductIds = [...new Set(allProductIds)];

    if (centerIds.length > 0 && uniqueProductIds.length > 0) {
      const centersWithResellers = await Center.find({ _id: { $in: centerIds } })
        .populate("reseller", "_id businessName")
        .select("_id reseller");

      centersWithResellers.forEach((center) => {
        if (center.reseller) centerToResellerMap.set(center._id.toString(), center.reseller._id);
      });

      const uniqueResellerIds = [...new Set([...centerToResellerMap.values()])];
      if (uniqueResellerIds.length > 0) {
        const ResellerStockModel = mongoose.model("ResellerStock");
        const resellerStocks = await ResellerStockModel.find({
          reseller: { $in: uniqueResellerIds },
          product: { $in: uniqueProductIds.map((id) => new mongoose.Types.ObjectId(id)) },
        }).lean();

        resellerStocks.forEach((stock) => {
          const key = `${stock.reseller}_${stock.product}`;
          let damageRepairCount = 0;
          let centerReturnCount = 0;
          let availableSerials = [];

          if (stock.serialNumbers && stock.serialNumbers.length > 0) {
            const availableSerialsArray = stock.serialNumbers.filter((sn) => sn.status === "available");
            availableSerials = availableSerialsArray.map((sn) => sn.serialNumber);
            damageRepairCount = availableSerialsArray.filter((sn) => sn.sourceType === "damage_repair").length;
            centerReturnCount = availableSerialsArray.filter((sn) => sn.sourceType === "center_return").length;
          } else {
            damageRepairCount = stock.sourceBreakdown?.damageRepairQuantity || 0;
            centerReturnCount = stock.sourceBreakdown?.centerReturnQuantity || 0;
          }

          resellerStockMap.set(key, {
            totalQuantity: stock.totalQuantity || 0,
            availableQuantity: stock.availableQuantity || 0,
            consumedQuantity: stock.consumedQuantity || 0,
            damagedQuantity: stock.damagedQuantity || 0,
            repairQuantity: stock.repairQuantity || 0,
            sourceBreakdown: stock.sourceBreakdown || {
              damageRepairQuantity: damageRepairCount,
              centerReturnQuantity: centerReturnCount,
              directPurchaseQuantity:
                (stock.availableQuantity || 0) - damageRepairCount - centerReturnCount,
            },
            availableSerials,
            availableSerialsCount: availableSerials.length,
            damageRepairSerialsCount: damageRepairCount,
            centerReturnSerialsCount: centerReturnCount,
          });
        });
      }
    }

    const defaultResellerStock = {
      totalQuantity: 0,
      availableQuantity: 0,
      availableBreakdown: { damageRepair: 0, centerReturn: 0, directPurchase: 0, total: 0 },
      sourceBreakdown: { damageRepairQuantity: 0, centerReturnQuantity: 0, directPurchaseQuantity: 0 },
      availableSerials: [],
      availableSerialsCount: 0,
      damageRepairCount: 0,
      centerReturnCount: 0,
      hasResellerStock: false,
    };

    const stockRequestsWithEnhancedData = stockRequests.map((request) => {
      const centerId = request.center?._id?.toString();
      const resellerId = centerId ? centerToResellerMap.get(centerId) : null;

      const productsWithEnhancedData = request.products.map((product) => {
        if (!product.product?._id || !request.center?._id) return product;
        const stockKey = `${request.center._id}_${product.product._id}`;
        const centerStockQuantity = stockMap.get(stockKey) || 0;
        let resellerStockInfo = null;
        if (resellerId) {
          const resellerStockKey = `${resellerId}_${product.product._id}`;
          resellerStockInfo = resellerStockMap.get(resellerStockKey);
        }
        return {
          ...product,
          centerStockQuantity,
          resellerStock: resellerStockInfo
            ? {
                totalQuantity: resellerStockInfo.totalQuantity || 0,
                availableQuantity: resellerStockInfo.availableQuantity || 0,
                availableBreakdown: {
                  damageRepair: resellerStockInfo.sourceBreakdown?.damageRepairQuantity || 0,
                  centerReturn: resellerStockInfo.sourceBreakdown?.centerReturnQuantity || 0,
                  directPurchase: resellerStockInfo.sourceBreakdown?.directPurchaseQuantity || 0,
                  total: resellerStockInfo.availableQuantity || 0,
                },
                sourceBreakdown: resellerStockInfo.sourceBreakdown || {
                  damageRepairQuantity: 0, centerReturnQuantity: 0, directPurchaseQuantity: 0,
                },
                availableSerials: resellerStockInfo.availableSerials || [],
                availableSerialsCount: resellerStockInfo.availableSerialsCount || 0,
                damageRepairCount: resellerStockInfo.damageRepairSerialsCount || 0,
                centerReturnCount: resellerStockInfo.centerReturnSerialsCount || 0,
                hasResellerStock: true,
              }
            : defaultResellerStock,
        };
      });

      const resellerStockTotals = productsWithEnhancedData.reduce(
        (totals, product) => {
          const resellerStock = product.resellerStock || defaultResellerStock;
          const availableBreakdown = resellerStock.availableBreakdown || defaultResellerStock.availableBreakdown;
          totals.totalAvailable += resellerStock.availableQuantity || 0;
          totals.damageRepair += availableBreakdown.damageRepair || 0;
          totals.centerReturn += availableBreakdown.centerReturn || 0;
          totals.directPurchase += availableBreakdown.directPurchase || 0;
          return totals;
        },
        { totalAvailable: 0, damageRepair: 0, centerReturn: 0, directPurchase: 0 }
      );

      return {
        ...request,
        products: productsWithEnhancedData,
        stockSummary: {
          centerStock: productsWithEnhancedData.reduce(
            (sum, product) => sum + (product.centerStockQuantity || 0), 0
          ),
          resellerStock: {
            totalAvailable: resellerStockTotals.totalAvailable,
            breakdown: {
              damageRepair: resellerStockTotals.damageRepair,
              centerReturn: resellerStockTotals.centerReturn,
              directPurchase: resellerStockTotals.directPurchase,
              percentage: {
                damageRepair: resellerStockTotals.totalAvailable > 0
                  ? Math.round((resellerStockTotals.damageRepair / resellerStockTotals.totalAvailable) * 100) : 0,
                centerReturn: resellerStockTotals.totalAvailable > 0
                  ? Math.round((resellerStockTotals.centerReturn / resellerStockTotals.totalAvailable) * 100) : 0,
                directPurchase: resellerStockTotals.totalAvailable > 0
                  ? Math.round((resellerStockTotals.directPurchase / resellerStockTotals.totalAvailable) * 100) : 0,
              },
            },
          },
          resellerInfo: resellerId
            ? { hasReseller: true, resellerId }
            : { hasReseller: false },
        },
      };
    });

    const statusStats = statusCounts.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    const overallStats = stockRequestsWithEnhancedData.reduce(
      (stats, request) => {
        stats.totalRequests += 1;
        const stockSummary = request.stockSummary || { resellerStock: { totalAvailable: 0, breakdown: {} } };
        const resellerStock = stockSummary.resellerStock || { totalAvailable: 0, breakdown: {} };
        const breakdown = resellerStock.breakdown || {};
        stats.totalResellerAvailable += resellerStock.totalAvailable || 0;
        stats.totalDamageRepair += breakdown.damageRepair || 0;
        stats.totalCenterReturn += breakdown.centerReturn || 0;
        stats.totalDirectPurchase += breakdown.directPurchase || 0;
        if (stockSummary.resellerInfo?.hasReseller) stats.requestsWithReseller += 1;
        return stats;
      },
      {
        totalRequests: 0, totalResellerAvailable: 0,
        totalDamageRepair: 0, totalCenterReturn: 0, totalDirectPurchase: 0,
        requestsWithReseller: 0,
      }
    );

    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Stock requests retrieved successfully",
        data: stockRequestsWithEnhancedData,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
        filters: { status: statusStats, total },
        summary: {
          overallResellerStock: {
            totalAvailable: overallStats.totalResellerAvailable,
            breakdown: {
              damageRepair: overallStats.totalDamageRepair,
              centerReturn: overallStats.totalCenterReturn,
              directPurchase: overallStats.totalDirectPurchase,
            },
            percentage: {
              damageRepair: overallStats.totalResellerAvailable > 0
                ? Math.round((overallStats.totalDamageRepair / overallStats.totalResellerAvailable) * 100) : 0,
              centerReturn: overallStats.totalResellerAvailable > 0
                ? Math.round((overallStats.totalCenterReturn / overallStats.totalResellerAvailable) * 100) : 0,
              directPurchase: overallStats.totalResellerAvailable > 0
                ? Math.round((overallStats.totalDirectPurchase / overallStats.totalResellerAvailable) * 100) : 0,
            },
          },
          requestsWithResellerStock: overallStats.requestsWithReseller,
          totalRequestsWithReseller: overallStats.totalRequests,
        },
      },
    };
  } catch (error) {
    console.error("Error retrieving stock requests:", error);
    return {
      statusCode: 500,
      body: { success: false, message: "Error retrieving stock requests", error: error.message },
    };
  }
};

export const getStockRequestById = async (user, id) => {
  try {
    const { hasAccess, permissions, userCenter } = await checkStockRequestPermissions(user, [
      "indent_all_center", "indent_own_center",
    ]);
    if (!hasAccess) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message: "Access denied. indent_own_center or indent_all_center permission required.",
        },
      };
    }

    const stockRequest = await StockRequest.findById(id)
      .populate("warehouse", "_id centerName centerCode centerType email addressLine1 addressLine2 city state")
      .populate({
        path: "center",
        select: "_id centerName centerCode centerType email addressLine1 addressLine2 city state",
        populate: [
          { path: "reseller", select: "_id businessName contactNumber name mobile email gstNumber panNumber address1 address2 city state" },
          { path: "area", select: "_id areaName" },
        ],
      })
      .populate("products.product", "_id productTitle productCode salePrice trackSerialNumber")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("approvalInfo.warehouseChallanApprovedBy", "_id fullName email")
      .populate("approvalInfo.centerChallanApprovedBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.completedBy", "_id fullName email")
      .populate("incompleteInfo.incompleteBy", "_id fullName email")
      .populate("rejectionInfo.rejectedBy", "_id fullName email")
      .lean();

    if (!stockRequest) {
      return { statusCode: 404, body: { success: false, message: "Stock request not found" } };
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return {
        statusCode: 403,
        body: { success: false, message: "Access denied. You can only view stock requests from your own center." },
      };
    }

    const productIds = stockRequest.products.map((p) => p.product._id);

    const centerStock = await CenterStock.aggregate([
      { $match: { center: stockRequest.center._id, product: { $in: productIds } } },
      {
        $group: {
          _id: "$product",
          totalQuantity: { $sum: "$totalQuantity" },
          availableQuantity: { $sum: "$availableQuantity" },
          consumedQuantity: { $sum: "$consumedQuantity" },
          inTransitQuantity: { $sum: "$inTransitQuantity" },
        },
      },
    ]);

    const centerStockMap = {};
    centerStock.forEach((stock) => {
      centerStockMap[stock._id.toString()] = {
        totalQuantity: stock.totalQuantity,
        availableQuantity: stock.availableQuantity,
        consumedQuantity: stock.consumedQuantity,
        inTransitQuantity: stock.inTransitQuantity,
      };
    });

    const outletStockMap = await getOutletStockForRequests(stockRequest.warehouse._id, productIds);

    const ResellerStockModel = mongoose.model("ResellerStock");
    const resellerId = stockRequest.center?.reseller?._id;
    const resellerStockMap = new Map();

    if (resellerId) {
      const resellerStocks = await ResellerStockModel.find({
        reseller: resellerId,
        product: { $in: productIds },
      }).select("product availableQuantity totalQuantity consumedQuantity serialNumbers");

      resellerStocks.forEach((stock) => {
        const availableSerials = stock.serialNumbers
          .filter((sn) => sn.status === "available")
          .map((sn) => sn.serialNumber);
        resellerStockMap.set(stock.product.toString(), {
          totalQuantity: stock.totalQuantity,
          availableQuantity: stock.availableQuantity,
          consumedQuantity: stock.consumedQuantity,
          damagedQuantity: stock.damagedQuantity,
          repairQuantity: stock.repairQuantity,
          hasSerialNumbers: stock.serialNumbers.length > 0,
          availableSerials,
          availableSerialsCount: availableSerials.length,
        });
      });
    }

    const centerStockDetails = await CenterStock.find({
      center: stockRequest.center._id,
      product: { $in: productIds },
    }).select("product serialNumbers");

    const centerSerialNumbersMap = new Map();
    centerStockDetails.forEach((stock) => {
      const availableSerials = stock.serialNumbers
        .filter((sn) => sn.status === "available")
        .map((sn) => sn.serialNumber);
      centerSerialNumbersMap.set(stock.product.toString(), {
        hasSerialNumbers: stock.serialNumbers.length > 0,
        availableSerials,
        availableSerialsCount: availableSerials.length,
        allSerials: stock.serialNumbers,
      });
    });

    const productsWithEnhancedData = stockRequest.products.map((product) => {
      const productId = product.product._id.toString();
      const stockInfo = centerStockMap[productId] || {
        totalQuantity: 0, availableQuantity: 0, consumedQuantity: 0, inTransitQuantity: 0,
      };
      const outletStock = outletStockMap.get(productId) || {
        totalQuantity: 0, availableQuantity: 0, inTransitQuantity: 0,
      };
      const resellerStock = resellerStockMap.get(productId) || {
        totalQuantity: 0, availableQuantity: 0, consumedQuantity: 0,
        damagedQuantity: 0, repairQuantity: 0, availableSerials: [], availableSerialsCount: 0,
      };
      const centerSerials = centerSerialNumbersMap.get(productId) || {
        hasSerialNumbers: false, availableSerials: [], availableSerialsCount: 0, allSerials: [],
      };

      return {
        ...product,
        centerStockQuantity: stockInfo.availableQuantity,
        centerStockDetails: stockInfo,
        outletStock: {
          totalQuantity: outletStock.totalQuantity,
          availableQuantity: outletStock.availableQuantity,
          inTransitQuantity: outletStock.inTransitQuantity,
          hasSerialNumbers: outletStock.hasSerialNumbers,
          availableSerials: outletStock.availableSerials || [],
        },
        centerStockSerials: {
          hasSerialNumbers: centerSerials.hasSerialNumbers,
          availableSerials: centerSerials.availableSerials,
          availableSerialsCount: centerSerials.availableSerialsCount,
          allSerials: centerSerials.allSerials,
        },
        resellerStock: {
          totalQuantity: resellerStock.totalQuantity,
          availableQuantity: resellerStock.availableQuantity,
          consumedQuantity: resellerStock.consumedQuantity,
          damagedQuantity: resellerStock.damagedQuantity,
          repairQuantity: resellerStock.repairQuantity,
          hasSerialNumbers: resellerStock.hasSerialNumbers,
          availableSerials: resellerStock.availableSerials,
          availableSerialsCount: resellerStock.availableSerialsCount,
        },
        approvedSerials: product.approvedSerials || [],
        serialNumbers: product.serialNumbers || [],
        transferredSerials: product.transferredSerials || [],
        serialSummary: {
          approvedCount: product.approvedSerials?.length || 0,
          transferredCount: product.transferredSerials?.length || 0,
          requiresSerialNumbers: product.product.trackSerialNumber === "Yes",
          centerAvailableSerials: centerSerials.availableSerialsCount,
          resellerAvailableSerials: resellerStock.availableSerialsCount,
        },
      };
    });

    const totalCenterAvailable = productsWithEnhancedData.reduce(
      (sum, p) => sum + p.centerStockQuantity, 0
    );
    const totalResellerAvailable = productsWithEnhancedData.reduce(
      (sum, p) => sum + p.resellerStock.availableQuantity, 0
    );
    const totalOutletAvailable = productsWithEnhancedData.reduce(
      (sum, p) => sum + p.outletStock.availableQuantity, 0
    );

    const stockRequestWithEnhancedData = {
      ...stockRequest,
      products: productsWithEnhancedData,
      stockSummary: {
        totalCenterAvailable,
        totalResellerAvailable,
        totalOutletAvailable,
        totalAvailable: totalCenterAvailable + totalResellerAvailable + totalOutletAvailable,
        resellerName: stockRequest.center?.reseller?.businessName || "N/A",
        resellerId,
        centerName: stockRequest.center?.centerName || "N/A",
      },
    };

    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Stock request retrieved successfully",
        data: stockRequestWithEnhancedData,
      },
    };
  } catch (error) {
    if (error.name === "CastError") {
      return { statusCode: 400, body: { success: false, message: "Invalid stock request ID" } };
    }
    console.error("Error retrieving stock request:", error);
    return {
      statusCode: 500,
      body: { success: false, message: "Error retrieving stock request", error: error.message },
    };
  }
};

export const updateStockRequest = async (user, id, body) => {
  try {
    const { hasAccess, permissions, userCenter } = await checkStockRequestPermissions(user, ["manage_indent"]);
    if (!hasAccess) {
      return {
        statusCode: 403,
        body: { success: false, message: "Access denied. manage_indent permission required." },
      };
    }

    const {
      warehouse, center, remark, products, status,
      approvalInfo, shippingInfo, receivingInfo, completionInfo,
      orderNumber, rejectionReason,
    } = body;

    const existingRequest = await StockRequest.findById(id);
    if (!existingRequest) {
      return { statusCode: 404, body: { success: false, message: "Stock request not found" } };
    }

    if (!checkCenterAccess(existingRequest, userCenter, permissions)) {
      return {
        statusCode: 403,
        body: { success: false, message: "Access denied. You can only manage stock requests from your own center." },
      };
    }

    const userId = user?.id;
    if (!userId) {
      return { statusCode: 400, body: { success: false, message: "User authentication required" } };
    }

    const updateData = {
      updatedBy: userId,
      ...(warehouse && { warehouse }),
      ...(center && { center }),
      ...(remark !== undefined && { remark }),
      ...(status && { status }),
      ...(orderNumber && { orderNumber: orderNumber.trim() }),
      ...(approvalInfo && { approvalInfo: { ...existingRequest.approvalInfo, ...approvalInfo } }),
      ...(shippingInfo && { shippingInfo: { ...existingRequest.shippingInfo, ...shippingInfo } }),
      ...(receivingInfo && { receivingInfo: { ...existingRequest.receivingInfo, ...receivingInfo } }),
      ...(completionInfo && {
        completionInfo: { ...existingRequest.completionInfo, ...completionInfo },
      }),
    };

    if (status === "Rejected" && existingRequest.status !== "Rejected") {
      if (!rejectionReason || rejectionReason.trim() === "") {
        return {
          statusCode: 400,
          body: { success: false, message: "Rejection reason is required when rejecting a stock request" },
        };
      }
      await revertStockForRejectedRequest(existingRequest);
      updateData.rejectionInfo = {
        rejectedAt: new Date(),
        rejectedBy: userId,
        rejectionReason: rejectionReason.trim(),
      };
    }

    if (products) {
      if (["Draft", "Submitted"].includes(existingRequest.status)) {
        updateData.products = products;
      } else {
        updateData.products = existingRequest.products.map((existingProduct) => {
          const newProduct = products.find(
            (p) => p.product.toString() === existingProduct.product.toString()
          );
          if (newProduct) {
            return {
              ...existingProduct.toObject(),
              quantity: newProduct.quantity !== undefined ? newProduct.quantity : existingProduct.quantity,
              productRemark: newProduct.productRemark !== undefined ? newProduct.productRemark : existingProduct.productRemark,
              receivedQuantity: newProduct.receivedQuantity !== undefined ? newProduct.receivedQuantity : existingProduct.receivedQuantity,
              receivedRemark: newProduct.receivedRemark !== undefined ? newProduct.receivedRemark : existingProduct.receivedRemark,
              approvedSerials: newProduct.approvedSerials !== undefined ? newProduct.approvedSerials : existingProduct.approvedSerials,
            };
          }
          return existingProduct;
        });
      }
    }

    if (status) {
      const currentDate = new Date();
      switch (status) {
        case "Confirmed":
          updateData.approvalInfo = {
            ...existingRequest.approvalInfo,
            approvedAt: currentDate,
            approvedBy: userId,
            ...approvalInfo,
          };
          break;
        case "Shipped":
          updateData.shippingInfo = {
            ...existingRequest.shippingInfo,
            shippedAt: currentDate,
            shippedBy: userId,
            ...shippingInfo,
          };
          break;
        case "Completed":
          updateData.receivingInfo = {
            ...existingRequest.receivingInfo,
            receivedAt: currentDate,
            receivedBy: userId,
            ...receivingInfo,
          };
          updateData.completionInfo = {
            ...existingRequest.completionInfo,
            completedOn: currentDate,
            completedBy: userId,
            ...completionInfo,
          };
          break;
        case "Incompleted":
          updateData.completionInfo = {
            ...existingRequest.completionInfo,
            incompleteOn: currentDate,
            incompleteBy: userId,
            incompleteRemark: completionInfo?.incompleteRemark || "",
            ...completionInfo,
          };
          break;
        case "Rejected":
          break;
      }
    }

    if (updateData.products) {
      await syncReceivedQuantityChanges({
        stockRequest: existingRequest,
        nextProducts: updateData.products,
      });
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(id, updateData, {
      new: true, runValidators: true,
    })
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("incompleteInfo.incompleteBy", "_id fullName email")
      .populate("rejectionInfo.rejectedBy", "_id fullName email");

    return {
      statusCode: 200,
      body: { success: true, message: "Stock request updated successfully", data: updatedRequest },
    };
  } catch (error) {
    if (error.name === "CastError") {
      return { statusCode: 400, body: { success: false, message: "Invalid stock request ID" } };
    }
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return { statusCode: 400, body: { success: false, message: "Validation error", errors } };
    }
    if (error.code === 11000) {
      return {
        statusCode: 400,
        body: { success: false, message: "Order number already exists. Please use a different order number." },
      };
    }
    console.error("Error updating stock request:", error);
    return {
      statusCode: 500,
      body: {
        success: false,
        message: "Error updating stock request",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      },
    };
  }
};

export const deleteStockRequest = async (user, id) => {
  try {
    const { hasAccess, permissions, userCenter } = await checkStockRequestPermissions(user, [
      "delete_indent_all_center", "delete_indent_own_center",
    ]);
    if (!hasAccess) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message: "Access denied. delete_indent_own_center or delete_indent_all_center permission required.",
        },
      };
    }

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return { statusCode: 404, body: { success: false, message: "Stock request not found" } };
    }

    if (permissions.delete_indent_own_center && !permissions.delete_indent_all_center && userCenter) {
      const userCenterId = userCenter._id || userCenter;
      const requestCenterId = stockRequest.center._id || stockRequest.center;
      if (userCenterId.toString() !== requestCenterId.toString()) {
        return {
          statusCode: 403,
          body: { success: false, message: "Access denied. You can only delete stock requests from your own center." },
        };
      }
    }

    if (!["Submitted", "Incompleted", "Draft", "Completed", "Confirmed"].includes(stockRequest.status)) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: "Only Submitted, Incompleted, Draft, Confirmed and Completed stock requests can be deleted",
        },
      };
    }

    await StockRequest.findByIdAndDelete(id);
    return { statusCode: 200, body: { success: true, message: "Stock request deleted successfully" } };
  } catch (error) {
    if (error.name === "CastError") {
      return { statusCode: 400, body: { success: false, message: "Invalid stock request ID" } };
    }
    console.error("Error deleting stock request:", error);
    return {
      statusCode: 500,
      body: { success: false, message: "Error deleting stock request", error: error.message },
    };
  }
};

export const approveStockRequest = async (user, id, body) => {
  try {
    const { hasAccess, permissions, userCenter } =
      await checkStockRequestPermissions(user, [
        "stock_transfer_approve_from_outlet",
        "manage_indent",
      ]);

    if (!hasAccess) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message:
            "Access denied. stock_transfer_approve_from_outlet or manage_indent permission required.",
        },
      };
    }

    const { productApprovals } = body;

    const stockRequest = await StockRequest.findById(id)
      .populate("center", "reseller centerType centerName centerCode")
      .populate("warehouse", "centerType centerName centerCode");

    if (!stockRequest) {
      return {
        statusCode: 404,
        body: {
          success: false,
          message: "Stock request not found",
        },
      };
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message:
            "Access denied. You can only approve stock requests from your own center.",
        },
      };
    }

    const userId = user?.id;

    if (!userId) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: "User authentication required",
        },
      };
    }

    const resellerId =
      stockRequest.center?.reseller?._id ||
      stockRequest.center?.reseller;

    const centerType = stockRequest.center?.centerType;

    if (centerType === "Center" && !resellerId) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: `Center "${
            stockRequest.center?.centerName || stockRequest.center
          }" is of type "Center" but does not have an associated reseller. Please update the center information.`,
          centerId: stockRequest.center?._id,
          centerName: stockRequest.center?.centerName,
        },
      };
    }

    const ResellerStockModel = mongoose.model("ResellerStock");
    const OutletStockModel = mongoose.model("OutletStock");
    const ProductModel = mongoose.model("Product");

    if (productApprovals && productApprovals.length > 0) {
      for (const approval of productApprovals) {
        const productItem = stockRequest.products.find(
          (p) =>
            p.product.toString() === approval.productId.toString()
        );

        if (!productItem) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message: `Product ${approval.productId} not found in stock request`,
            },
          };
        }

        if (
          approval.approvedQuantity === undefined ||
          approval.approvedQuantity === null
        ) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message: `Approved quantity is required for product ${productItem.product}`,
            },
          };
        }

        if (
          typeof approval.approvedQuantity !== "number" ||
          isNaN(approval.approvedQuantity)
        ) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message: `Approved quantity must be a valid number for product ${productItem.product}`,
            },
          };
        }

        if (approval.approvedQuantity < 0) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message: `Approved quantity cannot be negative for product ${productItem.product}`,
            },
          };
        }

        if (
          approval.approvedQuantity === 0 &&
          (!approval.approvedRemark ||
            approval.approvedRemark.trim() === "")
        ) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message: `Approval remark is required when approved quantity is zero for product ${productItem.product}`,
            },
          };
        }

        const productDoc = await ProductModel.findById(
          approval.productId
        );

        if (!productDoc) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message: `Product document not found for ID ${approval.productId}`,
            },
          };
        }

        const tracksSerialNumbers =
          productDoc.trackSerialNumber === "Yes";

        let resellerAvailable = 0;
        let outletAvailable = 0;
        let hasResellerStock = false;

        let resellerStockDoc = null;
        let outletStockDoc = null;

        if (resellerId) {
          resellerStockDoc = await ResellerStockModel.findOne({
            reseller: resellerId,
            product: approval.productId,
          });

          if (resellerStockDoc) {
            resellerAvailable =
              resellerStockDoc.availableQuantity || 0;
            hasResellerStock = true;
          }
        }

        outletStockDoc = await OutletStockModel.findOne({
          outlet: stockRequest.warehouse,
          product: approval.productId,
        });

        if (outletStockDoc) {
          outletAvailable =
            outletStockDoc.availableQuantity || 0;
        }

        let fromResellerQty = 0;
        let fromOutletQty = 0;
        let fromResellerSerials = [];
        let fromOutletSerials = [];

        if (
          tracksSerialNumbers &&
          approval.approvedSerials &&
          approval.approvedSerials.length > 0
        ) {
          if (
            approval.approvedSerials.length !==
            approval.approvedQuantity
          ) {
            return {
              statusCode: 400,
              body: {
                success: false,
                message: `Number of serial numbers (${approval.approvedSerials.length}) must match approved quantity (${approval.approvedQuantity}) for product ${productDoc.productTitle}`,
              },
            };
          }

          const serials = approval.approvedSerials;

          if (hasResellerStock && resellerAvailable > 0) {
            for (const serialNumber of serials) {
              const serial =
                resellerStockDoc.serialNumbers.find(
                  (sn) =>
                    sn.serialNumber === serialNumber &&
                    sn.status === "available"
                );

              if (serial) {
                fromResellerSerials.push(serialNumber);
              }
            }
          }

          fromOutletSerials = serials.filter(
            (sn) => !fromResellerSerials.includes(sn)
          );

          fromResellerQty = fromResellerSerials.length;
          fromOutletQty = fromOutletSerials.length;

          if (fromOutletQty > outletAvailable) {
            return {
              statusCode: 400,
              body: {
                success: false,
                message: `Insufficient outlet stock for product "${productDoc.productTitle}". Outlet available: ${outletAvailable}, required from outlet: ${fromOutletQty}`,
              },
            };
          }

          if (
            fromResellerSerials.length > 0 &&
            hasResellerStock
          ) {
            for (const serialNumber of fromResellerSerials) {
              const serial =
                resellerStockDoc.serialNumbers.find(
                  (sn) =>
                    sn.serialNumber === serialNumber &&
                    sn.status === "available"
                );

              if (!serial) {
                return {
                  statusCode: 400,
                  body: {
                    success: false,
                    message: `Serial number ${serialNumber} is not available in reseller stock for product "${productDoc.productTitle}"`,
                  },
                };
              }
            }
          }

          if (
            fromOutletSerials.length > 0 &&
            outletStockDoc
          ) {
            for (const serialNumber of fromOutletSerials) {
              const serial =
                outletStockDoc.serialNumbers.find(
                  (sn) =>
                    sn.serialNumber === serialNumber &&
                    sn.status === "available"
                );

              if (!serial) {
                return {
                  statusCode: 400,
                  body: {
                    success: false,
                    message: `Serial number ${serialNumber} is not available in outlet stock for product "${productDoc.productTitle}"`,
                  },
                };
              }
            }
          }
        } else {
          if (approval.approvedQuantity > 0) {
            fromResellerQty = Math.min(
              approval.approvedQuantity,
              resellerAvailable
            );

            const remaining =
              approval.approvedQuantity - fromResellerQty;

            if (remaining > outletAvailable) {
              return {
                statusCode: 400,
                body: {
                  success: false,
                  message:
                    `Insufficient stock for product "${productDoc.productTitle}". ` +
                    `Reseller available: ${resellerAvailable}, Outlet available: ${outletAvailable}, ` +
                    `Total approved: ${approval.approvedQuantity}, Total available: ${
                      resellerAvailable + outletAvailable
                    }`,
                },
              };
            }

            fromOutletQty = remaining;
          }
        }

        if (
          fromResellerQty + fromOutletQty !==
          approval.approvedQuantity
        ) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message:
                `Source breakdown mismatch for product "${productDoc.productTitle}". ` +
                `Expected ${approval.approvedQuantity}, got Reseller: ${fromResellerQty} + Outlet: ${fromOutletQty}`,
            },
          };
        }

        approval.sourceBreakdown = {
          fromReseller: {
            quantity: fromResellerQty,
            serials: fromResellerSerials,
          },
          fromOutlet: {
            quantity: fromOutletQty,
            serials: fromOutletSerials,
          },
          totalApproved: approval.approvedQuantity,
        };
      }

      /*
       * Reserve stock exactly as the legacy controller does:
       *
       * Outlet:
       *   serialized   -> available -> in_transit
       *   nonserialized -> available -= qty, inTransit += qty
       *
       * Reseller:
       *   serialized   -> available -> consumed
       *   nonserialized -> available -= qty, consumed += qty
       *
       * IMPORTANT:
       * Do not continue after the outlet reservation.
       * A single approval can consume stock from BOTH
       * reseller and outlet.
       */
      for (const approval of productApprovals) {
        if (
          approval.approvedQuantity > 0 &&
          approval.sourceBreakdown.fromOutlet.quantity > 0
        ) {
          const outletStock =
            await OutletStockModel.findOne({
              outlet: stockRequest.warehouse,
              product: approval.productId,
            });

          const outletQty =
            approval.sourceBreakdown.fromOutlet.quantity;

          const outletSerials =
            approval.sourceBreakdown.fromOutlet.serials;

          if (!outletStock) {
            return {
              statusCode: 400,
              body: {
                success: false,
                message: `Outlet stock record not found for product ${approval.productId}`,
              },
            };
          }

          if (outletStock.availableQuantity < outletQty) {
            return {
              statusCode: 400,
              body: {
                success: false,
                message: `Outlet stock changed! Available now: ${outletStock.availableQuantity}, Required: ${outletQty}. Please retry.`,
              },
            };
          }

          if (outletSerials.length > 0) {
            for (const serialNumber of outletSerials) {
              const serial = outletStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );

              if (serial && serial.status === "available") {
                serial.status = "in_transit";
                serial.currentLocation =
                  stockRequest.warehouse;

                serial.transferHistory.push({
                  fromCenter: stockRequest.warehouse,
                  toCenter: stockRequest.center,
                  transferDate: new Date(),
                  transferType: "outlet_to_center",
                  status: "in_transit",
                });
              } else {
                return {
                  statusCode: 400,
                  body: {
                    success: false,
                    message: `Serial number ${serialNumber} is no longer available in outlet stock`,
                  },
                };
              }
            }

            outletStock.availableQuantity -=
              outletSerials.length;

            outletStock.inTransitQuantity +=
              outletSerials.length;

            await outletStock.save();
          } else {
            const updateResult =
              await OutletStockModel.updateOne(
                {
                  _id: outletStock._id,
                  availableQuantity: { $gte: outletQty },
                },
                {
                  $inc: {
                    availableQuantity: -outletQty,
                    inTransitQuantity: outletQty,
                  },
                }
              );

            if (updateResult.modifiedCount === 0) {
              return {
                statusCode: 409,
                body: {
                  success: false,
                  message:
                    "Stock changed during approval for product. Please retry.",
                },
              };
            }
          }
        }

        if (
          approval.sourceBreakdown.fromReseller.quantity > 0 &&
          resellerId
        ) {
          const resellerStock =
            await ResellerStockModel.findOne({
              reseller: resellerId,
              product: approval.productId,
            });

          const resellerQty =
            approval.sourceBreakdown.fromReseller.quantity;

          const resellerSerials =
            approval.sourceBreakdown.fromReseller.serials;

          if (!resellerStock) {
            return {
              statusCode: 400,
              body: {
                success: false,
                message: `Reseller stock record not found for product ${approval.productId}`,
              },
            };
          }

          if (
            resellerStock.availableQuantity < resellerQty
          ) {
            return {
              statusCode: 400,
              body: {
                success: false,
                message: `Reseller stock changed! Available now: ${resellerStock.availableQuantity}, Required: ${resellerQty}. Please retry.`,
              },
            };
          }

          if (resellerSerials.length > 0) {
            for (const serialNumber of resellerSerials) {
              const serial =
                resellerStock.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );

              if (
                serial &&
                serial.status === "available"
              ) {
                serial.status = "consumed";
                serial.currentLocation =
                  stockRequest.center;
                serial.consumedDate = new Date();
                serial.consumedBy = userId;

                serial.transferHistory.push({
                  fromCenter: null,
                  toCenter: stockRequest.center,
                  transferDate: new Date(),
                  transferType: "outbound_transfer",
                  remark: "Stock request approval",
                  transferredBy: userId,
                  referenceId: stockRequest._id,
                });
              } else {
                return {
                  statusCode: 400,
                  body: {
                    success: false,
                    message: `Serial number ${serialNumber} is no longer available in reseller stock`,
                  },
                };
              }
            }

            resellerStock.availableQuantity -=
              resellerSerials.length;

            resellerStock.consumedQuantity +=
              resellerSerials.length;

            await resellerStock.save();
          } else {
            const updateResult =
              await ResellerStockModel.updateOne(
                {
                  _id: resellerStock._id,
                  availableQuantity: { $gte: resellerQty },
                },
                {
                  $inc: {
                    availableQuantity: -resellerQty,
                    consumedQuantity: resellerQty,
                  },
                }
              );

            if (updateResult.modifiedCount === 0) {
              return {
                statusCode: 409,
                body: {
                  success: false,
                  message:
                    "Reseller stock changed during approval. Please retry.",
                },
              };
            }
          }
        }
      }
    }

    const updatedProducts = stockRequest.products.map(
      (productItem) => {
        const approval = productApprovals?.find(
          (pa) =>
            pa.productId.toString() ===
            productItem.product.toString()
        );

        if (approval) {
          return {
            ...productItem.toObject(),
            approvedQuantity: approval.approvedQuantity,
            approvedRemark: approval.approvedRemark || "",
            approvedSerials:
              approval.approvedSerials || [],
            sourceBreakdown:
              approval.sourceBreakdown || {
                fromReseller: {
                  quantity: 0,
                  serials: [],
                },
                fromOutlet: {
                  quantity: 0,
                  serials: [],
                },
                totalApproved: 0,
              },
          };
        }

        return productItem;
      }
    );

    stockRequest.products = updatedProducts;

    await stockRequest.save();

    const updatedRequest =
      await stockRequest.approveRequest(
        userId,
        productApprovals
      );

    const populatedRequest =
      await StockRequest.findById(updatedRequest._id)
        .populate(
          "warehouse",
          "_id centerName centerCode centerType"
        )
        .populate(
          "center",
          "_id centerName centerCode centerType"
        )
        .populate(
          "products.product",
          "_id productTitle productCode productImage"
        )
        .populate(
          "approvalInfo.approvedBy",
          "_id fullName email"
        )
        .populate(
          "createdBy",
          "_id fullName email"
        )
        .populate(
          "updatedBy",
          "_id fullName email"
        );

    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Stock request approved successfully",
        data: populatedRequest,
      },
    };
  } catch (error) {
    console.error("Error approving stock request:", error);

    const validationErrors = [
      "Number of serial numbers",
      "Duplicate serial numbers",
      "serial numbers not available",
      "Approved quantity",
      "Serial numbers are required",
      "Serial numbers should not be provided",
      "Approved quantity is required",
      "Approved quantity must be a valid number",
      "Approved quantity cannot be negative",
      "Approval remark is required",
      "No stock available",
      "Insufficient stock",
      "Stock changed",
    ];

    if (
      validationErrors.some((v) =>
        error.message.includes(v)
      )
    ) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: "Validation failed",
          error: error.message,
        },
      };
    }

    if (
      error.code === 11000 &&
      error.keyPattern &&
      error.keyPattern.challanNo
    ) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message:
            "Duplicate challan number generated. Please try again.",
          error: "Challan number conflict",
        },
      };
    }

    return {
      statusCode: 500,
      body: {
        success: false,
        message: "Error approving stock request",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      },
    };
  }
};

export const shipStockRequest = async (user, id, body) => {
  try {
    const { hasAccess, permissions, userCenter } = await checkStockRequestPermissions(user, ["manage_indent"]);
    if (!hasAccess) {
      return {
        statusCode: 403,
        body: { success: false, message: "Access denied. manage_indent permission required." },
      };
    }

    const { shippedDate, expectedDeliveryDate, shipmentDetails, shipmentRemark, documents } = body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return { statusCode: 404, body: { success: false, message: "Stock request not found" } };
    }
    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return {
        statusCode: 403,
        body: { success: false, message: "Access denied. You can only ship stock requests from your own center." },
      };
    }
    const userId = user?.id;
    if (!userId) {
      return { statusCode: 400, body: { success: false, message: "User authentication required" } };
    }

    const shippingDetails = {
      shippedDate: new Date(shippedDate),
      ...(expectedDeliveryDate && { expectedDeliveryDate: new Date(expectedDeliveryDate) }),
      ...(shipmentDetails && { shipmentDetails }),
      ...(shipmentRemark && { shipmentRemark }),
      ...(documents && { documents: Array.isArray(documents) ? documents : [documents] }),
    };

    const updatedRequest = await stockRequest.shipRequest(userId, shippingDetails);

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    return {
      statusCode: 200,
      body: { success: true, message: "Stock request shipped successfully", data: populatedRequest },
    };
  } catch (error) {
    console.error("Error shipping stock request:", error);
    return {
      statusCode: 500,
      body: {
        success: false,
        message: "Error shipping stock request",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      },
    };
  }
};

export const updateShippingInfo = async (user, id, body) => {
  try {
    const { hasAccess, permissions, userCenter } = await checkStockRequestPermissions(user, ["manage_indent"]);
    if (!hasAccess) {
      return {
        statusCode: 403,
        body: { success: false, message: "Access denied. manage_indent permission required." },
      };
    }

    const { shippedDate, expectedDeliveryDate, shipmentDetails, shipmentRemark, documents } = body;
    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return { statusCode: 404, body: { success: false, message: "Stock request not found" } };
    }
    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return {
        statusCode: 403,
        body: { success: false, message: "Access denied. You can only update shipping info for stock requests from your own center." },
      };
    }
    const userId = user?.id;
    if (!userId) {
      return { statusCode: 400, body: { success: false, message: "User authentication required" } };
    }

    const shippingDetails = {
      ...(shippedDate && { shippedDate: new Date(shippedDate) }),
      ...(expectedDeliveryDate && { expectedDeliveryDate: new Date(expectedDeliveryDate) }),
      ...(shipmentDetails && { shipmentDetails }),
      ...(shipmentRemark && { shipmentRemark }),
      ...(documents && { documents: Array.isArray(documents) ? documents : [documents] }),
    };

    const updatedRequest = await stockRequest.updateShippingInfo(shippingDetails);
    updatedRequest.updatedBy = userId;
    await updatedRequest.save();

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email");

    return {
      statusCode: 200,
      body: { success: true, message: "Shipping information updated successfully", data: populatedRequest },
    };
  } catch (error) {
    console.error("Error updating shipping information:", error);
    return {
      statusCode: 500,
      body: {
        success: false,
        message: "Error updating shipping information",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      },
    };
  }
};

export const rejectShipment = async (user, id) => {
  try {
    const { hasAccess, permissions, userCenter } =
      await checkStockRequestPermissions(user, ["manage_indent"]);

    if (!hasAccess) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message: "Access denied. manage_indent permission required.",
        },
      };
    }

    const stockRequest = await StockRequest.findById(id)
      .populate("center", "reseller centerType centerName centerCode")
      .populate("warehouse", "centerType centerName centerCode");

    if (!stockRequest) {
      return {
        statusCode: 404,
        body: {
          success: false,
          message: "Stock request not found",
        },
      };
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message:
            "Access denied. You can only reject shipments for stock requests from your own center.",
        },
      };
    }

    const userId = user?.id;

    if (!userId) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: "User authentication required",
        },
      };
    }

    const ResellerStockModel = mongoose.model("ResellerStock");
    const OutletStockModel = mongoose.model("OutletStock");

    const resellerId =
      stockRequest.center?.reseller?._id ||
      stockRequest.center?.reseller;

    /*
     * Reverse stock reservations created during approval.
     *
     * Outlet:
     *   serialized    -> in_transit -> available
     *   nonserialized -> inTransit -= qty, available += qty
     *
     * Reseller:
     *   serialized    -> consumed -> available
     *   nonserialized -> consumed -= qty, available += qty
     */

    for (const productItem of stockRequest.products) {
      const sourceBreakdown = productItem.sourceBreakdown;

      if (!sourceBreakdown) {
        continue;
      }

      /*
       * ---------------------------------------------------------
       * OUTLET STOCK REVERSAL
       * ---------------------------------------------------------
       */

      const outletQty =
        Number(sourceBreakdown.fromOutlet?.quantity || 0);

      const outletSerials =
        sourceBreakdown.fromOutlet?.serials || [];

      if (outletQty > 0) {
        const outletStock = await OutletStockModel.findOne({
          outlet: stockRequest.warehouse?._id || stockRequest.warehouse,
          product: productItem.product,
        });

        if (!outletStock) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message:
                `Outlet stock record not found for product ${productItem.product}`,
            },
          };
        }

        /*
         * Serialized outlet stock
         */
        if (outletSerials.length > 0) {
          let restoredSerialCount = 0;

          for (const serialNumber of outletSerials) {
            const serial = outletStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber
            );

            if (!serial) {
              return {
                statusCode: 400,
                body: {
                  success: false,
                  message:
                    `Serial number ${serialNumber} not found in outlet stock`,
                },
              };
            }

            /*
             * Only reverse reservations that are still in transit.
             *
             * If a serial has already been transferred during a
             * completion flow, do not silently return it here.
             */
            if (serial.status === "in_transit") {
              serial.status = "available";
              serial.currentLocation =
                stockRequest.warehouse?._id ||
                stockRequest.warehouse;

              restoredSerialCount += 1;
            }
          }

          if (restoredSerialCount > 0) {
            outletStock.availableQuantity =
              Number(outletStock.availableQuantity || 0) +
              restoredSerialCount;

            outletStock.inTransitQuantity = Math.max(
              0,
              Number(outletStock.inTransitQuantity || 0) -
                restoredSerialCount
            );

            await outletStock.save();
          }
        } else {
          /*
           * Non-serialized outlet stock
           */
          const inTransitQuantity = Number(
            outletStock.inTransitQuantity || 0
          );

          if (inTransitQuantity < outletQty) {
            return {
              statusCode: 400,
              body: {
                success: false,
                message:
                  `Insufficient outlet in-transit stock to reverse rejection for product ${productItem.product}. ` +
                  `In transit: ${inTransitQuantity}, required: ${outletQty}`,
              },
            };
          }

          outletStock.availableQuantity =
            Number(outletStock.availableQuantity || 0) +
            outletQty;

          outletStock.inTransitQuantity =
            inTransitQuantity - outletQty;

          await outletStock.save();
        }
      }

      /*
       * ---------------------------------------------------------
       * RESELLER STOCK REVERSAL
       * ---------------------------------------------------------
       */

      const resellerQty =
        Number(sourceBreakdown.fromReseller?.quantity || 0);

      const resellerSerials =
        sourceBreakdown.fromReseller?.serials || [];

      if (resellerQty > 0) {
        if (!resellerId) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message:
                `Reseller information is missing for product ${productItem.product}`,
            },
          };
        }

        const resellerStock = await ResellerStockModel.findOne({
          reseller: resellerId,
          product: productItem.product,
        });

        if (!resellerStock) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message:
                `Reseller stock record not found for product ${productItem.product}`,
            },
          };
        }

        /*
         * Serialized reseller stock
         */
        if (resellerSerials.length > 0) {
          let restoredSerialCount = 0;

          for (const serialNumber of resellerSerials) {
            const serial = resellerStock.serialNumbers.find(
              (sn) => sn.serialNumber === serialNumber
            );

            if (!serial) {
              return {
                statusCode: 400,
                body: {
                  success: false,
                  message:
                    `Serial number ${serialNumber} not found in reseller stock`,
                },
              };
            }

            if (serial.status === "consumed") {
              serial.status = "available";
              serial.currentLocation =
                resellerStock.reseller;

              serial.consumedDate = null;
              serial.consumedBy = null;

              restoredSerialCount += 1;
            }
          }

          if (restoredSerialCount > 0) {
            resellerStock.availableQuantity =
              Number(resellerStock.availableQuantity || 0) +
              restoredSerialCount;

            resellerStock.consumedQuantity = Math.max(
              0,
              Number(resellerStock.consumedQuantity || 0) -
                restoredSerialCount
            );

            await resellerStock.save();
          }
        } else {
          /*
           * Non-serialized reseller stock
           */
          const consumedQuantity = Number(
            resellerStock.consumedQuantity || 0
          );

          if (consumedQuantity < resellerQty) {
            return {
              statusCode: 400,
              body: {
                success: false,
                message:
                  `Insufficient reseller consumed stock to reverse rejection for product ${productItem.product}. ` +
                  `Consumed: ${consumedQuantity}, required: ${resellerQty}`,
              },
            };
          }

          resellerStock.availableQuantity =
            Number(resellerStock.availableQuantity || 0) +
            resellerQty;

          resellerStock.consumedQuantity =
            consumedQuantity - resellerQty;

          await resellerStock.save();
        }
      }
    }

    /*
     * Finally update the StockRequest state.
     * Stock reversal is completed before changing the request
     * to Confirmed.
     */
    const updatedRequest =
      await stockRequest.rejectShipment(userId);

    updatedRequest.updatedBy = userId;

    await updatedRequest.save();

    const populatedRequest =
      await StockRequest.findById(updatedRequest._id)
        .populate(
          "warehouse",
          "_id centerName centerCode centerType"
        )
        .populate(
          "center",
          "_id centerName centerCode"
        )
        .populate(
          "products.product",
          "_id productTitle productCode productImage"
        )
        .populate(
          "shippingInfo.shipmentRejected.rejectedBy",
          "_id fullName email"
        )
        .populate(
          "updatedBy",
          "_id fullName email"
        )
        .populate(
          "createdBy",
          "_id fullName email"
        );

    return {
      statusCode: 200,
      body: {
        success: true,
        message:
          "Shipment rejected successfully. Shipping details cleared and status reverted to Confirmed.",
        data: populatedRequest,
      },
    };
  } catch (error) {
    console.error("Error rejecting shipment:", error);

    return {
      statusCode: 500,
      body: {
        success: false,
        message: "Error rejecting shipment",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      },
    };
  }
};

export const markAsIncomplete = async (req, res) => {
  console.log("[MARK-INCOMPLETE DEBUG]", {
    reqParams: req.params,
    reqBody: req.body,
    reqType: typeof req,
    resType: typeof res,
  });

  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["manage_indent"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent permission required.",
      });
    }

    const { id } = req.params;
    const { incompleteRemark, receivedProducts } = req.body;

    const stockRequest = await StockRequest.findById(id)
      .populate("center", "reseller");

    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only mark stock requests from your own center as incomplete.",
      });
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const ResellerStock = mongoose.model("ResellerStock");
    const OutletStock = mongoose.model("OutletStock");
    const Product = mongoose.model("Product");

    const resellerId = stockRequest.center?.reseller?._id;

    if (receivedProducts && Array.isArray(receivedProducts)) {
      for (const receivedProduct of receivedProducts) {
        const productItem = stockRequest.products.find(
          (p) =>
            p.product.toString() === receivedProduct.productId.toString()
        );

        if (!productItem) {
          return res.status(400).json({
            success: false,
            message: `Product ${receivedProduct.productId} not found in stock request`,
          });
        }

        const approvedQuantity = productItem.approvedQuantity || 0;
        const receivedQuantity = receivedProduct.receivedQuantity || 0;
        const quantityToRestore = approvedQuantity - receivedQuantity;

        console.log(`[DEBUG] Product ${receivedProduct.productId}:`);
        console.log(`[DEBUG]   Approved: ${approvedQuantity}`);
        console.log(`[DEBUG]   Received: ${receivedQuantity}`);
        console.log(`[DEBUG]   To Restore: ${quantityToRestore}`);

        if (quantityToRestore > 0) {
          const productDoc = await Product.findById(
            receivedProduct.productId
          );

          const tracksSerialNumbers =
            productDoc?.trackSerialNumber === "Yes";

          const sourceBreakdown = productItem.sourceBreakdown || {
            fromReseller: { quantity: 0, serials: [] },
            fromOutlet: { quantity: 0, serials: [] },
          };

          const resellerQuantity =
            sourceBreakdown.fromReseller.quantity || 0;

          if (resellerQuantity > 0 && resellerId) {
            const resellerRestoreQuantity = Math.min(
              quantityToRestore,
              resellerQuantity
            );

            if (resellerRestoreQuantity > 0) {
              const resellerStock = await ResellerStock.findOne({
                reseller: resellerId,
                product: receivedProduct.productId,
              });

              if (resellerStock) {
                if (
                  tracksSerialNumbers &&
                  sourceBreakdown.fromReseller.serials
                ) {
                  const serialsToRestore =
                    sourceBreakdown.fromReseller.serials.slice(
                      receivedQuantity,
                      receivedQuantity + resellerRestoreQuantity
                    );

                  for (const serialNumber of serialsToRestore) {
                    const serial = resellerStock.serialNumbers.find(
                      (sn) => sn.serialNumber === serialNumber
                    );

                    if (serial && serial.status === "consumed") {
                      serial.status = "available";
                      serial.consumedDate = null;
                      serial.consumedBy = null;
                      serial.currentLocation = null;

                      serial.transferHistory =
                        serial.transferHistory.filter(
                          (th) =>
                            th.referenceId?.toString() !==
                            stockRequest._id.toString()
                        );

                      console.log(
                        `[DEBUG] Restored reseller serial ${serialNumber}`
                      );
                    }
                  }

                  resellerStock.availableQuantity +=
                    serialsToRestore.length;

                  resellerStock.consumedQuantity -=
                    serialsToRestore.length;
                } else {
                  resellerStock.availableQuantity +=
                    resellerRestoreQuantity;

                  resellerStock.consumedQuantity -=
                    resellerRestoreQuantity;
                }

                await resellerStock.save();

                console.log(
                  `[DEBUG] Restored ${resellerRestoreQuantity} units to reseller stock`
                );
              }
            }
          }

          const outletQuantity =
            sourceBreakdown.fromOutlet.quantity || 0;

          const outletRestoreQuantity = Math.min(
            quantityToRestore,
            outletQuantity
          );

          if (outletRestoreQuantity > 0) {
            const outletStock = await OutletStock.findOne({
              outlet: stockRequest.warehouse,
              product: receivedProduct.productId,
            });

            if (outletStock) {
              if (
                tracksSerialNumbers &&
                sourceBreakdown.fromOutlet.serials
              ) {
                const serialsToRestore =
                  sourceBreakdown.fromOutlet.serials.slice(
                    receivedQuantity,
                    receivedQuantity + outletRestoreQuantity
                  );

                for (const serialNumber of serialsToRestore) {
                  const serial = outletStock.serialNumbers.find(
                    (sn) => sn.serialNumber === serialNumber
                  );

                  if (serial && serial.status === "in_transit") {
                    serial.status = "available";
                    serial.currentLocation = stockRequest.warehouse;

                    if (serial.transferHistory.length > 0) {
                      const lastTransfer =
                        serial.transferHistory[
                          serial.transferHistory.length - 1
                        ];

                      if (lastTransfer.status === "in_transit") {
                        serial.transferHistory.pop();
                      }
                    }

                    console.log(
                      `[DEBUG] Restored outlet serial ${serialNumber}`
                    );
                  }
                }

                outletStock.availableQuantity +=
                  serialsToRestore.length;

                outletStock.inTransitQuantity -=
                  serialsToRestore.length;
              } else {
                // FIX:
                // For non-serialized stock, completion already reduced
                // inTransitQuantity back to 0. Therefore, only restore
                // availableQuantity here.
                outletStock.availableQuantity +=
                  outletRestoreQuantity;
              }

              await outletStock.save();

              console.log(
                `[DEBUG] Restored ${outletRestoreQuantity} units to outlet stock`
              );
            }
          }
        }
      }
    }

    if (receivedProducts && Array.isArray(receivedProducts)) {
      stockRequest.products = stockRequest.products.map(
        (productItem) => {
          const receivedProduct = receivedProducts.find(
            (rp) =>
              rp.productId.toString() ===
              productItem.product.toString()
          );

          if (receivedProduct) {
            return {
              ...productItem.toObject(),
              receivedQuantity:
                receivedProduct.receivedQuantity || 0,
              receivedRemark:
                receivedProduct.receivedRemark || "",
              receivedSerials:
                receivedProduct.receivedSerials || [],
            };
          }

          return productItem;
        }
      );
    }

    const currentDate = new Date();

    stockRequest.status = "Incompleted";
    stockRequest.updatedBy = userId;

    stockRequest.incompleteInfo = {
      incompleteOn: currentDate,
      incompleteBy: userId,
      incompleteRemark: incompleteRemark || "",
      incompleteReceipts: receivedProducts
        ? receivedProducts.map((rp) => ({
            productId: rp.productId,
            receivedQuantity: rp.receivedQuantity,
            receivedRemark: rp.receivedRemark || "",
            receivedSerials: rp.receivedSerials || [],
          }))
        : [],
    };

    stockRequest.completionInfo = {
      completedOn: undefined,
      completedBy: undefined,
    };

    const updatedRequest = await stockRequest.save();

    const populatedRequest = await StockRequest.findById(
      updatedRequest._id
    )
      .populate(
        "warehouse",
        "_id centerName centerCode centerType"
      )
      .populate("center", "_id centerName centerCode")
      .populate(
        "products.product",
        "_id productTitle productCode productImage"
      )
      .populate(
        "incompleteInfo.incompleteBy",
        "_id fullName email"
      )
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message:
        "Stock request marked as incomplete successfully. Reseller stock restored for unreceived quantities.",
      data: populatedRequest,
    });
  } catch (error) {
    console.error(
      "Error marking stock request as incomplete:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Error marking stock request as incomplete",
      error: error.message,
    });
  }
};

export const completeIncompleteRequest = async (user, id, body) => {
  try {
    const { hasAccess, permissions, userCenter } =
      await checkStockRequestPermissions(user, ["manage_indent"]);

    if (!hasAccess) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message: "Access denied. manage_indent permission required.",
        },
      };
    }

    const { productApprovals, productReceipts } = body;

    console.log(
      "\n🔥🔥🔥 ========== COMPLETE INCOMPLETE REQUEST ========== 🔥🔥🔥"
    );
    console.log(`📅 Time: ${new Date().toISOString()}`);
    console.log(`🆔 Request ID: ${id}`);
    console.log(
      `📦 productApprovals:`,
      JSON.stringify(productApprovals, null, 2)
    );
    console.log(
      "🔥🔥🔥 ===================================================== 🔥🔥🔥\n"
    );

    const stockRequest = await StockRequest.findById(id)
      .populate("center", "reseller")
      .populate("warehouse", "_id");

    if (!stockRequest) {
      return {
        statusCode: 404,
        body: {
          success: false,
          message: "Stock request not found",
        },
      };
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message: "Access denied",
        },
      };
    }

    if (stockRequest.status !== "Incompleted") {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: "Only incomplete stock requests can be completed",
        },
      };
    }

    const userId = user?.id;

    if (!userId) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: "User authentication required",
        },
      };
    }

    if (!productApprovals || productApprovals.length === 0) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: "Product approvals are required",
        },
      };
    }

    const ProductModel = mongoose.model("Product");
    const ResellerStockModel = mongoose.model("ResellerStock");
    const OutletStockModel = mongoose.model("OutletStock");
    const CenterStockModel = mongoose.model("CenterStock");

    const resellerId = stockRequest.center?.reseller?._id;

    // ---------------------------------------------------------
    // VALIDATE PRODUCT APPROVALS
    // ---------------------------------------------------------

    for (const approval of productApprovals) {
      const productItem = stockRequest.products.find(
        (p) =>
          p.product.toString() === approval.productId.toString()
      );

      if (!productItem) {
        return {
          statusCode: 400,
          body: {
            success: false,
            message: `Product ${approval.productId} not found in stock request`,
          },
        };
      }

      const sourceTotal =
        (productItem.sourceBreakdown?.fromReseller?.quantity || 0) +
        (productItem.sourceBreakdown?.fromOutlet?.quantity || 0);

      if (approval.approvedQuantity > sourceTotal) {
        console.log(
          `❌ VALIDATION FAILED: Product ${approval.productId}`
        );

        console.log(
          `   Requested: ${approval.approvedQuantity}`
        );

        console.log(
          `   Available in source breakdown: ${sourceTotal}`
        );

        return {
          statusCode: 400,
          body: {
            success: false,
            message:
              `Cannot approve ${approval.approvedQuantity} units. ` +
              `Only ${sourceTotal} units were originally approved.`,
            requested: approval.approvedQuantity,
            maxAllowed: sourceTotal,
            productId: approval.productId,
          },
        };
      }

      console.log(
        `✅ VALIDATION PASSED: Product ${approval.productId}`
      );
    }

    // ---------------------------------------------------------
    // PROCESS PRODUCTS
    // ---------------------------------------------------------

    for (const approval of productApprovals) {
      const productId = approval.productId;

      // IMPORTANT:
      // In this incomplete-completion API,
      // approvedQuantity means the NEW / REMAINING quantity
      // that needs to be transferred.
      const newApprovedQuantity =
        approval.approvedQuantity;

      const approvedRemark =
        approval.approvedRemark || "";

      const approvedSerials =
        approval.approvedSerials || [];

      console.log(
        `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      );

      console.log(
        `📦 PROCESSING PRODUCT: ${productId}`
      );

      console.log(
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      );

      const productItem = stockRequest.products.find(
        (p) =>
          p.product.toString() === productId.toString()
      );

      if (!productItem) {
        console.log(
          `❌ Product not found, skipping`
        );
        continue;
      }

      const currentApprovedQuantity =
        productItem.approvedQuantity || 0;

      const productDoc =
        await ProductModel.findById(productId);

      if (!productDoc) {
        console.log(
          `❌ Product document not found`
        );
        continue;
      }

      const tracksSerialNumbers =
        productDoc.trackSerialNumber === "Yes";

      const sourceBreakdown =
        productItem.sourceBreakdown || {
          fromReseller: {
            quantity: 0,
            serials: [],
          },
          fromOutlet: {
            quantity: 0,
            serials: [],
          },
          totalApproved:
            currentApprovedQuantity,
        };

      console.log(
        `💰 Original Source - Reseller: ${sourceBreakdown.fromReseller?.quantity || 0}, Outlet: ${sourceBreakdown.fromOutlet?.quantity || 0}`
      );

      // ---------------------------------------------------------
      // FIND PREVIOUSLY RECEIVED QUANTITY / SERIALS
      // ---------------------------------------------------------

      const incompleteReceipts =
        stockRequest.incompleteInfo
          ?.incompleteReceipts || [];

      const previousReceipt =
        incompleteReceipts.find(
          (receipt) =>
            receipt.productId?.toString() ===
            productId.toString()
        );

      const previouslyReceivedQuantity =
        previousReceipt?.receivedQuantity || 0;

      const previouslyReceivedSerials =
        previousReceipt?.receivedSerials || [];

      console.log(
        `📥 Previously Received Quantity: ${previouslyReceivedQuantity}`
      );

      console.log(
        `📥 Previously Received Serials:`,
        previouslyReceivedSerials
      );

      // ---------------------------------------------------------
      // REMAINING QUANTITY
      // ---------------------------------------------------------

      // approvedQuantity represents the remaining quantity
      // being completed now.
      const remainingQuantity =
        newApprovedQuantity;

      console.log(
        `📊 New Approved Quantity: ${newApprovedQuantity}`
      );

      console.log(
        `📊 Remaining Quantity To Transfer: ${remainingQuantity}`
      );

      // ---------------------------------------------------------
      // CALCULATE REMAINING SOURCE DISTRIBUTION
      // ---------------------------------------------------------

      let fromResellerTransfer = 0;
      let fromOutletTransfer = 0;

      let remainingResellerSerials = [];
      let remainingOutletSerials = [];

      if (tracksSerialNumbers) {
        const resellerSerials =
          sourceBreakdown.fromReseller
            ?.serials || [];

        const outletSerials =
          sourceBreakdown.fromOutlet
            ?.serials || [];

        // Remove serials which were already received
        // during the incomplete workflow.
        remainingResellerSerials =
          resellerSerials.filter(
            (serialNumber) =>
              !previouslyReceivedSerials.includes(
                serialNumber
              )
          );

        remainingOutletSerials =
          outletSerials.filter(
            (serialNumber) =>
              !previouslyReceivedSerials.includes(
                serialNumber
              )
          );

        fromResellerTransfer =
          remainingResellerSerials.length;

        fromOutletTransfer =
          remainingOutletSerials.length;

        console.log(
          `📊 Remaining Reseller Serials:`,
          remainingResellerSerials
        );

        console.log(
          `📊 Remaining Outlet Serials:`,
          remainingOutletSerials
        );
      } else {
        // -------------------------------------------------------
        // NON-SERIALIZED SOURCE DISTRIBUTION
        // -------------------------------------------------------

        const originalResellerQuantity =
          sourceBreakdown.fromReseller
            ?.quantity || 0;

        const originalOutletQuantity =
          sourceBreakdown.fromOutlet
            ?.quantity || 0;

        const originalSourceTotal =
          originalResellerQuantity +
          originalOutletQuantity;

        if (originalSourceTotal > 0) {
          const resellerRatio =
            originalResellerQuantity /
            originalSourceTotal;

          fromResellerTransfer =
            Math.min(
              originalResellerQuantity,
              Math.floor(
                remainingQuantity *
                  resellerRatio
              )
            );

          fromOutletTransfer =
            remainingQuantity -
            fromResellerTransfer;

          if (
            fromOutletTransfer >
            originalOutletQuantity
          ) {
            fromOutletTransfer =
              originalOutletQuantity;

            fromResellerTransfer =
              remainingQuantity -
              fromOutletTransfer;
          }

          if (
            fromResellerTransfer >
            originalResellerQuantity
          ) {
            fromResellerTransfer =
              originalResellerQuantity;

            fromOutletTransfer =
              remainingQuantity -
              fromResellerTransfer;
          }
        }
      }

      console.log(
        `📊 FINAL DISTRIBUTION - Reseller: ${fromResellerTransfer}, Outlet: ${fromOutletTransfer}`
      );

      const calculatedSourceTotal =
        fromResellerTransfer +
        fromOutletTransfer;

      if (
        calculatedSourceTotal !==
        remainingQuantity
      ) {
        return {
          statusCode: 400,
          body: {
            success: false,
            message:
              `Unable to distribute remaining quantity for product ${productDoc.productTitle}. ` +
              `Remaining: ${remainingQuantity}, ` +
              `Reseller: ${fromResellerTransfer}, ` +
              `Outlet: ${fromOutletTransfer}`,
          },
        };
      }

      // ---------------------------------------------------------
      // RESELLER STOCK
      // ---------------------------------------------------------

      if (
        fromResellerTransfer > 0 &&
        resellerId
      ) {
        console.log(
          `\n🟣 RESELLER STOCK UPDATE`
        );

        const resellerStock =
          await ResellerStockModel.findOne({
            reseller: resellerId,
            product: productId,
          });

        if (!resellerStock) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message:
                `Reseller stock not found for product ${productDoc.productTitle}`,
            },
          };
        }

        console.log(
          `   BEFORE - Available: ${resellerStock.availableQuantity}, Consumed: ${resellerStock.consumedQuantity}`
        );

        if (tracksSerialNumbers) {
          for (
            const serialNumber of
            remainingResellerSerials
          ) {
            const serial =
              resellerStock.serialNumbers.find(
                (sn) =>
                  sn.serialNumber ===
                  serialNumber
              );

            if (!serial) {
              return {
                statusCode: 400,
                body: {
                  success: false,
                  message:
                    `Reseller serial ${serialNumber} not found in reseller stock`,
                },
              };
            }

            if (
              serial.status !== "available"
            ) {
              return {
                statusCode: 400,
                body: {
                  success: false,
                  message:
                    `Reseller serial ${serialNumber} is not available. Current status: ${serial.status}`,
                },
              };
            }

            serial.status =
              "consumed";

            serial.consumedDate =
              new Date();

            serial.consumedBy =
              userId;

            serial.currentLocation =
              stockRequest.center;

            if (
              !serial.transferHistory
            ) {
              serial.transferHistory =
                [];
            }

            serial.transferHistory.push({
              fromCenter: null,
              toCenter:
                stockRequest.center,
              transferDate:
                new Date(),
              transferType:
                "outbound_transfer",
              remark:
                "Incomplete request completion",
              transferredBy:
                userId,
              referenceId:
                stockRequest._id,
            });

            console.log(
              `     ✅ Serial ${serialNumber} consumed from RESELLER`
            );
          }
        }

        if (
          resellerStock.availableQuantity <
          fromResellerTransfer
        ) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message:
                `Insufficient reseller available stock. ` +
                `Available: ${resellerStock.availableQuantity}, ` +
                `Required: ${fromResellerTransfer}`,
            },
          };
        }

        resellerStock.availableQuantity -=
          fromResellerTransfer;

        resellerStock.consumedQuantity +=
          fromResellerTransfer;

        await resellerStock.save();

        console.log(
          `   AFTER - Available: ${resellerStock.availableQuantity}, Consumed: ${resellerStock.consumedQuantity}`
        );
      }

      // ---------------------------------------------------------
      // OUTLET STOCK
      // ---------------------------------------------------------

      if (
        fromOutletTransfer > 0
      ) {
        console.log(
          `\n🟠 OUTLET STOCK UPDATE`
        );

        const outletStock =
          await OutletStockModel.findOne({
            outlet:
              stockRequest.warehouse,
            product: productId,
          });

        if (!outletStock) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message:
                `Outlet stock not found for product ${productDoc.productTitle}`,
            },
          };
        }

        console.log(
          `   BEFORE - Available: ${outletStock.availableQuantity}, InTransit: ${outletStock.inTransitQuantity}, Total: ${outletStock.totalQuantity}`
        );

        // -------------------------------------------------------
        // SERIALIZED OUTLET STOCK
        // -------------------------------------------------------

        if (tracksSerialNumbers) {
          for (
            const serialNumber of
            remainingOutletSerials
          ) {
            const serial =
              outletStock.serialNumbers.find(
                (sn) =>
                  sn.serialNumber ===
                  serialNumber
              );

            if (!serial) {
              return {
                statusCode: 400,
                body: {
                  success: false,
                  message:
                    `Outlet serial ${serialNumber} not found in outlet stock`,
                },
              };
            }

            // A remaining serial can be:
            // available OR already reserved as in_transit.
            if (
              serial.status !==
                "available" &&
              serial.status !==
                "in_transit"
            ) {
              return {
                statusCode: 400,
                body: {
                  success: false,
                  message:
                    `Outlet serial ${serialNumber} is not available for transfer. Current status: ${serial.status}`,
                },
              };
            }

            const previousStatus =
              serial.status;

            serial.status =
              "transferred";

            serial.currentLocation =
              stockRequest.center;

            serial.transferredDate =
              new Date();

            if (
              !serial.transferHistory
            ) {
              serial.transferHistory =
                [];
            }

            serial.transferHistory.push({
              fromCenter:
                stockRequest.warehouse,
              toCenter:
                stockRequest.center,
              transferDate:
                new Date(),
              transferType:
                "outlet_to_center",
              status:
                "completed",
              remark:
                "Incomplete request completion - final transfer",
              transferredBy:
                userId,
              referenceId:
                stockRequest._id,
            });

            if (
              previousStatus ===
              "in_transit"
            ) {
              outletStock.inTransitQuantity =
                Math.max(
                  0,
                  outletStock.inTransitQuantity -
                    1
                );
            } else if (
              previousStatus ===
              "available"
            ) {
              outletStock.availableQuantity =
                Math.max(
                  0,
                  outletStock.availableQuantity -
                    1
                );
            }

            outletStock.totalQuantity =
              Math.max(
                0,
                outletStock.totalQuantity -
                  1
              );

            console.log(
              `     ✅ Serial ${serialNumber}: ${previousStatus} → transferred`
            );
          }
        } else {
          // -----------------------------------------------------
          // NON-SERIALIZED OUTLET STOCK
          // -----------------------------------------------------

          if (
            outletStock.availableQuantity <
            fromOutletTransfer
          ) {
            return {
              statusCode: 400,
              body: {
                success: false,
                message:
                  `Insufficient outlet available stock. ` +
                  `Available: ${outletStock.availableQuantity}, ` +
                  `Required: ${fromOutletTransfer}`,
              },
            };
          }

          outletStock.availableQuantity -=
            fromOutletTransfer;

          outletStock.totalQuantity -=
            fromOutletTransfer;
        }

        await outletStock.save();

        console.log(
          `   AFTER - Available: ${outletStock.availableQuantity}, InTransit: ${outletStock.inTransitQuantity}, Total: ${outletStock.totalQuantity}`
        );
      }

      // ---------------------------------------------------------
      // CENTER STOCK
      // ---------------------------------------------------------

      if (
        remainingQuantity > 0
      ) {
        console.log(
          `\n🟢 CENTER STOCK UPDATE`
        );

        let centerStock =
          await CenterStockModel.findOne({
            center:
              stockRequest.center,
            product: productId,
          });

        if (!centerStock) {
          centerStock =
            new CenterStockModel({
              center:
                stockRequest.center,
              product: productId,
              totalQuantity: 0,
              availableQuantity: 0,
              inTransitQuantity: 0,
              consumedQuantity: 0,
              serialNumbers: [],
            });

          console.log(
            `   📍 Created new center stock`
          );
        }

        console.log(
          `   BEFORE - Total: ${centerStock.totalQuantity}, Available: ${centerStock.availableQuantity}`
        );

        if (
          tracksSerialNumbers
        ) {
          const serialsToAdd = [
            ...remainingResellerSerials,
            ...remainingOutletSerials,
          ];

          for (
            const serialNumber of
            serialsToAdd
          ) {
            const exists =
              centerStock.serialNumbers.some(
                (sn) =>
                  sn.serialNumber ===
                  serialNumber
              );

            if (!exists) {
              centerStock.serialNumbers.push({
                serialNumber:
                  serialNumber,

                purchaseId:
                  new mongoose.Types.ObjectId(),

                originalOutlet:
                  stockRequest.warehouse,

                status:
                  "available",

                currentLocation:
                  stockRequest.center,

                transferHistory: [
                  {
                    fromCenter:
                      stockRequest.warehouse,

                    toCenter:
                      stockRequest.center,

                    transferDate:
                      new Date(),

                    transferType:
                      "inbound_transfer",

                    remark:
                      "Incomplete request completion",

                    referenceId:
                      stockRequest._id,

                    transferredBy:
                      userId,
                  },
                ],
              });

              centerStock.totalQuantity +=
                1;

              centerStock.availableQuantity +=
                1;

              console.log(
                `     ✅ Added serial ${serialNumber} to CENTER`
              );
            }
          }
        } else {
          centerStock.totalQuantity +=
            remainingQuantity;

          centerStock.availableQuantity +=
            remainingQuantity;

          console.log(
            `     ✅ Added ${remainingQuantity} units to CENTER`
          );
        }

        await centerStock.save();

        console.log(
          `   AFTER - Total: ${centerStock.totalQuantity}, Available: ${centerStock.availableQuantity}`
        );
      }

      // ---------------------------------------------------------
      // UPDATE PRODUCT
      // ---------------------------------------------------------

      productItem.approvedQuantity =
        newApprovedQuantity;

      productItem.approvedRemark =
        approvedRemark;

      if (
        tracksSerialNumbers
      ) {
        productItem.approvedSerials =
          approvedSerials;
      }

      productItem.receivedQuantity =
        previouslyReceivedQuantity +
        remainingQuantity;

      console.log(
        `✅ Product ${productDoc.productTitle} completed!`
      );
    }

    // ---------------------------------------------------------
    // COMPLETE REQUEST
    // ---------------------------------------------------------

    stockRequest.status =
      "Completed";

    stockRequest.receivingInfo = {
      receivedAt:
        new Date(),

      receivedBy:
        userId,

      receivedRemark:
        "Completed from incomplete request",
    };

    stockRequest.completionInfo = {
      completedOn:
        new Date(),

      completedBy:
        userId,
    };

    stockRequest.updatedBy =
      userId;

    const updatedRequest =
      await stockRequest.save();

    const populatedRequest =
      await StockRequest.findById(
        updatedRequest._id
      )
        .populate(
          "warehouse",
          "_id centerName centerCode centerType"
        )
        .populate(
          "center",
          "_id centerName centerCode centerType"
        )
        .populate(
          "products.product",
          "_id productTitle productCode productImage"
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
          "approvalInfo.approvedBy",
          "_id fullName email"
        )
        .populate(
          "receivingInfo.receivedBy",
          "_id fullName email"
        )
        .populate(
          "completionInfo.completedBy",
          "_id fullName email"
        );

    console.log(
      "\n✅✅✅ INCOMPLETE REQUEST COMPLETED SUCCESSFULLY! ✅✅✅\n"
    );

    return {
      statusCode: 200,
      body: {
        success: true,
        message:
          "Incomplete stock request completed successfully",
        data: populatedRequest,
      },
    };
  } catch (error) {
    console.error(
      "\n🔴 ERROR:",
      error.message
    );

    return {
      statusCode: 500,
      body: {
        success: false,
        message:
          "Error completing incomplete stock request",
        error: error.message,
      },
    };
  }
};

export const completeStockRequest = async (user, requestId, body) => {
  try {
    const { productReceipts } = body;

    if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: "Invalid stock request ID",
        },
      };
    }

    if (!Array.isArray(productReceipts) || productReceipts.length === 0) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: "Product receipts are required",
        },
      };
    }

    const stockRequest = await StockRequest.findById(requestId);

    if (!stockRequest) {
      return {
        statusCode: 404,
        body: {
          success: false,
          message: "Stock request not found",
        },
      };
    }

    if (!["Shipped", "Incompleted"].includes(stockRequest.status)) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: `Stock request cannot be completed from ${stockRequest.status} status`,
        },
      };
    }

    const centerId = stockRequest.center;
    const warehouseId = stockRequest.warehouse;

    if (!centerId || !warehouseId) {
      return {
        statusCode: 400,
        body: {
          success: false,
          message: "Stock request center or warehouse is missing",
        },
      };
    }

    const CenterStock = mongoose.model("CenterStock");
    const OutletStock = mongoose.model("OutletStock");
    const ResellerStock = mongoose.model("ResellerStock");
    const Product = mongoose.model("Product");

    const completedReceipts = [];

    for (const receipt of productReceipts) {
      const {
        productId,
        receivedQuantity,
        receivedSerials = [],
        receivedRemark,
      } = receipt;

      if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
        return {
          statusCode: 400,
          body: {
            success: false,
            message: "Invalid product ID in product receipt",
          },
        };
      }

      const productItem = stockRequest.products.find(
        (item) => item.product.toString() === productId.toString()
      );

      if (!productItem) {
        return {
          statusCode: 400,
          body: {
            success: false,
            message: `Product ${productId} does not belong to this stock request`,
          },
        };
      }

      const receivedQty = Number(receivedQuantity);

      if (!Number.isInteger(receivedQty) || receivedQty < 0) {
        return {
          statusCode: 400,
          body: {
            success: false,
            message: `Invalid received quantity for product ${productId}`,
          },
        };
      }

      const approvedQuantity = Number(productItem.approvedQuantity || 0);

      const alreadyReceivedQuantity = Number(
        productItem.receivedQuantity || 0
      );

      const remainingApprovedQuantity =
        approvedQuantity - alreadyReceivedQuantity;

      if (receivedQty > remainingApprovedQuantity) {
        return {
          statusCode: 400,
          body: {
            success: false,
            message: `Received quantity for product ${productId} cannot exceed remaining approved quantity`,
          },
        };
      }

      const product = await Product.findById(productId);

      if (!product) {
        return {
          statusCode: 404,
          body: {
            success: false,
            message: `Product ${productId} not found`,
          },
        };
      }

      const isSerialized =
        product.serialNumberTracking === true ||
        product.isSerialNumberTracked === true ||
        product.trackSerialNumber === true ||
        product.trackSerialNumber === "Yes";

      if (isSerialized) {
        if (!Array.isArray(receivedSerials)) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message: `Received serial numbers must be an array for product ${productId}`,
            },
          };
        }

        if (receivedSerials.length !== receivedQty) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message: `Received serial count must match received quantity for product ${productId}`,
            },
          };
        }

        const uniqueSerials = new Set(receivedSerials);

        if (uniqueSerials.size !== receivedSerials.length) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message: `Duplicate serial numbers found for product ${productId}`,
            },
          };
        }
      }

      const sourceBreakdown = productItem.sourceBreakdown || {};

      const fromReseller = sourceBreakdown.fromReseller || {};
      const fromOutlet = sourceBreakdown.fromOutlet || {};

      const resellerQuantity = Number(fromReseller.quantity || 0);
      const outletQuantity = Number(fromOutlet.quantity || 0);

      const resellerSerials = Array.isArray(fromReseller.serials)
        ? fromReseller.serials
        : [];

      const outletSerials = Array.isArray(fromOutlet.serials)
        ? fromOutlet.serials
        : [];

      let remainingToTransfer = receivedQty;

      let resellerStock = null;
      let outletStock = null;

      /*
       * ============================================================
       * RESELLER STOCK
       * ============================================================
       */

      if (remainingToTransfer > 0 && resellerQuantity > 0) {
        const resellerTransferQuantity = Math.min(
          remainingToTransfer,
          resellerQuantity
        );

        /*
         * For serialized reseller stock, the reseller itself is not
         * stored directly in the stock request.
         *
         * The approved serial identifies the correct ResellerStock.
         *
         * For non-serialized stock, preserve the existing warehouse
         * based lookup.
         */
        if (isSerialized && resellerSerials.length > 0) {
          resellerStock = await ResellerStock.findOne({
            product: productId,
            "serialNumbers.serialNumber": {
              $in: resellerSerials,
            },
          });
        } else {
          resellerStock = await ResellerStock.findOne({
            product: productId,
            reseller: warehouseId,
          });
        }

        if (!resellerStock) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message: `Reseller stock not found for product ${productId}`,
            },
          };
        }

        if (isSerialized) {
          const resellerSerialsToTransfer = receivedSerials.filter(
            (serial) => resellerSerials.includes(serial)
          );

          if (
            resellerSerialsToTransfer.length >
            resellerTransferQuantity
          ) {
            return {
              statusCode: 400,
              body: {
                success: false,
                message: `Invalid reseller serial allocation for product ${productId}`,
              },
            };
          }

          for (const serial of resellerSerialsToTransfer) {
            const serialEntry = resellerStock.serialNumbers.find(
              (item) => item.serialNumber === serial
            );

            if (!serialEntry) {
              return {
                statusCode: 400,
                body: {
                  success: false,
                  message: `Serial ${serial} not found in reseller stock`,
                },
              };
            }

            /*
             * Approval already reserves reseller serialized stock:
             *
             * availableQuantity -= 1
             * consumedQuantity += 1
             * serial.status = consumed
             *
             * Therefore completion accepts both available and consumed
             * states and does not change the quantity counters again.
             */
            if (
              serialEntry.status !== "available" &&
              serialEntry.status !== "consumed"
            ) {
              return {
                statusCode: 400,
                body: {
                  success: false,
                  message: `Serial ${serial} is not available in reseller stock. Current status: ${serialEntry.status}`,
                },
              };
            }

            serialEntry.status = "consumed";
            serialEntry.currentLocation = centerId;

            if (!serialEntry.consumedDate) {
              serialEntry.consumedDate = new Date();
            }

            if (!serialEntry.consumedBy) {
              serialEntry.consumedBy = user?.id || null;
            }
          }

          await resellerStock.save();

          remainingToTransfer -= resellerSerialsToTransfer.length;
        } else {
          if (
            Number(resellerStock.availableQuantity || 0) <
            resellerTransferQuantity
          ) {
            return {
              statusCode: 400,
              body: {
                success: false,
                message: `Insufficient reseller stock for product ${productId}`,
              },
            };
          }

          resellerStock.availableQuantity =
            Number(resellerStock.availableQuantity || 0) -
            resellerTransferQuantity;

          resellerStock.consumedQuantity =
            Number(resellerStock.consumedQuantity || 0) +
            resellerTransferQuantity;

          await resellerStock.save();

          remainingToTransfer -= resellerTransferQuantity;
        }
      }

      /*
       * ============================================================
       * OUTLET STOCK
       * ============================================================
       */

      if (remainingToTransfer > 0 && outletQuantity > 0) {
        const outletTransferQuantity = Math.min(
          remainingToTransfer,
          outletQuantity
        );

        outletStock = await OutletStock.findOne({
          outlet: warehouseId,
          product: productId,
        });

        if (!outletStock) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message: `Outlet stock not found for product ${productId}`,
            },
          };
        }

        if (isSerialized) {
          const outletSerialsToTransfer = receivedSerials.filter(
            (serial) => outletSerials.includes(serial)
          );

          if (
            outletSerialsToTransfer.length >
            outletTransferQuantity
          ) {
            return {
              statusCode: 400,
              body: {
                success: false,
                message: `Invalid outlet serial allocation for product ${productId}`,
              },
            };
          }

          for (const serial of outletSerialsToTransfer) {
            const serialEntry = outletStock.serialNumbers.find(
              (item) => item.serialNumber === serial
            );

            if (!serialEntry) {
              return {
                statusCode: 400,
                body: {
                  success: false,
                  message: `Serial ${serial} not found in outlet stock`,
                },
              };
            }

            const previousStatus = serialEntry.status;

            if (
              !["available", "in_transit"].includes(previousStatus)
            ) {
              return {
                statusCode: 400,
                body: {
                  success: false,
                  message: `Serial ${serial} is not available for transfer. Current status: ${previousStatus}`,
                },
              };
            }

            /*
             * If approval did not reserve the serial, reduce available
             * quantity here.
             *
             * If already in_transit, approval already reduced available.
             */
            if (previousStatus === "available") {
              outletStock.availableQuantity = Math.max(
                0,
                Number(outletStock.availableQuantity || 0) - 1
              );
            }

            serialEntry.status = "transferred";
            serialEntry.currentLocation = centerId;

            if (!Array.isArray(serialEntry.transferHistory)) {
              serialEntry.transferHistory = [];
            }

            serialEntry.transferHistory.push({
              fromCenter: warehouseId,
              toCenter: centerId,
              transferDate: new Date(),
              transferType: "outlet_to_center",
            });
          }

          outletStock.inTransitQuantity =
            Array.isArray(outletStock.serialNumbers)
              ? outletStock.serialNumbers.filter(
                  (serial) => serial.status === "in_transit"
                ).length
              : 0;

          await outletStock.save();

          remainingToTransfer -= outletSerialsToTransfer.length;
        } else {
          /*
           * Approval already reserved the quantity.
           *
           * Do not decrease availableQuantity again.
           * Only release the in-transit reservation.
           */
          const currentInTransitQuantity = Number(
            outletStock.inTransitQuantity || 0
          );

          if (currentInTransitQuantity < outletTransferQuantity) {
            return {
              statusCode: 400,
              body: {
                success: false,
                message: `Insufficient outlet in-transit stock for product ${productId}`,
              },
            };
          }

          outletStock.inTransitQuantity = Math.max(
            0,
            currentInTransitQuantity - outletTransferQuantity
          );

          await outletStock.save();

          remainingToTransfer -= outletTransferQuantity;
        }
      }

      /*
       * ============================================================
       * SOURCE STOCK VALIDATION
       * ============================================================
       */

      if (remainingToTransfer > 0) {
        return {
          statusCode: 400,
          body: {
            success: false,
            message: `Insufficient source stock for product ${productId}`,
          },
        };
      }

      /*
       * ============================================================
       * CENTER STOCK
       * ============================================================
       */

      let centerStock = await CenterStock.findOne({
        center: centerId,
        product: productId,
      });

      if (!centerStock) {
        centerStock = new CenterStock({
          center: centerId,
          product: productId,
          totalQuantity: 0,
          availableQuantity: 0,
          serialNumbers: [],
        });
      }

      centerStock.totalQuantity =
        Number(centerStock.totalQuantity || 0) + receivedQty;

      centerStock.availableQuantity =
        Number(centerStock.availableQuantity || 0) + receivedQty;

      if (isSerialized) {
        if (!Array.isArray(centerStock.serialNumbers)) {
          centerStock.serialNumbers = [];
        }

        for (const serial of receivedSerials) {
          const existingSerial =
            centerStock.serialNumbers.find(
              (item) => item.serialNumber === serial
            );

          if (existingSerial) {
            existingSerial.status = "available";
            existingSerial.currentLocation = centerId;

            if (!Array.isArray(existingSerial.transferHistory)) {
              existingSerial.transferHistory = [];
            }

            existingSerial.transferHistory.push({
              fromCenter: warehouseId,
              toCenter: centerId,
              transferDate: new Date(),
              transferType: "inbound_transfer",
            });
          } else {
            /*
             * --------------------------------------------------------
             * SOURCE SERIAL METADATA
             * --------------------------------------------------------
             *
             * OUTLET SOURCE:
             * purchaseId + originalOutlet come directly from
             * OutletStock.
             *
             * RESELLER SOURCE:
             * Legacy ResellerStock does NOT contain purchaseId or
             * originalOutlet.
             *
             * Therefore for reseller -> center:
             *
             * ResellerStock serial
             *       ↓
             * OutletStock same serial
             *       ↓
             * purchaseId + originalOutlet
             *
             * This preserves the legacy schema without adding new
             * fields to ResellerStock.
             */

            let sourceSerialEntry = null;
            let originalOutlet = null;
            let purchaseId = null;

            /*
             * --------------------------------------------------------
             * RESELLER SOURCE
             * --------------------------------------------------------
             */

            if (resellerStock) {
              sourceSerialEntry =
                resellerStock.serialNumbers.find(
                  (item) => item.serialNumber === serial
                );

              if (!sourceSerialEntry) {
                return {
                  statusCode: 400,
                  body: {
                    success: false,
                    message: `Source serial ${serial} not found in reseller stock`,
                  },
                };
              }

              /*
               * Legacy ResellerStock does not store purchaseId.
               *
               * Find the original OutletStock record using the same
               * product + serial number.
               */
              const originalOutletStock =
                await OutletStock.findOne({
                  product: productId,
                  "serialNumbers.serialNumber": serial,
                });

              if (!originalOutletStock) {
                return {
                  statusCode: 400,
                  body: {
                    success: false,
                    message: `Original outlet stock not found for serial ${serial}`,
                  },
                };
              }

              const originalOutletSerial =
                originalOutletStock.serialNumbers.find(
                  (item) => item.serialNumber === serial
                );

              if (!originalOutletSerial) {
                return {
                  statusCode: 400,
                  body: {
                    success: false,
                    message: `Serial ${serial} not found in original outlet stock`,
                  },
                };
              }

              purchaseId = originalOutletSerial.purchaseId;
              originalOutlet = originalOutletStock.outlet;
            }

            /*
             * --------------------------------------------------------
             * OUTLET SOURCE
             * --------------------------------------------------------
             */

            if (!sourceSerialEntry && outletStock) {
              sourceSerialEntry =
                outletStock.serialNumbers.find(
                  (item) => item.serialNumber === serial
                );

              if (!sourceSerialEntry) {
                return {
                  statusCode: 400,
                  body: {
                    success: false,
                    message: `Source serial ${serial} not found in outlet stock`,
                  },
                };
              }

              purchaseId = sourceSerialEntry.purchaseId;
              originalOutlet = outletStock.outlet;
            }

            /*
             * --------------------------------------------------------
             * FINAL SOURCE VALIDATION
             * --------------------------------------------------------
             */

            if (!sourceSerialEntry) {
              return {
                statusCode: 400,
                body: {
                  success: false,
                  message: `Source serial ${serial} not found while creating CenterStock`,
                },
              };
            }

            if (!purchaseId) {
              return {
                statusCode: 400,
                body: {
                  success: false,
                  message: `Purchase ID missing for source serial ${serial}`,
                },
              };
            }

            if (!originalOutlet) {
              return {
                statusCode: 400,
                body: {
                  success: false,
                  message: `Original outlet missing for source serial ${serial}`,
                },
              };
            }

            /*
             * Legacy CenterStock serialized structure.
             */
            centerStock.serialNumbers.push({
              serialNumber: serial,
              purchaseId,
              originalOutlet,
              status: "available",
              currentLocation: centerId,
              transferHistory: [
                {
                  fromCenter: warehouseId,
                  toCenter: centerId,
                  transferDate: new Date(),
                  transferType: "inbound_transfer",
                },
              ],
            });
          }
        }
      }

      await centerStock.save();

      /*
       * ============================================================
       * UPDATE STOCK REQUEST PRODUCT
       * ============================================================
       */

      productItem.receivedQuantity =
        Number(productItem.receivedQuantity || 0) + receivedQty;

      if (receivedRemark) {
        productItem.receivedRemark = receivedRemark;
      }

      if (isSerialized && receivedSerials.length > 0) {
        if (!Array.isArray(productItem.serialNumbers)) {
          productItem.serialNumbers = [];
        }

        if (!Array.isArray(productItem.transferredSerials)) {
          productItem.transferredSerials = [];
        }

        for (const serial of receivedSerials) {
          if (!productItem.serialNumbers.includes(serial)) {
            productItem.serialNumbers.push(serial);
          }

          if (!productItem.transferredSerials.includes(serial)) {
            productItem.transferredSerials.push(serial);
          }
        }
      }

      completedReceipts.push({
        productId,
        receivedQuantity: receivedQty,
        receivedSerials: isSerialized
          ? receivedSerials
          : [],
      });
    }

    /*
     * ============================================================
     * FINAL STATUS
     * ============================================================
     */

    const allProductsCompleted =
      stockRequest.products.every((product) => {
        const approvedQuantity = Number(
          product.approvedQuantity || 0
        );

        const receivedQuantity = Number(
          product.receivedQuantity || 0
        );

        return receivedQuantity >= approvedQuantity;
      });

    if (allProductsCompleted) {
      stockRequest.status = "Completed";

      /*
       * Approved business rule:
       * Successfully completed transfer = completed.
       */
      stockRequest.stockTransferStatus = "completed";

      stockRequest.completionInfo = {
        completedBy: user?.id || null,
        completedAt: new Date(),
      };
    } else {
      stockRequest.status = "Incompleted";

      stockRequest.incompleteInfo = {
        markedBy: user?.id || null,
        markedAt: new Date(),
      };
    }

    stockRequest.updatedBy = user?.id || null;

    await stockRequest.save();

    return {
      statusCode: 200,
      body: {
        success: true,
        message: allProductsCompleted
          ? "Stock request completed successfully"
          : "Stock request partially completed",
        data: {
          stockRequest,
          receipts: completedReceipts,
        },
      },
    };
  } catch (error) {
    console.error(
      "Error completing stock request:",
      error
    );

    const statusCode =
      Number.isInteger(error.statusCode) &&
      error.statusCode >= 100 &&
      error.statusCode <= 599
        ? error.statusCode
        : 500;

    return {
      statusCode,
      body: {
        success: false,
        message:
          error.message ||
          "Failed to complete stock request",
      },
    };
  }
};

export const updateStockRequestStatus = async (user, id, body) => {
  try {
    const { hasAccess, permissions, userCenter } = await checkStockRequestPermissions(user, ["manage_indent"]);
    if (!hasAccess) {
      return {
        statusCode: 403,
        body: { success: false, message: "Access denied. manage_indent permission required." },
      };
    }

    const { status, ...additionalInfo } = body;
    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return { statusCode: 404, body: { success: false, message: "Stock request not found" } };
    }
    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return {
        statusCode: 403,
        body: { success: false, message: "Access denied. You can only update status for stock requests from your own center." },
      };
    }
    const userId = user?.id;
    if (!userId) {
      return { statusCode: 400, body: { success: false, message: "User authentication required" } };
    }

    const updateData = { status, updatedBy: userId };
    const currentDate = new Date();

    switch (status) {
      case "Confirmed":
        if (additionalInfo.productApprovals) {
          const validationResults = await stockRequest.validateSerialNumbers(additionalInfo.productApprovals);
          const invalidResults = validationResults.filter((result) => !result.valid);
          if (invalidResults.length > 0) {
            return {
              statusCode: 400,
              body: { success: false, message: "Serial number validation failed", validationErrors: invalidResults },
            };
          }
        }
        updateData.approvalInfo = {
          ...stockRequest.approvalInfo,
          approvedAt: currentDate,
          approvedBy: userId,
          approvedRemark: additionalInfo.approvedRemark || "",
          ...additionalInfo,
        };
        if (additionalInfo.productApprovals) {
          updateData.products = stockRequest.products.map((productItem) => {
            const approval = additionalInfo.productApprovals.find(
              (pa) => pa.productId.toString() === productItem.product.toString()
            );
            if (approval) {
              return {
                ...productItem.toObject(),
                approvedQuantity: approval.approvedQuantity,
                approvedRemark: approval.approvedRemark || "",
                approvedSerials: approval.approvedSerials || [],
              };
            }
            return productItem;
          });
        }
        break;

      case "Completed": {
        if (
          !additionalInfo.productReceipts ||
          !Array.isArray(additionalInfo.productReceipts) ||
          additionalInfo.productReceipts.length === 0
        ) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message: "Product receipts are required when completing a stock request. Use completeStockRequest for the actual receipt operation.",
            },
          };
        }
        const nextProducts = stockRequest.products.map((productItem) => {
          const receipt = additionalInfo.productReceipts.find(
            (pr) => pr.productId?.toString() === productItem.product?.toString()
          );
          if (!receipt) return productItem.toObject();
          const receivedQuantity = Number(receipt.receivedQuantity);
          if (!Number.isInteger(receivedQuantity) || receivedQuantity < 0) {
            throw new Error(`Received quantity must be a non-negative integer for product ${productItem.product}`);
          }
          const approvedQuantity = Number(productItem.approvedQuantity) || 0;
          if (receivedQuantity > approvedQuantity) {
            throw new Error(
              `Received quantity (${receivedQuantity}) cannot exceed approved quantity (${approvedQuantity})`
            );
          }
          return {
            ...productItem.toObject(),
            receivedQuantity,
            receivedRemark: receipt.receivedRemark || "",
          };
        });
        await syncReceivedQuantityChanges({ stockRequest, nextProducts });
        updateData.receivingInfo = {
          ...stockRequest.receivingInfo,
          receivedAt: currentDate,
          receivedBy: userId,
          receivedRemark: additionalInfo.receivedRemark || "",
        };
        updateData.completionInfo = {
          ...stockRequest.completionInfo,
          completedOn: currentDate,
          completedBy: userId,
        };
        updateData.products = nextProducts;
        break;
      }
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(id, updateData, {
      new: true, runValidators: true,
    })
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("incompleteInfo.incompleteBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    return {
      statusCode: 200,
      body: { success: true, message: `Stock request status updated to ${status}`, data: updatedRequest },
    };
  } catch (error) {
    console.error("Error updating stock request status:", error);
    if (
      error.message.includes("serial numbers") ||
      error.message.includes("Insufficient stock") ||
      error.message.includes("Received quantity cannot exceed")
    ) {
      return { statusCode: 400, body: { success: false, message: "Validation failed", error: error.message } };
    }
    return {
      statusCode: 500,
      body: {
        success: false,
        message: "Error updating stock request status",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      },
    };
  }
};

export const updateApprovedQuantities = async (user, id, body) => {
  try {
    const { hasAccess, permissions, userCenter } = await checkStockRequestPermissions(user, ["manage_indent"]);
    if (!hasAccess) {
      return {
        statusCode: 403,
        body: { success: false, message: "Access denied. manage_indent permission required." },
      };
    }

    const { productApprovals } = body;
    const stockRequest = await StockRequest.findById(id)
      .populate("center", "reseller")
      .populate("warehouse", "_id");

    if (!stockRequest) {
      return { statusCode: 404, body: { success: false, message: "Stock request not found" } };
    }
    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message: "Access denied. You can only update approved quantities for stock requests from your own center.",
        },
      };
    }
    const userId = user?.id;
    if (!userId) {
      return { statusCode: 400, body: { success: false, message: "User authentication required" } };
    }

    const OutletStockModel = mongoose.model("OutletStock");
    const ResellerStockModel = mongoose.model("ResellerStock");
    const ProductModel = mongoose.model("Product");
    const resellerId = stockRequest.center?.reseller?._id;

    for (const approval of productApprovals) {
      const productItem = stockRequest.products.find(
        (p) => p.product.toString() === approval.productId.toString()
      );
      if (!productItem) {
        return {
          statusCode: 400,
          body: { success: false, message: `Product ${approval.productId} not found in stock request` },
        };
      }

      const currentApprovedQuantity = productItem.approvedQuantity || 0;
      const newApprovedQuantity = approval.approvedQuantity;
      const productDoc = await ProductModel.findById(approval.productId);
      const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

      console.log(`[DEBUG] Processing product ${approval.productId}:`);
      console.log(`[DEBUG] Current approved: ${currentApprovedQuantity}, New approved: ${newApprovedQuantity}`);

      let newSourceBreakdown = {
        fromReseller: { quantity: 0, serials: [] },
        fromOutlet: { quantity: 0, serials: [] },
        totalApproved: newApprovedQuantity,
      };

      if (newApprovedQuantity > 0) {
        let resellerAvailable = 0;
        let outletAvailable = 0;
        let resellerStockDoc = null;
        let outletStockDoc = null;

        if (resellerId) {
          resellerStockDoc = await ResellerStockModel.findOne({
            reseller: resellerId, product: approval.productId,
          });
          if (resellerStockDoc) resellerAvailable = resellerStockDoc.availableQuantity || 0;
        }
        outletStockDoc = await OutletStockModel.findOne({
          outlet: stockRequest.warehouse, product: approval.productId,
        });
        if (outletStockDoc) outletAvailable = outletStockDoc.availableQuantity || 0;

        if (tracksSerialNumbers && approval.approvedSerials && approval.approvedSerials.length > 0) {
          const serials = approval.approvedSerials;
          if (resellerStockDoc) {
            for (const serialNumber of serials) {
              const serial = resellerStockDoc.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber && sn.status === "available"
              );
              if (serial) newSourceBreakdown.fromReseller.serials.push(serialNumber);
            }
          }
          newSourceBreakdown.fromOutlet.serials = serials.filter(
            (sn) => !newSourceBreakdown.fromReseller.serials.includes(sn)
          );
          newSourceBreakdown.fromReseller.quantity = newSourceBreakdown.fromReseller.serials.length;
          newSourceBreakdown.fromOutlet.quantity = newSourceBreakdown.fromOutlet.serials.length;
        } else {
          newSourceBreakdown.fromReseller.quantity = Math.min(newApprovedQuantity, resellerAvailable);
          newSourceBreakdown.fromOutlet.quantity = newApprovedQuantity - newSourceBreakdown.fromReseller.quantity;
        }

        if (newSourceBreakdown.fromReseller.quantity + newSourceBreakdown.fromOutlet.quantity !== newApprovedQuantity) {
          return {
            statusCode: 400,
            body: {
              success: false,
              message: `Source breakdown calculation error for product ${productDoc?.productTitle}. Expected ${newApprovedQuantity}, got Reseller: ${newSourceBreakdown.fromReseller.quantity}, Outlet: ${newSourceBreakdown.fromOutlet.quantity}`,
            },
          };
        }

        const currentSourceBreakdown = productItem.sourceBreakdown || {
          fromReseller: { quantity: 0, serials: [] },
          fromOutlet: { quantity: 0, serials: [] },
        };

        if (outletStockDoc) {
          const currentOutletQty = currentSourceBreakdown.fromOutlet.quantity;
          const newOutletQty = newSourceBreakdown.fromOutlet.quantity;
          const outletQtyDiff = newOutletQty - currentOutletQty;

          if (outletQtyDiff > 0) {
            if (tracksSerialNumbers) {
              const newOutletSerials = newSourceBreakdown.fromOutlet.serials.filter(
                (serial) => !currentSourceBreakdown.fromOutlet.serials.includes(serial)
              );
              for (const serialNumber of newOutletSerials) {
                const serial = outletStockDoc.serialNumbers.find((sn) => sn.serialNumber === serialNumber);
                if (serial && serial.status === "available") {
                  serial.status = "in_transit";
                  serial.currentLocation = stockRequest.warehouse;
                  serial.transferHistory.push({
                    fromCenter: stockRequest.warehouse,
                    toCenter: stockRequest.center,
                    transferDate: new Date(),
                    transferType: "outlet_to_center",
                    status: "in_transit",
                  });
                }
              }
            }
            outletStockDoc.availableQuantity -= outletQtyDiff;
            outletStockDoc.inTransitQuantity += outletQtyDiff;
          } else if (outletQtyDiff < 0) {
            const outletQtyToRevert = Math.abs(outletQtyDiff);
            if (tracksSerialNumbers) {
              const serialsToRevert = currentSourceBreakdown.fromOutlet.serials.filter(
                (serial) => !newSourceBreakdown.fromOutlet.serials.includes(serial)
              );
              for (const serialNumber of serialsToRevert) {
                const serial = outletStockDoc.serialNumbers.find((sn) => sn.serialNumber === serialNumber);
                if (serial && serial.status === "in_transit") {
                  serial.status = "available";
                  serial.currentLocation = stockRequest.warehouse;
                  if (serial.transferHistory.length > 0) {
                    const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
                    if (lastTransfer.status === "in_transit") serial.transferHistory.pop();
                  }
                }
              }
            }
            outletStockDoc.availableQuantity += outletQtyToRevert;
            outletStockDoc.inTransitQuantity -= outletQtyToRevert;
          }
          await outletStockDoc.save();
        }

        if (resellerStockDoc) {
          const currentResellerQty = currentSourceBreakdown.fromReseller.quantity;
          const newResellerQty = newSourceBreakdown.fromReseller.quantity;
          const resellerQtyDiff = newResellerQty - currentResellerQty;

          if (resellerQtyDiff > 0) {
            if (tracksSerialNumbers) {
              const newResellerSerials = newSourceBreakdown.fromReseller.serials.filter(
                (serial) => !currentSourceBreakdown.fromReseller.serials.includes(serial)
              );
              for (const serialNumber of newResellerSerials) {
                const serial = resellerStockDoc.serialNumbers.find((sn) => sn.serialNumber === serialNumber);
                if (serial && serial.status === "available") {
                  serial.status = "consumed";
                  serial.consumedDate = new Date();
                  serial.consumedBy = userId;
                  serial.currentLocation = stockRequest.center;
                }
              }
            }
            resellerStockDoc.availableQuantity -= resellerQtyDiff;
            resellerStockDoc.consumedQuantity += resellerQtyDiff;
          } else if (resellerQtyDiff < 0) {
            const resellerQtyToRevert = Math.abs(resellerQtyDiff);
            if (tracksSerialNumbers) {
              const serialsToRevert = currentSourceBreakdown.fromReseller.serials.filter(
                (serial) => !newSourceBreakdown.fromReseller.serials.includes(serial)
              );
              for (const serialNumber of serialsToRevert) {
                const serial = resellerStockDoc.serialNumbers.find((sn) => sn.serialNumber === serialNumber);
                if (serial && serial.status === "consumed") {
                  serial.status = "available";
                  serial.consumedDate = null;
                  serial.consumedBy = null;
                  serial.currentLocation = null;
                }
              }
            }
            resellerStockDoc.availableQuantity += resellerQtyToRevert;
            resellerStockDoc.consumedQuantity -= resellerQtyToRevert;
          }
          await resellerStockDoc.save();
        }
      } else {
        const currentSourceBreakdown = productItem.sourceBreakdown || {
          fromReseller: { quantity: 0, serials: [] },
          fromOutlet: { quantity: 0, serials: [] },
        };
        if (currentSourceBreakdown.fromOutlet.quantity > 0) {
          const outletStockDoc = await OutletStockModel.findOne({
            outlet: stockRequest.warehouse, product: approval.productId,
          });
          if (outletStockDoc) {
            if (tracksSerialNumbers) {
              for (const serialNumber of currentSourceBreakdown.fromOutlet.serials) {
                const serial = outletStockDoc.serialNumbers.find((sn) => sn.serialNumber === serialNumber);
                if (serial && serial.status === "in_transit") {
                  serial.status = "available";
                  serial.currentLocation = stockRequest.warehouse;
                  if (serial.transferHistory.length > 0) {
                    const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
                    if (lastTransfer.status === "in_transit") serial.transferHistory.pop();
                  }
                }
              }
            }
            outletStockDoc.availableQuantity += currentSourceBreakdown.fromOutlet.quantity;
            outletStockDoc.inTransitQuantity -= currentSourceBreakdown.fromOutlet.quantity;
            await outletStockDoc.save();
          }
        }
        if (currentSourceBreakdown.fromReseller.quantity > 0) {
          const resellerStockDoc = await ResellerStockModel.findOne({
            reseller: resellerId, product: approval.productId,
          });
          if (resellerStockDoc) {
            if (tracksSerialNumbers) {
              for (const serialNumber of currentSourceBreakdown.fromReseller.serials) {
                const serial = resellerStockDoc.serialNumbers.find((sn) => sn.serialNumber === serialNumber);
                if (serial && serial.status === "consumed") {
                  serial.status = "available";
                  serial.consumedDate = null;
                  serial.consumedBy = null;
                  serial.currentLocation = null;
                }
              }
            }
            resellerStockDoc.availableQuantity += currentSourceBreakdown.fromReseller.quantity;
            resellerStockDoc.consumedQuantity -= currentSourceBreakdown.fromReseller.quantity;
            await resellerStockDoc.save();
          }
        }
      }

      productItem.sourceBreakdown = newSourceBreakdown;
      productItem.approvedQuantity = newApprovedQuantity;
      productItem.approvedRemark = approval.approvedRemark || "";
      if (tracksSerialNumbers) productItem.approvedSerials = approval.approvedSerials || [];
    }

    if (stockRequest.status === "Submitted") {
      stockRequest.status = "Confirmed";
      stockRequest.approvalInfo = {
        ...stockRequest.approvalInfo,
        approvedBy: userId,
        approvedAt: new Date(),
      };
    }
    stockRequest.updatedBy = userId;
    await stockRequest.save();

    const populatedRequest = await StockRequest.findById(stockRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email");

    return {
      statusCode: 200,
      body: { success: true, message: "Approved quantities updated successfully", data: populatedRequest },
    };
  } catch (error) {
    console.error("Error updating approved quantities:", error);
    if (error.name === "CastError") {
      return { statusCode: 400, body: { success: false, message: "Invalid stock request ID" } };
    }
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return { statusCode: 400, body: { success: false, message: "Validation error", errors } };
    }
    if (error.message?.includes("serial numbers") || error.message?.includes("Insufficient stock")) {
      return { statusCode: 400, body: { success: false, message: "Validation failed", error: error.message } };
    }
    return {
      statusCode: 500,
      body: {
        success: false,
        message: "Error updating approved quantities",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      },
    };
  }
};

export const getMostRecentOrderNumber = async (user) => {
  try {
    const { hasAccess, permissions, userCenter } = await checkStockRequestPermissions(user, [
      "indent_all_center", "indent_own_center",
    ]);
    if (!hasAccess) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message: "Access denied. indent_own_center or indent_all_center permission required.",
        },
      };
    }

    if (permissions.indent_own_center && !permissions.indent_all_center && userCenter) {
      const userCenterId = userCenter._id || userCenter;
      // Legacy: no filtering applied. Preserved.
    }

    const mostRecentRequest = await StockRequest.findOne()
      .sort({ createdAt: -1 })
      .select("orderNumber createdAt")
      .lean();

    if (!mostRecentRequest) {
      return {
        statusCode: 404,
        body: { success: false, message: "No stock requests found", data: null },
      };
    }

    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Most recent order number retrieved successfully",
        data: {
          orderNumber: mostRecentRequest.orderNumber,
          createdAt: mostRecentRequest.createdAt,
        },
      },
    };
  } catch (error) {
    console.error("Error retrieving most recent order number:", error);
    return {
      statusCode: 500,
      body: {
        success: false,
        message: "Error retrieving most recent order number",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      },
    };
  }
};

export const getCenterSerialNumbers = async (user, productId) => {
  try {
    const ProductModel = mongoose.model("Product");
    const { hasAccess, permissions, userCenter } = await checkStockRequestPermissions(user, [
      "indent_all_center", "indent_own_center",
    ]);
    if (!hasAccess) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message: "Access denied. indent_own_center or indent_all_center permission required.",
        },
      };
    }

    const userDoc = await User.findById(user.id).populate("center");
    if (!userDoc || !userDoc.center) {
      return {
        statusCode: 400,
        body: { success: false, message: "User center information not found" },
      };
    }
    const centerId = userDoc.center._id;

    if (permissions.indent_own_center && !permissions.indent_all_center && userCenter) {
      const userCenterId = userCenter._id || userCenter;
      if (userCenterId.toString() !== centerId.toString()) {
        return {
          statusCode: 403,
          body: { success: false, message: "Access denied. You can only view serial numbers from your own center." },
        };
      }
    }

    const centerStock = await CenterStock.findOne({
      center: centerId, product: productId,
    })
      .populate("center", "centerName centerCode centerType")
      .populate("product", "productTitle productCode trackSerialNumber");

    if (!centerStock) {
      return {
        statusCode: 200,
        body: {
          success: true,
          message: "No stock found for the specified product",
          data: {
            center: await Center.findById(centerId).select("centerName centerCode centerType"),
            product: await ProductModel.findById(productId).select(
              "productTitle productCode trackSerialNumber"
            ),
            availableSerials: [],
            totalAvailable: 0,
            stockSummary: {
              totalQuantity: 0, availableQuantity: 0,
              inTransitQuantity: 0, consumedQuantity: 0,
            },
          },
        },
      };
    }

    const availableSerials = centerStock.serialNumbers
      .filter((sn) => sn.status === "available")
      .map((sn) => ({
        serialNumber: sn.serialNumber,
        purchaseId: sn.purchaseId,
        originalOutlet: sn.originalOutlet,
        currentLocation: sn.currentLocation,
        status: sn.status,
      }));

    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Center serial numbers retrieved successfully",
        data: {
          centerStock: {
            _id: centerStock._id,
            center: centerStock.center,
            product: centerStock.product,
            totalQuantity: centerStock.totalQuantity,
            availableQuantity: centerStock.availableQuantity,
            inTransitQuantity: centerStock.inTransitQuantity,
            consumedQuantity: centerStock.consumedQuantity,
            lastUpdated: centerStock.lastUpdated,
          },
          availableSerials,
          totalAvailable: availableSerials.length,
        },
      },
    };
  } catch (error) {
    console.error("Error retrieving center serial numbers:", error);
    if (error.name === "CastError") {
      return { statusCode: 400, body: { success: false, message: "Invalid product ID" } };
    }
    return {
      statusCode: 500,
      body: {
        success: false,
        message: "Error retrieving center serial numbers",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      },
    };
  }
};

export const getStockRequestCount = async (query) => {
  try {
    const match = {};
    if (query.center) match.center = query.center;
    if (query.warehouse) match.warehouse = query.warehouse;
    if (query.startDate && query.endDate) {
      match.date = { $gte: new Date(query.startDate), $lte: new Date(query.endDate) };
    }
    const summary = await StockRequest.aggregate([
      { $match: match },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const totalRequests = summary.reduce((acc, cur) => acc + cur.count, 0);
    const completed = summary.find((s) => s._id === "Completed")?.count || 0;
    const incomplete = summary.find((s) => s._id === "Incompleted")?.count || 0;

    return {
      statusCode: 200,
      body: {
        success: true,
        totalRequests,
        completed,
        incomplete,
        summary: summary.reduce((acc, s) => {
          acc[s._id] = s.count;
          return acc;
        }, {}),
      },
    };
  } catch (error) {
    console.error("Error fetching stock request summary:", error);
    return {
      statusCode: 500,
      body: { success: false, message: "Failed to fetch stock request summary", error: error.message },
    };
  }
};

export const getStockRequestNotifications = async (user, query) => {
  try {
    const { type, center, days = 7 } = query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);

    const { hasAccess, permissions, userCenter } = await checkStockRequestPermissions(user, [
      "indent_all_center", "indent_own_center",
    ]);
    if (!hasAccess) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message: "Access denied. indent_own_center or indent_all_center permission required.",
        },
      };
    }

    const filter = { createdAt: { $gte: startDate } };
    if (!permissions.indent_all_center && permissions.indent_own_center && userCenter) {
      filter.center = userCenter._id || userCenter;
    } else if (center) {
      filter.center = center;
    }

    if (type && type !== "all") {
      switch (type) {
        case "submitted": filter.status = "Submitted"; break;
        case "completed": filter.status = "Completed"; break;
        case "confirmed": filter.status = "Confirmed"; break;
        case "shipped": filter.status = "Shipped"; break;
        case "incompleted": filter.status = "Incompleted"; break;
      }
    }

    const stockRequests = await StockRequest.find(filter)
      .populate("center", "centerName centerCode")
      .populate("createdBy", "fullName")
      .populate("approvalInfo.approvedBy", "fullName")
      .populate("completionInfo.completedBy", "fullName")
      .populate("incompleteInfo.incompleteBy", "fullName")
      .sort({ createdAt: -1 })
      .lean();

    const validStockRequests = stockRequests.filter(
      (request) => request.center && request.center.centerName
    );
    const notifications = validStockRequests.map(formatStockRequestToNotification);

    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Stock request notifications retrieved successfully",
        data: notifications,
        totalCount: notifications.length,
      },
    };
  } catch (error) {
    console.error("Error retrieving stock request notifications:", error);
    return {
      statusCode: 500,
      body: { success: false, message: "Error retrieving notifications", error: error.message },
    };
  }
};

export const updateWarehouseChallanApproval = async (user, id, body) => {
  try {
    const { hasAccess, permissions, userCenter } = await checkStockRequestPermissions(user, [
      "manage_indent", "stock_transfer_approve_from_outlet",
    ]);
    if (!hasAccess) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message: "Access denied. manage_indent or stock_transfer_approve_from_outlet permission required.",
        },
      };
    }

    const { warehouseChallanApproval } = body;
    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return { statusCode: 404, body: { success: false, message: "Stock request not found" } };
    }
    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return {
        statusCode: 403,
        body: { success: false, message: "Access denied. You can only update challan approval for stock requests from your own center." },
      };
    }
    const userId = user?.id;
    if (!userId) {
      return { statusCode: 400, body: { success: false, message: "User authentication required" } };
    }
    if (!["pending", "approved", "rejected"].includes(warehouseChallanApproval)) {
      return {
        statusCode: 400,
        body: { success: false, message: "Invalid challan approval status. Must be one of: pending, approved, rejected" },
      };
    }

    const updateData = {
      warehouseChallanApproval,
      updatedBy: userId,
      approvalInfo: { ...stockRequest.approvalInfo },
    };

    if (warehouseChallanApproval === "approved" || warehouseChallanApproval === "rejected") {
      updateData.approvalInfo.warehouseChallanApprovedAt = new Date();
      updateData.approvalInfo.warehouseChallanApprovedBy = userId;
    } else {
      updateData.approvalInfo.warehouseChallanApprovedAt = undefined;
      updateData.approvalInfo.warehouseChallanApprovedBy = undefined;
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(id, updateData, {
      new: true, runValidators: true,
    })
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("approvalInfo.warehouseChallanApprovedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    return {
      statusCode: 200,
      body: {
        success: true,
        message: `Challan approval status updated to ${warehouseChallanApproval} successfully`,
        data: updatedRequest,
      },
    };
  } catch (error) {
    console.error("Error updating challan approval:", error);
    if (error.name === "CastError") {
      return { statusCode: 400, body: { success: false, message: "Invalid stock request ID" } };
    }
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return { statusCode: 400, body: { success: false, message: "Validation error", errors } };
    }
    return {
      statusCode: 500,
      body: {
        success: false,
        message: "Error updating challan approval",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      },
    };
  }
};

export const updateCenterChallanApproval = async (user, id, body) => {
  try {
    const { hasAccess, permissions, userCenter } = await checkStockRequestPermissions(user, [
      "manage_indent", "stock_transfer_approve_from_outlet",
    ]);
    if (!hasAccess) {
      return {
        statusCode: 403,
        body: {
          success: false,
          message: "Access denied. manage_indent or stock_transfer_approve_from_outlet permission required.",
        },
      };
    }

    const { centerChallanApproval } = body;
    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return { statusCode: 404, body: { success: false, message: "Stock request not found" } };
    }
    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return {
        statusCode: 403,
        body: { success: false, message: "Access denied. You can only update challan approval for stock requests from your own center." },
      };
    }
    const userId = user?.id;
    if (!userId) {
      return { statusCode: 400, body: { success: false, message: "User authentication required" } };
    }
    if (!["pending", "approved", "rejected"].includes(centerChallanApproval)) {
      return {
        statusCode: 400,
        body: { success: false, message: "Invalid challan approval status. Must be one of: pending, approved, rejected" },
      };
    }

    const updateData = {
      centerChallanApproval,
      updatedBy: userId,
      approvalInfo: { ...stockRequest.approvalInfo },
    };

    if (centerChallanApproval === "approved" || centerChallanApproval === "rejected") {
      updateData.approvalInfo.centerChallanApprovedAt = new Date();
      updateData.approvalInfo.centerChallanApprovedBy = userId;
    } else {
      updateData.approvalInfo.centerChallanApprovedAt = undefined;
      updateData.approvalInfo.centerChallanApprovedBy = undefined;
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(id, updateData, {
      new: true, runValidators: true,
    })
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("approvalInfo.centerChallanApprovedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    return {
      statusCode: 200,
      body: {
        success: true,
        message: `Challan approval status updated to ${centerChallanApproval} successfully`,
        data: updatedRequest,
      },
    };
  } catch (error) {
    console.error("Error updating challan approval:", error);
    if (error.name === "CastError") {
      return { statusCode: 400, body: { success: false, message: "Invalid stock request ID" } };
    }
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return { statusCode: 400, body: { success: false, message: "Validation error", errors } };
    }
    return {
      statusCode: 500,
      body: {
        success: false,
        message: "Error updating challan approval",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      },
    };
  }
};

export const exportStockRequestsToExcel = async (user, query) => {
  try {
    return {
      statusCode: 200,
      body: { success: true, message: "Excel export function is working" },
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: { success: false, message: "Failed to export stock requests", error: error.message },
    };
  }
};

export const bulkUploadStockRequests = async (user, file) => {
  try {
    if (!file) {
      return { statusCode: 400, body: { success: false, message: "Please upload a CSV file" } };
    }
    if (!file.buffer) {
      return { statusCode: 500, body: { success: false, message: "No file buffer found" } };
    }

    console.log("Processing stock requests CSV from buffer, size:", file.size, "bytes");

    const results = [];
    const errors = [];
    const successfulUploads = [];
    const warnings = [];
    const centerGroups = new Map();
    const csvString = file.buffer.toString();

    const expectedHeaders = [
      "warehouseIdentifier", "centerIdentifier", "productIdentifier",
      "quantity", "serialNumbers",
    ];

    await new Promise((resolve, reject) => {
      const readable = Readable.from([csvString]);
      let rowIndex = 0;
      readable
        .pipe(csv({
          quote: '"', escape: '"', separator: ",",
          relax_column_count: true, skip_lines_with_error: true,
        }))
        .on("data", (data) => {
          rowIndex++;
          const normalizedData = {};
          const values = Object.values(data).filter((v) => v !== undefined);
          expectedHeaders.forEach((header, index) => {
            let value = values[index] || data[header] || "";
            if (value && typeof value === "string") {
              value = value.trim();
              if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
              }
            }
            normalizedData[header] = value || "";
          });
          results.push(normalizedData);
        })
        .on("end", () => {
          console.log(`CSV parsing complete. Found ${results.length} rows`);
          if (results.length > 0) {
            console.log("First row normalized:", JSON.stringify(results[0], null, 2));
          }
          resolve();
        })
        .on("error", (error) => {
          console.error("CSV parsing error:", error);
          reject(error);
        });
    });

    if (results.length === 0) {
      return { statusCode: 400, body: { success: false, message: "No data found in CSV file" } };
    }

    console.log("Fetching centers and products from database...");
    const allCenters = await Center.find({}).select("centerName centerCode _id centerType").lean();
    const allProducts = await Product.find({}).select("productTitle productCode _id").lean();

    console.log(`Found ${allCenters.length} centers and ${allProducts.length} products`);

    const centerMap = new Map();
    const centerCodeMap = new Map();
    allCenters.forEach((center) => {
      centerMap.set(center.centerName.toLowerCase(), {
        id: center._id, name: center.centerName,
        code: center.centerCode, type: center.centerType,
      });
      if (center.centerCode) {
        centerCodeMap.set(center.centerCode.toLowerCase(), {
          id: center._id, name: center.centerName,
          code: center.centerCode, type: center.centerType,
        });
      }
    });

    const productMap = new Map();
    const productCodeMap = new Map();
    allProducts.forEach((product) => {
      productMap.set(product.productTitle.toLowerCase(), product._id);
      if (product.productCode) {
        productCodeMap.set(product.productCode.toLowerCase(), product._id);
      }
    });

    for (let index = 0; index < results.length; index++) {
      const row = results[index];
      const rowNumber = index + 2;
      try {
        if (!row.warehouseIdentifier) {
          errors.push({ row: rowNumber, data: row, error: "Warehouse identifier (name or code) is required" });
          continue;
        }
        if (!row.centerIdentifier) {
          errors.push({ row: rowNumber, data: row, error: "Center identifier (name or code) is required" });
          continue;
        }
        if (!row.productIdentifier) {
          errors.push({ row: rowNumber, data: row, error: "Product identifier (name or code) is required" });
          continue;
        }
        const warehouseIdentifier = row.warehouseIdentifier.toString().toLowerCase().trim();
        const warehouseInfo = centerMap.get(warehouseIdentifier) || centerCodeMap.get(warehouseIdentifier);
        if (!warehouseInfo) {
          errors.push({ row: rowNumber, data: row, error: `Warehouse not found: ${row.warehouseIdentifier}` });
          continue;
        }
        if (warehouseInfo.type !== "Outlet") {
          errors.push({
            row: rowNumber, data: row,
            error: `Warehouse must be of type "Outlet" (not Center): ${row.warehouseIdentifier}`,
          });
          continue;
        }
        const centerIdentifier = row.centerIdentifier.toString().toLowerCase().trim();
        const centerInfo = centerMap.get(centerIdentifier) || centerCodeMap.get(centerIdentifier);
        if (!centerInfo) {
          errors.push({ row: rowNumber, data: row, error: `Center not found: ${row.centerIdentifier}` });
          continue;
        }
        const productIdentifier = row.productIdentifier.toString().toLowerCase().trim();
        const productId = productMap.get(productIdentifier) || productCodeMap.get(productIdentifier);
        if (!productId) {
          errors.push({ row: rowNumber, data: row, error: `Product not found: ${row.productIdentifier}` });
          continue;
        }
        const quantity = parseInt(row.quantity) || 0;
        if (quantity <= 0) {
          errors.push({ row: rowNumber, data: row, error: `Quantity must be greater than 0` });
          continue;
        }

        let approvedSerials = [];
        if (row.serialNumbers && row.serialNumbers.trim() !== "") {
          approvedSerials = row.serialNumbers.split(",").map((s) => s.trim()).filter((s) => s);
        }
        const centerKey = centerInfo.id.toString();

        if (!centerGroups.has(centerKey)) {
          centerGroups.set(centerKey, {
            warehouseInfo, centerInfo,
            products: [], rows: [],
            warehouseId: warehouseInfo.id,
            centerId: centerInfo.id,
            centerName: centerInfo.name,
          });
        }
        const group = centerGroups.get(centerKey);

        if (group.warehouseId.toString() !== warehouseInfo.id.toString()) {
          errors.push({
            row: rowNumber, data: row,
            error: `All rows for the same center must have the same warehouse`,
          });
          continue;
        }

        group.products.push({
          product: productId,
          quantity,
          approvedQuantity: quantity,
          approvedSerials,
          receivedQuantity: quantity,
          transferredSerials: approvedSerials,
          approvedRemark: "",
          receivedRemark: "",
          productInStock: 0,
          productRemark: "",
          serialNumbers: [],
          sourceBreakdown: {
            fromReseller: { quantity: 0, serials: [] },
            fromOutlet: { quantity: 0, serials: [] },
            totalApproved: quantity,
          },
        });
        group.rows.push(rowNumber);
      } catch (error) {
        console.error(`Error validating row ${rowNumber}:`, error);
        errors.push({ row: rowNumber, data: row, error: error.message });
      }
    }

    console.log(`Grouped into ${centerGroups.size} stock requests (one per center)`);

    for (const [centerKey, group] of centerGroups.entries()) {
      try {
        console.log(`\nProcessing stock request for center: ${group.centerName} with ${group.products.length} products`);
        const now = new Date();
        const requestDate = now;
        const orderNumber = await generateBulkOrderNumber(group.centerName, now);
        console.log(`Generated order number: ${orderNumber}`);

        const challanNo = await StockRequest.generateChallanNumber();
        console.log(`Generated challan number: ${challanNo}`);

        const newRequest = new StockRequest({
          warehouse: group.warehouseId,
          center: group.centerId,
          date: requestDate,
          orderNumber,
          challanNo,
          challanDate: now,
          remark: "",
          products: group.products,
          status: "Completed",
          warehouseChallanApproval: "approved",
          centerChallanApproval: "approved",
          approvalInfo: {
            approvedAt: now,
            approvedBy: user.id,
            warehouseChallanApprovedAt: now,
            warehouseChallanApprovedBy: user.id,
            centerChallanApprovedAt: now,
            centerChallanApprovedBy: user.id,
          },
          receivingInfo: { receivedAt: now, receivedBy: user.id },
          completionInfo: { completedOn: now, completedBy: user.id },
          invoiceInfo: {
            invoiceRaised: true,
            invoiceRaisedAt: now,
            invoiceRaisedBy: user.id,
          },
          createdBy: user.id,
          updatedBy: user.id,
        });

        await newRequest.save();

        await newRequest.populate("warehouse", "centerName centerCode");
        await newRequest.populate("center", "centerName centerCode");
        await newRequest.populate("products.product", "productTitle productCode");

        successfulUploads.push({
          rows: group.rows,
          stockRequest: newRequest,
          action: "created",
          orderNumber,
          centerName: group.centerName,
          productCount: group.products.length,
        });
        console.log(`Successfully created stock request for ${group.centerName} with ${group.products.length} products`);
      } catch (error) {
        console.error(`Error processing stock request for center ${group.centerName}:`, error);
        errors.push({ rows: group.rows, centerName: group.centerName, error: error.message });
      }
    }

    return {
      statusCode: 200,
      body: {
        success: true,
        message: `Bulk upload completed. ${successfulUploads.length} stock requests created (one per center), ${errors.length} errors, ${warnings.length} warnings.`,
        data: {
          totalProcessed: results.length,
          totalCenters: centerGroups.size,
          successful: successfulUploads.length,
          failed: errors.length,
          warnings: warnings.length,
          successfulUploads,
          errors,
          warnings,
        },
      },
    };
  } catch (error) {
    console.error("Bulk upload error:", error);
    return {
      statusCode: 500,
      body: {
        success: false,
        message: "Error processing bulk upload",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      },
    };
  }
};

export const downloadBulkUploadSample = async () => {
  try {
    const sampleWarehouses = await Center.find({ centerType: "Outlet" }).limit(1).select("centerName centerCode");
    const sampleCenters = await Center.find({}).limit(2).select("centerName centerCode");
    const sampleProducts = await Product.find({}).limit(5).select("productTitle productCode");

    const headers = [
      "warehouseIdentifier", "centerIdentifier", "productIdentifier",
      "quantity", "serialNumbers",
    ].join(",");

    const sampleRows = [];
    if (sampleWarehouses.length > 0 && sampleCenters.length > 0 && sampleProducts.length > 0) {
      sampleRows.push([
        sampleWarehouses[0].centerName,
        sampleCenters[0].centerName,
        sampleProducts[0].productTitle,
        "50",
        "SN001,SN002,SN003,SN004,SN005",
      ].join(","));
      sampleRows.push([
        sampleWarehouses[0].centerName,
        sampleCenters[0].centerName,
        sampleProducts[1].productTitle,
        "25",
        "SN101,SN102,SN103,SN104,SN105",
      ].join(","));
      sampleRows.push([
        sampleWarehouses[0].centerName,
        sampleCenters[0].centerName,
        sampleProducts[2].productTitle,
        "30",
        "",
      ].join(","));
      if (sampleCenters.length > 1) {
        sampleRows.push([
          sampleWarehouses[0].centerName,
          sampleCenters[1].centerName,
          sampleProducts[3].productTitle,
          "20",
          "SN201,SN202,SN203,SN204,SN205",
        ].join(","));
        sampleRows.push([
          sampleWarehouses[0].centerName,
          sampleCenters[1].centerName,
          sampleProducts[4].productTitle,
          "15",
          "",
        ].join(","));
      }
    } else {
      sampleRows.push("TELECOM WAREHOUSE,AIROLI 1,40Amp Change-Over Switch,50,SN001,SN002,SN003,SN004,SN005");
      sampleRows.push('TELECOM WAREHOUSE,AIROLI 1,"1.25G SFP 1000Base-T, Copper SFP-T, RJ-45 SFP",25,SN101,SN102,SN103,SN104,SN105');
      sampleRows.push("TELECOM WAREHOUSE,AIROLI 1,15 U Rack,30,");
      sampleRows.push("TELECOM WAREHOUSE,AIROLI 2,40Amp Change-Over Switch,20,SN201,SN202,SN203,SN204,SN205");
      sampleRows.push("TELECOM WAREHOUSE,AIROLI 2,test2,15,");
    }

    const csvContent = `${headers}\n${sampleRows.join("\n")}`;

    return {
      statusCode: 200,
      body: csvContent,
      raw: true,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="stock_requests_sample.csv"',
      },
    };
  } catch (error) {
    console.error("Download sample CSV error:", error);
    return {
      statusCode: 500,
      body: {
        success: false,
        message: "Error generating sample CSV",
        error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
      },
    };
  }
};

// Legacy alias kept for controller compatibility (legacy named the endpoint "downloadStockRequestSampleCSV")
export const downloadStockRequestSampleCSV = downloadBulkUploadSample;

export default {
  createStockRequest,
  getAllStockRequests,
  getStockRequestById,
  updateStockRequest,
  deleteStockRequest,
  approveStockRequest,
  updateApprovedQuantities,
  shipStockRequest,
  updateShippingInfo,
  rejectShipment,
  completeStockRequest,
  markAsIncomplete,
  completeIncompleteRequest,
  updateStockRequestStatus,
  getCenterSerialNumbers,
  getMostRecentOrderNumber,
  getStockRequestCount,
  getStockRequestNotifications,
  updateWarehouseChallanApproval,
  updateCenterChallanApproval,
  exportStockRequestsToExcel,
  bulkUploadStockRequests,
  downloadBulkUploadSample,
  downloadStockRequestSampleCSV,
};