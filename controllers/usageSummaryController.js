import mongoose from "mongoose";
import StockUsage from "../models/StockUsage.js";
import StockRequest from "../models/StockRequest.js";
import StockTransfer from "../models/StockTransfer.js";
import StockClosing from "../models/ReportSubmission.js";
import DamageReturn from "../models/DamageReturn.js";
import ReplacementRecord from "../models/ReplacementRecord.js";
import Center from "../models/Center.js";
import ReturnRecord from "../models/ReturnRecord.js";

// ============================================================
// MOVEMENT FIELDS - Excludes opening and closing
// ============================================================
const MOVEMENT_FIELDS = [
  'purchase', 'distributed', 'transferReceive', 'replaceReturn', 'usage',
  'transferGiven', 'nc', 'convert', 'shifting', 'buildingUsage', 'buildingDamage',
  'other', 'return', 'repair', 'damage', 'replaceDamage', 'stolenCenter', 'stolenField'
];

export const getUsageSummary = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      centerId, 
      productId, 
      month,
      year,
      page = 1,
      limit = 100
    } = req.query;
    
    const user = req.user;
    let dateRange = getDateRange(startDate, endDate, month, year);
    
    let targetCenters = await getTargetCenters(centerId, user);
    
    if (!targetCenters || targetCenters.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Center information not found"
      });
    }

    console.log(`Processing data for ${targetCenters.length} centers, productId: ${productId}`);

    const allCenterData = [];
    
    for (const center of targetCenters) {
      console.log(`Processing center: ${center.centerName} (${center._id})`);
      
      const [
        stockRequests,
        stockTransfers,
        stockUsages,
        damageReturns,
        replacementRecords,
        stockClosings,
        returnRecords, 
        openingStock
      ] = await Promise.all([
        getStockRequestData(center._id, dateRange, productId),
        getStockTransferData(center._id, dateRange, productId),
        getStockUsageData(center._id, dateRange, productId),
        getDamageReturnData(center._id, dateRange, productId),
        getReplacementRecordData(center._id, dateRange, productId),
        getStockClosingData(center._id, dateRange, productId),
        getReturnRecordData(center._id, dateRange, productId),
        getOpeningStockData(center._id, dateRange.startDate, productId) 
      ]);
      
      const usageSummary = processUsageSummary({
        stockRequests,
        stockTransfers,
        stockUsages,
        damageReturns,
        replacementRecords,
        stockClosings,
        returnRecords,
        openingStock
      }, center._id, center, productId);

      allCenterData.push(...usageSummary);
    }

    const currentPage = parseInt(page);
    const pageSize = parseInt(limit);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    const paginatedData = allCenterData.slice(startIndex, endIndex);
    const totalRecords = allCenterData.length;
    const totalPages = Math.ceil(totalRecords / pageSize);

    // Prepare filters response
    const filters = {
      dateRange: {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      },
      productId,
      month: month || 'current',
      year: year || new Date().getFullYear()
    };
    if (targetCenters.length === 1) {
      filters.center = {
        id: targetCenters[0]._id,
        name: targetCenters[0].centerName,
        code: targetCenters[0].centerCode,
        type: targetCenters[0].centerType
      };
    } else {
      filters.center = {
        id: 'all',
        name: 'All Centers',
        code: 'ALL',
        type: 'Multiple'
      };
    }

    res.json({
      success: true,
      data: paginatedData,
      pagination: {
        currentPage,
        pageSize,
        totalRecords,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1
      },
      summary: generateSummaryStats(allCenterData),
      filters,
      metadata: {
        generatedAt: new Date(),
        recordCount: paginatedData.length,
        totalQuantity: paginatedData.reduce((sum, item) => sum + getTotalQuantity(item), 0),
        centersProcessed: targetCenters.length
      }
    });

  } catch (error) {
    console.error("Get usage summary error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate usage summary",
      error: error.message
    });
  }
};

const getReturnRecordData = async (centerId, dateRange, productId) => {
  console.log(`Fetching return records for center: ${centerId}, date range: ${dateRange.startDate} to ${dateRange.endDate}, product: ${productId}`);
  
  const matchStage = {
    center: new mongoose.Types.ObjectId(centerId),
    status: "completed",
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };

  if (productId) {
    matchStage['items.product'] = new mongoose.Types.ObjectId(productId);
  }

  const results = await ReturnRecord.aggregate([
    { $match: matchStage },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "products",
        localField: "items.product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $lookup: {
        from: "stockusages",
        localField: "originalUsageId",
        foreignField: "_id",
        as: "originalUsage"
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        type: "Return",
        usageType: 1,
        center: { $arrayElemAt: ["$centerInfo", 0] },
        product: "$items.product",
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        quantity: "$items.quantity",
        serialNumber: "$items.serialNumber",
        originalUsageType: { $arrayElemAt: ["$originalUsage.usageType", 0] },
        originalConnectionType: { $arrayElemAt: ["$originalUsage.connectionType", 0] },
        remark: 1,
        status: 1
      }
    }
  ]);

  console.log(`Found ${results.length} return records`);
  results.forEach((record, index) => {
    console.log(`Return record ${index + 1}: Product=${record.productName}, Qty=${record.quantity}, Type=${record.type}`);
  });

  return results;
};
const getTargetCenters = async (requestedCenterId, user) => {
  try {
    if (!requestedCenterId) {
      const userCenterId = user.center?._id || user.center;
      if (!userCenterId) {
        console.log("No user center found");
        return [];
      }
      const center = await Center.findById(userCenterId).select("centerName centerCode centerType");
      return center ? [center] : [];
    }

    if (requestedCenterId === 'all') {
      console.log("Fetching all centers");
      return await Center.find({}).select("centerName centerCode centerType");
    }

    if (mongoose.Types.ObjectId.isValid(requestedCenterId)) {
      const center = await Center.findById(requestedCenterId).select("centerName centerCode centerType");
      if (!center) {
        console.log(`Center not found with ID: ${requestedCenterId}`);
        return [];
      }
      return [center];
    }

    console.log(`Invalid center ID format: ${requestedCenterId}`);
    return [];
    
  } catch (error) {
    console.error("Error in getTargetCenters:", error);
    return [];
  }
};

// Helper: Parse DD-MM-YYYY string into a proper Date object
function parseDDMMYYYY(dateStr) {
  if (!dateStr) return null;
  
  // Check if it's already a valid ISO date string like YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
  }
  
  // Try DD-MM-YYYY format (this is the format your API uses)
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  
  const [day, month, year] = parts.map(Number);
  
  if (!day || !month || !year || day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }
  
  const parsed = new Date(year, month - 1, day);
  
  // Guard against JS auto-correcting invalid dates (e.g., 31-02-2026 -> March 3)
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }
  
  return parsed;
}

const getDateRange = (startDate, endDate, month, year) => {
  let start, end;
  
  if (startDate && endDate) {
    start = parseDDMMYYYY(startDate);
    end = parseDDMMYYYY(endDate);
    
    if (!start || !end) {
      throw new Error(`Invalid date format. Expected DD-MM-YYYY, got startDate="${startDate}", endDate="${endDate}"`);
    }
    
    if (start > end) {
      throw new Error("startDate cannot be after endDate");
    }
    
    // Include the entire end day (23:59:59.999)
    end.setHours(23, 59, 59, 999);
  } else if (month && year) {
    const m = parseInt(month);
    const y = parseInt(year);
    
    if (!m || m < 1 || m > 12 || !y) {
      throw new Error(`Invalid month/year: month=${month}, year=${year}`);
    }
    
    start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    end = new Date(y, m, 0, 23, 59, 59, 999);
  } else {
    // Default: current month
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  
  return { startDate: start, endDate: end };
};

const getStockRequestData = async (centerId, dateRange, productId) => {
  const matchStage = {
    $or: [
      { center: new mongoose.Types.ObjectId(centerId) },
      { warehouse: new mongoose.Types.ObjectId(centerId) }
    ],
    status: { $in: ["Completed", "Confirmed", "Shipped"] },
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };

  if (productId) {
    matchStage['products.product'] = new mongoose.Types.ObjectId(productId);
  }

  const results = await StockRequest.aggregate([
    { $match: matchStage },
    { $unwind: "$products" },
    {
      $lookup: {
        from: "products",
        localField: "products.product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "warehouse",
        foreignField: "_id",
        as: "warehouseInfo"
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        orderNumber: 1,
        type: "Purchase",
        center: { $arrayElemAt: ["$centerInfo", 0] },
        warehouse: { $arrayElemAt: ["$warehouseInfo", 0] },
        product: "$products.product",
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        quantity: {
          $cond: {
            if: { $ifNull: ["$products.receivedQuantity", null] },
            then: "$products.receivedQuantity",
            else: {
              $cond: {
                if: { $ifNull: ["$products.approvedQuantity", null] },
                then: "$products.approvedQuantity",
                else: "$products.quantity"
              }
            }
          }
        },
        approvedQuantity: "$products.approvedQuantity",
        receivedQuantity: "$products.receivedQuantity",
        status: 1
      }
    }
  ]);

  console.log(`[StockRequest] Found ${results.length} records`);
  results.forEach(r => {
    console.log(`  - ${r.productName}: ${r.quantity} (approved: ${r.approvedQuantity}, received: ${r.receivedQuantity})`);
  });

  return results;
};

const getStockTransferData = async (centerId, dateRange, productId) => {
  const matchStage = {
    $or: [
      { fromCenter: new mongoose.Types.ObjectId(centerId) },
      { toCenter: new mongoose.Types.ObjectId(centerId) }
    ],
    status: { $in: ["Completed", "Shipped", "Confirmed"] },
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };

  if (productId) {
    matchStage['products.product'] = new mongoose.Types.ObjectId(productId);
  }

  const results = await StockTransfer.aggregate([
    { $match: matchStage },
    { $unwind: "$products" },
    {
      $lookup: {
        from: "products",
        localField: "products.product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "fromCenter",
        foreignField: "_id",
        as: "fromCenterInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "toCenter",
        foreignField: "_id",
        as: "toCenterInfo"
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        transferNumber: 1,
        type: {
          $cond: {
            if: { $eq: ["$fromCenter", new mongoose.Types.ObjectId(centerId)] },
            then: "Transfer Given",
            else: "Transfer Receive"
          }
        },
        fromCenter: { $arrayElemAt: ["$fromCenterInfo", 0] },
        toCenter: { $arrayElemAt: ["$toCenterInfo", 0] },
        product: "$products.product",
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        // FIX: Use appropriate quantity based on transfer direction
        quantity: {
          $cond: [
            { $eq: ["$fromCenter", new mongoose.Types.ObjectId(centerId)] },
            { $ifNull: ["$products.approvedQuantity", "$products.quantity"] }, // Transfer Given uses approved/quantity
            { $ifNull: ["$products.receivedQuantity", { $ifNull: ["$products.approvedQuantity", "$products.quantity"] }] } // Transfer Receive uses received
          ]
        },
        approvedQuantity: "$products.approvedQuantity",
        receivedQuantity: "$products.receivedQuantity",
        status: 1
      }
    }
  ]);

  console.log(`[StockTransfer] Found ${results.length} records`);
  results.forEach(r => {
    console.log(`  - ${r.productName}: ${r.quantity} (Type: ${r.type})`);
  });

  return results;
};

const getStockUsageData = async (centerId, dateRange, productId) => {
  const matchStage = {
    $or: [
      { center: new mongoose.Types.ObjectId(centerId) },
      { toCenter: new mongoose.Types.ObjectId(centerId) }
    ],
    status: { $in: ["completed", "pending"] },
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };
  if (productId) {
    matchStage['items.product'] = new mongoose.Types.ObjectId(productId);
  }

  console.log(`🔍 Querying StockUsage for center ${centerId} with date range: ${dateRange.startDate} to ${dateRange.endDate}`);
  console.log(`🔍 MatchStage:`, JSON.stringify(matchStage, null, 2));

const usageData = await StockUsage.aggregate([
    { $match: matchStage },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "products",
        localField: "items.product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "toCenter",
        foreignField: "_id",
        as: "toCenterInfo"
      }
    },
    {
      $addFields: {
        centerData: {
          $cond: {
            if: { $eq: ["$center", new mongoose.Types.ObjectId(centerId)] },
            then: { $arrayElemAt: ["$centerInfo", 0] },
            else: { $arrayElemAt: ["$toCenterInfo", 0] }
          }
        }
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        usageType: 1,
        type: {
          $switch: {
            branches: [
              { case: { $eq: ["$usageType", "Customer"] }, then: "Usage" },
              { case: { $eq: ["$usageType", "Building"] }, then: "Building Usage" },
              { case: { $eq: ["$usageType", "Building to Building"] }, then: "Shifting" },
              { case: { $eq: ["$usageType", "Control Room"] }, then: "Building Usage" },
              { case: { $eq: ["$usageType", "Damage"] }, then: "Damage" },
              { case: { $eq: ["$usageType", "Stolen from Center"] }, then: "Stolen Center" },
              { case: { $eq: ["$usageType", "Stolen from Field"] }, then: "Stolen Field" },
              { case: { $eq: ["$usageType", "Other"] }, then: "Other" }
            ],
            default: "Usage"
          }
        },
        connectionType: 1,
        center: "$centerData",
        product: "$items.product",
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        quantity: "$items.quantity",
        serialNumbers: "$items.serialNumbers",
        remark: 1,
        customer: 1,
        fromBuilding: 1,
        toBuilding: 1,
        fromControlRoom: 1,
        isToCenter: { $eq: ["$toCenter", new mongoose.Types.ObjectId(centerId)] }
      }
    }
  ]);

  console.log(`📊 Found ${usageData.length} StockUsage records for center ${centerId}`);
usageData.forEach((item, i) => {
  console.log(`  ${i+1}. Type: ${item.usageType}, Product: ${item.productName || item.product}, Qty: ${item.quantity}, isToCenter: ${item.isToCenter}`);
});

return usageData.map(item => {
    if (item.usageType === "Customer" && item.connectionType) {
      switch (item.connectionType) {
        case "NC":
          item.type = "NC";
          break;
        case "Convert":
          item.type = "Convert";
          break;
        case "Shifting":
          item.type = "Shifting";
          break;
        case "Repair":
          item.type = "Repair";
          break;
      }
    }
    return item;
  });
};

const getDamageReturnData = async (centerId, dateRange, productId) => {
  const matchStage = {
    $or: [
      { center: new mongoose.Types.ObjectId(centerId) },
      { toCenter: new mongoose.Types.ObjectId(centerId) }
    ],
    status: { $in: ["approved", "pending", "replaced"] },
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };
  if (productId) {
    matchStage.product = new mongoose.Types.ObjectId(productId);
  }

  return await DamageReturn.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "toCenter",
        foreignField: "_id",
        as: "toCenterInfo"
      }
    },
    {
      $addFields: {
        centerData: {
          $cond: {
            if: { $eq: ["$center", new mongoose.Types.ObjectId(centerId)] },
            then: { $arrayElemAt: ["$centerInfo", 0] },
            else: { $arrayElemAt: ["$toCenterInfo", 0] }
          }
        }
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        type: "Replace Return",
        center: "$centerData",
        product: 1,
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        quantity: 1,
        serialNumber: 1,
        status: 1,
        remark: 1
      }
    }
  ]);
};

const getReplacementRecordData = async (centerId, dateRange, productId) => {
  const matchStage = {
    center: new mongoose.Types.ObjectId(centerId),
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };
  if (productId) {
    matchStage.product = new mongoose.Types.ObjectId(productId);
  }

  return await ReplacementRecord.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        type: "Replace Damage",
        center: { $arrayElemAt: ["$centerInfo", 0] },
        product: 1,
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        qty: 1,
        oldSerialNumber: 1,
        newSerialNumber: 1,
        statusReason: 1
      }
    }
  ]);
};

const getStockClosingData = async (centerId, dateRange, productId) => {
  const matchStage = {
    $or: [
      { center: new mongoose.Types.ObjectId(centerId) },
      { closingCenter: new mongoose.Types.ObjectId(centerId) }
    ],
    status: { $in: ["Submitted", "Verified"] },
    date: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };

  if (productId) {
    matchStage['products.product'] = new mongoose.Types.ObjectId(productId);
  }

  return await StockClosing.aggregate([
    { $match: matchStage },
    { $unwind: "$products" },
    {
      $lookup: {
        from: "products",
        localField: "products.product",
        foreignField: "_id",
        as: "productInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "center",
        foreignField: "_id",
        as: "centerInfo"
      }
    },
    {
      $lookup: {
        from: "centers",
        localField: "closingCenter",
        foreignField: "_id",
        as: "closingCenterInfo"
      }
    },
    {
      $project: {
        _id: 1,
        date: 1,
        type: "Closing",
        center: { $arrayElemAt: ["$centerInfo", 0] },
        closingCenter: { $arrayElemAt: ["$closingCenterInfo", 0] },
        product: "$products.product",
        productName: { $arrayElemAt: ["$productInfo.productTitle", 0] },
        productQty: "$products.productQty",
        damageQty: "$products.damageQty",
        status: 1
      }
    }
  ]);
};

const getOpeningStockData = async (centerId, startDate, productId) => {
  try {
    const currentStartDate = new Date(startDate);
    
    console.log(`========================================`);
    console.log(`Getting opening stock for center: ${centerId}`);
    console.log(`For month starting: ${currentStartDate.toISOString()}`);

    // 1. Get all purchases BEFORE current month
    const purchases = await StockRequest.aggregate([
      {
        $match: {
          $or: [
            { center: new mongoose.Types.ObjectId(centerId) },
            { warehouse: new mongoose.Types.ObjectId(centerId) }
          ],
          status: { $in: ["Completed", "Confirmed", "Shipped"] },
          date: { $lt: currentStartDate }
        }
      },
      { $unwind: "$products" },
      {
        $match: productId ? { 'products.product': new mongoose.Types.ObjectId(productId) } : {}
      },
      {
        $group: {
          _id: '$products.product',
          total: { 
            $sum: { 
              $ifNull: [
                '$products.receivedQuantity', 
                { $ifNull: ['$products.approvedQuantity', '$products.quantity'] }
              ] 
            } 
          }
        }
      }
    ]);
    
    // 2. Get all transfers received BEFORE current month — use 'date' field, NOT 'completionInfo.completedOn'
    const transfersIn = await StockTransfer.aggregate([
      {
        $match: {
          toCenter: new mongoose.Types.ObjectId(centerId),
          status: 'Completed',
          date: { $lt: currentStartDate }   // FIXED: was completionInfo.completedOn
        }
      },
      { $unwind: "$products" },
      {
        $match: productId ? { 'products.product': new mongoose.Types.ObjectId(productId) } : {}
      },
      {
        $group: {
          _id: '$products.product',
          total: { 
            $sum: { 
              $ifNull: [
                '$products.receivedQuantity', 
                { $ifNull: ['$products.approvedQuantity', '$products.quantity'] }
              ] 
            } 
          }
        }
      }
    ]);
    
    // 3. Get all transfers given BEFORE current month — use 'date' field, NOT 'completionInfo.completedOn'
    const transfersOut = await StockTransfer.aggregate([
      {
        $match: {
          fromCenter: new mongoose.Types.ObjectId(centerId),
          status: 'Completed',
          date: { $lt: currentStartDate }   // FIXED: was completionInfo.completedOn
        }
      },
      { $unwind: "$products" },
      {
        $match: productId ? { 'products.product': new mongoose.Types.ObjectId(productId) } : {}
      },
      {
        $group: {
          _id: '$products.product',
          total: { 
            $sum: { 
              $ifNull: ['$products.approvedQuantity', '$products.quantity'] 
            } 
          }
        }
      }
    ]);
    
    // 4. Get all usages BEFORE current month
    const usages = await StockUsage.aggregate([
      {
        $match: {
          center: new mongoose.Types.ObjectId(centerId),
          status: "completed",
          date: { $lt: currentStartDate }
        }
      },
      { $unwind: "$items" },
      {
        $match: productId ? { 'items.product': new mongoose.Types.ObjectId(productId) } : {}
      },
      {
        $group: {
          _id: '$items.product',
          total: { $sum: '$items.quantity' }
        }
      }
    ]);
    
    // 5. Get all returns BEFORE current month
    const returns = await ReturnRecord.aggregate([
      {
        $match: {
          center: new mongoose.Types.ObjectId(centerId),
          status: "completed",
          date: { $lt: currentStartDate }
        }
      },
      { $unwind: "$items" },
      {
        $match: productId ? { 'items.product': new mongoose.Types.ObjectId(productId) } : {}
      },
      {
        $group: {
          _id: '$items.product',
          total: { $sum: '$items.quantity' }
        }
      }
    ]);
    
    // 6. Get all damages BEFORE current month (include both center and toCenter)
    const damages = await DamageReturn.aggregate([
      {
        $match: {
          $or: [
            { center: new mongoose.Types.ObjectId(centerId) },
            { toCenter: new mongoose.Types.ObjectId(centerId) }
          ],
          status: { $in: ["approved", "pending", "replaced"] },
          date: { $lt: currentStartDate }
        }
      },
      {
        $match: productId ? { product: new mongoose.Types.ObjectId(productId) } : {}
      },
      {
        $group: {
          _id: '$product',
          total: { $sum: '$quantity' }
        }
      }
    ]);
    
    // Combine all product IDs seen across all queries
    const allProducts = new Set();
    [...purchases, ...transfersIn, ...transfersOut, ...usages, ...returns, ...damages].forEach(item => {
      if (item._id) allProducts.add(item._id.toString());
    });
    
    // If filtering by productId, only process that one product
    if (productId) {
      allProducts.clear();
      allProducts.add(productId);
    }
    
    const ProductModel = mongoose.model('Product');
    const openingData = [];
    
    for (const prodId of allProducts) {
      const getTotal = (arr, id) => {
        const found = arr.find(item => item._id && item._id.toString() === id);
        return found ? found.total : 0;
      };
      
      const purchaseTotal   = getTotal(purchases,    prodId);
      const transferInTotal = getTotal(transfersIn,  prodId);
      const transferOutTotal= getTotal(transfersOut, prodId);
      const usageTotal      = getTotal(usages,       prodId);
      const returnTotal     = getTotal(returns,      prodId);
      const damageTotal     = getTotal(damages,      prodId);
      
      // Opening = (Purchases + Transfers In + Returns) - (Transfers Out + Usages + Damages)
      const openingStock = 
        purchaseTotal + transferInTotal + returnTotal 
        - transferOutTotal - usageTotal - damageTotal;
      
      const productDoc = await ProductModel.findById(prodId);
      const productName = productDoc?.productTitle || 'Unknown Product';
      
      console.log(`[Opening Stock] ${productName} = ${openingStock}`);
      console.log(`   Purchases: ${purchaseTotal}`);
      console.log(`   + Transfers In: ${transferInTotal}`);
      console.log(`   + Returns: ${returnTotal}`);
      console.log(`   - Transfers Out: ${transferOutTotal}`);
      console.log(`   - Usages: ${usageTotal}`);
      console.log(`   - Damages: ${damageTotal}`);
      
      // Always include the product if filtering by productId, even if opening is 0
      if (openingStock !== 0 || productId) {
        openingData.push({
          product: new mongoose.Types.ObjectId(prodId),
          productName: productName,
          quantity: Math.max(0, openingStock),
          stockType: "Calculated from All Previous Transactions",
          date: currentStartDate
        });
      }
    }
    
    console.log(`Returning ${openingData.length} products with opening stock`);
    console.log(`========================================`);
    return openingData;
    
  } catch (error) {
    console.error("Error in getOpeningStockData:", error);
    return [];
  }
};

// REMOVE the getPreviousMonthClosingStock function entirely - it's causing infinite recursion!

// NEW FUNCTION: Get previous month's closing stock from Summary calculations
const getPreviousMonthClosingStock = async (centerId, previousMonthStart, previousMonthEnd, productId) => {
  try {
    // 1. Get purchases in previous month
    const purchases = await StockRequest.aggregate([
      {
        $match: {
          $or: [
            { center: new mongoose.Types.ObjectId(centerId) },
            { warehouse: new mongoose.Types.ObjectId(centerId) }
          ],
          status: { $in: ["Completed", "Confirmed", "Shipped"] },
          date: { $gte: previousMonthStart, $lte: previousMonthEnd }
        }
      },
      { $unwind: "$products" },
      {
        $match: productId ? { 'products.product': new mongoose.Types.ObjectId(productId) } : {}
      },
      {
        $group: {
          _id: '$products.product',
          totalQuantity: { 
            $sum: { 
              $ifNull: [
                '$products.receivedQuantity', 
                { $ifNull: ['$products.approvedQuantity', '$products.quantity'] }
              ]
            } 
          }
        }
      }
    ]);
    
    // 2. Get transfers IN during previous month — FIXED: use 'date' not 'completionInfo.completedOn'
    const transfersIn = await StockTransfer.aggregate([
      {
        $match: {
          toCenter: new mongoose.Types.ObjectId(centerId),
          status: 'Completed',
          date: { $gte: previousMonthStart, $lte: previousMonthEnd }   // FIXED
        }
      },
      { $unwind: "$products" },
      {
        $match: productId ? { 'products.product': new mongoose.Types.ObjectId(productId) } : {}
      },
      {
        $group: {
          _id: '$products.product',
          totalQuantity: { 
            $sum: { 
              $ifNull: [
                '$products.receivedQuantity', 
                { $ifNull: ['$products.approvedQuantity', '$products.quantity'] }
              ]
            } 
          }
        }
      }
    ]);
    
    // 3. Get transfers OUT during previous month — FIXED: use 'date' not 'completionInfo.completedOn'
    const transfersOut = await StockTransfer.aggregate([
      {
        $match: {
          fromCenter: new mongoose.Types.ObjectId(centerId),
          status: 'Completed',
          date: { $gte: previousMonthStart, $lte: previousMonthEnd }   // FIXED
        }
      },
      { $unwind: "$products" },
      {
        $match: productId ? { 'products.product': new mongoose.Types.ObjectId(productId) } : {}
      },
      {
        $group: {
          _id: '$products.product',
          totalQuantity: { 
            $sum: { 
              $ifNull: ['$products.approvedQuantity', '$products.quantity'] 
            }
          }
        }
      }
    ]);
    
    // 4. Get usages during previous month
    const usages = await StockUsage.aggregate([
      {
        $match: {
          center: new mongoose.Types.ObjectId(centerId),
          status: "completed",
          date: { $gte: previousMonthStart, $lte: previousMonthEnd }
        }
      },
      { $unwind: "$items" },
      {
        $match: productId ? { 'items.product': new mongoose.Types.ObjectId(productId) } : {}
      },
      {
        $group: {
          _id: '$items.product',
          totalQuantity: { $sum: '$items.quantity' }
        }
      }
    ]);
    
    // 5. Get opening stock for previous month using the fixed function
    const previousMonthOpening = await getOpeningStockData(centerId, previousMonthStart, productId);
    
    // Build closing stock map starting from previous month's opening
    const closingStockMap = new Map();
    
    previousMonthOpening.forEach(item => {
      closingStockMap.set(item.product.toString(), item.quantity);
    });
    
    // Add purchases
    purchases.forEach(p => {
      const current = closingStockMap.get(p._id.toString()) || 0;
      closingStockMap.set(p._id.toString(), current + p.totalQuantity);
    });
    
    // Add transfers in
    transfersIn.forEach(t => {
      const current = closingStockMap.get(t._id.toString()) || 0;
      closingStockMap.set(t._id.toString(), current + t.totalQuantity);
    });
    
    // Subtract transfers out
    transfersOut.forEach(t => {
      const current = closingStockMap.get(t._id.toString()) || 0;
      closingStockMap.set(t._id.toString(), current - t.totalQuantity);
    });
    
    // Subtract usages
    usages.forEach(u => {
      const current = closingStockMap.get(u._id.toString()) || 0;
      closingStockMap.set(u._id.toString(), current - u.totalQuantity);
    });
    
    // Convert map to result array
    const result = [];
    const ProductModel = mongoose.model('Product');
    
    for (const [prodId, quantity] of closingStockMap) {
      if (quantity <= 0 && !productId) continue;
      if (productId && prodId !== productId) continue;
      
      let productName = 'Unknown Product';
      try {
        const productDoc = await ProductModel.findById(prodId);
        if (productDoc?.productTitle) {
          productName = productDoc.productTitle;
        }
      } catch (err) {
        console.error(`Error fetching product name for ${prodId}:`, err);
      }
      
      console.log(`📦 Previous month closing stock for ${productName}: ${Math.max(0, quantity)}`);
      
      result.push({
        product: new mongoose.Types.ObjectId(prodId),
        productName: productName,
        quantity: Math.max(0, quantity),
        stockType: "Calculated from Previous Month Transactions",
        date: previousMonthEnd
      });
    }
    
    return result;
    
  } catch (error) {
    console.error("Error calculating previous month closing stock:", error);
    return [];
  }
};

const processUsageSummary = (data, centerId, centerDetails, productId) => {
  const allData = [
    ...data.stockRequests,
    ...data.stockTransfers,
    ...data.stockUsages,
    ...data.damageReturns,
    ...data.replacementRecords,
    ...data.stockClosings,
    ...data.returnRecords
  ];

  const groupedData = {};

  console.log(`Processing summary for center ${centerId}`);
  console.log(`Opening stock items: ${data.openingStock.length}`);
  console.log(`StockRequests: ${data.stockRequests.length}`);
  console.log(`StockTransfers: ${data.stockTransfers.length}`);
  console.log(`StockUsages: ${data.stockUsages.length}`);
  console.log(`DamageReturns: ${data.damageReturns.length}`);
  console.log(`ReplacementRecords: ${data.replacementRecords.length}`);
  console.log(`StockClosings: ${data.stockClosings.length}`);
  console.log(`ReturnRecords: ${data.returnRecords.length}`);
  console.log(`Current month data items: ${allData.length}`);

  // First, process opening stock
  data.openingStock.forEach(item => {
    const productIdFromItem = item.product?.toString();
    
    if (productId && productIdFromItem !== productId) {
      return;
    }
    
    console.log(`Processing opening stock for product: ${productIdFromItem} - ${item.productName}, Qty: ${item.quantity}`);
    
    if (!groupedData[productIdFromItem]) {
      groupedData[productIdFromItem] = createEmptyProductSummary(item.productName || 'Unknown Product');
      groupedData[productIdFromItem].productId = productIdFromItem;
    }
    
    groupedData[productIdFromItem].opening = item.quantity;

    if (centerDetails && !groupedData[productIdFromItem].center) {
      groupedData[productIdFromItem].center = {
        id: centerId,
        name: centerDetails.centerName,
        code: centerDetails.centerCode,
        type: centerDetails.centerType
      };
    }
  });

  // Then process all current month transactions
  allData.forEach(item => {
    const productIdFromItem = item.product?.toString();
    const type = item.type;
    
    if (!productIdFromItem) return;
    if (productId && productIdFromItem !== productId) return;

    const quantity = item.quantity || item.qty || item.productQty || 0;
    
    console.log(`Processing transaction for product: ${productIdFromItem}, Type: ${type}, Qty: ${quantity}, isToCenter: ${item.isToCenter}`);

    if (!groupedData[productIdFromItem]) {
      groupedData[productIdFromItem] = createEmptyProductSummary(
        item.productName || 'Unknown Product'
      );
      groupedData[productIdFromItem].productId = productIdFromItem;
      groupedData[productIdFromItem].opening = 0;
      
      if (centerDetails && !groupedData[productIdFromItem].center) {
        groupedData[productIdFromItem].center = {
          id: centerId,
          name: centerDetails.centerName,
          code: centerDetails.centerCode,
          type: centerDetails.centerType
        };
      }
    }

    // Process based on transaction type
    switch (type) {
      case "Purchase":
        groupedData[productIdFromItem].purchase += quantity;
        break;
      case "Transfer Receive":
        groupedData[productIdFromItem].transferReceive += quantity;
        break;
      case "Transfer Given":
        groupedData[productIdFromItem].transferGiven += quantity;
        break;
      case "Usage":
        groupedData[productIdFromItem].usage += quantity;
        break;
      case "NC":
        groupedData[productIdFromItem].nc += quantity;
        break;
      case "Convert":
        groupedData[productIdFromItem].convert += quantity;
        break;
      case "Shifting":
        groupedData[productIdFromItem].shifting += quantity;
        break;
      case "Building Usage":
        groupedData[productIdFromItem].buildingUsage += quantity;
        break;
      case "Damage":
        groupedData[productIdFromItem].damage += quantity;
        break;
      case "Return":
        console.log(`Processing Return: Product=${item.productName}, Qty=${quantity}`);
        groupedData[productIdFromItem].return += quantity;
        break;
      case "Replace Return":
        console.log(`Processing Replace Return: Product=${item.productName}, Qty=${quantity}`);
        groupedData[productIdFromItem].replaceReturn += quantity;
        groupedData[productIdFromItem].return += quantity; // Add to return as well
        break;
      case "Replace Damage":
        groupedData[productIdFromItem].replaceDamage += quantity;
        break;
      case "Stolen Center":
        groupedData[productIdFromItem].stolenCenter += quantity;
        break;
      case "Stolen Field":
        groupedData[productIdFromItem].stolenField += quantity;
        break;
      case "Closing":
        const damageQty = item.damageQty || 0;
        groupedData[productIdFromItem].closing += (quantity + damageQty);
        break;
      case "Other":
        groupedData[productIdFromItem].other += quantity;
        break;
      case "Repair":
        groupedData[productIdFromItem].repair += quantity;
        break;
      default:
        console.log(`Unknown transaction type: ${type}`);
        break;
    }
  });

  // Calculate final closing for all products
  const result = Object.values(groupedData).map(item => {
    if (!item.center && centerDetails) {
      item.center = {
        id: centerId,
        name: centerDetails.centerName,
        code: centerDetails.centerCode,
        type: centerDetails.centerType
      };
    }

    // Calculate usage and closing
    if (item.calculateUsageAndClosing) {
      const calculatedClosing = item.calculateUsageAndClosing();
      console.log(`Final calculation for ${item.productName}:`);
      console.log(`  Opening: ${item.opening}`);
      console.log(`  Calculated Closing: ${calculatedClosing}`);
      console.log(`  Stored Closing: ${item.closing}`);
      
      // Use calculated closing if stored closing is 0
      if (item.closing === 0 && calculatedClosing !== 0) {
        item.closing = calculatedClosing;
        console.log(`  → Using calculated closing: ${item.closing}`);
      }
    }
    
    return item;
  });

  console.log(`Returning ${result.length} products in summary`);
  return result;
};
const createEmptyProductSummary = (productName) => {
  const summary = {
    productName,
    opening: 0,
    purchase: 0,
    distributed: 0,
    transferReceive: 0,
    replaceReturn: 0,
    usage: 0,
    transferGiven: 0,
    nc: 0,
    convert: 0,
    shifting: 0,
    buildingUsage: 0,
    buildingDamage: 0,
    other: 0,
    return: 0,
    repair: 0,
    damage: 0,
    replaceDamage: 0,
    stolenCenter: 0,
    stolenField: 0,
    closing: 0,
    center: null,
    productId: null
  };
  // FIXED: Correct closing stock calculation formula
  summary.calculateUsageAndClosing = function() {
    // Calculate total usage from all usage types
    this.usage = 
      this.nc +
      this.convert +
      this.shifting +
      this.buildingUsage +
      this.buildingDamage +
      this.other +
      this.repair +
      this.stolenCenter +
      this.stolenField;
    // CORRECT FORMULA FOR CLOSING STOCK:
    // Closing = Opening + Purchases + Transfer Receive + Returns - Transfer Given - Usage - Replace Damage - Damage
    this.closing = 
      this.opening + 
      this.purchase +
      this.transferReceive +
      this.return -
      this.transferGiven - 
      this.usage -
      this.replaceDamage -
      this.damage;
    console.log(`[Closing Calc] ${this.productName}:`);
    console.log(`  Opening: ${this.opening}`);
    console.log(`  + Purchase: ${this.purchase}`);
    console.log(`  + Transfer Receive: ${this.transferReceive}`);
    console.log(`  + Return: ${this.return}`);
    console.log(`  - Transfer Given: ${this.transferGiven}`);
    console.log(`  - Usage: ${this.usage}`);
    console.log(`  - Replace Damage: ${this.replaceDamage}`);
    console.log(`  - Damage: ${this.damage}`);
    console.log(`  = Closing: ${this.closing}`);
    return this.closing;
  };
  return summary;
};
const generateSummaryStats = (usageSummary) => {
  const stats = {
    totalProducts: usageSummary.length,
    totalTransactions: usageSummary.reduce((sum, product) => {
      return sum + MOVEMENT_FIELDS.reduce((s, key) => s + (product[key] || 0), 0);
    }, 0),
    totalQuantity: usageSummary.reduce((sum, product) => {
      return sum + MOVEMENT_FIELDS.reduce((s, key) => s + (product[key] || 0), 0);
    }, 0),
    centers: [...new Set(usageSummary.map(item => item.center?.name).filter(Boolean))]
  };

  return stats;
};
const getTotalQuantity = (item) => {
  return MOVEMENT_FIELDS.reduce((sum, key) => sum + (item[key] || 0), 0);
};

