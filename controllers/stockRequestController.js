// import StockRequest from "../models/StockRequest.js";
// import Center from "../models/Center.js";
// import User from "../models/User.js";
// import StockPurchase from "../models/StockPurchase.js";
// import CenterStock from "../models/CenterStock.js";
// import mongoose from "mongoose";
// import Product from "../models/Product.js"
// import ExcelJS from 'exceljs';
// import path from 'path';
// import { fileURLToPath } from 'url';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const checkStockRequestPermissions = (req, requiredPermissions = []) => {
//   const userPermissions = req.user.role?.permissions || [];
//   const indentModule = userPermissions.find((perm) => perm.module === "Indent");
//   if (!indentModule) {
//     return { hasAccess: false, permissions: {} };
//   }

//   const permissions = {
//     manage_indent: indentModule.permissions.includes("manage_indent"),
//     indent_all_center: indentModule.permissions.includes("indent_all_center"),
//     indent_own_center: indentModule.permissions.includes("indent_own_center"),
//     delete_indent_all_center: indentModule.permissions.includes(
//       "delete_indent_all_center"
//     ),
//     delete_indent_own_center: indentModule.permissions.includes(
//       "delete_indent_own_center"
//     ),
//     stock_transfer_approve_from_outlet: indentModule.permissions.includes(
//       "stock_transfer_approve_from_outlet"
//     ),
//     complete_indent: indentModule.permissions.includes("complete_indent"),
//   };

//   const hasRequiredPermission = requiredPermissions.some(
//     (perm) => permissions[perm]
//   );

//   return {
//     hasAccess: hasRequiredPermission,
//     permissions,
//     userCenter: req.user.center,
//   };
// };

// const checkCenterAccess = (stockRequest, userCenter, permissions) => {
//   if (permissions.indent_all_center) {
//     return true;
//   }

//   if (permissions.indent_own_center && userCenter) {
//     const userCenterId = userCenter._id || userCenter;
//     const requestCenterId = stockRequest.center._id || stockRequest.center;
//     return userCenterId.toString() === requestCenterId.toString();
//   }

//   return false;
// };

// const getOutletStockForRequests = async (warehouseId, productIds) => {
//   try {
//     const OutletStock = mongoose.model("OutletStock");
    
//     const outletStockData = await OutletStock.find({
//       outlet: warehouseId,
//       product: { $in: productIds }
//     })
//     .populate("outlet", "centerName centerCode")
//     .select("product totalQuantity availableQuantity inTransitQuantity serialNumbers");
    
//     const outletStockMap = new Map();
    
//     outletStockData.forEach((item) => {
//       // Get available serials (status: "available")
//       const availableSerials = item.serialNumbers
//         .filter(sn => sn.status === "available")
//         .map(sn => sn.serialNumber);
      
//       outletStockMap.set(item.product.toString(), {
//         totalQuantity: item.totalQuantity,
//         availableQuantity: item.availableQuantity,
//         inTransitQuantity: item.inTransitQuantity,
//         hasSerialNumbers: item.serialNumbers.length > 0,
//         availableSerials: availableSerials,
//         availableSerialsCount: availableSerials.length,
//         outletName: item.outlet?.centerName || "Unknown Outlet"
//       });
//     });

//     return outletStockMap;
//   } catch (error) {
//     console.error("Error fetching outlet stock for requests:", error);
//     throw error;
//   }
// };

// export const createStockRequest = async (req, res) => {
//   try {
//     const { hasAccess, permissions } = checkStockRequestPermissions(req, [
//       "manage_indent",
//     ]);

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_indent permission required.",
//       });
//     }
//     const {
//       warehouse,
//       remark,
//       products,
//       status = "Draft",
//       orderNumber,
//       date,
//     } = req.body;

//     if (!orderNumber || orderNumber.trim() === "") {
//       return res.status(400).json({
//         success: false,
//         message: "Order number is required",
//       });
//     }

//     const trimmedOrderNumber = orderNumber.trim();

//     const existingRequest = await StockRequest.findOne({
//       orderNumber: trimmedOrderNumber,
//     });

//     if (existingRequest) {
//       return res.status(409).json({
//         success: false,
//         message:
//           "Order number already exists. Please use a unique order number.",
//         duplicateOrderNumber: trimmedOrderNumber,
//         existingRequestId: existingRequest._id,
//       });
//     }

//     let requestDate = new Date();
//     if (date) {
//       requestDate = new Date(date);
//       if (isNaN(requestDate.getTime())) {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid date format. Please provide a valid date.",
//         });
//       }

//       const today = new Date();
//       today.setHours(0, 0, 0, 0);
//       const providedDate = new Date(requestDate);
//       providedDate.setHours(0, 0, 0, 0);
//     }

//     const user = await User.findById(req.user.id).populate("center");
//     if (!user || !user.center) {
//       return res.status(400).json({
//         success: false,
//         message: "User center information not found",
//       });
//     }

//     const centerId = user.center._id;

//     if (permissions.indent_own_center && !permissions.indent_all_center) {
//       const userCenterId = user.center._id || user.center;
//     }

//     const centerExists = await Center.findById(centerId);
//     if (!centerExists) {
//       return res.status(404).json({
//         success: false,
//         message: "Center not found",
//       });
//     }

//     if (!products || !Array.isArray(products) || products.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Products array is required and cannot be empty",
//       });
//     }

//     for (const product of products) {
//       if (!product.product || !product.quantity) {
//         return res.status(400).json({
//           success: false,
//           message: "Each product must have product ID and quantity",
//         });
//       }

//       if (product.quantity <= 0) {
//         return res.status(400).json({
//           success: false,
//           message: "Product quantity must be greater than 0",
//         });
//       }
//     }

//     const stockRequest = new StockRequest({
//       orderNumber: trimmedOrderNumber,
//       warehouse,
//       center: centerId,
//       remark: remark || "",
//       products,
//       date: requestDate,
//       status,
//       centerChallanApproval: "pending",
//       warehouseChallanApproval: "pending",
//       createdBy: req.user.id,
//     });

//     const savedStockRequest = await stockRequest.save();

//     const populatedRequest = await StockRequest.findById(savedStockRequest._id)
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode centerType")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("createdBy", "_id fullName email")
//       .populate("approvalInfo.approvedBy", "_id fullName email")
//       .populate("approvalInfo.warehouseChallanApprovedBy","_id fullName email" )
//       .populate("approvalInfo.centerChallanApprovedBy","_id fullName email" )
//       .populate("shippingInfo.shippedBy", "_id fullName email")
//       .populate("receivingInfo.receivedBy", "_id fullName email");

//     res.status(201).json({
//       success: true,
//       message: "Stock request created successfully",
//       data: populatedRequest,
//     });
//   } catch (error) {
//     console.error("Error creating stock request:", error);

//     if (error.code === 11000) {
//       const duplicateField = Object.keys(error.keyPattern)[0];
//       if (duplicateField === "orderNumber") {
//         return res.status(409).json({
//           success: false,
//           message:
//             "Order number already exists. Please use a unique order number.",
//           duplicateOrderNumber: req.body.orderNumber,
//         });
//       }
//     }

//     if (error.name === "ValidationError") {
//       const errors = Object.values(error.errors).map((err) => err.message);
//       return res.status(400).json({
//         success: false,
//         message: "Validation error",
//         errors,
//       });
//     }

//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: `Invalid ${error.path}: ${error.value}`,
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Error creating stock request",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

// const getDateRange = (rangeType, customStartDate, customEndDate) => {
//   const now = new Date();
//   let start = new Date();
//   let end = new Date();

//   switch (rangeType) {
//     case "Today":
//       start.setHours(0, 0, 0, 0);
//       end.setHours(23, 59, 59, 999);
//       break;
//     case "Yesterday":
//       start.setDate(now.getDate() - 1);
//       start.setHours(0, 0, 0, 0);
//       end.setDate(now.getDate() - 1);
//       end.setHours(23, 59, 59, 999);
//       break;
//     case "This Week":
//       start.setDate(now.getDate() - now.getDay());
//       start.setHours(0, 0, 0, 0);
//       end.setHours(23, 59, 59, 999);
//       break;
//     case "Last Week":
//       start.setDate(now.getDate() - now.getDay() - 7);
//       start.setHours(0, 0, 0, 0);
//       end.setDate(now.getDate() - now.getDay() - 1);
//       end.setHours(23, 59, 59, 999);
//       break;
//     case "This Month":
//       start.setDate(1);
//       start.setHours(0, 0, 0, 0);
//       end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
//       end.setHours(23, 59, 59, 999);
//       break;
//     case "Last Month":
//       start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
//       start.setHours(0, 0, 0, 0);
//       end = new Date(now.getFullYear(), now.getMonth(), 0);
//       end.setHours(23, 59, 59, 999);
//       break;
//     case "This Year":
//       start = new Date(now.getFullYear(), 0, 1);
//       start.setHours(0, 0, 0, 0);
//       end = new Date(now.getFullYear(), 11, 31);
//       end.setHours(23, 59, 59, 999);
//       break;
//     case "Last Year":
//       start = new Date(now.getFullYear() - 1, 0, 1);
//       start.setHours(0, 0, 0, 0);
//       end = new Date(now.getFullYear() - 1, 11, 31);
//       end.setHours(23, 59, 59, 999);
//       break;
//     case "Custom":
//       if (customStartDate) start = new Date(customStartDate);
//       if (customEndDate) end = new Date(customEndDate);
//       break;
//     default:
//       return null;
//   }

//   return { start, end };
// };

// const buildArrayFilter = (value) => {
//   if (!value) return null;
//   return value.includes(",")
//     ? { $in: value.split(",").map((item) => item.trim()) }
//     : value;
// };

// const buildDateFilter = (
//   dateFilter,
//   customStartDate,
//   customEndDate,
//   startDate,
//   endDate
// ) => {
//   if (dateFilter) {
//     const dateRange = getDateRange(dateFilter, customStartDate, customEndDate);
//     if (dateRange) {
//       return {
//         $gte: dateRange.start,
//         $lte: dateRange.end,
//       };
//     }
//   }

//   if (startDate || endDate) {
//     const dateFilter = {};
//     if (startDate) dateFilter.$gte = new Date(startDate);
//     if (endDate) dateFilter.$lte = new Date(endDate);
//     return dateFilter;
//   }

//   return null;
// };

// const getBulkCenterStock = async (requests) => {
//   // ***** FIXED (was reading from StockPurchase - historical purchase log, *****
//   // ***** now reads from CenterStock - live/current stock, same source as   *****
//   // ***** the "Available Stock" module (availableReportController.js), so  *****
//   // ***** Indent Summary totals now match Available Stock totals.          *****

//   const centerIds = [
//     ...new Set(
//       requests
//         .map((request) => request.center?._id?.toString())
//         .filter(Boolean)
//     ),
//   ].map((id) => new mongoose.Types.ObjectId(id));

//   if (centerIds.length === 0) {
//     return new Map();
//   }

//   const centerStocks = await CenterStock.aggregate([
//     {
//       $match: {
//         center: { $in: centerIds },
//       },
//     },
//     {
//       $group: {
//         _id: {
//           center: "$center",
//           product: "$product",
//         },
//         totalQuantity: { $sum: "$totalQuantity" },
//         availableQuantity: { $sum: "$availableQuantity" },
//       },
//     },
//   ]);

//   const stockMap = new Map();
//   centerStocks.forEach((stock) => {
//     const key = `${stock._id.center}_${stock._id.product}`;
//     // Use availableQuantity (same field Available Stock module uses) so both screens match exactly.
//     stockMap.set(key, stock.availableQuantity);
//   });

//   return stockMap;
// };

// const buildFilter = (query) => {
//   const {
//     status,
//     center,
//     outlet,
//     warehouse,
//     startDate,
//     endDate,
//     createdAtStart,
//     createdAtEnd,
//     orderNumber,
//     search,
//     dateFilter,
//     customStartDate,
//     customEndDate,
//   } = query;

//   const filter = {};

//   const statusFilter = buildArrayFilter(status);
//   if (statusFilter) filter.status = statusFilter;

//   const centerFilter = buildArrayFilter(center);
//   if (centerFilter) {
//     if (Array.isArray(centerFilter.$in)) {
//       filter.center = { 
//         $in: centerFilter.$in.map(id => 
//           mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
//         )
//       };
//     } else if (mongoose.Types.ObjectId.isValid(centerFilter)) {
//       filter.center = new mongoose.Types.ObjectId(centerFilter);
//     } else {
//       filter.center = centerFilter;
//     }
//   }

//   const warehouseParam = outlet || warehouse;
//   if (warehouseParam) {
//     const warehouseFilter = buildArrayFilter(warehouseParam);
//     if (warehouseFilter) {
//       if (Array.isArray(warehouseFilter.$in)) {
//         filter.warehouse = { 
//           $in: warehouseFilter.$in.map(id => 
//             mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
//           )
//         };
//       } else if (mongoose.Types.ObjectId.isValid(warehouseFilter)) {
//         filter.warehouse = new mongoose.Types.ObjectId(warehouseFilter);
//       } else {
//         filter.warehouse = warehouseFilter;
//       }
//     }
//   }

//   const dateFilterObj = buildDateFilter(
//     dateFilter,
//     customStartDate,
//     customEndDate,
//     startDate,
//     endDate
//   );
//   if (dateFilterObj) filter.date = dateFilterObj;
//   if (createdAtStart || createdAtEnd) {
//     filter.createdAt = {};
//     if (createdAtStart) filter.createdAt.$gte = new Date(createdAtStart);
//     if (createdAtEnd) filter.createdAt.$lte = new Date(createdAtEnd);
//   }

//   const orderNumberFilter = buildArrayFilter(orderNumber);
//   if (orderNumberFilter) {
//     filter.orderNumber =
//       typeof orderNumberFilter === "object"
//         ? orderNumberFilter
//         : { $regex: orderNumberFilter, $options: "i" };
//   }
//   if (search) {
//     filter.$or = [
//       { orderNumber: { $regex: search, $options: "i" } },
//       { remark: { $regex: search, $options: "i" } },
//       { "products.productRemark": { $regex: search, $options: "i" } },
//       { "approvalInfo.approvedRemark": { $regex: search, $options: "i" } },
//       { "receivingInfo.receivedRemark": { $regex: search, $options: "i" } },
//     ];
//   }

//   console.log('Final filter:', JSON.stringify(filter, null, 2));
//   return filter;
// };

// const buildSortOptions = (sortBy = "createdAt", sortOrder = "desc") => {
//   const validSortFields = [
//     "challanNo",
//     "challanDate",
//     "createdAt",
//     "updatedAt",
//     "date",
//     "orderNumber",
//     "status",
//     "approvalInfo.approvedAt",
//     "shippingInfo.shippedAt",
//     "receivingInfo.receivedAt",
//   ];

//   const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "createdAt";
//   return { [actualSortBy]: sortOrder === "desc" ? -1 : 1 };
// };

// const populateOptions = [
//   { path: "warehouse", select: "_id centerName centerCode centerType" },
//   { path: "center", select: "_id centerName centerCode centerType",
//     // populate: {
//     //   path: "reseller",
//     //   select: "_id businessName contactNumber name mobile email gstNumber panNumber address1 address2 city state "
//     // },
//     // populate: {
//     //   path: "area",
//     //   select: "_id areaName"
//     // }
//     populate: [
//       {
//         path: "reseller",
//         select: "_id businessName contactNumber name mobile email gstNumber panNumber address1 address2 city state "
//       },
//       {
//         path: "area",
//         select: "_id areaName"
//       }
//     ]
//    },
//   {
//     path: "products.product",
//     select: "_id productTitle productCode productPrice salePrice hsnCode",
//   },
//   { path: "createdBy", select: "_id fullName email" },
//   { path: "updatedBy", select: "_id fullName email" },
//   { path: "approvalInfo.approvedBy", select: "_id fullName email" },
//   { path: "approvalInfo.warehouseChallanApprovedBy", select: "_id fullName email" },
//   { path: "approvalInfo.centerChallanApprovedBy", select: "_id fullName email" },
//   { path: "shippingInfo.shippedBy", select: "_id fullName email" },
//   { path: "receivingInfo.receivedBy", select: "_id fullName email" },
//   { path: "completionInfo.completedBy", select: "_id fullName email" },
//   { path: "incompleteInfo.incompleteBy", select: "_id fullName email" },

// ];

// // export const getAllStockRequests = async (req, res) => {
// //   try {
// //     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
// //       req,
// //       ["indent_all_center", "indent_own_center"]
// //     );

// //     if (!hasAccess) {
// //       return res.status(403).json({
// //         success: false,
// //         message:
// //           "Access denied. indent_own_center or indent_all_center permission required.",
// //       });
// //     }
    
// //     const {
// //       page = 1,
// //       limit = 100,
// //       sortBy = "createdAt",
// //       sortOrder = "desc",
// //       ...filterParams
// //     } = req.query;

// //     let filter = buildFilter(filterParams);

// //     if (filterParams.reseller) {
// //       const resellerFilter = buildArrayFilter(filterParams.reseller);
// //       let centerFilter = {};
      
// //       if (resellerFilter) {
// //         if (Array.isArray(resellerFilter.$in)) {
// //           centerFilter.reseller = { 
// //             $in: resellerFilter.$in.map(id => 
// //               mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
// //             )
// //           };
// //         } else if (mongoose.Types.ObjectId.isValid(resellerFilter)) {
// //           centerFilter.reseller = new mongoose.Types.ObjectId(resellerFilter);
// //         } else {
// //           centerFilter.reseller = resellerFilter;
// //         }

// //         const matchingCenters = await Center.find(centerFilter).select('_id');
// //         const centerIds = matchingCenters.map(center => center._id);

// //         if (centerIds.length > 0) {
// //           if (filter.center) {
// //             if (filter.center.$in) {
// //               filter.center.$in = filter.center.$in.filter(centerId => 
// //                 centerIds.some(matchingId => matchingId.toString() === centerId.toString())
// //               );
// //             } else {
    
// //               if (!centerIds.some(id => id.toString() === filter.center.toString())) {
// //                 filter.center = { $in: [] };
// //               }
// //             }
// //           } else {
// //             filter.center = { $in: centerIds };
// //           }
// //         } else {
// //           filter.center = { $in: [] };
// //         }
// //       }
// //     }

// //     if (
// //       permissions.indent_own_center &&
// //       !permissions.indent_all_center &&
// //       userCenter
// //     ) {
// //       const userCenterId = userCenter._id || userCenter;
// //       if (filter.center) {
// //         if (filter.center.$in) {
// //           filter.center.$in = filter.center.$in.filter(centerId => 
// //             centerId.toString() === userCenterId.toString()
// //           );
// //         } else {
// //           if (filter.center.toString() !== userCenterId.toString()) {
// //             filter.center = { $in: [] };
// //           }
// //         }
// //       } else {
// //         filter.center = userCenterId;
// //       }
// //     }

// //     const sortOptions = buildSortOptions(sortBy, sortOrder);

// //     console.log('Final filter for query:', JSON.stringify(filter, null, 2));

// //     const [stockRequests, total, statusCounts] = await Promise.all([
// //       StockRequest.find(filter)
// //         .populate(populateOptions)
// //         .sort(sortOptions)
// //         .limit(parseInt(limit))
// //         .skip((parseInt(page) - 1) * parseInt(limit))
// //         .lean(),

// //       StockRequest.countDocuments(filter),

// //       StockRequest.aggregate([
// //         { $match: filter },
// //         { $group: { _id: "$status", count: { $sum: 1 } } },
// //       ]),
// //     ]);

// //     if (stockRequests.length === 0) {
// //       return res.status(200).json({
// //         success: true,
// //         message: "No stock requests found",
// //         data: [],
// //         pagination: {
// //           currentPage: parseInt(page),
// //           totalPages: 0,
// //           totalItems: 0,
// //           itemsPerPage: parseInt(limit),
// //         },
// //         filters: { status: {}, total: 0 },
// //       });
// //     }

// //     const stockMap = await getBulkCenterStock(stockRequests);
    
// //     // NEW: Get reseller stock data for all centers
// //     const resellerStockMap = new Map();
// //     const centerToResellerMap = new Map(); // Moved outside if block
    
// //     // Collect all center IDs and product IDs for batch reseller stock lookup
// //     const centerIds = stockRequests.map(req => req.center?._id).filter(Boolean);
// //     const allProductIds = [];
    
// //     stockRequests.forEach(request => {
// //       request.products.forEach(product => {
// //         if (product.product?._id) {
// //           allProductIds.push(product.product._id.toString());
// //         }
// //       });
// //     });
    
// //     // Get unique product IDs
// //     const uniqueProductIds = [...new Set(allProductIds)];
    
// //     if (centerIds.length > 0 && uniqueProductIds.length > 0) {
// //       // Get centers with their reseller information
// //       const centersWithResellers = await Center.find({
// //         _id: { $in: centerIds }
// //       }).populate('reseller', '_id businessName').select('_id reseller');
      
// //       // Create map of center ID to reseller ID
// //       centersWithResellers.forEach(center => {
// //         if (center.reseller) {
// //           centerToResellerMap.set(center._id.toString(), center.reseller._id);
// //         }
// //       });
      
// //       // Get all unique reseller IDs
// //       const uniqueResellerIds = [...new Set([...centerToResellerMap.values()])];
      
// //       if (uniqueResellerIds.length > 0) {
// //         // Fetch reseller stock data in bulk
// //         const ResellerStock = mongoose.model("ResellerStock");
// //         const resellerStocks = await ResellerStock.find({
// //           reseller: { $in: uniqueResellerIds },
// //           product: { $in: uniqueProductIds.map(id => new mongoose.Types.ObjectId(id)) }
// //         }).lean();
        
// //         // Create a map for quick lookup: key = "resellerId_productId"
// //         resellerStocks.forEach(stock => {
// //           const key = `${stock.reseller}_${stock.product}`;
          
// //           // Calculate damage repair and center return quantities from serials
// //           let damageRepairCount = 0;
// //           let centerReturnCount = 0;
// //           let availableSerials = [];
          
// //           if (stock.serialNumbers && stock.serialNumbers.length > 0) {
// //             // Count by source type from serial numbers
// //             const availableSerialsArray = stock.serialNumbers.filter(sn => 
// //               sn.status === "available"
// //             );
            
// //             availableSerials = availableSerialsArray.map(sn => sn.serialNumber);
            
// //             damageRepairCount = availableSerialsArray.filter(
// //               sn => sn.sourceType === "damage_repair"
// //             ).length;
            
// //             centerReturnCount = availableSerialsArray.filter(
// //               sn => sn.sourceType === "center_return"
// //             ).length;
// //           } else {
// //             // For non-serialized products, use sourceBreakdown
// //             damageRepairCount = stock.sourceBreakdown?.damageRepairQuantity || 0;
// //             centerReturnCount = stock.sourceBreakdown?.centerReturnQuantity || 0;
// //           }
          
// //           resellerStockMap.set(key, {
// //             totalQuantity: stock.totalQuantity || 0,
// //             availableQuantity: stock.availableQuantity || 0,
// //             consumedQuantity: stock.consumedQuantity || 0,
// //             damagedQuantity: stock.damagedQuantity || 0,
// //             repairQuantity: stock.repairQuantity || 0,
// //             sourceBreakdown: stock.sourceBreakdown || {
// //               damageRepairQuantity: damageRepairCount,
// //               centerReturnQuantity: centerReturnCount,
// //               directPurchaseQuantity: stock.availableQuantity - damageRepairCount - centerReturnCount
// //             },
// //             availableSerials: availableSerials,
// //             availableSerialsCount: availableSerials.length,
// //             damageRepairSerialsCount: damageRepairCount,
// //             centerReturnSerialsCount: centerReturnCount
// //           });
// //         });
// //       }
// //     }

// //     const stockRequestsWithEnhancedData = stockRequests.map((request) => {
// //       const centerId = request.center?._id?.toString();
// //       const resellerId = centerId ? centerToResellerMap.get(centerId) : null;
      
// //       const productsWithEnhancedData = request.products.map((product) => {
// //         if (!product.product?._id || !request.center?._id) return product;

// //         const stockKey = `${request.center._id}_${product.product._id}`;
// //         const centerStockQuantity = stockMap.get(stockKey) || 0;
        
// //         // Get reseller stock data
// //         let resellerStockInfo = null;
// //         if (resellerId) {
// //           const resellerStockKey = `${resellerId}_${product.product._id}`;
// //           resellerStockInfo = resellerStockMap.get(resellerStockKey);
// //         }

// //         return {
// //           ...product,
// //           centerStockQuantity,
// //           resellerStock: resellerStockInfo ? {
// //             totalQuantity: resellerStockInfo.totalQuantity,
// //             availableQuantity: resellerStockInfo.availableQuantity,
// //             availableBreakdown: {
// //               damageRepair: resellerStockInfo.sourceBreakdown.damageRepairQuantity,
// //               centerReturn: resellerStockInfo.sourceBreakdown.centerReturnQuantity,
// //               directPurchase: resellerStockInfo.sourceBreakdown.directPurchaseQuantity,
// //               total: resellerStockInfo.availableQuantity
// //             },
// //             sourceBreakdown: resellerStockInfo.sourceBreakdown,
// //             availableSerials: resellerStockInfo.availableSerials,
// //             availableSerialsCount: resellerStockInfo.availableSerialsCount,
// //             damageRepairCount: resellerStockInfo.damageRepairSerialsCount,
// //             centerReturnCount: resellerStockInfo.centerReturnSerialsCount,
// //             hasResellerStock: true
// //           } : {
// //             totalQuantity: 0,
// //             availableQuantity: 0,
// //             availableBreakdown: {
// //               damageRepair: 0,
// //               centerReturn: 0,
// //               directPurchase: 0,
// //               total: 0
// //             },
// //             sourceBreakdown: {
// //               damageRepairQuantity: 0,
// //               centerReturnQuantity: 0,
// //               directPurchaseQuantity: 0
// //             },
// //             availableSerials: [],
// //             availableSerialsCount: 0,
// //             damageRepairCount: 0,
// //             centerReturnCount: 0,
// //             hasResellerStock: false
// //           }
// //         };
// //       });

// //       // Calculate totals for the request
// //       const resellerStockTotals = productsWithEnhancedData.reduce((totals, product) => {
// //         totals.totalAvailable += product.resellerStock.availableQuantity;
// //         totals.damageRepair += product.resellerStock.availableBreakdown.damageRepair;
// //         totals.centerReturn += product.resellerStock.availableBreakdown.centerReturn;
// //         totals.directPurchase += product.resellerStock.availableBreakdown.directPurchase;
// //         return totals;
// //       }, {
// //         totalAvailable: 0,
// //         damageRepair: 0,
// //         centerReturn: 0,
// //         directPurchase: 0
// //       });

// //       return {
// //         ...request,
// //         products: productsWithEnhancedData,
// //         stockSummary: {
// //           centerStock: productsWithEnhancedData.reduce((sum, product) => 
// //             sum + product.centerStockQuantity, 0
// //           ),
// //           resellerStock: {
// //             totalAvailable: resellerStockTotals.totalAvailable,
// //             breakdown: {
// //               damageRepair: resellerStockTotals.damageRepair,
// //               centerReturn: resellerStockTotals.centerReturn,
// //               directPurchase: resellerStockTotals.directPurchase,
// //               percentage: {
// //                 damageRepair: resellerStockTotals.totalAvailable > 0 ? 
// //                   Math.round((resellerStockTotals.damageRepair / resellerStockTotals.totalAvailable) * 100) : 0,
// //                 centerReturn: resellerStockTotals.totalAvailable > 0 ? 
// //                   Math.round((resellerStockTotals.centerReturn / resellerStockTotals.totalAvailable) * 100) : 0,
// //                 directPurchase: resellerStockTotals.totalAvailable > 0 ? 
// //                   Math.round((resellerStockTotals.directPurchase / resellerStockTotals.totalAvailable) * 100) : 0
// //               }
// //             }
// //           },
// //           resellerInfo: resellerId ? {
// //             hasReseller: true,
// //             resellerId: resellerId
// //           } : {
// //             hasReseller: false
// //           }
// //         }
// //       };
// //     });

// //     const statusStats = statusCounts.reduce((acc, stat) => {
// //       acc[stat._id] = stat.count;
// //       return acc;
// //     }, {});

// //     // Calculate overall statistics across all requests
// //     const overallStats = stockRequestsWithEnhancedData.reduce((stats, request) => {
// //       stats.totalRequests += 1;
// //       stats.totalResellerAvailable += request.stockSummary.resellerStock.totalAvailable;
// //       stats.totalDamageRepair += request.stockSummary.resellerStock.breakdown.damageRepair;
// //       stats.totalCenterReturn += request.stockSummary.resellerStock.breakdown.centerReturn;
// //       stats.totalDirectPurchase += request.stockSummary.resellerStock.breakdown.directPurchase;
      
// //       // Count requests with reseller stock
// //       if (request.stockSummary.resellerInfo.hasReseller) {
// //         stats.requestsWithReseller += 1;
// //       }
      
// //       return stats;
// //     }, {
// //       totalRequests: 0,
// //       totalResellerAvailable: 0,
// //       totalDamageRepair: 0,
// //       totalCenterReturn: 0,
// //       totalDirectPurchase: 0,
// //       requestsWithReseller: 0
// //     });

// //     res.status(200).json({
// //       success: true,
// //       message: "Stock requests retrieved successfully",
// //       data: stockRequestsWithEnhancedData,
// //       pagination: {
// //         currentPage: parseInt(page),
// //         totalPages: Math.ceil(total / limit),
// //         totalItems: total,
// //         itemsPerPage: parseInt(limit),
// //       },
// //       filters: {
// //         status: statusStats,
// //         total: total,
// //       },
// //       summary: {
// //         overallResellerStock: {
// //           totalAvailable: overallStats.totalResellerAvailable,
// //           breakdown: {
// //             damageRepair: overallStats.totalDamageRepair,
// //             centerReturn: overallStats.totalCenterReturn,
// //             directPurchase: overallStats.totalDirectPurchase
// //           },
// //           percentage: {
// //             damageRepair: overallStats.totalResellerAvailable > 0 ? 
// //               Math.round((overallStats.totalDamageRepair / overallStats.totalResellerAvailable) * 100) : 0,
// //             centerReturn: overallStats.totalResellerAvailable > 0 ? 
// //               Math.round((overallStats.totalCenterReturn / overallStats.totalResellerAvailable) * 100) : 0,
// //             directPurchase: overallStats.totalResellerAvailable > 0 ? 
// //               Math.round((overallStats.totalDirectPurchase / overallStats.totalResellerAvailable) * 100) : 0
// //           }
// //         },
// //         requestsWithResellerStock: overallStats.requestsWithReseller,
// //         totalRequestsWithReseller: overallStats.totalRequests
// //       }
// //     });
// //   } catch (error) {
// //     console.error("Error retrieving stock requests:", error);
// //     res.status(500).json({
// //       success: false,
// //       message: "Error retrieving stock requests",
// //       error: error.message,
// //     });
// //   }
// // };
// //******************* resolve live reseller stock issue *********************
// export const getAllStockRequests = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["indent_all_center", "indent_own_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. indent_own_center or indent_all_center permission required.",
//       });
//     }
    
//     const {
//       page = 1,
//       limit = 100,
//       sortBy = "createdAt",
//       sortOrder = "desc",
//       startDate,
//       endDate,
//       status,
//       center: centerId,
//       reseller: resellerId,
//       orderNumber,
//       challanNo,
//       product: productId, // ***** ADDED: drill-down filter from Available Stock / Indent Summary *****
//       ...otherParams
//     } = req.query;

//     // ============ DEBUGGING LOGS ============
//     console.log('=== REQUEST QUERY PARAMETERS ===');
//     console.log('startDate:', startDate);
//     console.log('endDate:', endDate);
//     console.log('status:', status);
//     console.log('centerId:', centerId);
//     console.log('resellerId:', resellerId);
//     console.log('================================');

//     // Build filter properly
//     let filter = {};

//     // ============ 1. HANDLE STATUS FILTER ============
//     if (status) {
//       if (Array.isArray(status)) {
//         filter.status = { $in: status };
//       } else if (status.includes(',')) {
//         filter.status = { $in: status.split(',') };
//       } else {
//         filter.status = status;
//       }
//       console.log('✅ Status filter:', filter.status);
//     }

//     // ============ 2. HANDLE DATE RANGE FILTER ============
//     if (startDate || endDate) {
//       filter.createdAt = {};
      
//       if (startDate) {
//         const start = new Date(startDate);
//         if (isNaN(start.getTime())) {
//           return res.status(400).json({
//             success: false,
//             message: "Invalid startDate format. Please use YYYY-MM-DD format."
//           });
//         }
//         start.setHours(0, 0, 0, 0);
//         filter.createdAt.$gte = start;
//         console.log('✅ Start date filter:', start);
//       }
      
//       if (endDate) {
//         const end = new Date(endDate);
//         if (isNaN(end.getTime())) {
//           return res.status(400).json({
//             success: false,
//             message: "Invalid endDate format. Please use YYYY-MM-DD format."
//           });
//         }
//         end.setHours(23, 59, 59, 999);
//         filter.createdAt.$lte = end;
//         console.log('✅ End date filter:', end);
//       }
//     }

//     // ============ 3. HANDLE ORDER NUMBER FILTER ============
//     if (orderNumber) {
//       filter.orderNumber = { $regex: orderNumber, $options: 'i' };
//     }

//     // ============ 4. HANDLE CHALLAN NUMBER FILTER ============
//     if (challanNo) {
//       filter.challanNo = { $regex: challanNo, $options: 'i' };
//     }

//     // ============ 5. HANDLE RESELLER FILTER ============
//     let resellerCenterIds = null;
    
//     if (resellerId) {
//       console.log('🔍 Processing reseller filter with ID:', resellerId);
      
//       if (!mongoose.Types.ObjectId.isValid(resellerId)) {
//         console.log('❌ Invalid reseller ID format:', resellerId);
//         return res.status(400).json({
//           success: false,
//           message: `Invalid reseller ID format: ${resellerId}`
//         });
//       }
      
//       const Reseller = mongoose.model("Reseller");
//       const resellerExists = await Reseller.findById(resellerId);
      
//       if (!resellerExists) {
//         console.log('❌ Reseller not found with ID:', resellerId);
//         return res.status(404).json({
//           success: false,
//           message: `No reseller found with ID: ${resellerId}`
//         });
//       }
      
//       console.log('✅ Found reseller:', resellerExists.businessName);
      
//       const Center = mongoose.model("Center");
//       const matchingCenters = await Center.find({ 
//         reseller: new mongoose.Types.ObjectId(resellerId),
//         centerType: "Center"
//       }).select('_id');
      
//       console.log(`📊 Found ${matchingCenters.length} centers for this reseller`);
      
//       if (matchingCenters.length === 0) {
//         return res.status(200).json({
//           success: true,
//           message: "No stock requests found for this reseller",
//           data: [],
//           pagination: {
//             currentPage: parseInt(page),
//             totalPages: 0,
//             totalItems: 0,
//             itemsPerPage: parseInt(limit),
//           },
//           filters: { status: {}, total: 0 },
//         });
//       }
      
//       resellerCenterIds = matchingCenters.map(c => c._id);
//       console.log('Reseller center IDs:', resellerCenterIds.map(id => id.toString()));
//     }

//     // ============ 6. HANDLE CENTER FILTER WITH RESELLER INTERSECTION ============
//     if (resellerCenterIds) {
//       if (centerId) {
//         let requestedCenterIds = [];
        
//         if (Array.isArray(centerId)) {
//           requestedCenterIds = centerId.map(c => new mongoose.Types.ObjectId(c));
//         } else if (centerId.includes(',')) {
//           requestedCenterIds = centerId.split(',').map(c => new mongoose.Types.ObjectId(c));
//         } else if (mongoose.Types.ObjectId.isValid(centerId)) {
//           requestedCenterIds = [new mongoose.Types.ObjectId(centerId)];
//         }
        
//         const intersectionIds = requestedCenterIds.filter(requestedId => 
//           resellerCenterIds.some(resellerId => resellerId.toString() === requestedId.toString())
//         );
        
//         if (intersectionIds.length === 0) {
//           return res.status(200).json({
//             success: true,
//             message: "No stock requests found matching both reseller and center filters",
//             data: [],
//             pagination: {
//               currentPage: parseInt(page),
//               totalPages: 0,
//               totalItems: 0,
//               itemsPerPage: parseInt(limit),
//             },
//             filters: { status: {}, total: 0 },
//           });
//         }
        
//         filter.center = { $in: intersectionIds };
//         console.log('✅ Combined reseller + center filter:', filter.center);
//       } else {
//         filter.center = { $in: resellerCenterIds };
//         console.log('✅ Reseller-only filter:', filter.center);
//       }
//     } else if (centerId) {
//       if (Array.isArray(centerId)) {
//         filter.center = { $in: centerId.map(c => new mongoose.Types.ObjectId(c)) };
//       } else if (centerId.includes(',')) {
//         filter.center = { $in: centerId.split(',').map(c => new mongoose.Types.ObjectId(c)) };
//       } else if (mongoose.Types.ObjectId.isValid(centerId)) {
//         filter.center = new mongoose.Types.ObjectId(centerId);
//       } else {
//         filter.center = centerId;
//       }
//       console.log('✅ Center-only filter:', filter.center);
//     }

//     // ============ 7. APPLY USER CENTER PERMISSION FILTER ============
//     if (
//       permissions.indent_own_center &&
//       !permissions.indent_all_center &&
//       userCenter
//     ) {
//       const userCenterId = userCenter._id || userCenter;
//       console.log('🔒 Applying user center restriction:', userCenterId.toString());
      
//       if (filter.center) {
//         if (filter.center.$in) {
//           filter.center.$in = filter.center.$in.filter(centerId => 
//             centerId.toString() === userCenterId.toString()
//           );
//           if (filter.center.$in.length === 0) {
//             filter.center = { $in: [] };
//           }
//         } else if (filter.center._id) {
//           if (filter.center._id.toString() !== userCenterId.toString()) {
//             filter.center = { $in: [] };
//           }
//         } else if (filter.center.toString) {
//           if (filter.center.toString() !== userCenterId.toString()) {
//             filter.center = { $in: [] };
//           }
//         } else {
//           filter.center = userCenterId;
//         }
//       } else {
//         filter.center = userCenterId;
//       }
//     }

//     // ============ 7B. HANDLE PRODUCT FILTER (drill-down: "where is this stock used") ============
//     if (productId) {
//       if (!mongoose.Types.ObjectId.isValid(productId)) {
//         return res.status(400).json({
//           success: false,
//           message: `Invalid product ID format: ${productId}`,
//         });
//       }
//       // products is an array field, so match on the nested product id
//       filter["products.product"] = new mongoose.Types.ObjectId(productId);
//       console.log('✅ Product filter (products.product):', filter["products.product"]);
//     }

//     // ============ 8. HANDLE OTHER FILTER PARAMETERS ============
//     Object.keys(otherParams).forEach(key => {
//       if (otherParams[key] && key !== 'page' && key !== 'limit' && key !== 'sortBy' && key !== 'sortOrder') {
//         filter[key] = otherParams[key];
//       }
//     });

//     // Build sort options
//     const sortOptions = {};
//     sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

//     console.log('=== FINAL FILTER ===');
//     console.log(JSON.stringify(filter, null, 2));
//     console.log('===================');

//     // ============ FIXED POPULATE OPTIONS ============
//     const populateOptions = [
//       { 
//         path: 'center', 
//         select: 'centerName centerCode reseller area city addressLine1', 
//         populate: { 
//           path: 'reseller', 
//           select: 'businessName name mobile email' 
//         } 
//       },
//       { 
//         path: 'products.product', 
//         select: 'name sku modelNumber brand category productTitle' // Added productTitle field
//       },
//       { 
//         path: 'createdBy', 
//         select: 'name email' 
//       },
//       { 
//         path: 'updatedBy', 
//         select: 'name email' 
//       },
//       { 
//         path: 'approvalInfo.approvedBy', 
//         select: 'name email' 
//       },
//       { 
//         path: 'shippingInfo.shippedBy', 
//         select: 'name email' 
//       },
//       { 
//         path: 'receivingInfo.receivedBy', 
//         select: 'name email' 
//       }
//     ];

//     // Execute query with proper population
//     let stockRequestsQuery = StockRequest.find(filter)
//       .populate(populateOptions)
//       .sort(sortOptions)
//       .limit(parseInt(limit))
//       .skip((parseInt(page) - 1) * parseInt(limit))
//       .lean();

//     const [stockRequests, total, statusCounts] = await Promise.all([
//       stockRequestsQuery,
//       StockRequest.countDocuments(filter),
//       StockRequest.aggregate([
//         { $match: filter },
//         { $group: { _id: "$status", count: { $sum: 1 } } },
//       ]),
//     ]);

//     console.log(`📊 Query results: ${stockRequests.length} records found out of ${total} total`);

//     if (stockRequests.length === 0) {
//       return res.status(200).json({
//         success: true,
//         message: "No stock requests found",
//         data: [],
//         pagination: {
//           currentPage: parseInt(page),
//           totalPages: 0,
//           totalItems: 0,
//           itemsPerPage: parseInt(limit),
//         },
//         filters: { status: {}, total: 0 },
//       });
//     }

//     // Get center stock data
//     const stockMap = await getBulkCenterStock(stockRequests);
    
//     // Get reseller stock data for all centers
//     const resellerStockMap = new Map();
//     const centerToResellerMap = new Map();
    
//     // Collect all center IDs and product IDs for batch reseller stock lookup
//     const centerIds = stockRequests.map(req => req.center?._id).filter(Boolean);
//     const allProductIds = [];
    
//     stockRequests.forEach(request => {
//       if (request.products && Array.isArray(request.products)) {
//         request.products.forEach(product => {
//           if (product.product?._id) {
//             allProductIds.push(product.product._id.toString());
//           }
//         });
//       }
//     });
    
//     // Get unique product IDs
//     const uniqueProductIds = [...new Set(allProductIds)];
    
//     if (centerIds.length > 0 && uniqueProductIds.length > 0) {
//       // Get centers with their reseller information
//       const Center = mongoose.model("Center");
//       const centersWithResellers = await Center.find({
//         _id: { $in: centerIds }
//       }).populate('reseller', '_id businessName name email mobile').select('_id reseller');
      
//       // Create map of center ID to reseller info
//       centersWithResellers.forEach(center => {
//         if (center.reseller) {
//           centerToResellerMap.set(center._id.toString(), {
//             resellerId: center.reseller._id,
//             businessName: center.reseller.businessName,
//             name: center.reseller.name,
//             email: center.reseller.email,
//             mobile: center.reseller.mobile
//           });
//         }
//       });
      
//       // Get all unique reseller IDs
//       const uniqueResellerIds = [...new Set([...centerToResellerMap.values()].map(r => r.resellerId.toString()))];
      
//       if (uniqueResellerIds.length > 0) {
//         // Fetch reseller stock data in bulk
//         const ResellerStock = mongoose.model("ResellerStock");
//         const resellerStocks = await ResellerStock.find({
//           reseller: { $in: uniqueResellerIds.map(id => new mongoose.Types.ObjectId(id)) },
//           product: { $in: uniqueProductIds.map(id => new mongoose.Types.ObjectId(id)) }
//         }).lean();
        
//         // Create a map for quick lookup: key = "resellerId_productId"
//         resellerStocks.forEach(stock => {
//           const key = `${stock.reseller}_${stock.product}`;
          
//           // Calculate damage repair and center return quantities from serials
//           let damageRepairCount = 0;
//           let centerReturnCount = 0;
//           let availableSerials = [];
          
//           if (stock.serialNumbers && stock.serialNumbers.length > 0) {
//             const availableSerialsArray = stock.serialNumbers.filter(sn => sn.status === "available");
//             availableSerials = availableSerialsArray.map(sn => sn.serialNumber);
//             damageRepairCount = availableSerialsArray.filter(sn => sn.sourceType === "damage_repair").length;
//             centerReturnCount = availableSerialsArray.filter(sn => sn.sourceType === "center_return").length;
//           } else {
//             damageRepairCount = stock.sourceBreakdown?.damageRepairQuantity || 0;
//             centerReturnCount = stock.sourceBreakdown?.centerReturnQuantity || 0;
//           }
          
//           resellerStockMap.set(key, {
//             totalQuantity: stock.totalQuantity || 0,
//             availableQuantity: stock.availableQuantity || 0,
//             consumedQuantity: stock.consumedQuantity || 0,
//             damagedQuantity: stock.damagedQuantity || 0,
//             repairQuantity: stock.repairQuantity || 0,
//             sourceBreakdown: {
//               damageRepairQuantity: damageRepairCount,
//               centerReturnQuantity: centerReturnCount,
//               directPurchaseQuantity: (stock.availableQuantity || 0) - damageRepairCount - centerReturnCount
//             },
//             availableSerials: availableSerials,
//             availableSerialsCount: availableSerials.length
//           });
//         });
//       }
//     }

//     // Define default reseller stock object
//     const defaultResellerStock = {
//       totalQuantity: 0,
//       availableQuantity: 0,
//       sourceBreakdown: {
//         damageRepairQuantity: 0,
//         centerReturnQuantity: 0,
//         directPurchaseQuantity: 0
//       },
//       availableSerials: [],
//       availableSerialsCount: 0,
//       hasResellerStock: false
//     };

//     const stockRequestsWithEnhancedData = stockRequests.map((request) => {
//       const centerInfo = request.center?._id ? centerToResellerMap.get(request.center._id.toString()) : null;
      
//       const productsWithEnhancedData = (request.products || []).map((product) => {
//         if (!product.product?._id || !request.center?._id) {
//           // If product is not populated properly, try to get product name
//           if (product.product && typeof product.product === 'object') {
//             return {
//               ...product,
//               productName: product.product.name || product.product.productTitle || 'Unknown Product',
//               centerStockQuantity: 0,
//               resellerStock: defaultResellerStock
//             };
//           }
//           return {
//             ...product,
//             productName: 'Unknown Product',
//             centerStockQuantity: 0,
//             resellerStock: defaultResellerStock
//           };
//         }

//         const stockKey = `${request.center._id}_${product.product._id}`;
//         const centerStockQuantity = stockMap.get(stockKey) || 0;
        
//         // Get reseller stock data
//         let resellerStockInfo = null;
//         if (centerInfo) {
//           const resellerStockKey = `${centerInfo.resellerId}_${product.product._id}`;
//           resellerStockInfo = resellerStockMap.get(resellerStockKey);
//         }

//         // Extract product name properly
//         const productName = product.product.name || 
//                            product.product.productTitle || 
//                            product.product.sku || 
//                            'Unknown Product';

//         return {
//           ...product,
//           productName: productName, // Add product name for easy access
//           productDetails: {
//             _id: product.product._id,
//             name: productName,
//             sku: product.product.sku,
//             modelNumber: product.product.modelNumber,
//             brand: product.product.brand,
//             category: product.product.category
//           },
//           centerStockQuantity,
//           resellerStock: resellerStockInfo ? {
//             totalQuantity: resellerStockInfo.totalQuantity || 0,
//             availableQuantity: resellerStockInfo.availableQuantity || 0,
//             sourceBreakdown: resellerStockInfo.sourceBreakdown || defaultResellerStock.sourceBreakdown,
//             availableSerials: resellerStockInfo.availableSerials || [],
//             availableSerialsCount: resellerStockInfo.availableSerialsCount || 0,
//             hasResellerStock: true
//           } : defaultResellerStock
//         };
//       });

//       return {
//         ...request,
//         products: productsWithEnhancedData,
//         resellerInfo: centerInfo || null,
//         centerInfo: request.center,
//         requestNumber: request.orderNumber, // Alias for easy access
//         requestStatus: request.status // Alias for easy access
//       };
//     });

//     const statusStats = statusCounts.reduce((acc, stat) => {
//       acc[stat._id] = stat.count;
//       return acc;
//     }, {});

//     res.status(200).json({
//       success: true,
//       message: "Stock requests retrieved successfully",
//       data: stockRequestsWithEnhancedData,
//       pagination: {
//         currentPage: parseInt(page),
//         totalPages: Math.ceil(total / limit),
//         totalItems: total,
//         itemsPerPage: parseInt(limit),
//       },
//       filters: {
//         status: statusStats,
//         total: total,
//       }
//     });
//   } catch (error) {
//     console.error("Error retrieving stock requests:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error retrieving stock requests",
//       error: error.message,
//     });
//   }
// };

// // export const getStockRequestById = async (req, res) => {
// //   try {
// //     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
// //       req,
// //       ["indent_all_center", "indent_own_center"]
// //     );

// //     if (!hasAccess) {
// //       return res.status(403).json({
// //         success: false,
// //         message:
// //           "Access denied. indent_own_center or indent_all_center permission required.",
// //       });
// //     }

// //     const { id } = req.params;

// //     const stockRequest = await StockRequest.findById(id)
// //       .populate("warehouse", "_id centerName centerCode centerType")
// //       .populate({
// //         path: "center",
// //         select: "_id centerName centerCode centerType",
// //         populate: [
// //           {
// //             path: "reseller",
// //             select: "_id businessName contactNumber name mobile email gstNumber panNumber address1 address2 city state"
// //           },
// //           {
// //             path: "area",
// //             select: "_id areaName"
// //           }
// //         ]
// //       })
// //       .populate(
// //         "products.product",
// //         "_id productTitle productCode productImage trackSerialNumber"
// //       )
// //       .populate("createdBy", "_id fullName email")
// //       .populate("updatedBy", "_id fullName email")
// //       .populate("approvalInfo.approvedBy", "_id fullName email")
// //       .populate("approvalInfo.warehouseChallanApprovedBy","_id fullName email" )
// //       .populate("approvalInfo.centerChallanApprovedBy","_id fullName email" )
// //       .populate("shippingInfo.shippedBy", "_id fullName email")
// //       .populate("receivingInfo.receivedBy", "_id fullName email")
// //       .populate("completionInfo.completedBy", "_id fullName email")
// //       .populate("incompleteInfo.incompleteBy", "_id fullName email")
// //       .populate("rejectionInfo.rejectedBy", "_id fullName email")
// //       .lean();

// //     if (!stockRequest) {
// //       return res.status(404).json({
// //         success: false,
// //         message: "Stock request not found",
// //       });
// //     }

// //     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
// //       return res.status(403).json({
// //         success: false,
// //         message:
// //           "Access denied. You can only view stock requests from your own center.",
// //       });
// //     }

// //     const productIds = stockRequest.products.map((p) => p.product._id);

// //     const centerStock = await CenterStock.aggregate([
// //       {
// //         $match: {
// //           center: stockRequest.center._id,
// //           product: { $in: productIds },
// //         },
// //       },
// //       {
// //         $group: {
// //           _id: "$product",
// //           totalQuantity: { $sum: "$quantity" },
// //         },
// //       },
// //     ]);

// //     const centerStockMap = {};
// //     centerStock.forEach((stock) => {
// //       centerStockMap[stock._id.toString()] = stock.totalQuantity;
// //     });

// //     // Get outlet stock
// //     const outletStockMap = await getOutletStockForRequests(
// //       stockRequest.warehouse._id,
// //       productIds
// //     );

// //     // NEW: Get reseller stock for the center's reseller
// //     const ResellerStock = mongoose.model("ResellerStock");
// //     const resellerId = stockRequest.center?.reseller?._id;
    
// //     let resellerStockMap = new Map();
    
// //     if (resellerId) {
// //       // Get reseller stock for all products in the request
// //       const resellerStocks = await ResellerStock.find({
// //         reseller: resellerId,
// //         product: { $in: productIds }
// //       }).select("product availableQuantity totalQuantity consumedQuantity serialNumbers");
      
// //       // Create a map for easy lookup
// //       resellerStocks.forEach((stock) => {
// //         const availableSerials = stock.serialNumbers
// //           .filter(sn => sn.status === "available")
// //           .map(sn => sn.serialNumber);
        
// //         resellerStockMap.set(stock.product.toString(), {
// //           totalQuantity: stock.totalQuantity,
// //           availableQuantity: stock.availableQuantity,
// //           consumedQuantity: stock.consumedQuantity,
// //           damagedQuantity: stock.damagedQuantity,
// //           repairQuantity: stock.repairQuantity,
// //           hasSerialNumbers: stock.serialNumbers.length > 0,
// //           availableSerials: availableSerials,
// //           availableSerialsCount: availableSerials.length
// //         });
// //       });
// //     }

// //     const productsWithEnhancedData = stockRequest.products.map((product) => {
// //       const outletStock = outletStockMap.get(product.product._id.toString()) || {
// //         totalQuantity: 0,
// //         availableQuantity: 0,
// //         inTransitQuantity: 0,
// //       };

// //       const resellerStock = resellerStockMap.get(product.product._id.toString()) || {
// //         totalQuantity: 0,
// //         availableQuantity: 0,
// //         consumedQuantity: 0,
// //         damagedQuantity: 0,
// //         repairQuantity: 0,
// //         availableSerials: [],
// //         availableSerialsCount: 0
// //       };

// //       return {
// //         ...product,
// //         centerStockQuantity: centerStockMap[product.product._id.toString()] || 0,
// //         outletStock: {
// //           totalQuantity: outletStock.totalQuantity,
// //           availableQuantity: outletStock.availableQuantity,
// //           inTransitQuantity: outletStock.inTransitQuantity,
// //           hasSerialNumbers: outletStock.hasSerialNumbers,
// //           availableSerials: outletStock.availableSerials || []
// //         },
// //         resellerStock: { // NEW: Added reseller stock information
// //           totalQuantity: resellerStock.totalQuantity,
// //           availableQuantity: resellerStock.availableQuantity,
// //           consumedQuantity: resellerStock.consumedQuantity,
// //           damagedQuantity: resellerStock.damagedQuantity,
// //           repairQuantity: resellerStock.repairQuantity,
// //           hasSerialNumbers: resellerStock.hasSerialNumbers,
// //           availableSerials: resellerStock.availableSerials,
// //           availableSerialsCount: resellerStock.availableSerialsCount
// //         },
// //         approvedSerials: product.approvedSerials || [],
// //         serialNumbers: product.serialNumbers || [],
// //         transferredSerials: product.transferredSerials || [],
// //         serialSummary: {
// //           approvedCount: product.approvedSerials?.length || 0,
// //           transferredCount: product.transferredSerials?.length || 0,
// //           requiresSerialNumbers: product.product.trackSerialNumber === "Yes",
// //         },
// //       };
// //     });

// //     // Calculate totals for summary
// //     const totalResellerAvailable = productsWithEnhancedData.reduce(
// //       (sum, product) => sum + product.resellerStock.availableQuantity, 0
// //     );
    
// //     const totalOutletAvailable = productsWithEnhancedData.reduce(
// //       (sum, product) => sum + product.outletStock.availableQuantity, 0
// //     );

// //     const stockRequestWithEnhancedData = {
// //       ...stockRequest,
// //       products: productsWithEnhancedData,
// //       stockSummary: { // NEW: Added overall stock summary
// //         totalResellerAvailable,
// //         totalOutletAvailable,
// //         totalAvailable: totalResellerAvailable + totalOutletAvailable,
// //         resellerName: stockRequest.center?.reseller?.businessName || "N/A",
// //         resellerId: resellerId
// //       }
// //     };

// //     res.status(200).json({
// //       success: true,
// //       message: "Stock request retrieved successfully",
// //       data: stockRequestWithEnhancedData,
// //     });
// //   } catch (error) {
// //     if (error.name === "CastError") {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Invalid stock request ID",
// //       });
// //     }

// //     console.error("Error retrieving stock request:", error);
// //     res.status(500).json({
// //       success: false,
// //       message: "Error retrieving stock request",
// //       error: error.message,
// //     });
// //   }
// // };

// export const getStockRequestById = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["indent_all_center", "indent_own_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. indent_own_center or indent_all_center permission required.",
//       });
//     }

//     const { id } = req.params;

//     const stockRequest = await StockRequest.findById(id)
//       .populate("warehouse", "_id centerName centerCode centerType email addressLine1 addressLine2 city state")
//       .populate({
//         path: "center",
//         select: "_id centerName centerCode centerType email addressLine1 addressLine2 city state",
//         populate: [
//           {
//             path: "reseller",
//             select: "_id businessName contactNumber name mobile email gstNumber panNumber address1 address2 city state"
//           },
//           {
//             path: "area",
//             select: "_id areaName"
//           }
//         ]
//       })
//       .populate(
//         "products.product",
//         "_id productTitle productCode salePrice trackSerialNumber"
//       )
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email")
//       .populate("approvalInfo.approvedBy", "_id fullName email")
//       .populate("approvalInfo.warehouseChallanApprovedBy","_id fullName email" )
//       .populate("approvalInfo.centerChallanApprovedBy","_id fullName email" )
//       .populate("shippingInfo.shippedBy", "_id fullName email")
//       .populate("receivingInfo.receivedBy", "_id fullName email")
//       .populate("completionInfo.completedBy", "_id fullName email")
//       .populate("incompleteInfo.incompleteBy", "_id fullName email") 
//       .populate("rejectionInfo.rejectedBy", "_id fullName email")
//       .lean();

//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. You can only view stock requests from your own center.",
//       });
//     }

//     // FIX: Filter out products with null product references
//     const validProducts = stockRequest.products.filter(p => p && p.product && p.product._id);
    
//     if (validProducts.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "No valid products found in this stock request",
//         data: stockRequest
//       });
//     }

//     const productIds = validProducts.map((p) => p.product._id);

//     // Get center stock from CenterStock collection
//     const centerStock = await CenterStock.aggregate([
//       {
//         $match: {
//           center: stockRequest.center._id,
//           product: { $in: productIds },
//         },
//       },
//       {
//         $group: {
//           _id: "$product",
//           totalQuantity: { $sum: "$totalQuantity" },
//           availableQuantity: { $sum: "$availableQuantity" },
//           consumedQuantity: { $sum: "$consumedQuantity" },
//           inTransitQuantity: { $sum: "$inTransitQuantity" },
//         },
//       },
//     ]);

//     const centerStockMap = {};
//     centerStock.forEach((stock) => {
//       centerStockMap[stock._id.toString()] = {
//         totalQuantity: stock.totalQuantity,
//         availableQuantity: stock.availableQuantity,
//         consumedQuantity: stock.consumedQuantity,
//         inTransitQuantity: stock.inTransitQuantity,
//       };
//     });

//     // Get outlet stock
//     const outletStockMap = await getOutletStockForRequests(
//       stockRequest.warehouse._id,
//       productIds
//     );

//     // Get reseller stock for the center's reseller
//     const ResellerStock = mongoose.model("ResellerStock");
//     const resellerId = stockRequest.center?.reseller?._id;
    
//     let resellerStockMap = new Map();
    
//     if (resellerId) {
//       const resellerStocks = await ResellerStock.find({
//         reseller: resellerId,
//         product: { $in: productIds }
//       }).select("product availableQuantity totalQuantity consumedQuantity serialNumbers");
      
//       resellerStocks.forEach((stock) => {
//         const availableSerials = stock.serialNumbers
//           .filter(sn => sn.status === "available")
//           .map(sn => sn.serialNumber);
        
//         resellerStockMap.set(stock.product.toString(), {
//           totalQuantity: stock.totalQuantity,
//           availableQuantity: stock.availableQuantity,
//           consumedQuantity: stock.consumedQuantity,
//           damagedQuantity: stock.damagedQuantity,
//           repairQuantity: stock.repairQuantity,
//           hasSerialNumbers: stock.serialNumbers.length > 0,
//           availableSerials: availableSerials,
//           availableSerialsCount: availableSerials.length
//         });
//       });
//     }

//     // Get serial numbers from CenterStock for each product
//     const centerStockDetails = await CenterStock.find({
//       center: stockRequest.center._id,
//       product: { $in: productIds }
//     }).select("product serialNumbers");

//     const centerSerialNumbersMap = new Map();
//     centerStockDetails.forEach(stock => {
//       const availableSerials = stock.serialNumbers
//         .filter(sn => sn.status === "available")
//         .map(sn => sn.serialNumber);
      
//       centerSerialNumbersMap.set(stock.product.toString(), {
//         hasSerialNumbers: stock.serialNumbers.length > 0,
//         availableSerials: availableSerials,
//         availableSerialsCount: availableSerials.length,
//         allSerials: stock.serialNumbers
//       });
//     });

//     // Use validProducts instead of stockRequest.products
//     const productsWithEnhancedData = validProducts.map((product) => {
//       const productId = product.product._id.toString();
//       const stockInfo = centerStockMap[productId] || {
//         totalQuantity: 0,
//         availableQuantity: 0,
//         consumedQuantity: 0,
//         inTransitQuantity: 0,
//       };

//       const outletStock = outletStockMap.get(productId) || {
//         totalQuantity: 0,
//         availableQuantity: 0,
//         inTransitQuantity: 0,
//       };

//       const resellerStock = resellerStockMap.get(productId) || {
//         totalQuantity: 0,
//         availableQuantity: 0,
//         consumedQuantity: 0,
//         damagedQuantity: 0,
//         repairQuantity: 0,
//         availableSerials: [],
//         availableSerialsCount: 0
//       };

//       const centerSerials = centerSerialNumbersMap.get(productId) || {
//         hasSerialNumbers: false,
//         availableSerials: [],
//         availableSerialsCount: 0,
//         allSerials: []
//       };

//       return {
//         ...product,
//         centerStockQuantity: stockInfo.availableQuantity,
//         centerStockDetails: stockInfo,
//         outletStock: {
//           totalQuantity: outletStock.totalQuantity,
//           availableQuantity: outletStock.availableQuantity,
//           inTransitQuantity: outletStock.inTransitQuantity,
//           hasSerialNumbers: outletStock.hasSerialNumbers,
//           availableSerials: outletStock.availableSerials || []
//         },
//         centerStockSerials: {
//           hasSerialNumbers: centerSerials.hasSerialNumbers,
//           availableSerials: centerSerials.availableSerials,
//           availableSerialsCount: centerSerials.availableSerialsCount,
//           allSerials: centerSerials.allSerials
//         },
//         resellerStock: {
//           totalQuantity: resellerStock.totalQuantity,
//           availableQuantity: resellerStock.availableQuantity,
//           consumedQuantity: resellerStock.consumedQuantity,
//           damagedQuantity: resellerStock.damagedQuantity,
//           repairQuantity: resellerStock.repairQuantity,
//           hasSerialNumbers: resellerStock.hasSerialNumbers,
//           availableSerials: resellerStock.availableSerials,
//           availableSerialsCount: resellerStock.availableSerialsCount
//         },
//         approvedSerials: product.approvedSerials || [],
//         serialNumbers: product.serialNumbers || [],
//         transferredSerials: product.transferredSerials || [],
//         serialSummary: {
//           approvedCount: product.approvedSerials?.length || 0,
//           transferredCount: product.transferredSerials?.length || 0,
//           requiresSerialNumbers: product.product.trackSerialNumber === "Yes",
//           centerAvailableSerials: centerSerials.availableSerialsCount,
//           resellerAvailableSerials: resellerStock.availableSerialsCount
//         },
//       };
//     });

//     // Calculate totals
//     const totalCenterAvailable = productsWithEnhancedData.reduce(
//       (sum, product) => sum + product.centerStockQuantity, 0
//     );
    
//     const totalResellerAvailable = productsWithEnhancedData.reduce(
//       (sum, product) => sum + product.resellerStock.availableQuantity, 0
//     );
    
//     const totalOutletAvailable = productsWithEnhancedData.reduce(
//       (sum, product) => sum + product.outletStock.availableQuantity, 0
//     );

//     const stockRequestWithEnhancedData = {
//       ...stockRequest,
//       products: productsWithEnhancedData,
//       stockSummary: {
//         totalCenterAvailable,
//         totalResellerAvailable,
//         totalOutletAvailable,
//         totalAvailable: totalCenterAvailable + totalResellerAvailable + totalOutletAvailable,
//         resellerName: stockRequest.center?.reseller?.businessName || "N/A",
//         resellerId: resellerId,
//         centerName: stockRequest.center?.centerName || "N/A"
//       }
//     };

//     res.status(200).json({
//       success: true,
//       message: "Stock request retrieved successfully",
//       data: stockRequestWithEnhancedData,
//     });
//   } catch (error) {
//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock request ID",
//       });
//     }

//     console.error("Error retrieving stock request:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error retrieving stock request",
//       error: error.message,
//     });
//   }
// };

// export const updateStockRequest = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["manage_indent"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_indent permission required.",
//       });
//     }

//     const { id } = req.params;
//     const {
//       warehouse,
//       center,
//       remark,
//       products,
//       status,
//       approvalInfo,
//       shippingInfo,
//       receivingInfo,
//       completionInfo,
//       orderNumber,
//       rejectionReason, 
//     } = req.body;

//     const existingRequest = await StockRequest.findById(id);
//     if (!existingRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(existingRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. You can only manage stock requests from your own center.",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     const updateData = {
//       updatedBy: userId,
//       ...(warehouse && { warehouse }),
//       ...(center && { center }),
//       ...(remark !== undefined && { remark }),
//       ...(status && { status }),
//       ...(orderNumber && { orderNumber: orderNumber.trim() }),
//       ...(approvalInfo && {
//         approvalInfo: { ...existingRequest.approvalInfo, ...approvalInfo },
//       }),
//       ...(shippingInfo && {
//         shippingInfo: { ...existingRequest.shippingInfo, ...shippingInfo },
//       }),
//       ...(receivingInfo && {
//         receivingInfo: { ...existingRequest.receivingInfo, ...receivingInfo },
//       }),
//       ...(completionInfo && {
//         completionInfo: {
//           ...existingRequest.completionInfo,
//           ...completionInfo,
//         },
//       }),
//     };

//     if (status === "Rejected" && existingRequest.status !== "Rejected") {
//       if (!rejectionReason || rejectionReason.trim() === '') {
//         return res.status(400).json({
//           success: false,
//           message: "Rejection reason is required when rejecting a stock request",
//         });
//       }

//       await revertStockForRejectedRequest(existingRequest);
//       updateData.rejectionInfo = {
//         rejectedAt: new Date(),
//         rejectedBy: userId,
//         rejectionReason: rejectionReason.trim(),
//       };
//     }

//     if (products) {
//       if (["Draft", "Submitted"].includes(existingRequest.status)) {
//         updateData.products = products;
//       } else {
//         updateData.products = existingRequest.products.map(
//           (existingProduct, index) => {
//             const newProduct = products.find(
//               (p) => p.product.toString() === existingProduct.product.toString()
//             );
//             if (newProduct) {
//               return {
//                 ...existingProduct.toObject(),
//                 quantity:
//                   newProduct.quantity !== undefined
//                     ? newProduct.quantity
//                     : existingProduct.quantity,
//                 productRemark:
//                   newProduct.productRemark !== undefined
//                     ? newProduct.productRemark
//                     : existingProduct.productRemark,
//                 receivedQuantity:
//                   newProduct.receivedQuantity !== undefined
//                     ? newProduct.receivedQuantity
//                     : existingProduct.receivedQuantity,
//                 receivedRemark:
//                   newProduct.receivedRemark !== undefined
//                     ? newProduct.receivedRemark
//                     : existingProduct.receivedRemark,

//                 approvedSerials:
//                   newProduct.approvedSerials !== undefined
//                     ? newProduct.approvedSerials
//                     : existingProduct.approvedSerials,
//               };
//             }
//             return existingProduct;
//           }
//         );
//       }
//     }

//     if (status) {
//       const currentDate = new Date();

//       switch (status) {
//         case "Confirmed":
//           updateData.approvalInfo = {
//             ...existingRequest.approvalInfo,
//             approvedAt: currentDate,
//             approvedBy: userId,
//             ...approvalInfo,
//           };
//           break;
//         case "Shipped":
//           updateData.shippingInfo = {
//             ...existingRequest.shippingInfo,
//             shippedAt: currentDate,
//             shippedBy: userId,
//             ...shippingInfo,
//           };
//           break;
//         case "Completed":
//           updateData.receivingInfo = {
//             ...existingRequest.receivingInfo,
//             receivedAt: currentDate,
//             receivedBy: userId,
//             ...receivingInfo,
//           };
//           updateData.completionInfo = {
//             ...existingRequest.completionInfo,
//             completedOn: currentDate,
//             completedBy: userId,
//             ...completionInfo,
//           };
//           break;
//         case "Incompleted":
//           updateData.completionInfo = {
//             ...existingRequest.completionInfo,
//             incompleteOn: currentDate,
//             incompleteBy: userId,
//             incompleteRemark: completionInfo?.incompleteRemark || "",
//             ...completionInfo,
//           };
//           break;
//         case "Rejected":
          
//           // updateData.completionInfo = {
//           //   ...existingRequest.completionInfo,
//           //   incompleteOn: currentDate,
//           //   incompleteBy: userId,
//           //   ...completionInfo,
//           // };
//           break;
//       }
//     }

//     const updatedRequest = await StockRequest.findByIdAndUpdate(
//       id,
//       updateData,
//       { new: true, runValidators: true }
//     )
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode centerType")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email")
//       .populate("approvalInfo.approvedBy", "_id fullName email")
//       .populate("shippingInfo.shippedBy", "_id fullName email")
//       .populate("receivingInfo.receivedBy", "_id fullName email")
//       .populate("incompleteInfo.incompleteBy", "_id fullName email")
//       .populate("rejectionInfo.rejectedBy", "_id fullName email"); 
//     res.status(200).json({
//       success: true,
//       message: "Stock request updated successfully",
//       data: updatedRequest,
//     });
//   } catch (error) {
//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock request ID",
//       });
//     }

//     if (error.name === "ValidationError") {
//       const errors = Object.values(error.errors).map((err) => err.message);
//       return res.status(400).json({
//         success: false,
//         message: "Validation error",
//         errors,
//       });
//     }

//     if (error.code === 11000) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Order number already exists. Please use a different order number.",
//       });
//     }

//     console.error("Error updating stock request:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error updating stock request",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

// // async function revertStockForRejectedRequest(stockRequest) {
// //   try {
// //     const OutletStock = mongoose.model("OutletStock");
// //     const CenterStock = mongoose.model("CenterStock");

// //     for (const productItem of stockRequest.products) {
// //       if (
// //         productItem.approvedSerials &&
// //         productItem.approvedSerials.length > 0
// //       ) {
// //         const outletStock = await OutletStock.findOne({
// //           outlet: stockRequest.warehouse,
// //           product: productItem.product,
// //         });

// //         if (outletStock) {
// //           let revertedCount = 0;

// //           for (const serialNumber of productItem.approvedSerials) {
// //             const serial = outletStock.serialNumbers.find(
// //               (sn) => sn.serialNumber === serialNumber
// //             );

// //             if (serial) {
// //               if (serial.status === "in_transit") {
// //                 serial.status = "available";
// //                 serial.currentLocation = stockRequest.warehouse;

// //                 if (serial.transferHistory.length > 0) {
// //                   const lastTransfer =
// //                     serial.transferHistory[serial.transferHistory.length - 1];
// //                   if (lastTransfer.status === "in_transit") {
// //                     serial.transferHistory.pop();
// //                   }
// //                 }

// //                 revertedCount++;
// //                 console.log(
// //                   `Reverted serial ${serialNumber} back to available status due to request rejection`
// //                 );
// //               } else if (serial.status === "transferred") {
// //                 serial.status = "available";
// //                 serial.currentLocation = stockRequest.warehouse;

// //                 serial.transferHistory = serial.transferHistory.filter(
// //                   (transfer) =>
// //                     transfer.toCenter?.toString() !==
// //                     stockRequest.center.toString()
// //                 );

// //                 revertedCount++;
// //                 console.log(
// //                   `Reverted transferred serial ${serialNumber} back to available status due to request rejection`
// //                 );
// //               }
// //             }
// //           }

// //           if (revertedCount > 0) {
// //             outletStock.availableQuantity += revertedCount;

// //             const inTransitSerials = productItem.approvedSerials.filter(
// //               (serialNumber) => {
// //                 const serial = outletStock.serialNumbers.find(
// //                   (sn) => sn.serialNumber === serialNumber
// //                 );
// //                 return serial && serial.status === "in_transit";
// //               }
// //             );

// //             outletStock.inTransitQuantity -= inTransitSerials.length;

// //             const transferredSerials = productItem.approvedSerials.filter(
// //               (serialNumber) => {
// //                 const serial = outletStock.serialNumbers.find(
// //                   (sn) => sn.serialNumber === serialNumber
// //                 );
// //                 return serial && serial.status === "transferred";
// //               }
// //             );

// //             outletStock.totalQuantity += transferredSerials.length;

// //             await outletStock.save();
// //             console.log(
// //               `Reverted ${revertedCount} items back to available for product ${productItem.product} due to request rejection`
// //             );

// //             if (transferredSerials.length > 0) {
// //               const centerStock = await CenterStock.findOne({
// //                 center: stockRequest.center,
// //                 product: productItem.product,
// //               });

// //               if (centerStock) {
// //                 centerStock.serialNumbers = centerStock.serialNumbers.filter(
// //                   (sn) => !transferredSerials.includes(sn.serialNumber)
// //                 );

// //                 centerStock.totalQuantity -= transferredSerials.length;
// //                 centerStock.availableQuantity -= transferredSerials.length;

// //                 await centerStock.save();
// //                 console.log(
// //                   `Removed ${transferredSerials.length} items from center stock for product ${productItem.product} due to request rejection`
// //                 );
// //               }
// //             }
// //           }
// //         }
// //       }
// //     }

// //     stockRequest.products = stockRequest.products.map((productItem) => ({
// //       ...productItem.toObject(),
// //       approvedQuantity: 0,
// //       approvedSerials: [],
// //       transferredSerials: [],
// //       receivedQuantity: 0,
// //       receivedRemark: "",
// //     }));

// //     await stockRequest.save();
// //   } catch (error) {
// //     console.error("Error reverting stock for rejected request:", error);
// //     throw new Error(`Failed to revert stock: ${error.message}`);
// //   }
// // }

// async function revertStockForRejectedRequest(stockRequest) {
//   try {
//     const OutletStock = mongoose.model("OutletStock");
//     const CenterStock = mongoose.model("CenterStock");

//     for (const productItem of stockRequest.products) {
//       const outletStock = await OutletStock.findOne({
//         outlet: stockRequest.warehouse,
//         product: productItem.product,
//       });

//       if (!outletStock) {
//         console.log(`No outlet stock found for product ${productItem.product}`);
//         continue;
//       }

//       console.log(`Processing product ${productItem.product}:`);
//       console.log(`- Current outlet stock - Total: ${outletStock.totalQuantity}, Available: ${outletStock.availableQuantity}, InTransit: ${outletStock.inTransitQuantity}`);
//       console.log(`- Product approved quantity: ${productItem.approvedQuantity || 0}`);
//       console.log(`- Has approvedSerials: ${productItem.approvedSerials?.length || 0} serials`);

//       if (productItem.approvedSerials && productItem.approvedSerials.length > 0) {
//         let revertedCount = 0;
//         let transferredSerials = [];

//         for (const serialNumber of productItem.approvedSerials) {
//           const serial = outletStock.serialNumbers.find(
//             (sn) => sn.serialNumber === serialNumber
//           );

//           if (serial) {
//             if (serial.status === "in_transit") {
//               serial.status = "available";
//               serial.currentLocation = stockRequest.warehouse;

//               if (serial.transferHistory.length > 0) {
//                 const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
//                 if (lastTransfer.status === "in_transit") {
//                   serial.transferHistory.pop();
//                 }
//               }

//               revertedCount++;
//               console.log(`Reverted serial ${serialNumber} back to available status due to request rejection`);
//             } else if (serial.status === "transferred") {
//               serial.status = "available";
//               serial.currentLocation = stockRequest.warehouse;

//               serial.transferHistory = serial.transferHistory.filter(
//                 (transfer) =>
//                   transfer.toCenter?.toString() !== stockRequest.center.toString()
//               );

//               transferredSerials.push(serialNumber);
//               revertedCount++;
//               console.log(`Reverted transferred serial ${serialNumber} back to available status due to request rejection`);
//             }
//           }
//         }

//         if (revertedCount > 0) {
//           outletStock.availableQuantity += revertedCount;

//           const inTransitSerials = productItem.approvedSerials.filter((serialNumber) => {
//             const serial = outletStock.serialNumbers.find(
//               (sn) => sn.serialNumber === serialNumber
//             );
//             return serial && serial.status === "in_transit";
//           });

//           outletStock.inTransitQuantity -= inTransitSerials.length;

//           if (transferredSerials.length > 0) {
//             outletStock.totalQuantity += transferredSerials.length;
            
//             const centerStock = await CenterStock.findOne({
//               center: stockRequest.center,
//               product: productItem.product,
//             });

//             if (centerStock) {
//               centerStock.serialNumbers = centerStock.serialNumbers.filter(
//                 (sn) => !transferredSerials.includes(sn.serialNumber)
//               );

//               centerStock.totalQuantity -= transferredSerials.length;
//               centerStock.availableQuantity -= transferredSerials.length;

//               await centerStock.save();
//               console.log(`Removed ${transferredSerials.length} items from center stock for product ${productItem.product} due to request rejection`);
//             }
//           }

//           await outletStock.save();
//           console.log(`Reverted ${revertedCount} serialized items for product ${productItem.product}`);
//         }
//       } else if (productItem.approvedQuantity && productItem.approvedQuantity > 0) {

//         console.log(`Handling non-serialized product with approved quantity: ${productItem.approvedQuantity}`);
        
//         const currentInTransit = outletStock.inTransitQuantity || 0;
//         console.log(`Current in-transit quantity in outlet: ${currentInTransit}`);

//         if (currentInTransit >= productItem.approvedQuantity) {
//           outletStock.availableQuantity += productItem.approvedQuantity;
//           outletStock.inTransitQuantity -= productItem.approvedQuantity;
//           console.log(`Reverted ${productItem.approvedQuantity} non-serialized items from in_transit to available`);
//         } else {
//           const revertableQuantity = Math.min(currentInTransit, productItem.approvedQuantity);
//           if (revertableQuantity > 0) {
//             outletStock.availableQuantity += revertableQuantity;
//             outletStock.inTransitQuantity -= revertableQuantity;
//             console.log(`Reverted ${revertableQuantity} non-serialized items (partial, from ${currentInTransit} available in_transit)`);
//           }
//           const centerStock = await CenterStock.findOne({
//             center: stockRequest.center,
//             product: productItem.product,
//           });

//           if (centerStock) {
//             const centerTotalQuantity = centerStock.totalQuantity || 0;
//             const potentiallyTransferred = productItem.approvedQuantity - revertableQuantity;
            
//             if (potentiallyTransferred > 0 && centerTotalQuantity >= potentiallyTransferred) {

//               centerStock.totalQuantity -= potentiallyTransferred;
//               centerStock.availableQuantity -= potentiallyTransferred;
              
//               outletStock.totalQuantity += potentiallyTransferred;
              
//               await centerStock.save();
//               console.log(`Removed ${potentiallyTransferred} non-serialized items from center stock and added back to outlet total quantity`);
//             }
//           }
//         }

//         await outletStock.save();
//         console.log(`Updated outlet stock for non-serialized product ${productItem.product}: Total=${outletStock.totalQuantity}, Available=${outletStock.availableQuantity}, InTransit=${outletStock.inTransitQuantity}`);
//       }
//       productItem.approvedQuantity = 0;
//       productItem.approvedSerials = [];
//       productItem.transferredSerials = [];
//       productItem.receivedQuantity = 0;
//       productItem.receivedRemark = "";
//     }

//     await stockRequest.save();
//     console.log("Successfully reverted stock for rejected request");
//   } catch (error) {
//     console.error("Error reverting stock for rejected request:", error);
//     throw new Error(`Failed to revert stock: ${error.message}`);
//   }
// }

// export const deleteStockRequest = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["delete_indent_all_center", "delete_indent_own_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. delete_indent_own_center or delete_indent_all_center permission required.",
//       });
//     }

//     const { id } = req.params;

//     const stockRequest = await StockRequest.findById(id);

//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (
//       permissions.delete_indent_own_center &&
//       !permissions.delete_indent_all_center &&
//       userCenter
//     ) {
//       const userCenterId = userCenter._id || userCenter;
//       const requestCenterId = stockRequest.center._id || stockRequest.center;
//       if (userCenterId.toString() !== requestCenterId.toString()) {
//         return res.status(403).json({
//           success: false,
//           message:
//             "Access denied. You can only delete stock requests from your own center.",
//         });
//       }
//     }

//     if (
//       !["Submitted", "Incompleted", "Draft", "Completed", "Confirmed"].includes(
//         stockRequest.status
//       )
//     ) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Only Submitted, Incompleted, Draft, Confirmed and Completed stock requests can be deleted",
//       });
//     }

//     await StockRequest.findByIdAndDelete(id);

//     res.status(200).json({
//       success: true,
//       message: "Stock request deleted successfully",
//     });
//   } catch (error) {
//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock request ID",
//       });
//     }

//     console.error("Error deleting stock request:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error deleting stock request",
//       error: error.message,
//     });
//   }
// };

// export const validateSerialNumbers = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { productApprovals } = req.body;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     const validationResults = await stockRequest.validateSerialNumbers(
//       productApprovals
//     );

//     const hasErrors = validationResults.some((result) => !result.valid);

//     res.status(200).json({
//       success: true,
//       message: hasErrors
//         ? "Some serial numbers validation failed"
//         : "All serial numbers are valid",
//       data: validationResults,
//       isValid: !hasErrors,
//     });
//   } catch (error) {
//     console.error("Error validating serial numbers:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error validating serial numbers",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

// // export const approveStockRequest = async (req, res) => {
// //   try {
// //     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
// //       req,
// //       ["stock_transfer_approve_from_outlet", "manage_indent"]
// //     );

// //     if (!hasAccess) {
// //       return res.status(403).json({
// //         success: false,
// //         message:
// //           "Access denied. stock_transfer_approve_from_outlet or manage_indent permission required.",
// //       });
// //     }

// //     const { id } = req.params;
// //     const { productApprovals } = req.body;

// //     const stockRequest = await StockRequest.findById(id)
// //       .populate("center", "reseller centerType centerName centerCode")
// //       .populate("warehouse", "centerType centerName centerCode");
    
// //     if (!stockRequest) {
// //       return res.status(404).json({
// //         success: false,
// //         message: "Stock request not found",
// //       });
// //     }

// //     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
// //       return res.status(403).json({
// //         success: false,
// //         message:
// //           "Access denied. You can only approve stock requests from your own center.",
// //       });
// //     }

// //     const userId = req.user?.id;
// //     if (!userId) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "User authentication required",
// //       });
// //     }

// //     // Get reseller ID from the center making the request
// //     // IMPORTANT: Check if center has reseller populated
// //     const resellerId = stockRequest.center?.reseller?._id || stockRequest.center?.reseller;
    
// //     // Check center type - only "Center" type should have reseller
// //     const centerType = stockRequest.center?.centerType;
    
// //     if (centerType === "Center" && !resellerId) {
// //       return res.status(400).json({
// //         success: false,
// //         message: `Center "${stockRequest.center?.centerName || stockRequest.center}" is of type "Center" but does not have an associated reseller. Please update the center information.`,
// //         centerId: stockRequest.center?._id,
// //         centerName: stockRequest.center?.centerName,
// //       });
// //     }

// //     const ResellerStock = mongoose.model("ResellerStock");
// //     const OutletStock = mongoose.model("OutletStock");
// //     const Product = mongoose.model("Product");

// //     // Validate product approvals and check stock availability
// //     if (productApprovals && productApprovals.length > 0) {
// //       for (const approval of productApprovals) {
// //         const productItem = stockRequest.products.find(
// //           (p) => p.product.toString() === approval.productId.toString()
// //         );

// //         if (!productItem) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Product ${approval.productId} not found in stock request`,
// //           });
// //         }

// //         // Validate approved quantity
// //         if (
// //           approval.approvedQuantity === undefined ||
// //           approval.approvedQuantity === null
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approved quantity is required for product ${productItem.product}`,
// //           });
// //         }

// //         if (
// //           typeof approval.approvedQuantity !== "number" ||
// //           isNaN(approval.approvedQuantity)
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approved quantity must be a valid number for product ${productItem.product}`,
// //           });
// //         }

// //         if (approval.approvedQuantity < 0) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approved quantity cannot be negative for product ${productItem.product}`,
// //           });
// //         }

// //         if (approval.approvedQuantity > productItem.quantity) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approved quantity (${approval.approvedQuantity}) cannot exceed requested quantity (${productItem.quantity}) for product ${productItem.product}`,
// //           });
// //         }

// //         if (
// //           approval.approvedQuantity === 0 &&
// //           (!approval.approvedRemark || approval.approvedRemark.trim() === "")
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approval remark is required when approved quantity is zero for product ${productItem.product}`,
// //           });
// //         }

// //         // Check stock availability - MODIFIED to handle case when no reseller
// //         if (approval.approvedQuantity > 0) {
// //           const productDoc = await Product.findById(approval.productId);
// //           const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

// //           let totalAvailable = 0;
// //           let resellerAvailable = 0;
// //           let outletAvailable = 0;
// //           let hasResellerStock = false;
          
// //           // Only check reseller stock if center has a reseller
// //           if (resellerId) {
// //             const resellerStock = await ResellerStock.findOne({
// //               reseller: resellerId,
// //               product: approval.productId,
// //             });

// //             if (resellerStock) {
// //               resellerAvailable = resellerStock.availableQuantity || 0;
// //               hasResellerStock = true;
// //             }
// //           }

// //           // Always check outlet stock
// //           const outletStock = await OutletStock.findOne({
// //             outlet: stockRequest.warehouse,
// //             product: approval.productId,
// //           });

// //           if (outletStock) {
// //             outletAvailable = outletStock.availableQuantity || 0;
// //           }
          
// //           totalAvailable = resellerAvailable + outletAvailable;

// //           if (totalAvailable < approval.approvedQuantity) {
// //             let message = `Insufficient total stock for product ${productDoc?.productTitle || approval.productId}. `;
// //             message += `Available: ${totalAvailable}`;
            
// //             if (hasResellerStock) {
// //               message += ` (Reseller: ${resellerAvailable}, Outlet: ${outletAvailable})`;
// //             } else {
// //               message += ` (Outlet: ${outletAvailable})`;
// //             }
            
// //             message += `, Requested: ${approval.approvedQuantity}`;
            
// //             return res.status(400).json({
// //               success: false,
// //               message,
// //               availableQuantity: totalAvailable,
// //               resellerAvailable,
// //               outletAvailable,
// //               requestedQuantity: approval.approvedQuantity,
// //             });
// //           }

// //           if (tracksSerialNumbers) {
// //             if (!approval.approvedSerials || approval.approvedSerials.length === 0) {
// //               return res.status(400).json({
// //                 success: false,
// //                 message: `Serial numbers are required for product ${productDoc.productTitle} as it tracks serial numbers`,
// //               });
// //             }

// //             if (approval.approvedSerials.length !== approval.approvedQuantity) {
// //               return res.status(400).json({
// //                 success: false,
// //                 message: `Number of serial numbers (${approval.approvedSerials.length}) must match approved quantity (${approval.approvedQuantity}) for product ${productDoc.productTitle}`,
// //               });
// //             }

// //             // Check serial numbers - MODIFIED to handle case when no reseller
// //             const availableSerials = [];
// //             const unavailableSerials = [];
            
// //             let resellerSerialsFound = 0;
            
// //             // First check reseller stock for serials (if center has reseller)
// //             if (resellerId && hasResellerStock) {
// //               const resellerStock = await ResellerStock.findOne({
// //                 reseller: resellerId,
// //                 product: approval.productId,
// //               });
              
// //               if (resellerStock) {
// //                 for (const serialNumber of approval.approvedSerials) {
// //                   const serial = resellerStock.serialNumbers.find(
// //                     sn => sn.serialNumber === serialNumber && sn.status === "available"
// //                   );
// //                   if (serial) {
// //                     availableSerials.push(serialNumber);
// //                     resellerSerialsFound++;
// //                   } else {
// //                     unavailableSerials.push(serialNumber);
// //                   }
// //                 }
// //               }
// //             } else {
// //               // If no reseller, all serials need to be checked in outlet
// //               unavailableSerials.push(...approval.approvedSerials);
// //             }
            
// //             // Then check outlet stock for remaining serials
// //             if (unavailableSerials.length > 0 && outletStock) {
// //               const remainingSerials = [...unavailableSerials];
// //               unavailableSerials.length = 0; // Clear array
              
// //               for (const serialNumber of remainingSerials) {
// //                 const serial = outletStock.serialNumbers.find(
// //                   sn => sn.serialNumber === serialNumber && sn.status === "available"
// //                 );
// //                 if (serial) {
// //                   availableSerials.push(serialNumber);
// //                 } else {
// //                   unavailableSerials.push(serialNumber);
// //                 }
// //               }
// //             }
            
// //             if (unavailableSerials.length > 0) {
// //               let errorMessage = `Some serial numbers are not available`;
              
// //               if (hasResellerStock) {
// //                 errorMessage += ` in reseller or outlet stock`;
// //               } else {
// //                 errorMessage += ` in outlet stock`;
// //               }
              
// //               errorMessage += ` for product ${productDoc.productTitle}: ${unavailableSerials.join(", ")}`;
              
// //               return res.status(400).json({
// //                 success: false,
// //                 message: errorMessage,
// //                 unavailableSerials,
// //                 resellerAvailable,
// //                 outletAvailable,
// //                 totalAvailable: totalAvailable,
// //               });
// //             }
            
// //             // Store source details
// //             approval._sourceDetails = {
// //               fromReseller: approval.approvedSerials.slice(0, resellerSerialsFound),
// //               fromOutlet: approval.approvedSerials.slice(resellerSerialsFound),
// //               resellerCount: resellerSerialsFound,
// //               outletCount: approval.approvedSerials.length - resellerSerialsFound,
// //               hasReseller: hasResellerStock
// //             };
// //           } else {
// //             if (approval.approvedSerials && approval.approvedSerials.length > 0) {
// //               return res.status(400).json({
// //                 success: false,
// //                 message: `Serial numbers should not be provided for product ${productDoc.productTitle} as it does not track serial numbers`,
// //               });
// //             }
            
// //             // Store quantity distribution
// //             const resellerQty = hasResellerStock ? Math.min(resellerAvailable, approval.approvedQuantity) : 0;
// //             const outletQty = approval.approvedQuantity - resellerQty;
            
// //             approval._sourceDetails = {
// //               fromReseller: resellerQty,
// //               fromOutlet: outletQty,
// //               resellerCount: resellerQty,
// //               outletCount: outletQty,
// //               hasReseller: hasResellerStock
// //             };
// //           }
// //         } else {
// //           const productDoc = await Product.findById(approval.productId);
// //           if (approval.approvedSerials && approval.approvedSerials.length > 0) {
// //             return res.status(400).json({
// //               success: false,
// //               message: `Serial numbers should not be provided when approved quantity is zero for product ${productDoc.productTitle}`,
// //             });
// //           }
// //         }
// //       }

// //       const productApprovalsWithQuantity = productApprovals.filter(
// //         (pa) => pa.approvedQuantity > 0
// //       );

// //       if (productApprovalsWithQuantity.length > 0) {
// //         const validationResults = await stockRequest.validateSerialNumbers(
// //           productApprovalsWithQuantity
// //         );
// //         const invalidResults = validationResults.filter(
// //           (result) => !result.valid
// //         );

// //         if (invalidResults.length > 0) {
// //           return res.status(400).json({
// //             success: false,
// //             message: "Serial number validation failed",
// //             validationErrors: invalidResults.map((result) => ({
// //               productId: result.productId,
// //               productName: result.productName,
// //               error: result.error,
// //             })),
// //           });
// //         }
// //       }
// //     }

// //     // Update stockRequest products with source breakdown
// //     const updatedProducts = stockRequest.products.map(productItem => {
// //       const approval = productApprovals.find(
// //         pa => pa.productId.toString() === productItem.product.toString()
// //       );
      
// //       if (approval && approval._sourceDetails) {
// //         const sourceDetails = approval._sourceDetails;
        
// //         const sourceBreakdown = {
// //           fromReseller: {
// //             quantity: sourceDetails.resellerCount,
// //             serials: sourceDetails.fromReseller instanceof Array ? 
// //               sourceDetails.fromReseller : []
// //           },
// //           fromOutlet: {
// //             quantity: sourceDetails.outletCount,
// //             serials: sourceDetails.fromOutlet instanceof Array ? 
// //               sourceDetails.fromOutlet : []
// //           },
// //           totalApproved: approval.approvedQuantity,
// //           hasReseller: sourceDetails.hasReseller
// //         };
        
// //         return {
// //           ...productItem.toObject(),
// //           approvedQuantity: approval.approvedQuantity,
// //           approvedRemark: approval.approvedRemark || "",
// //           approvedSerials: approval.approvedSerials || [],
// //           sourceBreakdown: sourceBreakdown
// //         };
// //       }
// //       return productItem;
// //     });

// //     stockRequest.products = updatedProducts;
// //     await stockRequest.save();

// //     // Process stock allocation
// //     if (productApprovals && productApprovals.length > 0) {
// //       for (const approval of productApprovals) {
// //         if (approval.approvedQuantity > 0) {
// //           const sourceDetails = approval._sourceDetails;
          
// //           // Process from reseller stock (if available)
// //           if (sourceDetails.resellerCount > 0 && sourceDetails.hasReseller) {
// //             const resellerStock = await ResellerStock.findOne({
// //               reseller: resellerId,
// //               product: approval.productId,
// //             });

// //             if (resellerStock) {
// //               if (sourceDetails.fromReseller instanceof Array) {
// //                 // Serialized products from reseller
// //                 for (const serialNumber of sourceDetails.fromReseller) {
// //                   const serial = resellerStock.serialNumbers.find(
// //                     (sn) => sn.serialNumber === serialNumber
// //                   );

// //                   if (serial && serial.status === "available") {
// //                     serial.status = "consumed";
// //                     serial.currentLocation = stockRequest.center;
// //                     serial.consumedDate = new Date();
// //                     serial.consumedBy = userId;

// //                     serial.transferHistory.push({
// //                       fromCenter: null,
// //                       toCenter: stockRequest.center,
// //                       transferDate: new Date(),
// //                       transferType: "outbound_transfer",
// //                       remark: "Stock request approval",
// //                       transferredBy: userId,
// //                       referenceId: stockRequest._id
// //                     });
// //                   }
// //                 }

// //                 resellerStock.availableQuantity -= sourceDetails.resellerCount;
// //                 resellerStock.consumedQuantity += sourceDetails.resellerCount;
                
// //                 console.log(`Deducted ${sourceDetails.resellerCount} serials from reseller stock`);
// //               } else {
// //                 // Non-serialized products from reseller
// //                 resellerStock.availableQuantity -= sourceDetails.resellerCount;
// //                 resellerStock.consumedQuantity += sourceDetails.resellerCount;
                
// //                 console.log(`Deducted ${sourceDetails.resellerCount} units from reseller stock (non-serialized)`);
// //               }

// //               await resellerStock.save();
// //             }
// //           }

// //           // Process from outlet stock
// //           if (sourceDetails.outletCount > 0) {
// //             const outletStock = await OutletStock.findOne({
// //               outlet: stockRequest.warehouse,
// //               product: approval.productId,
// //             });

// //             if (outletStock) {
// //               if (sourceDetails.fromOutlet instanceof Array) {
// //                 // Serialized products from outlet
// //                 for (const serialNumber of sourceDetails.fromOutlet) {
// //                   const serial = outletStock.serialNumbers.find(
// //                     (sn) => sn.serialNumber === serialNumber
// //                   );

// //                   if (serial && serial.status === "available") {
// //                     serial.status = "in_transit";
// //                     serial.currentLocation = stockRequest.warehouse;

// //                     serial.transferHistory.push({
// //                       fromCenter: stockRequest.warehouse,
// //                       toCenter: stockRequest.center,
// //                       transferDate: new Date(),
// //                       transferType: "outlet_to_center",
// //                     });
// //                   }
// //                 }

// //                 outletStock.availableQuantity -= sourceDetails.outletCount;
// //                 outletStock.inTransitQuantity += sourceDetails.outletCount;
                
// //                 console.log(`Marked ${sourceDetails.outletCount} serials as in_transit from outlet stock`);
// //               } else {
// //                 // Non-serialized products from outlet
// //                 outletStock.availableQuantity -= sourceDetails.outletCount;
// //                 outletStock.inTransitQuantity += sourceDetails.outletCount;
                
// //                 console.log(`Marked ${sourceDetails.outletCount} units as in_transit from outlet stock (non-serialized)`);
// //               }

// //               await outletStock.save();
// //             }
// //           }
// //         }
// //       }
// //     }

// //     // Now call approveRequest
// //     const updatedRequest = await stockRequest.approveRequest(
// //       userId,
// //       productApprovals
// //     );

// //     const populatedRequest = await StockRequest.findById(updatedRequest._id)
// //       .populate("warehouse", "_id centerName centerCode centerType")
// //       .populate("center", "_id centerName centerCode centerType")
// //       .populate("products.product", "_id productTitle productCode productImage")
// //       .populate("approvalInfo.approvedBy", "_id fullName email")
// //       .populate("createdBy", "_id fullName email")
// //       .populate("updatedBy", "_id fullName email");

// //     res.status(200).json({
// //       success: true,
// //       message: "Stock request approved successfully",
// //       data: populatedRequest,
// //     });
// //   } catch (error) {
// //     console.error("Error approving stock request:", error);

// //     if (
// //       error.message.includes("Number of serial numbers") ||
// //       error.message.includes("Duplicate serial numbers") ||
// //       error.message.includes("serial numbers not available") ||
// //       error.message.includes("Approved quantity") ||
// //       error.message.includes("Serial numbers are required") ||
// //       error.message.includes("Serial numbers should not be provided") ||
// //       error.message.includes("Approved quantity is required") ||
// //       error.message.includes("Approved quantity must be a valid number") ||
// //       error.message.includes("Approved quantity cannot be negative") ||
// //       error.message.includes("Approval remark is required") ||
// //       error.message.includes("No stock available") ||
// //       error.message.includes("Insufficient stock")
// //     ) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Validation failed",
// //         error: error.message,
// //       });
// //     }

// //     if (error.code === 11000 && error.keyPattern && error.keyPattern.challanNo) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Duplicate challan number generated. Please try again.",
// //         error: "Challan number conflict",
// //       });
// //     }

// //     res.status(500).json({
// //       success: false,
// //       message: "Error approving stock request",
// //       error:
// //         process.env.NODE_ENV === "development"
// //           ? error.message
// //           : "Internal server error",
// //     });
// //   }
// // };



// export const approveStockRequest = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["stock_transfer_approve_from_outlet", "manage_indent"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. stock_transfer_approve_from_outlet or manage_indent permission required.",
//       });
//     }

//     const { id } = req.params;
//     const { productApprovals } = req.body;

//     const stockRequest = await StockRequest.findById(id)
//       .populate("center", "reseller centerType centerName centerCode")
//       .populate("warehouse", "centerType centerName centerCode");

//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. You can only approve stock requests from your own center.",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     const resellerId = stockRequest.center?.reseller?._id || stockRequest.center?.reseller;
//     const centerType = stockRequest.center?.centerType;

//     if (centerType === "Center" && !resellerId) {
//       return res.status(400).json({
//         success: false,
//         message: `Center "${stockRequest.center?.centerName || stockRequest.center}" is of type "Center" but does not have an associated reseller. Please update the center information.`,
//         centerId: stockRequest.center?._id,
//         centerName: stockRequest.center?.centerName,
//       });
//     }

//     const ResellerStock = mongoose.model("ResellerStock");
//     const OutletStock = mongoose.model("OutletStock");
//     const Product = mongoose.model("Product");

//     // ─────────────────────────────────────────────────────────────────────────
//     // PHASE 1: Validate all product approvals + calculate source breakdowns
//     // (NO STOCK REDUCTION - Only validation)
//     // ─────────────────────────────────────────────────────────────────────────
//     if (productApprovals && productApprovals.length > 0) {
//       for (const approval of productApprovals) {
//         const productItem = stockRequest.products.find(
//           (p) => p.product.toString() === approval.productId.toString()
//         );

//         if (!productItem) {
//           return res.status(400).json({
//             success: false,
//             message: `Product ${approval.productId} not found in stock request`,
//           });
//         }

//         if (approval.approvedQuantity === undefined || approval.approvedQuantity === null) {
//           return res.status(400).json({
//             success: false,
//             message: `Approved quantity is required for product ${productItem.product}`,
//           });
//         }

//         if (typeof approval.approvedQuantity !== "number" || isNaN(approval.approvedQuantity)) {
//           return res.status(400).json({
//             success: false,
//             message: `Approved quantity must be a valid number for product ${productItem.product}`,
//           });
//         }

//         if (approval.approvedQuantity < 0) {
//           return res.status(400).json({
//             success: false,
//             message: `Approved quantity cannot be negative for product ${productItem.product}`,
//           });
//         }

//         if (approval.approvedQuantity === 0 && (!approval.approvedRemark || approval.approvedRemark.trim() === "")) {
//           return res.status(400).json({
//             success: false,
//             message: `Approval remark is required when approved quantity is zero for product ${productItem.product}`,
//           });
//         }

//         const productDoc = await Product.findById(approval.productId);
//         if (!productDoc) {
//           return res.status(400).json({
//             success: false,
//             message: `Product document not found for ID ${approval.productId}`,
//           });
//         }

//         const tracksSerialNumbers = productDoc.trackSerialNumber === "Yes";

//         let resellerAvailable = 0;
//         let outletAvailable = 0;
//         let hasResellerStock = false;

//         if (resellerId) {
//           const resellerStock = await ResellerStock.findOne({
//             reseller: resellerId,
//             product: approval.productId,
//           });
//           if (resellerStock) {
//             resellerAvailable = resellerStock.availableQuantity || 0;
//             hasResellerStock = true;
//           }
//         }

//         const outletStockDoc = await OutletStock.findOne({
//           outlet: stockRequest.warehouse,
//           product: approval.productId,
//         });
//         if (outletStockDoc) {
//           outletAvailable = outletStockDoc.availableQuantity || 0;
//         }

//         let fromResellerQty = 0;
//         let fromOutletQty = 0;
//         let fromResellerSerials = [];
//         let fromOutletSerials = [];

//         if (tracksSerialNumbers && approval.approvedSerials && approval.approvedSerials.length > 0) {
//           if (approval.approvedSerials.length !== approval.approvedQuantity) {
//             return res.status(400).json({
//               success: false,
//               message: `Number of serial numbers (${approval.approvedSerials.length}) must match approved quantity (${approval.approvedQuantity}) for product ${productDoc.productTitle}`,
//             });
//           }

//           const serials = approval.approvedSerials;

//           if (hasResellerStock && resellerAvailable > 0) {
//             const resellerStockDoc = await ResellerStock.findOne({
//               reseller: resellerId,
//               product: approval.productId,
//             });

//             if (resellerStockDoc) {
//               for (const serialNumber of serials) {
//                 const serial = resellerStockDoc.serialNumbers.find(
//                   (sn) => sn.serialNumber === serialNumber && sn.status === "available"
//                 );
//                 if (serial) {
//                   fromResellerSerials.push(serialNumber);
//                 }
//               }
//             }
//           }

//           fromOutletSerials = serials.filter(
//             (sn) => !fromResellerSerials.includes(sn)
//           );

//           fromResellerQty = fromResellerSerials.length;
//           fromOutletQty = fromOutletSerials.length;

//           // Only validate availability - DO NOT REDUCE STOCK
//           if (fromOutletQty > outletAvailable) {
//             return res.status(400).json({
//               success: false,
//               message: `Insufficient outlet stock for product "${productDoc.productTitle}". Outlet available: ${outletAvailable}, required from outlet: ${fromOutletQty}`,
//             });
//           }

//           if (fromResellerSerials.length > 0 && hasResellerStock) {
//             const resellerStockDoc = await ResellerStock.findOne({
//               reseller: resellerId,
//               product: approval.productId,
//             });

//             for (const serialNumber of fromResellerSerials) {
//               const serial = resellerStockDoc?.serialNumbers.find(
//                 (sn) => sn.serialNumber === serialNumber && sn.status === "available"
//               );
//               if (!serial) {
//                 return res.status(400).json({
//                   success: false,
//                   message: `Serial number ${serialNumber} is not available in reseller stock for product "${productDoc.productTitle}"`,
//                 });
//               }
//             }
//           }

//           if (fromOutletSerials.length > 0 && outletStockDoc) {
//             for (const serialNumber of fromOutletSerials) {
//               const serial = outletStockDoc.serialNumbers.find(
//                 (sn) => sn.serialNumber === serialNumber && sn.status === "available"
//               );
//               if (!serial) {
//                 return res.status(400).json({
//                   success: false,
//                   message: `Serial number ${serialNumber} is not available in outlet stock for product "${productDoc.productTitle}"`,
//                 });
//               }
//             }
//           }
//         } else {
//           if (approval.approvedQuantity > 0) {
//             fromResellerQty = Math.min(approval.approvedQuantity, resellerAvailable);
//             const remaining = approval.approvedQuantity - fromResellerQty;

//             // Only validate availability - DO NOT REDUCE STOCK
//             if (remaining > outletAvailable) {
//               return res.status(400).json({
//                 success: false,
//                 message: `Insufficient stock for product "${productDoc.productTitle}". ` +
//                   `Reseller available: ${resellerAvailable}, Outlet available: ${outletAvailable}, ` +
//                   `Total approved: ${approval.approvedQuantity}, Total available: ${resellerAvailable + outletAvailable}`,
//               });
//             }

//             fromOutletQty = remaining;
//           }
//         }

//         if (fromResellerQty + fromOutletQty !== approval.approvedQuantity) {
//           return res.status(400).json({
//             success: false,
//             message: `Source breakdown mismatch for product "${productDoc.productTitle}". ` +
//               `Expected ${approval.approvedQuantity}, got Reseller: ${fromResellerQty} + Outlet: ${fromOutletQty}`,
//           });
//         }

//         approval.sourceBreakdown = {
//           fromReseller: {
//             quantity: fromResellerQty,
//             serials: fromResellerSerials,
//           },
//           fromOutlet: {
//             quantity: fromOutletQty,
//             serials: fromOutletSerials,
//           },
//           totalApproved: approval.approvedQuantity,
//         };
//       }

//       // ─────────────────────────────────────────────────────────────────────────
//       // PHASE 2: STOCK REDUCTION COMPLETELY REMOVED
//       // No stock updates happen here anymore - only validation above
//       // ─────────────────────────────────────────────────────────────────────────
//     }

//     // ─────────────────────────────────────────────────────────────────────────
//     // PHASE 3: Persist updated products + call approveRequest
//     // ─────────────────────────────────────────────────────────────────────────
//     const updatedProducts = stockRequest.products.map((productItem) => {
//       const approval = productApprovals?.find(
//         (pa) => pa.productId.toString() === productItem.product.toString()
//       );

//       if (approval) {
//         return {
//           ...productItem.toObject(),
//           approvedQuantity: approval.approvedQuantity,
//           approvedRemark: approval.approvedRemark || "",
//           approvedSerials: approval.approvedSerials || [],
//           sourceBreakdown: approval.sourceBreakdown || {
//             fromReseller: { quantity: 0, serials: [] },
//             fromOutlet: { quantity: 0, serials: [] },
//             totalApproved: 0,
//           },
//         };
//       }
//       return productItem;
//     });

//     stockRequest.products = updatedProducts;
//     await stockRequest.save();

//     const updatedRequest = await stockRequest.approveRequest(
//       userId,
//       productApprovals
//     );

//     const populatedRequest = await StockRequest.findById(updatedRequest._id)
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode centerType")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("approvalInfo.approvedBy", "_id fullName email")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Stock request approved successfully (stock not deducted)",
//       data: populatedRequest,
//     });
//   } catch (error) {
//     console.error("Error approving stock request:", error);

//     if (
//       error.message.includes("Number of serial numbers") ||
//       error.message.includes("Duplicate serial numbers") ||
//       error.message.includes("serial numbers not available") ||
//       error.message.includes("Approved quantity") ||
//       error.message.includes("Serial numbers are required") ||
//       error.message.includes("Serial numbers should not be provided") ||
//       error.message.includes("Approved quantity is required") ||
//       error.message.includes("Approved quantity must be a valid number") ||
//       error.message.includes("Approved quantity cannot be negative") ||
//       error.message.includes("Approval remark is required") ||
//       error.message.includes("No stock available") ||
//       error.message.includes("Insufficient stock")
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Validation failed",
//         error: error.message,
//       });
//     }

//     if (
//       error.code === 11000 &&
//       error.keyPattern &&
//       error.keyPattern.challanNo
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Duplicate challan number generated. Please try again.",
//         error: "Challan number conflict",
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Error approving stock request",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

// export const shipStockRequest = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["manage_indent"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_indent permission required.",
//       });
//     }

//     const { id } = req.params;
//     const {
//       shippedDate,
//       expectedDeliveryDate,
//       shipmentDetails,
//       shipmentRemark,
//       documents,
//     } = req.body;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. You can only ship stock requests from your own center.",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     const shippingDetails = {
//       shippedDate: new Date(shippedDate),
//       ...(expectedDeliveryDate && {
//         expectedDeliveryDate: new Date(expectedDeliveryDate),
//       }),
//       ...(shipmentDetails && { shipmentDetails }),
//       ...(shipmentRemark && { shipmentRemark }),
//       ...(documents && {
//         documents: Array.isArray(documents) ? documents : [documents],
//       }),
//     };

//     const updatedRequest = await stockRequest.shipRequest(
//       userId,
//       shippingDetails
//     );

//     const populatedRequest = await StockRequest.findById(updatedRequest._id)
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("shippingInfo.shippedBy", "_id fullName email")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Stock request shipped successfully",
//       data: populatedRequest,
//     });
//   } catch (error) {
//     console.error("Error shipping stock request:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error shipping stock request",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

// export const updateShippingInfo = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["manage_indent"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_indent permission required.",
//       });f
//     }

//     const { id } = req.params;
//     const {
//       shippedDate,
//       expectedDeliveryDate,
//       shipmentDetails,
//       shipmentRemark,
//       documents,
//     } = req.body;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. You can only update shipping info for stock requests from your own center.",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     const shippingDetails = {
//       ...(shippedDate && { shippedDate: new Date(shippedDate) }),
//       ...(expectedDeliveryDate && {
//         expectedDeliveryDate: new Date(expectedDeliveryDate),
//       }),
//       ...(shipmentDetails && { shipmentDetails }),
//       ...(shipmentRemark && { shipmentRemark }),
//       ...(documents && {
//         documents: Array.isArray(documents) ? documents : [documents],
//       }),
//     };

//     const updatedRequest = await stockRequest.updateShippingInfo(
//       shippingDetails
//     );

//     updatedRequest.updatedBy = userId;
//     await updatedRequest.save();

//     const populatedRequest = await StockRequest.findById(updatedRequest._id)
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("shippingInfo.shippedBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email")
//       .populate("createdBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Shipping information updated successfully",
//       data: populatedRequest,
//     });
//   } catch (error) {
//     console.error("Error updating shipping information:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error updating shipping information",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

// export const rejectShipment = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["manage_indent"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_indent permission required.",
//       });
//     }

//     const { id } = req.params;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. You can only reject shipments for stock requests from your own center.",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     const updatedRequest = await stockRequest.rejectShipment(userId);

//     updatedRequest.updatedBy = userId;
//     await updatedRequest.save();

//     const populatedRequest = await StockRequest.findById(updatedRequest._id)
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate(
//         "shippingInfo.shipmentRejected.rejectedBy",
//         "_id fullName email"
//       )
//       .populate("updatedBy", "_id fullName email")
//       .populate("createdBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message:
//         "Shipment rejected successfully. Shipping details cleared and status reverted to Confirmed.",
//       data: populatedRequest,
//     });
//   } catch (error) {
//     console.error("Error rejecting shipment:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error rejecting shipment",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

// // export const markAsIncomplete = async (req, res) => {
// //   try {
// //     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
// //       req,
// //       ["manage_indent"]
// //     );

// //     if (!hasAccess) {
// //       return res.status(403).json({
// //         success: false,
// //         message: "Access denied. manage_indent permission required.",
// //       });
// //     }

// //     const { id } = req.params;
// //     const { incompleteRemark, receivedProducts } = req.body;

// //     const stockRequest = await StockRequest.findById(id);
// //     if (!stockRequest) {
// //       return res.status(404).json({
// //         success: false,
// //         message: "Stock request not found",
// //       });
// //     }

// //     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
// //       return res.status(403).json({
// //         success: false,
// //         message:
// //           "Access denied. You can only mark stock requests from your own center as incomplete.",
// //       });
// //     }

// //     const userId = req.user?.id;
// //     if (!userId) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "User authentication required",
// //       });
// //     }

// //     if (receivedProducts && Array.isArray(receivedProducts)) {
// //       const Product = mongoose.model("Product");

// //       for (const receivedProduct of receivedProducts) {
// //         if (!receivedProduct.productId) {
// //           return res.status(400).json({
// //             success: false,
// //             message: "Product ID is required for each received product",
// //           });
// //         }

// //         if (
// //           receivedProduct.receivedQuantity === undefined ||
// //           receivedProduct.receivedQuantity === null
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity is required for product ${receivedProduct.productId}`,
// //           });
// //         }

// //         if (
// //           typeof receivedProduct.receivedQuantity !== "number" ||
// //           isNaN(receivedProduct.receivedQuantity)
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity must be a valid number for product ${receivedProduct.productId}`,
// //           });
// //         }

// //         if (receivedProduct.receivedQuantity < 0) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity cannot be negative for product ${receivedProduct.productId}`,
// //           });
// //         }

// //         if (!Number.isInteger(receivedProduct.receivedQuantity)) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity must be an integer for product ${receivedProduct.productId}`,
// //           });
// //         }

// //         const productItem = stockRequest.products.find(
// //           (p) => p.product.toString() === receivedProduct.productId.toString()
// //         );

// //         if (!productItem) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Product ${receivedProduct.productId} not found in stock request`,
// //           });
// //         }

// //         if (receivedProduct.receivedQuantity > productItem.approvedQuantity) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity (${receivedProduct.receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity}) for product ${receivedProduct.productId}`,
// //           });
// //         }

// //         const productDoc = await Product.findById(receivedProduct.productId);
// //         const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";
// //       }

// //       stockRequest.products = stockRequest.products.map((productItem) => {
// //         const receivedProduct = receivedProducts.find(
// //           (rp) => rp.productId.toString() === productItem.product.toString()
// //         );

// //         if (receivedProduct) {
// //           return {
// //             ...productItem.toObject(),
// //             receivedQuantity: receivedProduct.receivedQuantity || 0,
// //             receivedRemark: receivedProduct.receivedRemark || "",
// //             receivedSerials: receivedProduct.receivedSerials || [],
// //           };
// //         }
// //         return productItem;
// //       });
// //     }

// //     const currentDate = new Date();

// //     stockRequest.status = "Incompleted";
// //     stockRequest.updatedBy = userId;
// //     stockRequest.completionInfo = {
// //       ...stockRequest.completionInfo,
// //       incompleteOn: currentDate,
// //       incompleteBy: userId,
// //       incompleteRemark: incompleteRemark || "",
// //     };

// //     const updatedRequest = await stockRequest.save();

// //     const populatedRequest = await StockRequest.findById(updatedRequest._id)
// //       .populate("warehouse", "_id centerName centerCode centerType")
// //       .populate("center", "_id centerName centerCode")
// //       .populate("products.product", "_id productTitle productCode productImage")
// //       .populate("incompleteInfo.incompleteBy", "_id fullName email")
// //       .populate("createdBy", "_id fullName email")
// //       .populate("updatedBy", "_id fullName email");

// //     res.status(200).json({
// //       success: true,
// //       message: "Stock request marked as incomplete successfully",
// //       data: populatedRequest,
// //     });
// //   } catch (error) {
// //     console.error("Error marking stock request as incomplete:", error);

// //     if (
// //       error.message.includes("Received quantity") ||
// //       error.message.includes("Product ID") ||
// //       error.message.includes("serial numbers") ||
// //       error.message.includes("exceed approved quantity")
// //     ) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Validation failed",
// //         error: error.message,
// //       });
// //     }

// //     res.status(500).json({
// //       success: false,
// //       message: "Error marking stock request as incomplete",
// //       error:
// //         process.env.NODE_ENV === "development"
// //           ? error.message
// //           : "Internal server error",
// //     });
// //   }
// // };


// /////**************** in below to handle extra received qty **************/
// // export const markAsIncomplete = async (req, res) => {
// //   try {
// //     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
// //       req,
// //       ["manage_indent"]
// //     );

// //     if (!hasAccess) {
// //       return res.status(403).json({
// //         success: false,
// //         message: "Access denied. manage_indent permission required.",
// //       });
// //     }

// //     const { id } = req.params;
// //     const { incompleteRemark, receivedProducts } = req.body;

// //     const stockRequest = await StockRequest.findById(id);
// //     if (!stockRequest) {
// //       return res.status(404).json({
// //         success: false,
// //         message: "Stock request not found",
// //       });
// //     }

// //     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
// //       return res.status(403).json({
// //         success: false,
// //         message:
// //           "Access denied. You can only mark stock requests from your own center as incomplete.",
// //       });
// //     }

// //     const userId = req.user?.id;
// //     if (!userId) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "User authentication required",
// //       });
// //     }

// //     if (receivedProducts && Array.isArray(receivedProducts)) {
// //       const Product = mongoose.model("Product");
// //       const OutletStock = mongoose.model("OutletStock");

// //       for (const receivedProduct of receivedProducts) {
// //         if (!receivedProduct.productId) {
// //           return res.status(400).json({
// //             success: false,
// //             message: "Product ID is required for each received product",
// //           });
// //         }

// //         if (
// //           receivedProduct.receivedQuantity === undefined ||
// //           receivedProduct.receivedQuantity === null
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity is required for product ${receivedProduct.productId}`,
// //           });
// //         }

// //         if (
// //           typeof receivedProduct.receivedQuantity !== "number" ||
// //           isNaN(receivedProduct.receivedQuantity)
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity must be a valid number for product ${receivedProduct.productId}`,
// //           });
// //         }

// //         if (receivedProduct.receivedQuantity < 0) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity cannot be negative for product ${receivedProduct.productId}`,
// //           });
// //         }

// //         if (!Number.isInteger(receivedProduct.receivedQuantity)) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity must be an integer for product ${receivedProduct.productId}`,
// //           });
// //         }

// //         const productItem = stockRequest.products.find(
// //           (p) => p.product.toString() === receivedProduct.productId.toString()
// //         );

// //         if (!productItem) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Product ${receivedProduct.productId} not found in stock request`,
// //           });
// //         }

// //         // Check if received quantity exceeds approved quantity
// //         if (receivedProduct.receivedQuantity > productItem.approvedQuantity) {
// //           const additionalQuantity = receivedProduct.receivedQuantity - productItem.approvedQuantity;
          
// //           console.log(`[DEBUG] Received quantity (${receivedProduct.receivedQuantity}) > Approved quantity (${productItem.approvedQuantity})`);
// //           console.log(`[DEBUG] Additional quantity needed: ${additionalQuantity}`);
          
// //           // Check outlet stock availability for the additional quantity
// //           const outletStock = await OutletStock.findOne({
// //             outlet: stockRequest.warehouse,
// //             product: receivedProduct.productId,
// //           });

// //           if (!outletStock) {
// //             return res.status(400).json({
// //               success: false,
// //               message: `No stock found in outlet for product ${receivedProduct.productId}`,
// //             });
// //           }

// //           console.log(`[DEBUG] Outlet stock before - Available: ${outletStock.availableQuantity}, InTransit: ${outletStock.inTransitQuantity}, Total: ${outletStock.totalQuantity}`);

// //           // Get product info
// //           const productDoc = await Product.findById(receivedProduct.productId);
// //           const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

// //           if (tracksSerialNumbers) {
// //             // For serialized products, we'll handle serials during completion
// //             // Just check if enough quantity is available
// //             if (outletStock.availableQuantity < additionalQuantity) {
// //               return res.status(400).json({
// //                 success: false,
// //                 message: `Insufficient stock in outlet for additional quantity of product "${productDoc?.productTitle || receivedProduct.productId}". Available: ${outletStock.availableQuantity}, Needed: ${additionalQuantity}`,
// //               });
// //             }

// //             console.log(`[DEBUG] Serialized product - will handle serials during completion`);
            
// //           } else {
// //             // For non-serialized products, check availability
// //             if (outletStock.availableQuantity < additionalQuantity) {
// //               return res.status(400).json({
// //                 success: false,
// //                 message: `Insufficient stock in outlet for additional quantity of product ${receivedProduct.productId}. Available: ${outletStock.availableQuantity}, Needed: ${additionalQuantity}`,
// //               });
// //             }
// //           }

// //           // IMPORTANT: DO NOT update outlet stock here
// //           // We'll handle the stock update during completion when serials are provided
// //           console.log(`[DEBUG] NOT updating outlet stock. Will handle during completion with proper serials.`);
          
// //           // Store a flag to indicate additional quantity is needed
// //           receivedProduct._requiresAdditionalStock = true;
// //           receivedProduct._additionalQuantity = additionalQuantity;
// //         }

// //         // Basic serial validation if provided (optional)
// //         if (receivedProduct.receivedSerials && Array.isArray(receivedProduct.receivedSerials)) {
// //           const productDoc = await Product.findById(receivedProduct.productId);
// //           const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";
          
// //           if (tracksSerialNumbers) {
// //             if (receivedProduct.receivedSerials.length !== receivedProduct.receivedQuantity) {
// //               return res.status(400).json({
// //                 success: false,
// //                 message: `Number of serial numbers (${receivedProduct.receivedSerials.length}) must match received quantity (${receivedProduct.receivedQuantity}) for product "${productDoc.productTitle}"`,
// //               });
// //             }
// //           }
// //         }
// //       }

// //       // Update stock request products with received quantities
// //       // BUT don't update approved quantities or serials yet
// //       stockRequest.products = stockRequest.products.map((productItem) => {
// //         const receivedProduct = receivedProducts.find(
// //           (rp) => rp.productId.toString() === productItem.product.toString()
// //         );

// //         if (receivedProduct) {
// //           return {
// //             ...productItem.toObject(),
// //             receivedQuantity: receivedProduct.receivedQuantity || 0,
// //             receivedRemark: receivedProduct.receivedRemark || "",
// //             receivedSerials: receivedProduct.receivedSerials || [],
// //             // Keep approved quantities as they are for now
// //             // They'll be updated during completion
// //           };
// //         }
// //         return productItem;
// //       });
// //     }

// //     const currentDate = new Date();

// //     stockRequest.status = "Incompleted";
// //     stockRequest.updatedBy = userId;
// //     stockRequest.completionInfo = {
// //       ...stockRequest.completionInfo,
// //       incompleteOn: currentDate,
// //       incompleteBy: userId,
// //       incompleteRemark: incompleteRemark || "",
// //     };

// //     const updatedRequest = await stockRequest.save();

// //     const populatedRequest = await StockRequest.findById(updatedRequest._id)
// //       .populate("warehouse", "_id centerName centerCode centerType")
// //       .populate("center", "_id centerName centerCode")
// //       .populate("products.product", "_id productTitle productCode productImage")
// //       .populate("completionInfo.incompleteBy", "_id fullName email")
// //       .populate("createdBy", "_id fullName email")
// //       .populate("updatedBy", "_id fullName email");

// //     res.status(200).json({
// //       success: true,
// //       message: "Stock request marked as incomplete successfully. Note: For received quantity > approved quantity, additional stock and serials will be handled during completion.",
// //       data: populatedRequest,
// //     });
// //   } catch (error) {
// //     console.error("Error marking stock request as incomplete:", error);

// //     if (
// //       error.message.includes("Received quantity") ||
// //       error.message.includes("Product ID") ||
// //       error.message.includes("serial numbers") ||
// //       error.message.includes("exceed approved quantity") ||
// //       error.message.includes("Insufficient stock") ||
// //       error.message.includes("Serial number") ||
// //       error.message.includes("not available")
// //     ) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Validation failed",
// //         error: error.message,
// //       });
// //     }

// //     res.status(500).json({
// //       success: false,
// //       message: "Error marking stock request as incomplete",
// //       error:
// //         process.env.NODE_ENV === "development"
// //           ? error.message
// //           : "Internal server error",
// //     });
// //   }
// // };

// export const markAsIncomplete = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["manage_indent"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_indent permission required.",
//       });
//     }

//     const { id } = req.params;
//     const { incompleteRemark, receivedProducts } = req.body;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. You can only mark stock requests from your own center as incomplete.",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     if (receivedProducts && Array.isArray(receivedProducts)) {
//       const Product = mongoose.model("Product");
//       const OutletStock = mongoose.model("OutletStock");

//       for (const receivedProduct of receivedProducts) {
//         if (!receivedProduct.productId) {
//           return res.status(400).json({
//             success: false,
//             message: "Product ID is required for each received product",
//           });
//         }

//         if (
//           receivedProduct.receivedQuantity === undefined ||
//           receivedProduct.receivedQuantity === null
//         ) {
//           return res.status(400).json({
//             success: false,
//             message: `Received quantity is required for product ${receivedProduct.productId}`,
//           });
//         }

//         if (
//           typeof receivedProduct.receivedQuantity !== "number" ||
//           isNaN(receivedProduct.receivedQuantity)
//         ) {
//           return res.status(400).json({
//             success: false,
//             message: `Received quantity must be a valid number for product ${receivedProduct.productId}`,
//           });
//         }

//         if (receivedProduct.receivedQuantity < 0) {
//           return res.status(400).json({
//             success: false,
//             message: `Received quantity cannot be negative for product ${receivedProduct.productId}`,
//           });
//         }

//         if (!Number.isInteger(receivedProduct.receivedQuantity)) {
//           return res.status(400).json({
//             success: false,
//             message: `Received quantity must be an integer for product ${receivedProduct.productId}`,
//           });
//         }

//         const productItem = stockRequest.products.find(
//           (p) => p.product.toString() === receivedProduct.productId.toString()
//         );

//         if (!productItem) {
//           return res.status(400).json({
//             success: false,
//             message: `Product ${receivedProduct.productId} not found in stock request`,
//           });
//         }

//         // Check if received quantity exceeds approved quantity
//         if (receivedProduct.receivedQuantity > productItem.approvedQuantity) {
//           const additionalQuantity = receivedProduct.receivedQuantity - productItem.approvedQuantity;
          
//           console.log(`[DEBUG] Received quantity (${receivedProduct.receivedQuantity}) > Approved quantity (${productItem.approvedQuantity})`);
//           console.log(`[DEBUG] Additional quantity needed: ${additionalQuantity}`);
          
//           // Check outlet stock availability for the additional quantity
//           const outletStock = await OutletStock.findOne({
//             outlet: stockRequest.warehouse,
//             product: receivedProduct.productId,
//           });

//           if (!outletStock) {
//             return res.status(400).json({
//               success: false,
//               message: `No stock found in outlet for product ${receivedProduct.productId}`,
//             });
//           }

//           console.log(`[DEBUG] Outlet stock before - Available: ${outletStock.availableQuantity}, InTransit: ${outletStock.inTransitQuantity}, Total: ${outletStock.totalQuantity}`);

//           // Get product info
//           const productDoc = await Product.findById(receivedProduct.productId);
//           const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

//           if (tracksSerialNumbers) {
//             // For serialized products, we'll handle serials during completion
//             // Just check if enough quantity is available
//             if (outletStock.availableQuantity < additionalQuantity) {
//               return res.status(400).json({
//                 success: false,
//                 message: `Insufficient stock in outlet for additional quantity of product "${productDoc?.productTitle || receivedProduct.productId}". Available: ${outletStock.availableQuantity}, Needed: ${additionalQuantity}`,
//               });
//             }

//             console.log(`[DEBUG] Serialized product - will handle serials during completion`);
            
//           } else {
//             // For non-serialized products, check availability
//             if (outletStock.availableQuantity < additionalQuantity) {
//               return res.status(400).json({
//                 success: false,
//                 message: `Insufficient stock in outlet for additional quantity of product ${receivedProduct.productId}. Available: ${outletStock.availableQuantity}, Needed: ${additionalQuantity}`,
//               });
//             }
//           }

//           // IMPORTANT: DO NOT update outlet stock here
//           // We'll handle the stock update during completion when serials are provided
//           console.log(`[DEBUG] NOT updating outlet stock. Will handle during completion with proper serials.`);
          
//           // Store a flag to indicate additional quantity is needed
//           receivedProduct._requiresAdditionalStock = true;
//           receivedProduct._additionalQuantity = additionalQuantity;
//         }

//         // Basic serial validation if provided (optional)
//         if (receivedProduct.receivedSerials && Array.isArray(receivedProduct.receivedSerials)) {
//           const productDoc = await Product.findById(receivedProduct.productId);
//           const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";
          
//           if (tracksSerialNumbers) {
//             if (receivedProduct.receivedSerials.length !== receivedProduct.receivedQuantity) {
//               return res.status(400).json({
//                 success: false,
//                 message: `Number of serial numbers (${receivedProduct.receivedSerials.length}) must match received quantity (${receivedProduct.receivedQuantity}) for product "${productDoc.productTitle}"`,
//               });
//             }
//           }
//         }
//       }

//       // Update stock request products with received quantities
//       // BUT don't update approved quantities or serials yet
//       stockRequest.products = stockRequest.products.map((productItem) => {
//         const receivedProduct = receivedProducts.find(
//           (rp) => rp.productId.toString() === productItem.product.toString()
//         );

//         if (receivedProduct) {
//           return {
//             ...productItem.toObject(),
//             receivedQuantity: receivedProduct.receivedQuantity || 0,
//             receivedRemark: receivedProduct.receivedRemark || "",
//             receivedSerials: receivedProduct.receivedSerials || [],
//             // Keep approved quantities as they are for now
//             // They'll be updated during completion
//           };
//         }
//         return productItem;
//       });
//     }

//     const currentDate = new Date();

//     // UPDATE: Set status and update incompleteInfo separately
//     stockRequest.status = "Incompleted";
//     stockRequest.updatedBy = userId;
    
//     // Store incomplete information in the new field
//     stockRequest.incompleteInfo = {
//       incompleteOn: currentDate,
//       incompleteBy: userId,
//       incompleteRemark: incompleteRemark || "",
//       // Optionally store the receipt details
//       incompleteReceipts: receivedProducts ? receivedProducts.map(rp => ({
//         productId: rp.productId,
//         receivedQuantity: rp.receivedQuantity,
//         receivedRemark: rp.receivedRemark || "",
//         receivedSerials: rp.receivedSerials || [],
//       })) : []
//     };

//     // Clear completionInfo if it exists (since it's incomplete, not completed)
//     stockRequest.completionInfo = {
//       completedOn: undefined,
//       completedBy: undefined,
//     };

//     const updatedRequest = await stockRequest.save();

//     const populatedRequest = await StockRequest.findById(updatedRequest._id)
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("incompleteInfo.incompleteBy", "_id fullName email")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Stock request marked as incomplete successfully. Note: For received quantity > approved quantity, additional stock and serials will be handled during completion.",
//       data: populatedRequest,
//     });
//   } catch (error) {
//     console.error("Error marking stock request as incomplete:", error);

//     if (
//       error.message.includes("Received quantity") ||
//       error.message.includes("Product ID") ||
//       error.message.includes("serial numbers") ||
//       error.message.includes("exceed approved quantity") ||
//       error.message.includes("Insufficient stock") ||
//       error.message.includes("Serial number") ||
//       error.message.includes("not available")
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Validation failed",
//         error: error.message,
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Error marking stock request as incomplete",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

// // export const completeIncompleteRequest = async (req, res) => {
// //   try {
// //     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
// //       req,
// //       ["manage_indent"]
// //     );

// //     if (!hasAccess) {
// //       return res.status(403).json({
// //         success: false,
// //         message: "Access denied. manage_indent permission required.",
// //       });
// //     }

// //     const { id } = req.params;
// //     const { productApprovals, productReceipts } = req.body;

// //     const stockRequest = await StockRequest.findById(id);
// //     if (!stockRequest) {
// //       return res.status(404).json({
// //         success: false,
// //         message: "Stock request not found",
// //       });
// //     }

// //     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
// //       return res.status(403).json({
// //         success: false,
// //         message:
// //           "Access denied. You can only complete incomplete stock requests from your own center.",
// //       });
// //     }

// //     if (stockRequest.status !== "Incompleted") {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Only incomplete stock requests can be completed",
// //       });
// //     }

// //     const userId = req.user?.id;
// //     if (!userId) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "User authentication required",
// //       });
// //     }

// //     if (
// //       (!productApprovals ||
// //         !Array.isArray(productApprovals) ||
// //         productApprovals.length === 0) &&
// //       (!productReceipts ||
// //         !Array.isArray(productReceipts) ||
// //         productReceipts.length === 0)
// //     ) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Either product approvals or product receipts are required",
// //       });
// //     }

// //     const Product = mongoose.model("Product");

// //     if (productApprovals && productApprovals.length > 0) {
// //       for (const approval of productApprovals) {
// //         if (!approval.productId) {
// //           return res.status(400).json({
// //             success: false,
// //             message: "Product ID is required for each product approval",
// //           });
// //         }

// //         if (
// //           approval.approvedQuantity === undefined ||
// //           approval.approvedQuantity === null
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approved quantity is required for product ${approval.productId}`,
// //           });
// //         }

// //         if (
// //           typeof approval.approvedQuantity !== "number" ||
// //           isNaN(approval.approvedQuantity)
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approved quantity must be a valid number for product ${approval.productId}`,
// //           });
// //         }

// //         if (approval.approvedQuantity < 0) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approved quantity cannot be negative for product ${approval.productId}`,
// //           });
// //         }

// //         if (!Number.isInteger(approval.approvedQuantity)) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approved quantity must be an integer for product ${approval.productId}`,
// //           });
// //         }

// //         const productItem = stockRequest.products.find(
// //           (p) => p.product.toString() === approval.productId.toString()
// //         );

// //         if (!productItem) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Product ${approval.productId} not found in stock request`,
// //           });
// //         }

// //         if (approval.approvedQuantity > productItem.quantity) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approved quantity (${approval.approvedQuantity}) cannot exceed requested quantity (${productItem.quantity}) for product ${approval.productId}`,
// //           });
// //         }

// //         if (
// //           approval.approvedQuantity === 0 &&
// //           (!approval.approvedRemark || approval.approvedRemark.trim() === "")
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approval remark is required when approved quantity is zero for product ${approval.productId}`,
// //           });
// //         }

// //         const productDoc = await Product.findById(approval.productId);
// //         const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

// //         if (tracksSerialNumbers) {
// //           if (approval.approvedQuantity > 0) {
// //             const approvedSerials = approval.approvedSerials || [];

// //             if (approvedSerials.length > 0) {
// //               const uniqueSerials = new Set(approvedSerials);
// //               if (uniqueSerials.size !== approvedSerials.length) {
// //                 return res.status(400).json({
// //                   success: false,
// //                   message: `Duplicate serial numbers found for product ${productDoc.productTitle}`,
// //                 });
// //               }
// //             }
// //           } else {
// //             if (
// //               approval.approvedSerials &&
// //               approval.approvedSerials.length > 0
// //             ) {
// //               return res.status(400).json({
// //                 success: false,
// //                 message: `Approved serial numbers should not be provided when approved quantity is zero for product ${productDoc.productTitle}`,
// //               });
// //             }
// //           }
// //         } else {
// //           if (approval.approvedSerials && approval.approvedSerials.length > 0) {
// //             return res.status(400).json({
// //               success: false,
// //               message: `Approved serial numbers should not be provided for product ${productDoc.productTitle} as it does not track serial numbers`,
// //             });
// //           }
// //         }
// //       }

// //       const productApprovalsWithQuantity = productApprovals.filter(
// //         (pa) => pa.approvedQuantity > 0
// //       );

// //       if (productApprovalsWithQuantity.length > 0) {
// //         const validationResults = await stockRequest.validateSerialNumbers(
// //           productApprovalsWithQuantity
// //         );
// //         const invalidResults = validationResults.filter(
// //           (result) => !result.valid
// //         );

// //         if (invalidResults.length > 0) {
// //           return res.status(400).json({
// //             success: false,
// //             message: "Serial number validation failed",
// //             validationErrors: invalidResults,
// //           });
// //         }
// //       }
// //     }
// //     if (productReceipts && productReceipts.length > 0) {
// //       for (const receipt of productReceipts) {
// //         if (!receipt.productId) {
// //           return res.status(400).json({
// //             success: false,
// //             message: "Product ID is required for each product receipt",
// //           });
// //         }

// //         if (
// //           receipt.receivedQuantity === undefined ||
// //           receipt.receivedQuantity === null
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity is required for product ${receipt.productId}`,
// //           });
// //         }

// //         if (
// //           typeof receipt.receivedQuantity !== "number" ||
// //           isNaN(receipt.receivedQuantity)
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity must be a valid number for product ${receipt.productId}`,
// //           });
// //         }

// //         if (receipt.receivedQuantity < 0) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity cannot be negative for product ${receipt.productId}`,
// //           });
// //         }

// //         if (!Number.isInteger(receipt.receivedQuantity)) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity must be an integer for product ${receipt.productId}`,
// //           });
// //         }

// //         const productItem = stockRequest.products.find(
// //           (p) => p.product.toString() === receipt.productId.toString()
// //         );

// //         if (!productItem) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Product ${receipt.productId} not found in stock request`,
// //           });
// //         }

// //         let currentApprovedQuantity = productItem.approvedQuantity;

// //         if (productApprovals && productApprovals.length > 0) {
// //           const approval = productApprovals.find(
// //             (pa) => pa.productId.toString() === receipt.productId.toString()
// //           );
// //           if (approval) {
// //             currentApprovedQuantity = approval.approvedQuantity;
// //           }
// //         }

// //         if (receipt.receivedQuantity > currentApprovedQuantity) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${currentApprovedQuantity}) for product ${receipt.productId}`,
// //           });
// //         }
// //       }
// //     }

// //     const OutletStock = mongoose.model("OutletStock");
// //     const CenterStock = mongoose.model("CenterStock");

// //     const productsToProcess = productReceipts && productReceipts.length > 0 
// //       ? productReceipts 
// //       : productApprovals.map((approval) => ({
// //           productId: approval.productId,
// //           receivedQuantity: approval.approvedQuantity,
// //           receivedRemark: approval.receivedRemark || approval.approvedRemark || "",
// //         }));

// //     for (const receipt of productsToProcess) {
// //       const productItem = stockRequest.products.find(
// //         (p) => p.product.toString() === receipt.productId.toString()
// //       );

// //       if (!productItem) {
// //         return res.status(400).json({
// //           success: false,
// //           message: `Product ${receipt.productId} not found in stock request`,
// //         });
// //       }

// //       const productDoc = await Product.findById(receipt.productId);
// //       const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";
      
// //       const currentApprovedQuantity = productItem.approvedQuantity || 0;
// //       const receivedQuantity = receipt.receivedQuantity || 0;
      
// //       const outletStock = await OutletStock.findOne({
// //         outlet: stockRequest.warehouse,
// //         product: receipt.productId,
// //       });

// //       if (!outletStock) {
// //         return res.status(400).json({
// //           success: false,
// //           message: `No stock found in outlet for product ${receipt.productId}`,
// //         });
// //       }

// //       const quantityToRevert = currentApprovedQuantity - receivedQuantity;
      
// //       console.log(`Processing product ${receipt.productId}:`);
// //       console.log(`  Current approved: ${currentApprovedQuantity}`);
// //       console.log(`  Received: ${receivedQuantity}`);
// //       console.log(`  Quantity to revert: ${quantityToRevert}`);
// //       console.log(`  Outlet stock before: Total=${outletStock.totalQuantity}, Available=${outletStock.availableQuantity}, InTransit=${outletStock.inTransitQuantity}`);

// //       if (tracksSerialNumbers) {
// //         const hasApprovedSerials = productItem.approvedSerials && productItem.approvedSerials.length > 0;

// //         if (hasApprovedSerials) {
// //           const approvedCount = productItem.approvedSerials.length;
          
// //           if (quantityToRevert > 0) {
// //             const serialsToRevert = productItem.approvedSerials.slice(receivedQuantity);
            
// //             console.log(`  Reverting ${serialsToRevert.length} serials: ${serialsToRevert.join(', ')}`);

// //             for (const serialNumber of serialsToRevert) {
// //               const serial = outletStock.serialNumbers.find(
// //                 (sn) => sn.serialNumber === serialNumber
// //               );

// //               if (serial && serial.status === "in_transit") {
// //                 serial.status = "available";
// //                 serial.currentLocation = stockRequest.warehouse;

// //                 if (serial.transferHistory.length > 0) {
// //                   const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
// //                   if (lastTransfer.status === "in_transit") {
// //                     serial.transferHistory.pop();
// //                   }
// //                 }

// //                 console.log(`    Reverted serial ${serialNumber} back to available`);
// //               }
// //             }

// //             outletStock.availableQuantity += quantityToRevert;
// //             outletStock.inTransitQuantity -= quantityToRevert;
// //           }

// //           if (receivedQuantity > 0) {
// //             const serialsToTransfer = productItem.approvedSerials.slice(0, receivedQuantity);
            
// //             console.log(`  Transferring ${serialsToTransfer.length} serials: ${serialsToTransfer.join(', ')}`);

// //             for (const serialNumber of serialsToTransfer) {
// //               const serial = outletStock.serialNumbers.find(
// //                 (sn) => sn.serialNumber === serialNumber
// //               );

// //               if (serial && serial.status === "in_transit") {
// //                 serial.status = "transferred";
// //                 serial.currentLocation = stockRequest.center;

// //                 const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
// //                 if (lastTransfer) {
// //                   lastTransfer.status = "completed";
// //                   lastTransfer.completedAt = new Date();
// //                 }

// //                 console.log(`    Marked serial ${serialNumber} as transferred`);
// //               }
// //             }

// //             outletStock.inTransitQuantity -= receivedQuantity;
// //             outletStock.totalQuantity -= receivedQuantity;

// //             if (receivedQuantity > 0) {
// //               await CenterStock.updateStock(
// //                 stockRequest.center,
// //                 receipt.productId,
// //                 receivedQuantity,
// //                 serialsToTransfer,
// //                 stockRequest.warehouse,
// //                 "inbound_transfer"
// //               );
// //             }

// //             productItem.transferredSerials = serialsToTransfer;
// //           } else {
// //             productItem.transferredSerials = [];
// //           }
// //         }
// //       } else {

// //         console.log(`  Processing non-serialized product`);
        
// //         if (quantityToRevert > 0) {
// //           console.log(`  Reverting ${quantityToRevert} units back to available`);
// //           outletStock.availableQuantity += quantityToRevert;
// //           outletStock.inTransitQuantity -= quantityToRevert;
// //         }

// //         if (receivedQuantity > 0) {
// //           console.log(`  Transferring ${receivedQuantity} units to center`);
          
// //           outletStock.totalQuantity -= receivedQuantity;
// //           outletStock.inTransitQuantity -= receivedQuantity;

// //           await CenterStock.updateStock(
// //             stockRequest.center,
// //             receipt.productId,
// //             receivedQuantity,
// //             [],
// //             stockRequest.warehouse,
// //             "inbound_transfer"
// //           );
          
// //           console.log(`  Added ${receivedQuantity} units to center stock`);
// //         }
// //       }

// //       await outletStock.save();
      
// //       console.log(`  Outlet stock after: Total=${outletStock.totalQuantity}, Available=${outletStock.availableQuantity}, InTransit=${outletStock.inTransitQuantity}`);

// //       productItem.receivedQuantity = receivedQuantity;
// //       productItem.receivedRemark = receipt.receivedRemark || "";
      
// //       if (productApprovals && productApprovals.length > 0) {
// //         const approval = productApprovals.find(
// //           (pa) => pa.productId.toString() === receipt.productId.toString()
// //         );
// //         if (approval) {
// //           productItem.approvedQuantity = approval.approvedQuantity;
// //           productItem.approvedSerials = approval.approvedSerials || [];
// //         }
// //       }
// //     }
// //     if (productApprovals && productApprovals.length > 0) {
// //       stockRequest.products = stockRequest.products.map((productItem) => {
// //         const approval = productApprovals.find(
// //           (pa) => pa.productId.toString() === productItem.product.toString()
// //         );

// //         if (approval) {
// //           return {
// //             ...productItem.toObject(),
// //             approvedQuantity: approval.approvedQuantity,
// //             approvedRemark: approval.approvedRemark || "",
// //             approvedSerials: approval.approvedSerials || [],
// //           };
// //         }
// //         return productItem;
// //       });
// //     }

// //     stockRequest.status = "Completed";
// //     stockRequest.receivingInfo = {
// //       receivedAt: new Date(),
// //       receivedBy: userId,
// //     };
// //     stockRequest.completionInfo = {
// //       completedOn: new Date(),
// //       completedBy: userId,
// //     };
// //     stockRequest.updatedBy = userId;

// //     const updatedRequest = await stockRequest.save();

// //     const populatedRequest = await StockRequest.findById(updatedRequest._id)
// //       .populate("warehouse", "_id centerName centerCode centerType")
// //       .populate("center", "_id centerName centerCode centerType")
// //       .populate("products.product", "_id productTitle productCode productImage")
// //       .populate("createdBy", "_id fullName email")
// //       .populate("updatedBy", "_id fullName email")
// //       .populate("approvalInfo.approvedBy", "_id fullName email")
// //       .populate("receivingInfo.receivedBy", "_id fullName email")
// //       .populate("completionInfo.completedBy", "_id fullName email");

// //     res.status(200).json({
// //       success: true,
// //       message:
// //         "Incomplete stock request completed successfully and stock transferred to center",
// //       data: populatedRequest,
// //     });
// //   } catch (error) {
// //     if (error.name === "CastError") {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Invalid stock request ID",
// //       });
// //     }

// //     if (error.name === "ValidationError") {
// //       const errors = Object.values(error.errors).map((err) => err.message);
// //       return res.status(400).json({
// //         success: false,
// //         message: "Validation error",
// //         errors,
// //       });
// //     }

// //     if (
// //       error.message.includes("Insufficient stock") ||
// //       error.message.includes("serial numbers") ||
// //       error.message.includes("No serial numbers assigned") ||
// //       error.message.includes("Approved quantity") ||
// //       error.message.includes("Received quantity") ||
// //       error.message.includes("Product ID") ||
// //       error.message.includes("exceed") ||
// //       error.message.includes("Cannot read properties of undefined")
// //     ) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Validation failed",
// //         error: error.message,
// //       });
// //     }

// //     console.error("Error completing incomplete stock request:", error);
// //     res.status(500).json({
// //       success: false,
// //       message: "Error completing incomplete stock request",
// //       error:
// //         process.env.NODE_ENV === "development"
// //           ? error.message
// //           : "Internal server error",
// //     });
// //   }
// // };


// // export const completeIncompleteRequest = async (req, res) => {
// //   try {
// //     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
// //       req,
// //       ["manage_indent"]
// //     );

// //     if (!hasAccess) {
// //       return res.status(403).json({
// //         success: false,
// //         message: "Access denied. manage_indent permission required.",
// //       });
// //     }

// //     const { id } = req.params;
// //     const { productApprovals, productReceipts } = req.body;

// //     const stockRequest = await StockRequest.findById(id);
// //     if (!stockRequest) {
// //       return res.status(404).json({
// //         success: false,
// //         message: "Stock request not found",
// //       });
// //     }

// //     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
// //       return res.status(403).json({
// //         success: false,
// //         message:
// //           "Access denied. You can only complete incomplete stock requests from your own center.",
// //       });
// //     }

// //     if (stockRequest.status !== "Incompleted") {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Only incomplete stock requests can be completed",
// //       });
// //     }

// //     const userId = req.user?.id;
// //     if (!userId) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "User authentication required",
// //       });
// //     }

// //     if (
// //       (!productApprovals ||
// //         !Array.isArray(productApprovals) ||
// //         productApprovals.length === 0) &&
// //       (!productReceipts ||
// //         !Array.isArray(productReceipts) ||
// //         productReceipts.length === 0)
// //     ) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Either product approvals or product receipts are required",
// //       });
// //     }

// //     const Product = mongoose.model("Product");

// //     // MODIFIED: Allow approved quantity to exceed original requested quantity for incomplete completion
// //     if (productApprovals && productApprovals.length > 0) {
// //       for (const approval of productApprovals) {
// //         if (!approval.productId) {
// //           return res.status(400).json({
// //             success: false,
// //             message: "Product ID is required for each product approval",
// //           });
// //         }

// //         if (
// //           approval.approvedQuantity === undefined ||
// //           approval.approvedQuantity === null
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approved quantity is required for product ${approval.productId}`,
// //           });
// //         }

// //         if (
// //           typeof approval.approvedQuantity !== "number" ||
// //           isNaN(approval.approvedQuantity)
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approved quantity must be a valid number for product ${approval.productId}`,
// //           });
// //         }

// //         if (approval.approvedQuantity < 0) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approved quantity cannot be negative for product ${approval.productId}`,
// //           });
// //         }

// //         if (!Number.isInteger(approval.approvedQuantity)) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approved quantity must be an integer for product ${approval.productId}`,
// //           });
// //         }

// //         const productItem = stockRequest.products.find(
// //           (p) => p.product.toString() === approval.productId.toString()
// //         );

// //         if (!productItem) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Product ${approval.productId} not found in stock request`,
// //           });
// //         }

// //         // MODIFIED: For incomplete completion, allow approved quantity to exceed requested quantity
// //         // This handles cases where more was received than originally approved
// //         if (approval.approvedQuantity > productItem.quantity) {
// //           console.log(`[DEBUG] Approved quantity (${approval.approvedQuantity}) exceeds requested quantity (${productItem.quantity}) for product ${approval.productId}. Allowed for incomplete completion.`);
// //           // Don't throw error - allow it for incomplete completion
// //         }

// //         if (
// //           approval.approvedQuantity === 0 &&
// //           (!approval.approvedRemark || approval.approvedRemark.trim() === "")
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Approval remark is required when approved quantity is zero for product ${approval.productId}`,
// //           });
// //         }

// //         const productDoc = await Product.findById(approval.productId);
// //         const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

// //         if (tracksSerialNumbers) {
// //           if (approval.approvedQuantity > 0) {
// //             const approvedSerials = approval.approvedSerials || [];

// //             if (approvedSerials.length > 0) {
// //               const uniqueSerials = new Set(approvedSerials);
// //               if (uniqueSerials.size !== approvedSerials.length) {
// //                 return res.status(400).json({
// //                   success: false,
// //                   message: `Duplicate serial numbers found for product ${productDoc.productTitle}`,
// //                 });
// //               }
// //             }
// //           } else {
// //             if (
// //               approval.approvedSerials &&
// //               approval.approvedSerials.length > 0
// //             ) {
// //               return res.status(400).json({
// //                 success: false,
// //                 message: `Approved serial numbers should not be provided when approved quantity is zero for product ${productDoc.productTitle}`,
// //               });
// //             }
// //           }
// //         } else {
// //           if (approval.approvedSerials && approval.approvedSerials.length > 0) {
// //             return res.status(400).json({
// //               success: false,
// //               message: `Approved serial numbers should not be provided for product ${productDoc.productTitle} as it does not track serial numbers`,
// //             });
// //           }
// //         }
// //       }

// //       const productApprovalsWithQuantity = productApprovals.filter(
// //         (pa) => pa.approvedQuantity > 0
// //       );

// //       if (productApprovalsWithQuantity.length > 0) {
// //         const validationResults = await stockRequest.validateSerialNumbersForIncomplete(
// //           productApprovalsWithQuantity
// //         );
// //         const invalidResults = validationResults.filter(
// //           (result) => !result.valid
// //         );

// //         if (invalidResults.length > 0) {
// //           return res.status(400).json({
// //             success: false,
// //             message: "Serial number validation failed",
// //             validationErrors: invalidResults,
// //           });
// //         }
// //       }
// //     }

// //     // MODIFIED: Remove or modify the received quantity > approved quantity check
// //     if (productReceipts && productReceipts.length > 0) {
// //       for (const receipt of productReceipts) {
// //         if (!receipt.productId) {
// //           return res.status(400).json({
// //             success: false,
// //             message: "Product ID is required for each product receipt",
// //           });
// //         }

// //         if (
// //           receipt.receivedQuantity === undefined ||
// //           receipt.receivedQuantity === null
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity is required for product ${receipt.productId}`,
// //           });
// //         }

// //         if (
// //           typeof receipt.receivedQuantity !== "number" ||
// //           isNaN(receipt.receivedQuantity)
// //         ) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity must be a valid number for product ${receipt.productId}`,
// //           });
// //         }

// //         if (receipt.receivedQuantity < 0) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity cannot be negative for product ${receipt.productId}`,
// //           });
// //         }

// //         if (!Number.isInteger(receipt.receivedQuantity)) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Received quantity must be an integer for product ${receipt.productId}`,
// //           });
// //         }

// //         const productItem = stockRequest.products.find(
// //           (p) => p.product.toString() === receipt.productId.toString()
// //         );

// //         if (!productItem) {
// //           return res.status(400).json({
// //             success: false,
// //             message: `Product ${receipt.productId} not found in stock request`,
// //           });
// //         }

// //         let currentApprovedQuantity = productItem.approvedQuantity;

// //         if (productApprovals && productApprovals.length > 0) {
// //           const approval = productApprovals.find(
// //             (pa) => pa.productId.toString() === receipt.productId.toString()
// //           );
// //           if (approval) {
// //             currentApprovedQuantity = approval.approvedQuantity;
// //           }
// //         }

// //         // MODIFIED: Don't check if received quantity exceeds approved quantity
// //         // This allows completing with the quantity that was marked as received during incomplete
// //         console.log(`[DEBUG] Received quantity: ${receipt.receivedQuantity}, Current approved: ${currentApprovedQuantity}`);
        
// //         // Optional: You can add a warning but not an error
// //         if (receipt.receivedQuantity > currentApprovedQuantity) {
// //           console.log(`[WARNING] Received quantity (${receipt.receivedQuantity}) exceeds approved quantity (${currentApprovedQuantity}) for product ${receipt.productId}. Proceeding anyway.`);
// //         }
// //       }
// //     }

// //     const OutletStock = mongoose.model("OutletStock");
// //     const CenterStock = mongoose.model("CenterStock");

// //     // Use productReceipts if provided, otherwise use productApprovals
// //     const productsToProcess = productReceipts && productReceipts.length > 0 
// //       ? productReceipts 
// //       : productApprovals.map((approval) => ({
// //           productId: approval.productId,
// //           receivedQuantity: approval.approvedQuantity,
// //           receivedRemark: approval.receivedRemark || approval.approvedRemark || "",
// //         }));

// //     for (const receipt of productsToProcess) {
// //       const productItem = stockRequest.products.find(
// //         (p) => p.product.toString() === receipt.productId.toString()
// //       );

// //       if (!productItem) {
// //         return res.status(400).json({
// //           success: false,
// //           message: `Product ${receipt.productId} not found in stock request`,
// //         });
// //       }

// //       const productDoc = await Product.findById(receipt.productId);
// //       const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";
      
// //       const currentApprovedQuantity = productItem.approvedQuantity || 0;
// //       const receivedQuantity = receipt.receivedQuantity || 0;
      
// //       const outletStock = await OutletStock.findOne({
// //         outlet: stockRequest.warehouse,
// //         product: receipt.productId,
// //       });

// //       if (!outletStock) {
// //         return res.status(400).json({
// //           success: false,
// //           message: `No stock found in outlet for product ${receipt.productId}`,
// //         });
// //       }

// //       // Calculate the DIFFERENCE between new approved quantity and current approved quantity
// //       let newApprovedQuantity = currentApprovedQuantity;
// //       if (productApprovals && productApprovals.length > 0) {
// //         const approval = productApprovals.find(
// //           pa => pa.productId.toString() === receipt.productId.toString()
// //         );
// //         if (approval) {
// //           newApprovedQuantity = approval.approvedQuantity;
// //         }
// //       }
      
// //       const quantityDifference = newApprovedQuantity - currentApprovedQuantity;
// //       const quantityToTransfer = receivedQuantity;
      
// //       console.log(`[DEBUG] Processing product ${receipt.productId}:`);
// //       console.log(`[DEBUG] Current approved: ${currentApprovedQuantity}`);
// //       console.log(`[DEBUG] New approved: ${newApprovedQuantity}`);
// //       console.log(`[DEBUG] Quantity difference: ${quantityDifference}`);
// //       console.log(`[DEBUG] Received/Transfer quantity: ${quantityToTransfer}`);
// //       console.log(`[DEBUG] Outlet stock before - Available: ${outletStock.availableQuantity}, InTransit: ${outletStock.inTransitQuantity}, Total: ${outletStock.totalQuantity}`);

// //       if (tracksSerialNumbers) {
// //         // Handle serialized products
// //         const currentApprovedSerials = productItem.approvedSerials || [];
// //         let newApprovedSerials = currentApprovedSerials;
        
// //         if (productApprovals && productApprovals.length > 0) {
// //           const approval = productApprovals.find(
// //             pa => pa.productId.toString() === receipt.productId.toString()
// //           );
// //           if (approval && approval.approvedSerials) {
// //             newApprovedSerials = approval.approvedSerials;
// //           }
// //         }
        
// //         console.log(`[DEBUG] Current approved serials: ${currentApprovedSerials.length}`);
// //         console.log(`[DEBUG] New approved serials: ${newApprovedSerials.length}`);

// //         // If increasing approved quantity (quantityDifference > 0)
// //         if (quantityDifference > 0) {
// //           console.log(`[DEBUG] Need to mark ${quantityDifference} additional serials as in_transit`);
          
// //           // Get additional serials (the ones beyond current approved)
// //           const additionalSerials = newApprovedSerials.slice(currentApprovedQuantity);
          
// //           if (additionalSerials.length !== quantityDifference) {
// //             return res.status(400).json({
// //               success: false,
// //               message: `Need ${quantityDifference} additional serial numbers but got ${additionalSerials.length}`,
// //             });
// //           }
          
// //           // Mark additional serials as in_transit
// //           let newlyMarkedCount = 0;
// //           for (const serialNumber of additionalSerials) {
// //             const serial = outletStock.serialNumbers.find(
// //               sn => sn.serialNumber === serialNumber
// //             );

// //             if (serial && serial.status === "available") {
// //               serial.status = "in_transit";
// //               serial.currentLocation = stockRequest.warehouse;

// //               serial.transferHistory.push({
// //                 fromCenter: stockRequest.warehouse,
// //                 toCenter: stockRequest.center,
// //                 transferDate: new Date(),
// //                 transferType: "outlet_to_center",
// //                 status: "in_transit",
// //                 remark: "Additional stock for incomplete completion",
// //               });

// //               newlyMarkedCount++;
// //               console.log(`[DEBUG] Marked additional serial ${serialNumber} as in_transit`);
// //             } else if (serial && serial.status === "in_transit") {
// //               // Already in transit (from previous incomplete marking)
// //               console.log(`[DEBUG] Serial ${serialNumber} already in_transit`);
// //               newlyMarkedCount++;
// //             }
// //           }
          
// //           if (newlyMarkedCount > 0) {
// //             outletStock.availableQuantity -= newlyMarkedCount;
// //             outletStock.inTransitQuantity += newlyMarkedCount;
// //             console.log(`[DEBUG] Updated outlet - Available: -${newlyMarkedCount}, InTransit: +${newlyMarkedCount}`);
// //           }
// //         }
        
// //         // If decreasing approved quantity (quantityDifference < 0)
// //         if (quantityDifference < 0) {
// //           const quantityToRevert = Math.abs(quantityDifference);
// //           console.log(`[DEBUG] Need to revert ${quantityToRevert} serials back to available`);
          
// //           // Get serials to revert (the ones beyond new approved quantity)
// //           const serialsToRevert = currentApprovedSerials.slice(newApprovedQuantity);
          
// //           let revertedCount = 0;
// //           for (const serialNumber of serialsToRevert) {
// //             const serial = outletStock.serialNumbers.find(
// //               sn => sn.serialNumber === serialNumber
// //             );

// //             if (serial && serial.status === "in_transit") {
// //               serial.status = "available";
// //               serial.currentLocation = stockRequest.warehouse;

// //               // Remove the transfer history entry
// //               if (serial.transferHistory.length > 0) {
// //                 const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
// //                 if (lastTransfer.status === "in_transit") {
// //                   serial.transferHistory.pop();
// //                 }
// //               }

// //               revertedCount++;
// //               console.log(`[DEBUG] Reverted serial ${serialNumber} back to available`);
// //             }
// //           }
          
// //           if (revertedCount > 0) {
// //             outletStock.availableQuantity += revertedCount;
// //             outletStock.inTransitQuantity -= revertedCount;
// //             console.log(`[DEBUG] Updated outlet - Available: +${revertedCount}, InTransit: -${revertedCount}`);
// //           }
// //         }

// //         // Now transfer the received quantity
// //         if (quantityToTransfer > 0) {
// //           const serialsToTransfer = newApprovedSerials.slice(0, quantityToTransfer);
// //           console.log(`[DEBUG] Transferring ${serialsToTransfer.length} serials: ${serialsToTransfer.join(', ')}`);

// //           let transferredCount = 0;
// //           for (const serialNumber of serialsToTransfer) {
// //             const serial = outletStock.serialNumbers.find(
// //               sn => sn.serialNumber === serialNumber
// //             );

// //             if (serial && serial.status === "in_transit") {
// //               serial.status = "transferred";
// //               serial.currentLocation = stockRequest.center;

// //               // Update the last transfer history entry
// //               if (serial.transferHistory.length > 0) {
// //                 const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
// //                 if (lastTransfer) {
// //                   lastTransfer.status = "completed";
// //                   lastTransfer.completedAt = new Date();
// //                 }
// //               }

// //               transferredCount++;
// //               console.log(`[DEBUG] Marked serial ${serialNumber} as transferred`);
// //             }
// //           }

// //           if (transferredCount > 0) {
// //             outletStock.inTransitQuantity -= transferredCount;
// //             outletStock.totalQuantity -= transferredCount;

// //             // Add to center stock
// //             await CenterStock.updateStock(
// //               stockRequest.center,
// //               receipt.productId,
// //               transferredCount,
// //               serialsToTransfer,
// //               stockRequest.warehouse,
// //               "inbound_transfer"
// //             );

// //             console.log(`[DEBUG] Transferred ${transferredCount} serials to center`);
// //           }

// //           productItem.transferredSerials = serialsToTransfer;
// //         }

// //       } else {
// //         // Handle non-serialized products
// //         console.log(`[DEBUG] Processing non-serialized product`);
        
// //         // If increasing approved quantity
// //         if (quantityDifference > 0) {
// //           console.log(`[DEBUG] Need to mark ${quantityDifference} additional units as in_transit`);
          
// //           // Check availability
// //           if (outletStock.availableQuantity < quantityDifference) {
// //             return res.status(400).json({
// //               success: false,
// //               message: `Insufficient stock in outlet. Available: ${outletStock.availableQuantity}, Needed: ${quantityDifference}`,
// //             });
// //           }
          
// //           outletStock.availableQuantity -= quantityDifference;
// //           outletStock.inTransitQuantity += quantityDifference;
// //           console.log(`[DEBUG] Updated outlet - Available: -${quantityDifference}, InTransit: +${quantityDifference}`);
// //         }
        
// //         // If decreasing approved quantity
// //         if (quantityDifference < 0) {
// //           const quantityToRevert = Math.abs(quantityDifference);
// //           console.log(`[DEBUG] Need to revert ${quantityToRevert} units back to available`);
          
// //           outletStock.availableQuantity += quantityToRevert;
// //           outletStock.inTransitQuantity -= quantityToRevert;
// //           console.log(`[DEBUG] Updated outlet - Available: +${quantityToRevert}, InTransit: -${quantityToRevert}`);
// //         }

// //         // Transfer the received quantity
// //         if (quantityToTransfer > 0) {
// //           console.log(`[DEBUG] Transferring ${quantityToTransfer} units to center`);
          
// //           outletStock.inTransitQuantity -= quantityToTransfer;
// //           outletStock.totalQuantity -= quantityToTransfer;

// //           // Add to center stock
// //           await CenterStock.updateStock(
// //             stockRequest.center,
// //             receipt.productId,
// //             quantityToTransfer,
// //             [],
// //             stockRequest.warehouse,
// //             "inbound_transfer"
// //           );
          
// //           console.log(`[DEBUG] Added ${quantityToTransfer} units to center stock`);
// //         }
// //       }

// //       await outletStock.save();
      
// //       console.log(`[DEBUG] Outlet stock after - Available: ${outletStock.availableQuantity}, InTransit: ${outletStock.inTransitQuantity}, Total: ${outletStock.totalQuantity}`);

// //       // Update product item
// //       productItem.receivedQuantity = quantityToTransfer;
// //       productItem.receivedRemark = receipt.receivedRemark || "";
      
// //       if (productApprovals && productApprovals.length > 0) {
// //         const approval = productApprovals.find(
// //           (pa) => pa.productId.toString() === receipt.productId.toString()
// //         );
// //         if (approval) {
// //           productItem.approvedQuantity = approval.approvedQuantity;
// //           productItem.approvedSerials = approval.approvedSerials || [];
// //         }
// //       }
// //     }

// //     // Update stock request with new approvals
// //     if (productApprovals && productApprovals.length > 0) {
// //       stockRequest.products = stockRequest.products.map((productItem) => {
// //         const approval = productApprovals.find(
// //           (pa) => pa.productId.toString() === productItem.product.toString()
// //         );

// //         if (approval) {
// //           return {
// //             ...productItem.toObject(),
// //             approvedQuantity: approval.approvedQuantity,
// //             approvedRemark: approval.approvedRemark || "",
// //             approvedSerials: approval.approvedSerials || [],
// //           };
// //         }
// //         return productItem;
// //       });
// //     }

// //     stockRequest.status = "Completed";
// //     stockRequest.receivingInfo = {
// //       receivedAt: new Date(),
// //       receivedBy: userId,
// //     };
// //     stockRequest.completionInfo = {
// //       completedOn: new Date(),
// //       completedBy: userId,
// //     };
// //     stockRequest.updatedBy = userId;

// //     const updatedRequest = await stockRequest.save();

// //     const populatedRequest = await StockRequest.findById(updatedRequest._id)
// //       .populate("warehouse", "_id centerName centerCode centerType")
// //       .populate("center", "_id centerName centerCode centerType")
// //       .populate("products.product", "_id productTitle productCode productImage")
// //       .populate("createdBy", "_id fullName email")
// //       .populate("updatedBy", "_id fullName email")
// //       .populate("approvalInfo.approvedBy", "_id fullName email")
// //       .populate("receivingInfo.receivedBy", "_id fullName email")
// //       .populate("completionInfo.completedBy", "_id fullName email");

// //     res.status(200).json({
// //       success: true,
// //       message:
// //         "Incomplete stock request completed successfully and stock transferred to center",
// //       data: populatedRequest,
// //     });
// //   } catch (error) {
// //     console.error("Error completing incomplete stock request:", error);

// //     if (error.name === "CastError") {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Invalid stock request ID",
// //       });
// //     }

// //     if (error.name === "ValidationError") {
// //       const errors = Object.values(error.errors).map((err) => err.message);
// //       return res.status(400).json({
// //         success: false,
// //         message: "Validation error",
// //         errors,
// //       });
// //     }

// //     if (
// //       error.message.includes("Insufficient stock") ||
// //       error.message.includes("serial numbers") ||
// //       error.message.includes("No serial numbers assigned") ||
// //       error.message.includes("Approved quantity") ||
// //       error.message.includes("Received quantity") ||
// //       error.message.includes("Product ID") ||
// //       error.message.includes("exceed") ||
// //       error.message.includes("Cannot read properties of undefined")
// //     ) {
// //       return res.status(400).json({
// //         success: false,
// //         message: "Validation failed",
// //         error: error.message,
// //       });
// //     }

// //     res.status(500).json({
// //       success: false,
// //       message: "Error completing incomplete stock request",
// //       error:
// //         process.env.NODE_ENV === "development"
// //           ? error.message
// //           : "Internal server error",
// //     });
// //   }
// // };


// ///***************************** In below if outlet stock is not presnt then getting isssue then resolve this in below (change approved qty is 0 and not present in outlet stock) */

// export const completeIncompleteRequest = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();
  
//   try {
//     console.log("========== COMPLETE INCOMPLETE REQUEST STARTED ==========");
    
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["manage_indent"]
//     );

//     if (!hasAccess) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_indent permission required.",
//       });
//     }

//     const { id } = req.params;
//     const { productApprovals, productReceipts } = req.body;

//     console.log(`Processing incomplete stock request ID: ${id}`);
//     console.log(`Product approvals: ${JSON.stringify(productApprovals, null, 2)}`);
//     console.log(`Product receipts: ${JSON.stringify(productReceipts, null, 2)}`);

//     const stockRequest = await StockRequest.findById(id).session(session);
//     if (!stockRequest) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. You can only complete incomplete stock requests from your own center.",
//       });
//     }

//     if (stockRequest.status !== "Incompleted") {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json({
//         success: false,
//         message: "Only incomplete stock requests can be completed",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     if (
//       (!productApprovals ||
//         !Array.isArray(productApprovals) ||
//         productApprovals.length === 0) &&
//       (!productReceipts ||
//         !Array.isArray(productReceipts) ||
//         productReceipts.length === 0)
//     ) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json({
//         success: false,
//         message: "Either product approvals or product receipts are required",
//       });
//     }

//     const Product = mongoose.model("Product");
//     const OutletStock = mongoose.model("OutletStock");
//     const CenterStock = mongoose.model("CenterStock");
//     const ResellerStock = mongoose.model("ResellerStock");

//     // ============================================
//     // VALIDATION PHASE - NO DATABASE CHANGES YET
//     // ============================================
//     console.log("\n========== VALIDATION PHASE ==========");
    
//     if (productApprovals && productApprovals.length > 0) {
//       for (const approval of productApprovals) {
//         if (!approval.productId) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: "Product ID is required for each product approval",
//           });
//         }

//         if (
//           approval.approvedQuantity === undefined ||
//           approval.approvedQuantity === null
//         ) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: `Approved quantity is required for product ID ${approval.productId}`,
//           });
//         }

//         if (
//           typeof approval.approvedQuantity !== "number" ||
//           isNaN(approval.approvedQuantity)
//         ) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: `Approved quantity must be a valid number for product ID ${approval.productId}`,
//           });
//         }

//         if (approval.approvedQuantity < 0) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: `Approved quantity cannot be negative for product ID ${approval.productId}`,
//           });
//         }

//         if (!Number.isInteger(approval.approvedQuantity)) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: `Approved quantity must be an integer for product ID ${approval.productId}`,
//           });
//         }

//         const productItem = stockRequest.products.find(
//           (p) => p.product.toString() === approval.productId.toString()
//         );

//         if (!productItem) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: `Product with ID ${approval.productId} not found in stock request`,
//           });
//         }

//         console.log(`  Product: ${approval.productId}`);
//         console.log(`    Requested quantity: ${productItem.quantity}`);
//         console.log(`    Approved quantity: ${approval.approvedQuantity}`);

//         if (
//           approval.approvedQuantity === 0 &&
//           (!approval.approvedRemark || approval.approvedRemark.trim() === "")
//         ) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: `Approval remark is required when approved quantity is zero for product ID ${approval.productId}`,
//           });
//         }

//         const productDoc = await Product.findById(approval.productId).session(session);
//         const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

//         if (tracksSerialNumbers) {
//           if (approval.approvedQuantity > 0) {
//             const approvedSerials = approval.approvedSerials || [];

//             if (approvedSerials.length > 0) {
//               const uniqueSerials = new Set(approvedSerials);
//               if (uniqueSerials.size !== approvedSerials.length) {
//                 await session.abortTransaction();
//                 session.endSession();
//                 return res.status(400).json({
//                   success: false,
//                   message: `Duplicate serial numbers found for product ${productDoc?.productTitle || approval.productId}`,
//                 });
//               }
//             }
//           } else {
//             if (
//               approval.approvedSerials &&
//               approval.approvedSerials.length > 0
//             ) {
//               await session.abortTransaction();
//               session.endSession();
//               return res.status(400).json({
//                 success: false,
//                 message: `Approved serial numbers should not be provided when approved quantity is zero for product ${productDoc?.productTitle || approval.productId}`,
//               });
//             }
//           }
//         } else {
//           if (approval.approvedSerials && approval.approvedSerials.length > 0) {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(400).json({
//               success: false,
//               message: `Approved serial numbers should not be provided for product ${productDoc?.productTitle || approval.productId} as it does not track serial numbers`,
//             });
//           }
//         }
//       }

//       const productApprovalsWithQuantity = productApprovals.filter(
//         (pa) => pa.approvedQuantity > 0
//       );

//       if (productApprovalsWithQuantity.length > 0) {
//         const validationResults = await stockRequest.validateSerialNumbersForIncomplete(
//           productApprovalsWithQuantity
//         );
//         const invalidResults = validationResults.filter(
//           (result) => !result.valid
//         );

//         if (invalidResults.length > 0) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: "Serial number validation failed",
//             validationErrors: invalidResults,
//           });
//         }
//       }
//     }

//     if (productReceipts && productReceipts.length > 0) {
//       for (const receipt of productReceipts) {
//         if (!receipt.productId) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: "Product ID is required for each product receipt",
//           });
//         }

//         if (
//           receipt.receivedQuantity === undefined ||
//           receipt.receivedQuantity === null
//         ) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: `Received quantity is required for product ID ${receipt.productId}`,
//           });
//         }

//         if (
//           typeof receipt.receivedQuantity !== "number" ||
//           isNaN(receipt.receivedQuantity)
//         ) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: `Received quantity must be a valid number for product ID ${receipt.productId}`,
//           });
//         }

//         if (receipt.receivedQuantity < 0) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: `Received quantity cannot be negative for product ID ${receipt.productId}`,
//           });
//         }

//         if (!Number.isInteger(receipt.receivedQuantity)) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: `Received quantity must be an integer for product ID ${receipt.productId}`,
//           });
//         }

//         const productItem = stockRequest.products.find(
//           (p) => p.product.toString() === receipt.productId.toString()
//         );

//         if (!productItem) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: `Product with ID ${receipt.productId} not found in stock request`,
//           });
//         }
//       }
//     }

//     // Determine products to process
//     const productsToProcess = productReceipts && productReceipts.length > 0 
//       ? productReceipts 
//       : productApprovals.map((approval) => ({
//           productId: approval.productId,
//           receivedQuantity: approval.approvedQuantity,
//           receivedRemark: approval.receivedRemark || approval.approvedRemark || "",
//         }));

//     const productsToProcessWithQuantity = productsToProcess.filter(
//       product => product.receivedQuantity > 0
//     );

//     console.log(`\n📊 Processing ${productsToProcessWithQuantity.length} products with non-zero quantity`);

//     // ============================================
//     // PRE-VALIDATION: Check stock availability BEFORE making changes
//     // ============================================
//     console.log("\n========== PRE-VALIDATION - CHECKING STOCK ==========");
//     const preValidationErrors = [];
    
//     for (const receipt of productsToProcessWithQuantity) {
//       const outletStock = await OutletStock.findOne({
//         outlet: stockRequest.warehouse,
//         product: receipt.productId,
//       }).session(session);

//       if (!outletStock) {
//         const productDoc = await Product.findById(receipt.productId).session(session);
//         preValidationErrors.push({
//           productId: receipt.productId,
//           productName: productDoc?.productTitle || "Unknown Product",
//           message: `No stock found in outlet for product "${productDoc?.productTitle || receipt.productId}"`
//         });
//         continue;
//       }

//       const productDoc = await Product.findById(receipt.productId).session(session);
//       const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";
//       const quantityToTransfer = receipt.receivedQuantity;

//       console.log(`\nChecking product: ${productDoc?.productTitle || receipt.productId}`);
//       console.log(`  Quantity to transfer: ${quantityToTransfer}`);
//       console.log(`  Outlet available stock: ${outletStock.availableQuantity}`);
//       console.log(`  Tracks serial numbers: ${tracksSerialNumbers}`);

//       if (!tracksSerialNumbers) {
//         if (outletStock.availableQuantity < quantityToTransfer) {
//           preValidationErrors.push({
//             productId: receipt.productId,
//             productName: productDoc?.productTitle || "Unknown Product",
//             available: outletStock.availableQuantity,
//             required: quantityToTransfer,
//             message: `Insufficient available stock for product "${productDoc?.productTitle}". Available: ${outletStock.availableQuantity}, Required: ${quantityToTransfer}`
//           });
//         }
//       }
//     }

//     if (preValidationErrors.length > 0) {
//       await session.abortTransaction();
//       session.endSession();
      
//       const errorMessages = preValidationErrors.map(err => err.message);
      
//       return res.status(400).json({
//         success: false,
//         message: errorMessages.join(". "),
//         errors: preValidationErrors
//       });
//     }

//     console.log("\n✅ Pre-validation passed - All products have sufficient stock");

//     // ============================================
//     // PROCESSING PHASE - DIRECTLY REDUCE FROM AVAILABLE
//     // ============================================
//     console.log("\n========== PROCESSING PHASE - STOCK MOVEMENT ==========");
    
//     for (const receipt of productsToProcessWithQuantity) {
//       console.log(`\n========== Processing Product: ${receipt.productId} ==========`);
      
//       const productItem = stockRequest.products.find(
//         (p) => p.product.toString() === receipt.productId.toString()
//       );

//       if (!productItem) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(400).json({
//           success: false,
//           message: `Product with ID ${receipt.productId} not found in stock request`,
//         });
//       }

//       const productDoc = await Product.findById(receipt.productId).session(session);
//       const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";
      
//       const currentApprovedQuantity = productItem.approvedQuantity || 0;
//       const receivedQuantity = receipt.receivedQuantity || 0;
      
//       let newApprovedQuantity = currentApprovedQuantity;
//       let newApprovedSerials = productItem.approvedSerials || [];
      
//       if (productApprovals && productApprovals.length > 0) {
//         const approval = productApprovals.find(
//           pa => pa.productId.toString() === receipt.productId.toString()
//         );
//         if (approval) {
//           newApprovedQuantity = approval.approvedQuantity;
//           newApprovedSerials = approval.approvedSerials || [];
//         }
//       }
      
//       const quantityDifference = newApprovedQuantity - currentApprovedQuantity;
//       const quantityToTransfer = receivedQuantity;
      
//       console.log(`📊 Product: ${productDoc?.productTitle || receipt.productId}`);
//       console.log(`  Current approved: ${currentApprovedQuantity}`);
//       console.log(`  New approved: ${newApprovedQuantity}`);
//       console.log(`  Quantity difference: ${quantityDifference}`);
//       console.log(`  Quantity to transfer: ${quantityToTransfer}`);
//       console.log(`  Tracks serial numbers: ${tracksSerialNumbers}`);
      
//       const outletStock = await OutletStock.findOne({
//         outlet: stockRequest.warehouse,
//         product: receipt.productId,
//       }).session(session);

//       if (!outletStock) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(400).json({
//           success: false,
//           message: `No stock found in outlet for product "${productDoc?.productTitle || receipt.productId}"`,
//         });
//       }

//       console.log(`\n  BEFORE OUTLET UPDATE:`);
//       console.log(`    Available Quantity: ${outletStock.availableQuantity}`);
//       console.log(`    Total Quantity: ${outletStock.totalQuantity}`);

//       if (tracksSerialNumbers) {
//         // ============================================
//         // SERIALIZED PRODUCTS HANDLING
//         // ============================================
//         console.log(`\n  🔢 SERIALIZED PRODUCT HANDLING`);
        
//         const currentApprovedSerials = productItem.approvedSerials || [];
        
//         console.log(`  Current approved serials (${currentApprovedSerials.length}): ${currentApprovedSerials.join(', ')}`);
//         console.log(`  New approved serials (${newApprovedSerials.length}): ${newApprovedSerials.join(', ')}`);

//         // Handle quantity difference (increase or decrease in approval)
//         if (quantityDifference > 0) {
//           console.log(`\n  📈 Increasing approval by ${quantityDifference} units`);
          
//           const additionalSerials = newApprovedSerials.slice(currentApprovedQuantity);
          
//           if (additionalSerials.length !== quantityDifference) {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(400).json({
//               success: false,
//               message: `Need ${quantityDifference} additional serial numbers but got ${additionalSerials.length} for product "${productDoc?.productTitle}"`,
//             });
//           }
          
//           // Check if additional serials are available in outlet stock
//           for (const serialNumber of additionalSerials) {
//             const serial = outletStock.serialNumbers.find(
//               sn => sn.serialNumber === serialNumber
//             );

//             if (!serial || serial.status !== "available") {
//               await session.abortTransaction();
//               session.endSession();
//               return res.status(400).json({
//                 success: false,
//                 message: `Serial number ${serialNumber} not available in outlet stock for product "${productDoc?.productTitle}"`,
//               });
//             }
//           }
          
//           // No stock reduction yet - just validation passed
//           console.log(`  ✅ Validated ${quantityDifference} additional serials are available`);
//         }
        
//         if (quantityDifference < 0) {
//           console.log(`\n  📉 Decreasing approval by ${Math.abs(quantityDifference)} units`);
//           // No stock changes needed when decreasing approval
//           console.log(`  ✅ No stock changes for decreased approval`);
//         }

//         // Handle actual stock transfer (reduce from available)
//         if (quantityToTransfer > 0) {
//           console.log(`\n  🔻 TRANSFERRING ${quantityToTransfer} SERIALS TO CENTER`);
          
//           const serialsToTransfer = newApprovedSerials.slice(0, quantityToTransfer);
//           console.log(`  Serials to transfer: ${serialsToTransfer.join(', ')}`);

//           // Check if all serials are available
//           for (const serialNumber of serialsToTransfer) {
//             const serial = outletStock.serialNumbers.find(
//               sn => sn.serialNumber === serialNumber
//             );

//             if (!serial || serial.status !== "available") {
//               await session.abortTransaction();
//               session.endSession();
//               return res.status(400).json({
//                 success: false,
//                 message: `Serial number ${serialNumber} is not available in outlet stock for product "${productDoc?.productTitle}"`,
//               });
//             }
//           }

//           // Reduce stock from outlet available
//           let transferredCount = 0;
//           for (const serialNumber of serialsToTransfer) {
//             const serial = outletStock.serialNumbers.find(
//               sn => sn.serialNumber === serialNumber
//             );

//             if (serial && serial.status === "available") {
//               serial.status = "transferred";
//               serial.currentLocation = stockRequest.center;

//               serial.transferHistory.push({
//                 fromCenter: stockRequest.warehouse,
//                 toCenter: stockRequest.center,
//                 transferDate: new Date(),
//                 transferType: "outlet_to_center",
//                 status: "completed",
//                 completedAt: new Date(),
//                 transferredBy: userId,
//                 referenceId: stockRequest._id,
//                 remark: "Incomplete stock request completion"
//               });

//               transferredCount++;
//               console.log(`    ✅ Transferred serial ${serialNumber}`);
//             }
//           }

//           if (transferredCount > 0) {
//             outletStock.availableQuantity -= transferredCount;
//             outletStock.totalQuantity -= transferredCount;
//             console.log(`\n  AFTER OUTLET UPDATE:`);
//             console.log(`    Available Quantity: ${outletStock.availableQuantity} (decreased by ${transferredCount})`);
//             console.log(`    Total Quantity: ${outletStock.totalQuantity} (decreased by ${transferredCount})`);
//           }

//           // Add to center stock
//           let centerStock = await CenterStock.findOne({
//             center: stockRequest.center,
//             product: receipt.productId,
//           }).session(session);

//           if (!centerStock) {
//             centerStock = new CenterStock({
//               center: stockRequest.center,
//               product: receipt.productId,
//               totalQuantity: 0,
//               availableQuantity: 0,
//               consumedQuantity: 0,
//               serialNumbers: []
//             });
//           }

//           console.log(`\n  BEFORE CENTER UPDATE:`);
//           console.log(`    Total Quantity: ${centerStock.totalQuantity}`);
//           console.log(`    Available Quantity: ${centerStock.availableQuantity}`);

//           // Helper function to get serial details from outlet stock
//           const getSerialDetails = async (serialNumber) => {
//             const outletStockForSerial = await OutletStock.findOne({
//               outlet: stockRequest.warehouse,
//               product: receipt.productId,
//               "serialNumbers.serialNumber": serialNumber
//             }).session(session);
            
//             if (outletStockForSerial) {
//               const outletSerial = outletStockForSerial.serialNumbers.find(
//                 sn => sn.serialNumber === serialNumber
//               );
//               if (outletSerial) {
//                 return {
//                   purchaseId: outletSerial.purchaseId,
//                   originalOutlet: outletSerial.currentLocation || stockRequest.warehouse
//                 };
//               }
//             }
//             return {
//               purchaseId: new mongoose.Types.ObjectId(),
//               originalOutlet: stockRequest.warehouse
//             };
//           };

//           for (const serialNumber of serialsToTransfer) {
//             const existingSerial = centerStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
            
//             if (existingSerial) {
//               if (existingSerial.status === "damaged" || existingSerial.status === "damage_pending") {
//                 existingSerial.status = "available";
//                 existingSerial.currentLocation = stockRequest.center;
                
//                 // Ensure required fields exist on reactivated serial
//                 if (!existingSerial.purchaseId || !existingSerial.originalOutlet) {
//                   const details = await getSerialDetails(serialNumber);
//                   if (!existingSerial.purchaseId) existingSerial.purchaseId = details.purchaseId;
//                   if (!existingSerial.originalOutlet) existingSerial.originalOutlet = details.originalOutlet;
//                 }
                
//                 centerStock.availableQuantity += 1;
//                 console.log(`    ✅ Reactivated damaged serial ${serialNumber} in center`);
//               }
//             } else {
//               const details = await getSerialDetails(serialNumber);
              
//               centerStock.serialNumbers.push({
//                 serialNumber: serialNumber,
//                 purchaseId: details.purchaseId,
//                 originalOutlet: details.originalOutlet,
//                 status: "available",
//                 currentLocation: stockRequest.center,
//                 transferHistory: [{
//                   fromCenter: stockRequest.warehouse,
//                   toCenter: stockRequest.center,
//                   transferDate: new Date(),
//                   transferType: "inbound_transfer",
//                   remark: "Incomplete stock request completion",
//                   referenceId: stockRequest._id,
//                   transferredBy: userId
//                 }]
//               });
//               centerStock.totalQuantity += 1;
//               centerStock.availableQuantity += 1;
//               console.log(`    ✅ Added new serial ${serialNumber} to center`);
//             }
//           }

//           console.log(`\n  AFTER CENTER UPDATE:`);
//           console.log(`    Total Quantity: ${centerStock.totalQuantity}`);
//           console.log(`    Available Quantity: ${centerStock.availableQuantity}`);
          
//           await centerStock.save({ session });
//           console.log(`  💾 Center stock saved successfully`);

//           productItem.transferredSerials = serialsToTransfer;
//         }

//       } else {
//         // ============================================
//         // NON-SERIALIZED PRODUCTS HANDLING
//         // ============================================
//         console.log(`\n  📦 NON-SERIALIZED PRODUCT HANDLING`);
        
//         // Handle quantity difference (increase or decrease in approval)
//         if (quantityDifference > 0) {
//           console.log(`\n  📈 Increasing approval by ${quantityDifference} units`);
//           // Check if enough available stock
//           if (outletStock.availableQuantity < quantityDifference) {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(400).json({
//               success: false,
//               message: `Insufficient available stock for product "${productDoc?.productTitle}". Available: ${outletStock.availableQuantity}, Needed: ${quantityDifference}`,
//             });
//           }
//           console.log(`  ✅ Sufficient stock available for approval increase`);
//         }
        
//         if (quantityDifference < 0) {
//           console.log(`\n  📉 Decreasing approval by ${Math.abs(quantityDifference)} units`);
//           // No stock changes needed when decreasing approval
//           console.log(`  ✅ No stock changes for decreased approval`);
//         }

//         // Handle actual stock transfer (reduce from available)
//         if (quantityToTransfer > 0) {
//           console.log(`\n  🔻 TRANSFERRING ${quantityToTransfer} UNITS TO CENTER`);
          
//           // Check if enough available stock
//           if (outletStock.availableQuantity < quantityToTransfer) {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(400).json({
//               success: false,
//               message: `Insufficient available stock for transfer for product "${productDoc?.productTitle}". Available: ${outletStock.availableQuantity}, Required: ${quantityToTransfer}`,
//             });
//           }
          
//           // Reduce from outlet available
//           outletStock.availableQuantity -= quantityToTransfer;
//           outletStock.totalQuantity -= quantityToTransfer;
          
//           console.log(`  AFTER OUTLET UPDATE:`);
//           console.log(`    Available Quantity: ${outletStock.availableQuantity} (decreased by ${quantityToTransfer})`);
//           console.log(`    Total Quantity: ${outletStock.totalQuantity} (decreased by ${quantityToTransfer})`);

//           // Add to center stock
//           let centerStock = await CenterStock.findOne({
//             center: stockRequest.center,
//             product: receipt.productId,
//           }).session(session);

//           if (!centerStock) {
//             centerStock = new CenterStock({
//               center: stockRequest.center,
//               product: receipt.productId,
//               totalQuantity: 0,
//               availableQuantity: 0,
//               consumedQuantity: 0,
//               serialNumbers: []
//             });
//           }

//           console.log(`\n  BEFORE CENTER UPDATE:`);
//           console.log(`    Total Quantity: ${centerStock.totalQuantity}`);
//           console.log(`    Available Quantity: ${centerStock.availableQuantity}`);

//           centerStock.totalQuantity += quantityToTransfer;
//           centerStock.availableQuantity += quantityToTransfer;

//           console.log(`\n  AFTER CENTER UPDATE:`);
//           console.log(`    Total Quantity: ${centerStock.totalQuantity} (added ${quantityToTransfer})`);
//           console.log(`    Available Quantity: ${centerStock.availableQuantity} (added ${quantityToTransfer})`);
          
//           await centerStock.save({ session });
//           console.log(`  💾 Center stock saved successfully`);
//         }
//       }

//       // Final safety checks
//       if (outletStock.availableQuantity < 0) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(400).json({
//           success: false,
//           message: `Stock calculation error: availableQuantity would become negative (${outletStock.availableQuantity}) for product "${productDoc?.productTitle}"`,
//         });
//       }
      
//       if (outletStock.totalQuantity < 0) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(400).json({
//           success: false,
//           message: `Stock calculation error: totalQuantity would become negative (${outletStock.totalQuantity}) for product "${productDoc?.productTitle}"`,
//         });
//       }

//       await outletStock.save({ session });
//       console.log(`  💾 Outlet stock saved successfully`);

//       // Update product item in stock request
//       productItem.receivedQuantity = quantityToTransfer;
//       productItem.receivedRemark = receipt.receivedRemark || "";
      
//       if (productApprovals && productApprovals.length > 0) {
//         const approval = productApprovals.find(
//           (pa) => pa.productId.toString() === receipt.productId.toString()
//         );
//         if (approval) {
//           productItem.approvedQuantity = approval.approvedQuantity;
//           productItem.approvedSerials = approval.approvedSerials || [];
//         }
//       }
      
//       console.log(`\n✅ Product ${productDoc?.productTitle || receipt.productId} processed successfully`);
//       console.log(`   Stock OUT: Outlet (-${quantityToTransfer} from available)`);
//       console.log(`   Stock IN: Center (+${quantityToTransfer} to available)`);
//     }

//     // Update stock request with all approvals (including 0 quantity)
//     if (productApprovals && productApprovals.length > 0) {
//       stockRequest.products = stockRequest.products.map((productItem) => {
//         const approval = productApprovals.find(
//           (pa) => pa.productId.toString() === productItem.product.toString()
//         );

//         if (approval) {
//           return {
//             ...productItem.toObject(),
//             approvedQuantity: approval.approvedQuantity,
//             approvedRemark: approval.approvedRemark || "",
//             approvedSerials: approval.approvedSerials || [],
//             receivedQuantity: approval.approvedQuantity === 0 ? 0 : productItem.receivedQuantity,
//             receivedRemark: approval.approvedQuantity === 0 ? (approval.approvedRemark || "") : productItem.receivedRemark
//           };
//         }
//         return productItem;
//       });
//     }

//     if (productReceipts && productReceipts.length > 0) {
//       stockRequest.products = stockRequest.products.map((productItem) => {
//         const receipt = productReceipts.find(
//           (pr) => pr.productId.toString() === productItem.product.toString()
//         );

//         if (receipt && receipt.receivedQuantity === 0) {
//           return {
//             ...productItem.toObject(),
//             receivedQuantity: 0,
//             receivedRemark: receipt.receivedRemark || ""
//           };
//         }
//         return productItem;
//       });
//     }

//     stockRequest.status = "Completed";
//     stockRequest.receivingInfo = {
//       receivedAt: new Date(),
//       receivedBy: userId,
//     };
//     stockRequest.completionInfo = {
//       completedOn: new Date(),
//       completedBy: userId,
//     };
//     stockRequest.updatedBy = userId;

//     await stockRequest.save({ session });
//     console.log(`\n✅ Stock request status updated to Completed`);

//     // Commit all changes
//     console.log(`\n💾 COMMITTING TRANSACTION...`);
//     await session.commitTransaction();
//     session.endSession();
//     console.log(`✅ TRANSACTION COMMITTED SUCCESSFULLY`);
//     console.log("========== COMPLETE INCOMPLETE REQUEST FINISHED ==========\n");

//     const populatedRequest = await StockRequest.findById(stockRequest._id)
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode centerType")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email")
//       .populate("approvalInfo.approvedBy", "_id fullName email")
//       .populate("receivingInfo.receivedBy", "_id fullName email")
//       .populate("completionInfo.completedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Incomplete stock request completed successfully - Stock reduced from Outlet available stock and added to Center",
//       data: populatedRequest,
//     });

//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
    
//     console.error(`\n❌ ERROR OCCURRED: ${error.message}`);
//     console.error(`Stack trace: ${error.stack}`);
//     console.log(`🔄 TRANSACTION ROLLED BACK - No changes were saved`);
//     console.log("========== COMPLETE INCOMPLETE REQUEST FAILED ==========\n");

//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock request ID",
//       });
//     }

//     if (error.name === "ValidationError") {
//       const errors = Object.values(error.errors).map((err) => err.message);
//       return res.status(400).json({
//         success: false,
//         message: "Validation error",
//         errors,
//       });
//     }

//     if (
//       error.message.includes("Insufficient stock") ||
//       error.message.includes("serial numbers") ||
//       error.message.includes("No serial numbers assigned") ||
//       error.message.includes("Approved quantity") ||
//       error.message.includes("Received quantity") ||
//       error.message.includes("Product ID") ||
//       error.message.includes("exceed") ||
//       error.message.includes("available")
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: error.message,
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Error completing incomplete stock request. All changes have been rolled back.",
//       error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
//     });
//   }
// };
// /////************ resolve change approved qty and complete request issue */
// export const completeStockRequest = async (req, res) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();
  
//   try {
//     console.log("========== COMPLETE STOCK REQUEST STARTED ==========");
    
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["complete_indent", "manage_indent"]
//     );

//     if (!hasAccess) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. complete_indent or manage_indent permission required.",
//       });
//     }

//     const { id } = req.params;
//     const { productReceipts, receivedRemark } = req.body;

//     console.log(`Processing stock request ID: ${id}`);
//     console.log(`Product receipts: ${JSON.stringify(productReceipts, null, 2)}`);

//     const stockRequest = await StockRequest.findById(id).session(session);
//     if (!stockRequest) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     console.log(`Stock request found - Status: ${stockRequest.status}, Center: ${stockRequest.center}, Warehouse: ${stockRequest.warehouse}`);

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. You can only complete stock requests from your own center.",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     if (!productReceipts || !Array.isArray(productReceipts) || productReceipts.length === 0) {
//       await session.abortTransaction();
//       session.endSession();
//       return res.status(400).json({
//         success: false,
//         message: "Product receipts are required",
//       });
//     }

//     const Product = mongoose.model("Product");
//     const ResellerStock = mongoose.model("ResellerStock");
//     const OutletStock = mongoose.model("OutletStock");
//     const CenterStock = mongoose.model("CenterStock");

//     // ============================================
//     // VALIDATION PHASE - NO DATABASE CHANGES YET
//     // ============================================
//     console.log("\n========== VALIDATION PHASE ==========");
    
//     for (const receipt of productReceipts) {
//       console.log(`\nValidating product: ${receipt.productId}`);
      
//       if (!receipt.productId) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(400).json({
//           success: false,
//           message: "Product ID is required for each product receipt",
//         });
//       }

//       if (receipt.receivedQuantity === undefined || receipt.receivedQuantity === null) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(400).json({
//           success: false,
//           message: `Received quantity is required for product ID ${receipt.productId}`,
//         });
//       }

//       if (typeof receipt.receivedQuantity !== "number" || isNaN(receipt.receivedQuantity)) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(400).json({
//           success: false,
//           message: `Received quantity must be a valid number for product ID ${receipt.productId}`,
//         });
//       }

//       if (receipt.receivedQuantity < 0) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(400).json({
//           success: false,
//           message: `Received quantity cannot be negative for product ID ${receipt.productId}`,
//         });
//       }

//       if (!Number.isInteger(receipt.receivedQuantity)) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(400).json({
//           success: false,
//           message: `Received quantity must be an integer for product ID ${receipt.productId}`,
//         });
//       }

//       const productItem = stockRequest.products.find(
//         (p) => p.product.toString() === receipt.productId.toString()
//       );

//       if (!productItem) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(400).json({
//           success: false,
//           message: `Product with ID ${receipt.productId} not found in stock request`,
//         });
//       }

//       console.log(`  Approved quantity: ${productItem.approvedQuantity}, Received: ${receipt.receivedQuantity}`);

//       if (receipt.receivedQuantity > productItem.approvedQuantity) {
//         const productDoc = await Product.findById(receipt.productId).session(session);
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(400).json({
//           success: false,
//           message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity}) for product "${productDoc?.productTitle || receipt.productId}"`,
//         });
//       }

//       const productDoc = await Product.findById(receipt.productId).session(session);
//       const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";
//       console.log(`  Tracks serial numbers: ${tracksSerialNumbers}`);

//       if (tracksSerialNumbers) {
//         const receivedSerials = receipt.receivedSerials || [];

//         if (receipt.receivedQuantity > 0) {
//           if (receivedSerials.length > 0) {
//             const uniqueSerials = new Set(receivedSerials);
//             if (uniqueSerials.size !== receivedSerials.length) {
//               await session.abortTransaction();
//               session.endSession();
//               return res.status(400).json({
//                 success: false,
//                 message: `Duplicate serial numbers found for product ${productDoc.productTitle}`,
//               });
//             }
//           }
//         } else {
//           if (receivedSerials.length > 0) {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(400).json({
//               success: false,
//               message: `Received serial numbers should not be provided when received quantity is zero for product ${productDoc.productTitle}`,
//             });
//           }
//         }
//       } else {
//         if (receipt.receivedSerials && receipt.receivedSerials.length > 0) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: `Received serial numbers should not be provided for product ${productDoc.productTitle} as it does not track serial numbers`,
//           });
//         }
//       }
//     }

//     // ============================================
//     // PROCESSING PHASE - DIRECTLY REDUCE FROM AVAILABLE
//     // ============================================
//     console.log("\n========== PROCESSING PHASE - STOCK MOVEMENT ==========");
    
//     for (const receipt of productReceipts) {
//       console.log(`\n========== Processing Product: ${receipt.productId} ==========`);
      
//       const productItem = stockRequest.products.find(
//         (p) => p.product.toString() === receipt.productId.toString()
//       );

      // if (!productItem) {
      //   await session.abortTransaction();
      //   session.endSession();
      //   return res.status(400).json({
      //     success: false,
      //     message: `Product with ID ${receipt.productId} not found in stock request`,
      //   });
      // }

      // const sourceBreakdown = productItem.sourceBreakdown || {
//         fromReseller: { quantity: 0, serials: [] },
//         fromOutlet: { quantity: 0, serials: [] },
//         totalApproved: productItem.approvedQuantity || 0
//       };

//       console.log(`📊 Source Breakdown from approval:`);
//       console.log(`  Total Approved: ${sourceBreakdown.totalApproved}`);
//       console.log(`  From Outlet: ${sourceBreakdown.fromOutlet.quantity} units`);
//       console.log(`  From Reseller: ${sourceBreakdown.fromReseller.quantity} units`);
//       if (sourceBreakdown.fromOutlet.serials?.length > 0) {
//         console.log(`  Outlet Serials: ${sourceBreakdown.fromOutlet.serials.join(', ')}`);
//       }
//       if (sourceBreakdown.fromReseller.serials?.length > 0) {
//         console.log(`  Reseller Serials: ${sourceBreakdown.fromReseller.serials.join(', ')}`);
//       }

//       const totalApproved = sourceBreakdown.totalApproved || productItem.approvedQuantity || 0;
//       const receivedCount = receipt.receivedQuantity;
      
//       const productDoc = await Product.findById(receipt.productId).session(session);
//       const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";
      
//       let fromResellerReceived = 0;
//       let fromOutletReceived = 0;
//       let serialsToTransfer = [];
      
//       if (tracksSerialNumbers && productItem.approvedSerials && productItem.approvedSerials.length > 0) {
//         const allSerials = productItem.approvedSerials || [];
//         serialsToTransfer = allSerials.slice(0, receivedCount);
        
//         console.log(`  🔢 Serialized Product - All approved serials: ${allSerials.join(', ')}`);
//         console.log(`  🔢 Serials to transfer: ${serialsToTransfer.join(', ')}`);
        
//         if (sourceBreakdown.fromReseller.serials && sourceBreakdown.fromOutlet.serials) {
//           fromResellerReceived = serialsToTransfer.filter(serial => 
//             sourceBreakdown.fromReseller.serials.includes(serial)
//           ).length;
//           fromOutletReceived = serialsToTransfer.filter(serial => 
//             sourceBreakdown.fromOutlet.serials.includes(serial)
//           ).length;
          
//           console.log(`  📍 Based on source breakdown:`);
//           console.log(`     From Reseller serials: ${fromResellerReceived}`);
//           console.log(`     From Outlet serials: ${fromOutletReceived}`);
//         } else {
//           const resellerRatio = sourceBreakdown.fromReseller.quantity / totalApproved;
//           fromResellerReceived = Math.round(receivedCount * resellerRatio);
//           fromOutletReceived = receivedCount - fromResellerReceived;
//           console.log(`  📍 Based on ratio calculation (${resellerRatio}):`);
//           console.log(`     From Reseller: ${fromResellerReceived}, From Outlet: ${fromOutletReceived}`);
//         }
//       } else {
//         const resellerRatio = totalApproved > 0 ? sourceBreakdown.fromReseller.quantity / totalApproved : 0;
//         fromResellerReceived = Math.round(receivedCount * resellerRatio);
//         fromOutletReceived = receivedCount - fromResellerReceived;
//         console.log(`  📍 Non-serialized - Ratio: ${resellerRatio}`);
//         console.log(`     From Reseller: ${fromResellerReceived}, From Outlet: ${fromOutletReceived}`);
//       }

//       console.log(`\n🎯 FINAL DISTRIBUTION FOR ${productDoc?.productTitle || receipt.productId}:`);
//       console.log(`  📥 Received: ${receivedCount} units`);
//       console.log(`  🏭 From Outlet: ${fromOutletReceived} units`);
//       console.log(`  🏪 From Reseller: ${fromResellerReceived} units`);

//       // ✅ STEP 1: DIRECTLY REDUCE FROM OUTLET AVAILABLE STOCK
//       console.log(`\n🔻 STEP 1: REDUCING FROM OUTLET AVAILABLE STOCK (${fromOutletReceived} units)...`);
      
//       if (fromOutletReceived > 0) {
//         const outletStock = await OutletStock.findOne({
//           outlet: stockRequest.warehouse,
//           product: receipt.productId,
//         }).session(session);

//         console.log(`  Outlet ID: ${stockRequest.warehouse}`);
//         console.log(`  Outlet Stock Document Found: ${outletStock ? 'YES' : 'NO'}`);

//         if (!outletStock) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: `No stock found in outlet for product "${productDoc?.productTitle || receipt.productId}"`,
//           });
//         }

//         console.log(`  BEFORE OUTLET UPDATE:`);
//         console.log(`    Available Quantity: ${outletStock.availableQuantity}`);
//         console.log(`    Total Quantity: ${outletStock.totalQuantity}`);

//         // Check if enough available stock
//         if (outletStock.availableQuantity < fromOutletReceived) {
//           await session.abortTransaction();
//           session.endSession();
//           return res.status(400).json({
//             success: false,
//             message: `Insufficient available stock in outlet. Required: ${fromOutletReceived}, Available: ${outletStock.availableQuantity}`,
//           });
//         }

//         if (tracksSerialNumbers && productItem.approvedSerials && productItem.approvedSerials.length > 0) {
//           const outletSerials = sourceBreakdown.fromOutlet.serials || [];
//           const outletSerialsToTransfer = outletSerials.slice(0, fromOutletReceived);

//           console.log(`  🏷️ Processing SERIALIZED outlet stock`);
//           console.log(`  Outlet serials to transfer: ${outletSerialsToTransfer.join(', ')}`);

//           let transferredCount = 0;
//           for (const serialNumber of outletSerialsToTransfer) {
//             const serial = outletStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
            
//             console.log(`    Checking serial ${serialNumber}: Found = ${serial ? 'YES' : 'NO'}, Status = ${serial?.status || 'N/A'}`);
            
//             if (!serial || serial.status !== "available") {
//               await session.abortTransaction();
//               session.endSession();
//               return res.status(400).json({
//                 success: false,
//                 message: `Serial ${serialNumber} is not available in outlet stock for product "${productDoc?.productTitle}". Current status: ${serial?.status || 'not found'}`,
//               });
//             }

//             // Mark serial as transferred directly (no in_transit)
//             serial.status = "transferred";
//             serial.currentLocation = stockRequest.center;
            
//             serial.transferHistory.push({
//               fromCenter: stockRequest.warehouse,
//               toCenter: stockRequest.center,
//               transferDate: new Date(),
//               transferType: "outlet_to_center",
//               status: "completed",
//               completedAt: new Date(),
//               transferredBy: userId,
//               referenceId: stockRequest._id
//             });
            
//             transferredCount++;
//           }

//           outletStock.availableQuantity -= fromOutletReceived;
//           outletStock.totalQuantity -= fromOutletReceived;
          
//           console.log(`  ✅ Successfully transferred ${transferredCount} serials from OUTLET`);
//           console.log(`  AFTER OUTLET UPDATE (Serialized):`);
//           console.log(`    Available Quantity: ${outletStock.availableQuantity} (decreased by ${fromOutletReceived})`);
//           console.log(`    Total Quantity: ${outletStock.totalQuantity} (decreased by ${fromOutletReceived})`);
//         } else {
//           // Non-serialized: directly reduce available quantity
//           console.log(`  📦 Processing NON-SERIALIZED outlet stock`);
          
//           const beforeAvailable = outletStock.availableQuantity;
//           const beforeTotal = outletStock.totalQuantity;
          
//           outletStock.availableQuantity -= fromOutletReceived;
//           outletStock.totalQuantity -= fromOutletReceived;
          
//           console.log(`  BEFORE: Available=${beforeAvailable}, Total=${beforeTotal}`);
//           console.log(`  AFTER: Available=${outletStock.availableQuantity} (decreased by ${fromOutletReceived}), Total=${outletStock.totalQuantity} (decreased by ${fromOutletReceived})`);
//         }

//         await outletStock.save({ session });
//         console.log(`  💾 Outlet stock saved successfully`);
//       } else {
//         console.log(`  ⚠️ No stock to reduce from outlet (fromOutletReceived = 0)`);
//       }

//       // ✅ STEP 2: DIRECTLY REDUCE FROM RESELLER AVAILABLE STOCK
//       console.log(`\n🔻 STEP 2: REDUCING FROM RESELLER AVAILABLE STOCK (${fromResellerReceived} units)...`);
      
//       if (fromResellerReceived > 0) {
//         const resellerId = stockRequest.center?.reseller?._id || stockRequest.center?.reseller;
//         console.log(`  Reseller ID: ${resellerId}`);
        
//         if (resellerId) {
//           const resellerStock = await ResellerStock.findOne({
//             reseller: resellerId,
//             product: receipt.productId,
//           }).session(session);

//           console.log(`  Reseller Stock Document Found: ${resellerStock ? 'YES' : 'NO'}`);

//           if (resellerStock) {
//             console.log(`  BEFORE RESELLER UPDATE:`);
//             console.log(`    Available Quantity: ${resellerStock.availableQuantity}`);
//             console.log(`    Consumed Quantity: ${resellerStock.consumedQuantity}`);
            
//             // Check if enough available stock
//             if (resellerStock.availableQuantity < fromResellerReceived) {
//               await session.abortTransaction();
//               session.endSession();
//               return res.status(400).json({
//                 success: false,
//                 message: `Insufficient available stock in reseller. Required: ${fromResellerReceived}, Available: ${resellerStock.availableQuantity}`,
//               });
//             }
            
//             if (tracksSerialNumbers && sourceBreakdown.fromReseller.serials && sourceBreakdown.fromReseller.serials.length > 0) {
//               const resellerSerialsToConsume = sourceBreakdown.fromReseller.serials.slice(0, fromResellerReceived);
//               console.log(`  🏷️ Reseller serials to consume: ${resellerSerialsToConsume.join(', ')}`);
              
//               let consumedCount = 0;
//               for (const serialNumber of resellerSerialsToConsume) {
//                 const serial = resellerStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
                
//                 if (serial && serial.status === "available") {
//                   serial.status = "consumed";
//                   serial.consumedDate = new Date();
//                   serial.consumedBy = userId;
//                   serial.currentLocation = stockRequest.center;
                  
//                   serial.transferHistory.push({
//                     fromCenter: stockRequest.warehouse,
//                     toCenter: stockRequest.center,
//                     transferDate: new Date(),
//                     transferType: "outbound_transfer",
//                     remark: "Stock request completion",
//                     transferredBy: userId,
//                     referenceId: stockRequest._id
//                   });
                  
//                   consumedCount++;
//                   console.log(`    ✅ Consumed serial ${serialNumber}`);
//                 } else {
//                   console.log(`    ⚠️ Serial ${serialNumber} not found or not available`);
//                 }
//               }
              
//               resellerStock.availableQuantity -= fromResellerReceived;
//               resellerStock.consumedQuantity += fromResellerReceived;
//               console.log(`  ✅ Consumed ${consumedCount} serials from RESELLER`);
//             } else {
//               console.log(`  📦 Processing NON-SERIALIZED reseller stock`);
//               resellerStock.availableQuantity -= fromResellerReceived;
//               resellerStock.consumedQuantity += fromResellerReceived;
//               console.log(`  ✅ Reduced available by ${fromResellerReceived}, increased consumed by ${fromResellerReceived}`);
//             }
            
//             console.log(`  AFTER RESELLER UPDATE:`);
//             console.log(`    Available Quantity: ${resellerStock.availableQuantity}`);
//             console.log(`    Consumed Quantity: ${resellerStock.consumedQuantity}`);
            
//             await resellerStock.save({ session });
//             console.log(`  💾 Reseller stock saved successfully`);
//           } else {
//             console.log(`  ⚠️ No reseller stock document found - skipping reduction`);
//           }
//         } else {
//           console.log(`  ⚠️ No reseller ID found - skipping reseller stock reduction`);
//         }
//       } else {
//         console.log(`  ⚠️ No stock to reduce from reseller (fromResellerReceived = 0)`);
//       }

//       // ✅ STEP 3: ADD STOCK TO CENTER
//       console.log(`\n🔺 STEP 3: ADDING STOCK TO CENTER (${receivedCount} units)...`);
      
//       if (receivedCount > 0) {
//         let centerStock = await CenterStock.findOne({
//           center: stockRequest.center,
//           product: receipt.productId,
//         }).session(session);

//         console.log(`  Center ID: ${stockRequest.center}`);
//         console.log(`  Center Stock Document Found: ${centerStock ? 'YES' : 'NO'}`);

//         if (!centerStock) {
//           console.log(`  📝 Creating new center stock document...`);
//           centerStock = new CenterStock({
//             center: stockRequest.center,
//             product: receipt.productId,
//             totalQuantity: 0,
//             availableQuantity: 0,
//             consumedQuantity: 0,
//             serialNumbers: []
//           });
//         }

//         console.log(`  BEFORE CENTER UPDATE:`);
//         console.log(`    Total Quantity: ${centerStock.totalQuantity}`);
//         console.log(`    Available Quantity: ${centerStock.availableQuantity}`);

//         if (tracksSerialNumbers && serialsToTransfer.length > 0) {
//           console.log(`  🏷️ Adding SERIALIZED stock to center`);
//           console.log(`  Serials to add: ${serialsToTransfer.join(', ')}`);
          
//           let addedCount = 0;
//           let reactivatedCount = 0;
          
//           for (const serialNumber of serialsToTransfer) {
//             const existingSerial = centerStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
            
//             if (existingSerial) {
//               console.log(`    Serial ${serialNumber} already exists in center - Status: ${existingSerial.status}`);
              
//               if (existingSerial.status === "damaged" || existingSerial.status === "damage_pending") {
//                 existingSerial.status = "available";
//                 existingSerial.currentLocation = stockRequest.center;
//                 centerStock.availableQuantity += 1;
//                 reactivatedCount++;
//                 console.log(`    ✅ Reactivated damaged serial ${serialNumber}`);
//               }
//             } else {
//               // Get purchaseId from outlet stock if available
//               let purchaseId = null;
//               const outletStock = await OutletStock.findOne({
//                 outlet: stockRequest.warehouse,
//                 product: receipt.productId,
//                 "serialNumbers.serialNumber": serialNumber
//               }).session(session);
              
//               if (outletStock) {
//                 const outletSerial = outletStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
//                 if (outletSerial && outletSerial.purchaseId) {
//                   purchaseId = outletSerial.purchaseId;
//                 }
//               }
              
//               centerStock.serialNumbers.push({
//                 serialNumber: serialNumber,
//                 purchaseId: purchaseId,
//                 originalOutlet: stockRequest.warehouse,
//                 status: "available",
//                 currentLocation: stockRequest.center,
//                 transferHistory: [{
//                   fromCenter: stockRequest.warehouse,
//                   toCenter: stockRequest.center,
//                   transferDate: new Date(),
//                   transferType: "inbound_transfer",
//                   remark: "Stock request completion",
//                   referenceId: stockRequest._id,
//                   transferredBy: userId
//                 }]
//               });
              
//               centerStock.totalQuantity += 1;
//               centerStock.availableQuantity += 1;
//               addedCount++;
//               console.log(`    ✅ Added new serial ${serialNumber}`);
//             }
//           }
          
//           console.log(`  📊 Center stock summary:`);
//           console.log(`    New serials added: ${addedCount}`);
//           console.log(`    Damaged serials reactivated: ${reactivatedCount}`);
//           console.log(`    Total Quantity: ${centerStock.totalQuantity}`);
//           console.log(`    Available Quantity: ${centerStock.availableQuantity}`);
//         } else {
//           console.log(`  📦 Adding NON-SERIALIZED stock to center`);
//           const beforeTotal = centerStock.totalQuantity;
//           const beforeAvailable = centerStock.availableQuantity;
          
//           centerStock.totalQuantity += receivedCount;
//           centerStock.availableQuantity += receivedCount;
          
//           console.log(`    BEFORE: Total=${beforeTotal}, Available=${beforeAvailable}`);
//           console.log(`    AFTER: Total=${centerStock.totalQuantity} (+${receivedCount}), Available=${centerStock.availableQuantity} (+${receivedCount})`);
//         }
        
//         await centerStock.save({ session });
//         console.log(`  💾 Center stock saved successfully`);
//         console.log(`  ✅ Successfully added ${receivedCount} units to CENTER stock`);
//       } else {
//         console.log(`  ⚠️ No stock to add to center (receivedCount = 0)`);
//       }

//       // Update product item in stock request
//       productItem.receivedQuantity = receipt.receivedQuantity;
//       productItem.receivedRemark = receipt.receivedRemark || "";
      
//       if (tracksSerialNumbers && serialsToTransfer.length > 0) {
//         productItem.transferredSerials = serialsToTransfer;
//       }
      
//       console.log(`\n✅ Product ${productDoc?.productTitle || receipt.productId} processed successfully`);
//       console.log(`   Stock OUT: Outlet (-${fromOutletReceived} from available), Reseller (-${fromResellerReceived} from available)`);
//       console.log(`   Stock IN: Center (+${receivedCount} to available)`);
//     }

//     // Update stock request status
//     console.log(`\n📝 Updating stock request status to "Completed"...`);
//     stockRequest.status = "Completed";
//     stockRequest.receivingInfo = {
//       receivedAt: new Date(),
//       receivedBy: userId,
//       receivedRemark: receivedRemark || "",
//     };
//     stockRequest.completionInfo = {
//       completedOn: new Date(),
//       completedBy: userId,
//     };
//     stockRequest.updatedBy = userId;

//     await stockRequest.save({ session });
//     console.log(`✅ Stock request status updated to Completed`);

//     // Commit all changes
//     console.log(`\n💾 COMMITTING TRANSACTION...`);
//     await session.commitTransaction();
//     session.endSession();
//     console.log(`✅ TRANSACTION COMMITTED SUCCESSFULLY`);
//     console.log("========== COMPLETE STOCK REQUEST FINISHED ==========\n");

//     const populatedRequest = await StockRequest.findById(stockRequest._id)
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode centerType")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("receivingInfo.receivedBy", "_id fullName email")
//       .populate("completionInfo.completedBy", "_id fullName email")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Stock request completed successfully - Stock reduced from Outlet/Reseller available stock and added to Center",
//       data: populatedRequest,
//     });

//   } catch (error) {
//     console.error(`\n❌ ERROR OCCURRED: ${error.message}`);
//     console.error(`Stack trace: ${error.stack}`);
    
//     await session.abortTransaction();
//     session.endSession();
//     console.log(`🔄 TRANSACTION ROLLED BACK - No changes were saved`);
//     console.log("========== COMPLETE STOCK REQUEST FAILED ==========\n");
    
//     console.error("Error completing stock request:", error);

//     if (
//       error.message.includes("Insufficient stock") ||
//       error.message.includes("serial numbers not available") ||
//       error.message.includes("No serial numbers assigned") ||
//       error.message.includes("Received quantity") ||
//       error.message.includes("exceed approved quantity") ||
//       error.message.includes("available")
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: error.message,
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Error completing stock request. All changes have been rolled back.",
//       error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
//     });
//   }
// };
// export const updateStockRequestStatus = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["manage_indent"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_indent permission required.",
//       });
//     }

//     const { id } = req.params;
//     const { status, ...additionalInfo } = req.body;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. You can only update status for stock requests from your own center.",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     const updateData = {
//       status,
//       updatedBy: userId,
//     };

//     const currentDate = new Date();

//     switch (status) {
//       case "Confirmed":
//         if (additionalInfo.productApprovals) {
//           const validationResults = await stockRequest.validateSerialNumbers(
//             additionalInfo.productApprovals
//           );
//           const invalidResults = validationResults.filter(
//             (result) => !result.valid
//           );

//           if (invalidResults.length > 0) {
//             return res.status(400).json({
//               success: false,
//               message: "Serial number validation failed",
//               validationErrors: invalidResults,
//             });
//           }
//         }

//         updateData.approvalInfo = {
//           ...stockRequest.approvalInfo,
//           approvedAt: currentDate,
//           approvedBy: userId,
//           approvedRemark: additionalInfo.approvedRemark || "",
//           ...additionalInfo,
//         };

//         if (additionalInfo.productApprovals) {
//           updateData.products = stockRequest.products.map((productItem) => {
//             const approval = additionalInfo.productApprovals.find(
//               (pa) => pa.productId.toString() === productItem.product.toString()
//             );
//             if (approval) {
//               return {
//                 ...productItem.toObject(),
//                 approvedQuantity: approval.approvedQuantity,
//                 approvedRemark: approval.approvedRemark || "",
//                 approvedSerials: approval.approvedSerials || [],
//               };
//             }
//             return productItem;
//           });
//         }
//         break;

//       case "Completed":
//         if (additionalInfo.productReceipts) {
//           for (const receipt of additionalInfo.productReceipts) {
//             const productItem = stockRequest.products.find(
//               (p) => p.product.toString() === receipt.productId.toString()
//             );

//             if (
//               productItem &&
//               receipt.receivedQuantity > productItem.approvedQuantity
//             ) {
//               return res.status(400).json({
//                 success: false,
//                 message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${productItem.approvedQuantity})`,
//               });
//             }
//           }
//         }

//         updateData.receivingInfo = {
//           ...stockRequest.receivingInfo,
//           receivedAt: currentDate,
//           receivedBy: userId,
//           receivedRemark: additionalInfo.receivedRemark || "",
//           ...additionalInfo,
//         };

//         updateData.completionInfo = {
//           ...stockRequest.completionInfo,
//           completedOn: currentDate,
//           completedBy: userId,
//           ...additionalInfo,
//         };

//         if (additionalInfo.productReceipts) {
//           updateData.products = stockRequest.products.map((productItem) => {
//             const receipt = additionalInfo.productReceipts.find(
//               (pr) => pr.productId.toString() === productItem.product.toString()
//             );
//             if (receipt) {
//               return {
//                 ...productItem.toObject(),
//                 receivedQuantity: receipt.receivedQuantity,
//                 receivedRemark: receipt.receivedRemark || "",
//               };
//             }
//             return productItem;
//           });
//         }
//         break;
//     }

//     const updatedRequest = await StockRequest.findByIdAndUpdate(
//       id,
//       updateData,
//       { new: true, runValidators: true }
//     )
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("approvalInfo.approvedBy", "_id fullName email")
//       .populate("shippingInfo.shippedBy", "_id fullName email")
//       .populate("receivingInfo.receivedBy", "_id fullName email")
//       .populate("incompleteInfo.incompleteBy", "_id fullName email")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: `Stock request status updated to ${status}`,
//       data: updatedRequest,
//     });
//   } catch (error) {
//     console.error("Error updating stock request status:", error);

//     if (
//       error.message.includes("serial numbers") ||
//       error.message.includes("Insufficient stock") ||
//       error.message.includes("Received quantity cannot exceed")
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Validation failed",
//         error: error.message,
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Error updating stock request status",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };
// // export const updateApprovedQuantities = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["manage_indent"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_indent permission required.",
//       });
//     }

//     const { id } = req.params;
//     const { productApprovals } = req.body;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. You can only update approved quantities for stock requests from your own center.",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     const OutletStock = mongoose.model("OutletStock");
//     const Product = mongoose.model("Product");

//     // Validate product approvals
//     for (const approval of productApprovals) {
//       if (!approval.productId) {
//         return res.status(400).json({
//           success: false,
//           message: "Product ID is required for each product approval",
//         });
//       }

//       const productDoc = await Product.findById(approval.productId);
      
//       // Skip validation if approved quantity is 0 (product is not being approved)
//       if (approval.approvedQuantity === 0) {
//         continue;
//       }

//       const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

//       if (tracksSerialNumbers && approval.approvedSerials && approval.approvedSerials.length > 0) {
//         const productItem = stockRequest.products.find(
//           (p) => p.product.toString() === approval.productId.toString()
//         );

//         const outletStock = await OutletStock.findOne({
//           outlet: stockRequest.warehouse,
//           product: approval.productId,
//         });

//         if (!outletStock) {
//           return res.status(400).json({
//             success: false,
//             message: `No stock found in outlet for product ${productDoc?.productTitle || approval.productId}`,
//           });
//         }

//         const availableSerials = [];
//         const unavailableSerials = [];

//         for (const serialNumber of approval.approvedSerials) {
//           const serial = outletStock.serialNumbers.find(
//             (sn) => sn.serialNumber === serialNumber
//           );

//           if (serial) {
//             if (serial.status === "available") {
//               availableSerials.push(serialNumber);
//             } else if (serial.status === "in_transit") {
//               const isAssignedToThisTransfer =
//                 productItem?.approvedSerials?.includes(serialNumber);
//               if (isAssignedToThisTransfer) {
//                 availableSerials.push(serialNumber);
//               } else {
//                 unavailableSerials.push(serialNumber);
//               }
//             } else {
//               unavailableSerials.push(serialNumber);
//             }
//           } else {
//             unavailableSerials.push(serialNumber);
//           }
//         }

//         if (unavailableSerials.length > 0) {
//           return res.status(400).json({
//             success: false,
//             message: `Serial numbers not available: ${unavailableSerials.join(", ")}`,
//             productId: approval.productId,
//             productName: productDoc?.productTitle || "Unknown Product",
//           });
//         }
//       }
//     }

//     // Process each product approval
//     for (const approval of productApprovals) {
//       const productItem = stockRequest.products.find(
//         (p) => p.product.toString() === approval.productId.toString()
//       );

//       if (!productItem) {
//         return res.status(400).json({
//           success: false,
//           message: `Product ${approval.productId} not found in stock request`,
//         });
//       }

//       const currentApprovedQuantity = productItem.approvedQuantity || 0;
//       const newApprovedQuantity = approval.approvedQuantity;

//       // SKIP processing if approved quantity is 0
//       // This means the product is not being approved
//       if (newApprovedQuantity === 0) {
//         console.log(`[DEBUG] Skipping product ${approval.productId} - approved quantity is 0`);
//         // If there was previously approved quantity, we need to restore it
//         if (currentApprovedQuantity > 0) {
//           console.log(`[DEBUG] Restoring ${currentApprovedQuantity} units for product ${approval.productId}`);
          
//           const outletStock = await OutletStock.findOne({
//             outlet: stockRequest.warehouse,
//             product: approval.productId,
//           });

//           if (outletStock) {
//             const productDoc = await Product.findById(approval.productId);
//             const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

//             if (tracksSerialNumbers) {
//               // Restore serial numbers for serialized product
//               const currentApprovedSerials = productItem.approvedSerials || [];
//               console.log(`[DEBUG] Restoring ${currentApprovedSerials.length} serials for product ${approval.productId}`);
              
//               let restoredCount = 0;
//               for (const serialNumber of currentApprovedSerials) {
//                 const serial = outletStock.serialNumbers.find(
//                   (sn) => sn.serialNumber === serialNumber
//                 );

//                 if (serial && serial.status === "in_transit") {
//                   serial.status = "available";
//                   serial.currentLocation = stockRequest.warehouse;
//                   restoredCount++;

//                   // Remove the transfer history for this center
//                   serial.transferHistory = serial.transferHistory.filter(
//                     (history) =>
//                       !(
//                         history.toCenter?.toString() ===
//                         stockRequest.center.toString() &&
//                         history.transferType === "outlet_to_center"
//                       )
//                   );

//                   console.log(`[DEBUG] Restored serial ${serialNumber} to available`);
//                 }
//               }

//               if (restoredCount > 0) {
//                 outletStock.availableQuantity += restoredCount;
//                 outletStock.inTransitQuantity -= restoredCount;
//                 await outletStock.save();
//                 console.log(`[DEBUG] Updated outlet: Available +${restoredCount}, InTransit -${restoredCount}`);
//               }
//             } else {
//               // Restore non-serialized product quantity
//               outletStock.availableQuantity += currentApprovedQuantity;
//               outletStock.inTransitQuantity -= currentApprovedQuantity;
//               await outletStock.save();
//               console.log(`[DEBUG] Restored ${currentApprovedQuantity} units to available stock`);
//             }
//           }
//         }
//         continue; // Skip to next product
//       }

//       const outletStock = await OutletStock.findOne({
//         outlet: stockRequest.warehouse,
//         product: approval.productId,
//       });

//       if (!outletStock) {
//         return res.status(400).json({
//           success: false,
//           message: `No stock found in outlet for product ${approval.productId}`,
//         });
//       }

//       console.log(`[DEBUG] Processing product: ${approval.productId}`);
//       console.log(`[DEBUG] Current approved: ${currentApprovedQuantity}, New approved: ${newApprovedQuantity}`);
//       console.log(`[DEBUG] Outlet stock before - Total: ${outletStock.totalQuantity}, Available: ${outletStock.availableQuantity}, InTransit: ${outletStock.inTransitQuantity}`);

//       const productDoc = await Product.findById(approval.productId);
//       const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

//       if (tracksSerialNumbers) {
//         // Handle serialized products
//         const currentApprovedSerials = productItem.approvedSerials || [];
//         const newApprovedSerials = approval.approvedSerials || [];

//         if (newApprovedQuantity < currentApprovedQuantity) {
//           console.log(`[DEBUG] Quantity reduced from ${currentApprovedQuantity} to ${newApprovedQuantity}`);
          
//           const quantityToRestore = currentApprovedQuantity - newApprovedQuantity;
//           let serialsToRestore = [];

//           if (JSON.stringify(currentApprovedSerials) !== JSON.stringify(newApprovedSerials)) {
//             serialsToRestore = currentApprovedSerials.filter(
//               (serial) => !newApprovedSerials.includes(serial)
//             );
//             console.log(`[DEBUG] Restoring ${serialsToRestore.length} specific serials`);
//           } else {
//             serialsToRestore = currentApprovedSerials.slice(newApprovedQuantity);
//             console.log(`[DEBUG] Restoring last ${serialsToRestore.length} serials`);
//           }

//           let restoredCount = 0;
//           for (const serialNumber of serialsToRestore) {
//             const serial = outletStock.serialNumbers.find(
//               (sn) => sn.serialNumber === serialNumber
//             );

//             if (serial && serial.status === "in_transit") {
//               serial.status = "available";
//               serial.currentLocation = stockRequest.warehouse;
//               restoredCount++;

//               // Remove the transfer history for this center
//               serial.transferHistory = serial.transferHistory.filter(
//                 (history) =>
//                   !(
//                     history.toCenter?.toString() ===
//                     stockRequest.center.toString() &&
//                     history.transferType === "outlet_to_center"
//                   )
//               );

//               console.log(`[DEBUG] Restored serial ${serialNumber} to available`);
//             }
//           }

//           if (restoredCount > 0) {
//             outletStock.availableQuantity += restoredCount;
//             outletStock.inTransitQuantity -= restoredCount;
//             await outletStock.save();
//             console.log(`[DEBUG] Updated outlet: Available +${restoredCount}, InTransit -${restoredCount}`);
//           }
//         } else if (newApprovedQuantity > currentApprovedQuantity) {
//           console.log(`[DEBUG] Quantity increased from ${currentApprovedQuantity} to ${newApprovedQuantity}`);
          
//           const quantityToAdd = newApprovedQuantity - currentApprovedQuantity;
          
//           if (newApprovedSerials.length < newApprovedQuantity) {
//             return res.status(400).json({
//               success: false,
//               message: `Need ${quantityToAdd} additional serial numbers for quantity increase`,
//               productId: approval.productId,
//               productName: productDoc?.productTitle || "Unknown Product",
//             });
//           }

//           const additionalSerials = newApprovedSerials.slice(currentApprovedQuantity);
          
//           if (additionalSerials.length !== quantityToAdd) {
//             return res.status(400).json({
//               success: false,
//               message: `Need ${quantityToAdd} additional serial numbers but got ${additionalSerials.length}`,
//               productId: approval.productId,
//             });
//           }

//           let newlyMarkedInTransit = 0;
//           for (const serialNumber of additionalSerials) {
//             const serial = outletStock.serialNumbers.find(
//               (sn) => sn.serialNumber === serialNumber
//             );

//             if (serial) {
//               if (serial.status === "available") {
//                 serial.status = "in_transit";
//                 serial.transferHistory.push({
//                   fromCenter: stockRequest.warehouse,
//                   toCenter: stockRequest.center,
//                   transferDate: new Date(),
//                   transferType: "outlet_to_center",
//                   remark: "Added during quantity increase",
//                 });
//                 newlyMarkedInTransit++;
//                 console.log(`[DEBUG] Marked serial ${serialNumber} as in_transit`);
//               } else if (serial.status === "in_transit") {
//                 const existingTransfer = serial.transferHistory.find(
//                   (history) =>
//                     history.toCenter?.toString() ===
//                     stockRequest.center.toString()
//                 );

//                 if (!existingTransfer) {
//                   serial.transferHistory.push({
//                     fromCenter: stockRequest.warehouse,
//                     toCenter: stockRequest.center,
//                     transferDate: new Date(),
//                     transferType: "outlet_to_center",
//                     remark: "Added during quantity increase",
//                   });
//                 }
//                 newlyMarkedInTransit++;
//                 console.log(`[DEBUG] Serial ${serialNumber} already in_transit`);
//               }
//             } else {
//               return res.status(400).json({
//                 success: false,
//                 message: `Serial number ${serialNumber} not found in outlet stock`,
//                 productId: approval.productId,
//               });
//             }
//           }

//           if (newlyMarkedInTransit > 0) {
//             outletStock.availableQuantity -= newlyMarkedInTransit;
//             outletStock.inTransitQuantity += newlyMarkedInTransit;
//             await outletStock.save();
//             console.log(`[DEBUG] Updated outlet: Available -${newlyMarkedInTransit}, InTransit +${newlyMarkedInTransit}`);
//           }
//         } else if (JSON.stringify(currentApprovedSerials) !== JSON.stringify(newApprovedSerials)) {
//           // Same quantity, different serials
//           console.log(`[DEBUG] Same quantity (${currentApprovedQuantity}), different serials`);
          
//           const serialsToRemove = currentApprovedSerials.filter(
//             (serial) => !newApprovedSerials.includes(serial)
//           );
//           const serialsToAdd = newApprovedSerials.filter(
//             (serial) => !currentApprovedSerials.includes(serial)
//           );

//           console.log(`[DEBUG] Serials to remove: ${serialsToRemove.length}, to add: ${serialsToAdd.length}`);

//           // Restore removed serials
//           let restoredCount = 0;
//           for (const serialNumber of serialsToRemove) {
//             const serial = outletStock.serialNumbers.find(
//               (sn) => sn.serialNumber === serialNumber
//             );

//             if (serial && serial.status === "in_transit") {
//               serial.status = "available";
//               serial.currentLocation = stockRequest.warehouse;
//               restoredCount++;

//               serial.transferHistory = serial.transferHistory.filter(
//                 (history) =>
//                   !(
//                     history.toCenter?.toString() ===
//                     stockRequest.center.toString() &&
//                     history.transferType === "outlet_to_center"
//                   )
//               );
//               console.log(`[DEBUG] Restored serial ${serialNumber}`);
//             }
//           }

//           // Mark new serials as in_transit
//           let addedCount = 0;
//           for (const serialNumber of serialsToAdd) {
//             const serial = outletStock.serialNumbers.find(
//               (sn) => sn.serialNumber === serialNumber
//             );

//             if (serial) {
//               if (serial.status === "available") {
//                 serial.status = "in_transit";
//                 serial.transferHistory.push({
//                   fromCenter: stockRequest.warehouse,
//                   toCenter: stockRequest.center,
//                   transferDate: new Date(),
//                   transferType: "outlet_to_center",
//                   remark: "Swapped during serial change",
//                 });
//                 addedCount++;
//                 console.log(`[DEBUG] Marked serial ${serialNumber} as in_transit`);
//               } else if (serial.status === "in_transit") {
//                 const existingTransfer = serial.transferHistory.find(
//                   (history) =>
//                     history.toCenter?.toString() ===
//                     stockRequest.center.toString()
//                 );

//                 if (!existingTransfer) {
//                   serial.transferHistory.push({
//                     fromCenter: stockRequest.warehouse,
//                     toCenter: stockRequest.center,
//                     transferDate: new Date(),
//                     transferType: "outlet_to_center",
//                     remark: "Swapped during serial change",
//                   });
//                 }
//                 addedCount++;
//                 console.log(`[DEBUG] Serial ${serialNumber} already in_transit`);
//               }
//             } else {
//               return res.status(400).json({
//                 success: false,
//                 message: `Serial number ${serialNumber} not found in outlet stock`,
//                 productId: approval.productId,
//               });
//             }
//           }

//           // Update outlet quantities
//           if (restoredCount > 0) {
//             outletStock.availableQuantity += restoredCount;
//             outletStock.inTransitQuantity -= restoredCount;
//           }
//           if (addedCount > 0) {
//             outletStock.availableQuantity -= addedCount;
//             outletStock.inTransitQuantity += addedCount;
//           }

//           if (restoredCount > 0 || addedCount > 0) {
//             await outletStock.save();
//             console.log(`[DEBUG] Updated outlet after serial swap`);
//           }
//         }
//       } else {
//         // Handle non-serialized products
//         console.log(`[DEBUG] Processing non-serialized product`);
        
//         if (newApprovedQuantity < currentApprovedQuantity) {
//           console.log(`[DEBUG] Quantity reduced from ${currentApprovedQuantity} to ${newApprovedQuantity}`);
          
//           const quantityToRestore = currentApprovedQuantity - newApprovedQuantity;
          
//           // Restore unused quantity back to available
//           outletStock.availableQuantity += quantityToRestore;
//           outletStock.inTransitQuantity -= quantityToRestore;
          
//           await outletStock.save();
//           console.log(`[DEBUG] Restored ${quantityToRestore} units: Available +${quantityToRestore}, InTransit -${quantityToRestore}`);
          
//         } else if (newApprovedQuantity > currentApprovedQuantity) {
//           console.log(`[DEBUG] Quantity increased from ${currentApprovedQuantity} to ${newApprovedQuantity}`);
          
//           const quantityToAdd = newApprovedQuantity - currentApprovedQuantity;
          
//           // Check if enough stock is available
//           if (outletStock.availableQuantity < quantityToAdd) {
//             return res.status(400).json({
//               success: false,
//               message: `Insufficient stock in outlet. Required: ${quantityToAdd}, Available: ${outletStock.availableQuantity}`,
//               productId: approval.productId,
//               productName: productDoc?.productTitle || "Unknown Product",
//             });
//           }
          
//           // Mark additional quantity as in_transit
//           outletStock.availableQuantity -= quantityToAdd;
//           outletStock.inTransitQuantity += quantityToAdd;
          
//           await outletStock.save();
//           console.log(`[DEBUG] Added ${quantityToAdd} units: Available -${quantityToAdd}, InTransit +${quantityToAdd}`);
//         }
//       }

//       console.log(`[DEBUG] Outlet stock after - Total: ${outletStock.totalQuantity}, Available: ${outletStock.availableQuantity}, InTransit: ${outletStock.inTransitQuantity}`);
//     }

//     // Update stock request products with new approvals
//     const updatedProducts = stockRequest.products.map((productItem) => {
//       const approval = productApprovals.find(
//         (pa) => pa.productId.toString() === productItem.product.toString()
//       );

//       if (approval) {
//         const updatedItem = {
//           ...productItem.toObject(),
//           approvedQuantity: approval.approvedQuantity,
//         };

//         // Only include approvedSerials for serialized products
//         const productDoc = Product.findById(approval.productId);
//         if (productDoc?.trackSerialNumber === "Yes") {
//           updatedItem.approvedSerials = approval.approvedSerials || [];
//         }

//         return updatedItem;
//       }
//       return productItem;
//     });

//     const updateData = {
//       products: updatedProducts,
//       updatedBy: userId,
//     };

//     // Update status to Confirmed if it's Submitted
//     if (stockRequest.status === "Submitted") {
//       updateData.status = "Confirmed";
//       updateData.approvalInfo = {
//         ...stockRequest.approvalInfo,
//         approvedBy: userId,
//         approvedAt: new Date(),
//       };
//     }

//     const updatedRequest = await StockRequest.findByIdAndUpdate(
//       id,
//       updateData,
//       { new: true, runValidators: true }
//     )
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email")
//       .populate("approvalInfo.approvedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Approved quantities updated successfully",
//       data: updatedRequest,
//     });
//   } catch (error) {
//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock request ID",
//       });
//     }

//     if (error.name === "ValidationError") {
//       const errors = Object.values(error.errors).map((err) => err.message);
//       return res.status(400).json({
//         success: false,
//         message: "Validation error",
//         errors,
//       });
//     }

//     if (error.message.includes("serial numbers") || error.message.includes("Insufficient stock")) {
//       return res.status(400).json({
//         success: false,
//         message: "Validation failed",
//         error: error.message,
//       });
//     }

//     console.error("Error updating approved quantities:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error updating approved quantities",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };


// export const updateApprovedQuantities = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["manage_indent"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_indent permission required.",
//       });
//     }

//     const { id } = req.params;
//     const { productApprovals } = req.body;

//     const stockRequest = await StockRequest.findById(id)
//       .populate("center", "reseller")
//       .populate("warehouse", "_id");
    
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. You can only update approved quantities for stock requests from your own center.",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     const OutletStock = mongoose.model("OutletStock");
//     const ResellerStock = mongoose.model("ResellerStock");
//     const Product = mongoose.model("Product");

//     const resellerId = stockRequest.center?.reseller?._id;

//     for (const approval of productApprovals) {
//       const productItem = stockRequest.products.find(
//         (p) => p.product.toString() === approval.productId.toString()
//       );

//       if (!productItem) {
//         return res.status(400).json({
//           success: false,
//           message: `Product ${approval.productId} not found in stock request`,
//         });
//       }

//       const currentApprovedQuantity = productItem.approvedQuantity || 0;
//       const newApprovedQuantity = approval.approvedQuantity;
      
//       const productDoc = await Product.findById(approval.productId);
//       const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

//       console.log(`[DEBUG] Processing product ${approval.productId}:`);
//       console.log(`[DEBUG] Current approved: ${currentApprovedQuantity}, New approved: ${newApprovedQuantity}`);

//       let newSourceBreakdown = {
//         fromReseller: { quantity: 0, serials: [] },
//         fromOutlet: { quantity: 0, serials: [] },
//         totalApproved: newApprovedQuantity
//       };

//       if (newApprovedQuantity > 0) {
//         let resellerAvailable = 0;
//         let outletAvailable = 0;
//         let resellerStockDoc = null;
//         let outletStockDoc = null;

//         if (resellerId) {
//           resellerStockDoc = await ResellerStock.findOne({
//             reseller: resellerId,
//             product: approval.productId,
//           });
//           if (resellerStockDoc) {
//             resellerAvailable = resellerStockDoc.availableQuantity || 0;
//           }
//         }

//         outletStockDoc = await OutletStock.findOne({
//           outlet: stockRequest.warehouse,
//           product: approval.productId,
//         });
//         if (outletStockDoc) {
//           outletAvailable = outletStockDoc.availableQuantity || 0;
//         }

//         if (tracksSerialNumbers && approval.approvedSerials && approval.approvedSerials.length > 0) {
      
//           const serials = approval.approvedSerials;
        
//           if (resellerStockDoc) {
//             for (const serialNumber of serials) {
//               const serial = resellerStockDoc.serialNumbers.find(
//                 sn => sn.serialNumber === serialNumber && sn.status === "available"
//               );
//               if (serial) {
//                 newSourceBreakdown.fromReseller.serials.push(serialNumber);
//               }
//             }
//           }
//           newSourceBreakdown.fromOutlet.serials = serials.filter(
//             sn => !newSourceBreakdown.fromReseller.serials.includes(sn)
//           );
          
//           newSourceBreakdown.fromReseller.quantity = newSourceBreakdown.fromReseller.serials.length;
//           newSourceBreakdown.fromOutlet.quantity = newSourceBreakdown.fromOutlet.serials.length;
//         } else {

//           newSourceBreakdown.fromReseller.quantity = Math.min(newApprovedQuantity, resellerAvailable);
//           newSourceBreakdown.fromOutlet.quantity = newApprovedQuantity - newSourceBreakdown.fromReseller.quantity;
//         }
//         if (newSourceBreakdown.fromReseller.quantity + newSourceBreakdown.fromOutlet.quantity !== newApprovedQuantity) {
//           return res.status(400).json({
//             success: false,
//             message: `Source breakdown calculation error for product ${productDoc?.productTitle}. Expected ${newApprovedQuantity}, got Reseller: ${newSourceBreakdown.fromReseller.quantity}, Outlet: ${newSourceBreakdown.fromOutlet.quantity}`,
//           });
//         }

//         const currentSourceBreakdown = productItem.sourceBreakdown || {
//           fromReseller: { quantity: 0, serials: [] },
//           fromOutlet: { quantity: 0, serials: [] }
//         };

//         if (outletStockDoc) {
//           const currentOutletQty = currentSourceBreakdown.fromOutlet.quantity;
//           const newOutletQty = newSourceBreakdown.fromOutlet.quantity;
//           const outletQtyDiff = newOutletQty - currentOutletQty;

//           if (outletQtyDiff > 0) {

//             if (tracksSerialNumbers) {
//               const newOutletSerials = newSourceBreakdown.fromOutlet.serials.filter(
//                 serial => !currentSourceBreakdown.fromOutlet.serials.includes(serial)
//               );
              
//               for (const serialNumber of newOutletSerials) {
//                 const serial = outletStockDoc.serialNumbers.find(
//                   sn => sn.serialNumber === serialNumber
//                 );

//                 if (serial && serial.status === "available") {
//                   serial.status = "in_transit";
//                   serial.currentLocation = stockRequest.warehouse;
//                   serial.transferHistory.push({
//                     fromCenter: stockRequest.warehouse,
//                     toCenter: stockRequest.center,
//                     transferDate: new Date(),
//                     transferType: "outlet_to_center",
//                     status: "in_transit",
//                   });
//                 }
//               }
//             }
            
//             outletStockDoc.availableQuantity -= outletQtyDiff;
//             outletStockDoc.inTransitQuantity += outletQtyDiff;
//           } else if (outletQtyDiff < 0) {

//             const outletQtyToRevert = Math.abs(outletQtyDiff);
            
//             if (tracksSerialNumbers) {
//               const serialsToRevert = currentSourceBreakdown.fromOutlet.serials.filter(
//                 serial => !newSourceBreakdown.fromOutlet.serials.includes(serial)
//               );
              
//               for (const serialNumber of serialsToRevert) {
//                 const serial = outletStockDoc.serialNumbers.find(
//                   sn => sn.serialNumber === serialNumber
//                 );

//                 if (serial && serial.status === "in_transit") {
//                   serial.status = "available";
//                   serial.currentLocation = stockRequest.warehouse;

//                   if (serial.transferHistory.length > 0) {
//                     const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
//                     if (lastTransfer.status === "in_transit") {
//                       serial.transferHistory.pop();
//                     }
//                   }
//                 }
//               }
//             }
            
//             outletStockDoc.availableQuantity += outletQtyToRevert;
//             outletStockDoc.inTransitQuantity -= outletQtyToRevert;
//           }

//           await outletStockDoc.save();
//         }

//         if (resellerStockDoc) {
//           const currentResellerQty = currentSourceBreakdown.fromReseller.quantity;
//           const newResellerQty = newSourceBreakdown.fromReseller.quantity;
//           const resellerQtyDiff = newResellerQty - currentResellerQty;

//           if (resellerQtyDiff > 0) {

//             if (tracksSerialNumbers) {
//               const newResellerSerials = newSourceBreakdown.fromReseller.serials.filter(
//                 serial => !currentSourceBreakdown.fromReseller.serials.includes(serial)
//               );
              
//               for (const serialNumber of newResellerSerials) {
//                 const serial = resellerStockDoc.serialNumbers.find(
//                   sn => sn.serialNumber === serialNumber
//                 );

//                 if (serial && serial.status === "available") {
//                   serial.status = "consumed";
//                   serial.consumedDate = new Date();
//                   serial.consumedBy = userId;
//                   serial.currentLocation = stockRequest.center;
//                 }
//               }
//             }
            
//             resellerStockDoc.availableQuantity -= resellerQtyDiff;
//             resellerStockDoc.consumedQuantity += resellerQtyDiff;
//           } else if (resellerQtyDiff < 0) {
//             const resellerQtyToRevert = Math.abs(resellerQtyDiff);
            
//             if (tracksSerialNumbers) {
//               const serialsToRevert = currentSourceBreakdown.fromReseller.serials.filter(
//                 serial => !newSourceBreakdown.fromReseller.serials.includes(serial)
//               );
              
//               for (const serialNumber of serialsToRevert) {
//                 const serial = resellerStockDoc.serialNumbers.find(
//                   sn => sn.serialNumber === serialNumber
//                 );

//                 if (serial && serial.status === "consumed") {
//                   serial.status = "available";
//                   serial.consumedDate = null;
//                   serial.consumedBy = null;
//                   serial.currentLocation = null;
//                 }
//               }
//             }
            
//             resellerStockDoc.availableQuantity += resellerQtyToRevert;
//             resellerStockDoc.consumedQuantity -= resellerQtyToRevert;
//           }

//           await resellerStockDoc.save();
//         }
//       } else {
//         const currentSourceBreakdown = productItem.sourceBreakdown || {
//           fromReseller: { quantity: 0, serials: [] },
//           fromOutlet: { quantity: 0, serials: [] }
//         };
//         if (currentSourceBreakdown.fromOutlet.quantity > 0) {
//           const outletStockDoc = await OutletStock.findOne({
//             outlet: stockRequest.warehouse,
//             product: approval.productId,
//           });

//           if (outletStockDoc) {
//             if (tracksSerialNumbers) {
//               for (const serialNumber of currentSourceBreakdown.fromOutlet.serials) {
//                 const serial = outletStockDoc.serialNumbers.find(
//                   sn => sn.serialNumber === serialNumber
//                 );

//                 if (serial && serial.status === "in_transit") {
//                   serial.status = "available";
//                   serial.currentLocation = stockRequest.warehouse;
                  
//                   if (serial.transferHistory.length > 0) {
//                     const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
//                     if (lastTransfer.status === "in_transit") {
//                       serial.transferHistory.pop();
//                     }
//                   }
//                 }
//               }
//             }
            
//             outletStockDoc.availableQuantity += currentSourceBreakdown.fromOutlet.quantity;
//             outletStockDoc.inTransitQuantity -= currentSourceBreakdown.fromOutlet.quantity;
//             await outletStockDoc.save();
//           }
//         }
//         if (currentSourceBreakdown.fromReseller.quantity > 0 && resellerStockDoc) {
//           const resellerStockDoc = await ResellerStock.findOne({
//             reseller: resellerId,
//             product: approval.productId,
//           });

//           if (resellerStockDoc) {
//             if (tracksSerialNumbers) {
//               for (const serialNumber of currentSourceBreakdown.fromReseller.serials) {
//                 const serial = resellerStockDoc.serialNumbers.find(
//                   sn => sn.serialNumber === serialNumber
//                 );

//                 if (serial && serial.status === "consumed") {
//                   serial.status = "available";
//                   serial.consumedDate = null;
//                   serial.consumedBy = null;
//                   serial.currentLocation = null;
//                 }
//               }
//             }
            
//             resellerStockDoc.availableQuantity += currentSourceBreakdown.fromReseller.quantity;
//             resellerStockDoc.consumedQuantity -= currentSourceBreakdown.fromReseller.quantity;
//             await resellerStockDoc.save();
//           }
//         }
//       }

//       productItem.sourceBreakdown = newSourceBreakdown;
//       productItem.approvedQuantity = newApprovedQuantity;
//       productItem.approvedRemark = approval.approvedRemark || "";
//       if (tracksSerialNumbers) {
//         productItem.approvedSerials = approval.approvedSerials || [];
//       }
//     }

//     if (stockRequest.status === "Submitted") {
//       stockRequest.status = "Confirmed";
//       stockRequest.approvalInfo = {
//         ...stockRequest.approvalInfo,
//         approvedBy: userId,
//         approvedAt: new Date(),
//       };
//     }

//     stockRequest.updatedBy = userId;
//     await stockRequest.save();

//     const populatedRequest = await StockRequest.findById(stockRequest._id)
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email")
//       .populate("approvalInfo.approvedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Approved quantities updated successfully",
//       data: populatedRequest,
//     });
//   } catch (error) {
//     console.error("Error updating approved quantities:", error);

//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock request ID",
//       });
//     }

//     if (error.name === "ValidationError") {
//       const errors = Object.values(error.errors).map((err) => err.message);
//       return res.status(400).json({
//         success: false,
//         message: "Validation error",
//         errors,
//       });
//     }

//     if (error.message.includes("serial numbers") || error.message.includes("Insufficient stock")) {
//       return res.status(400).json({
//         success: false,
//         message: "Validation failed",
//         error: error.message,
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Error updating approved quantities",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

// export const getMostRecentOrderNumber = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["indent_all_center", "indent_own_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. indent_own_center or indent_all_center permission required.",
//       });
//     }

//     if (
//       permissions.indent_own_center &&
//       !permissions.indent_all_center &&
//       userCenter
//     ) {
//       const userCenterId = userCenter._id || userCenter;
//     }
//     const mostRecentRequest = await StockRequest.findOne()
//       .sort({ createdAt: -1 })
//       .select("orderNumber createdAt")
//       .lean();

//     if (!mostRecentRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "No stock requests found",
//         data: null,
//       });
//     }

//     res.status(200).json({
//       success: true,
//       message: "Most recent order number retrieved successfully",
//       data: {
//         orderNumber: mostRecentRequest.orderNumber,
//         createdAt: mostRecentRequest.createdAt,
//       },
//     });
//   } catch (error) {
//     console.error("Error retrieving most recent order number:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error retrieving most recent order number",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

// export const getCenterSerialNumbers = async (req, res) => {
//   try {
//     console.log("========== getCenterSerialNumbers START ==========");
//     console.log("Request params:", req.params);
//     console.log("Request user ID:", req.user?.id);

//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["indent_all_center", "indent_own_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. indent_own_center or indent_all_center permission required.",
//       });
//     }

//     const { productId } = req.params;
//     console.log("Product ID:", productId);

//     // Validate productId
//     if (!productId || productId === 'undefined') {
//       return res.status(400).json({
//         success: false,
//         message: "Valid product ID is required",
//       });
//     }

//     const user = await User.findById(req.user.id).populate("center");
//     if (!user || !user.center) {
//       return res.status(400).json({
//         success: false,
//         message: "User center information not found",
//       });
//     }

//     const entityId = user.center._id;
//     const entityType = user.center.centerType; // 'Center' or 'Outlet'
//     console.log("Entity ID:", entityId.toString());
//     console.log("Entity Type:", entityType);
//     console.log("Entity Name:", user.center.centerName);

//     if (
//       permissions.indent_own_center &&
//       !permissions.indent_all_center &&
//       userCenter
//     ) {
//       const userCenterId = userCenter._id || userCenter;
//       if (userCenterId.toString() !== entityId.toString()) {
//         return res.status(403).json({
//           success: false,
//           message: "Access denied. You can only view serial numbers from your own center.",
//         });
//       }
//     }

//     // DEBUG: Check if product exists
//     console.log("\n--- DEBUG: Checking Product ---");
//     const product = await Product.findById(productId).select(
//       "productTitle productCode trackSerialNumber"
//     );
    
//     if (!product) {
//       console.log("❌ Product NOT found with ID:", productId);
//       return res.status(404).json({
//         success: false,
//         message: "Product not found",
//       });
//     }
    
//     console.log("✅ Product found:");
//     console.log("   - ID:", product._id);
//     console.log("   - Title:", product.productTitle);
//     console.log("   - Track Serial:", product.trackSerialNumber);

//     let stockData = null;
//     let stockField = null;

//     // Check entity type and query appropriate collection
//     if (entityType === "Outlet") {
//       console.log("\n--- DEBUG: Querying OutletStock ---");
//       const OutletStock = mongoose.model("OutletStock");
//       stockData = await OutletStock.findOne({
//         outlet: entityId,
//         product: productId,
//       })
//         .populate("outlet", "centerName centerCode centerType")
//         .populate("product", "productTitle productCode trackSerialNumber");
      
//       stockField = "outlet";
//       console.log("Outlet stock found:", stockData ? "Yes" : "No");
      
//       // Debug all stocks for this outlet
//       const allOutletStocks = await OutletStock.find({ 
//         outlet: entityId 
//       }).populate("product", "productTitle");
      
//       console.log(`Total products in this outlet stock: ${allOutletStocks.length}`);
//       if (allOutletStocks.length > 0) {
//         console.log("Products found in this outlet:");
//         allOutletStocks.forEach((stock, index) => {
//           console.log(`   ${index + 1}. ${stock.product?.productTitle || 'Unknown'} - Quantity: ${stock.totalQuantity}, Serials: ${stock.serialNumbers?.length || 0}`);
//         });
//       }
//     } else {
//       console.log("\n--- DEBUG: Querying CenterStock ---");
//       stockData = await CenterStock.findOne({
//         center: entityId,
//         product: productId,
//       })
//         .populate("center", "centerName centerCode centerType")
//         .populate("product", "productTitle productCode trackSerialNumber");
      
//       stockField = "center";
//       console.log("Center stock found:", stockData ? "Yes" : "No");
      
//       // Debug all stocks for this center
//       const allCenterStocks = await CenterStock.find({ 
//         center: entityId 
//       }).populate("product", "productTitle");
      
//       console.log(`Total products in this center stock: ${allCenterStocks.length}`);
//       if (allCenterStocks.length > 0) {
//         console.log("Products found in this center:");
//         allCenterStocks.forEach((stock, index) => {
//           console.log(`   ${index + 1}. ${stock.product?.productTitle || 'Unknown'} - Quantity: ${stock.totalQuantity}, Serials: ${stock.serialNumbers?.length || 0}`);
//         });
//       }
//     }

//     // If no stock found
//     if (!stockData) {
//       console.log(`❌ No ${entityType} stock found for this product`);
      
//       // Get entity details
//       const entity = await Center.findById(entityId).select(
//         "centerName centerCode centerType"
//       );

//       return res.status(200).json({
//         success: true,
//         message: `No stock found for the specified product in ${entityType}`,
//         data: {
//           entity: {
//             _id: entity._id,
//             name: entity.centerName,
//             code: entity.centerCode,
//             type: entity.centerType
//           },
//           entityType: entityType,
//           product: product,
//           availableSerials: [],
//           totalAvailable: 0,
//           stockSummary: {
//             totalQuantity: 0,
//             availableQuantity: 0,
//             inTransitQuantity: 0,
//             consumedQuantity: 0,
//           },
//         },
//       });
//     }

//     console.log(`✅ ${entityType}Stock record found:`);
//     console.log("   - Stock ID:", stockData._id);
//     console.log("   - Total Quantity:", stockData.totalQuantity);
//     console.log("   - Available Quantity:", stockData.availableQuantity);
//     console.log("   - Serial Numbers Count:", stockData.serialNumbers?.length || 0);

//     // Analyze serial numbers
//     const serialNumbersArray = stockData.serialNumbers || [];
    
//     if (serialNumbersArray.length > 0) {
//       console.log("\n--- Serial Numbers Analysis ---");
//       const statusCount = {};
//       serialNumbersArray.forEach(sn => {
//         statusCount[sn.status] = (statusCount[sn.status] || 0) + 1;
//       });
//       console.log("Status breakdown:", statusCount);
//     }

//     // Filter available serials (only status "available" AND at current location)
//     const availableSerials = serialNumbersArray
//       .filter((sn) => {
//         if (!sn) return false;
        
//         const isAvailable = sn.status === "available";
//         const isAtCurrentLocation = sn.currentLocation?.toString() === entityId.toString();
        
//         if (!isAvailable && sn.status) {
//           console.log(`   Serial ${sn.serialNumber} skipped - Status: ${sn.status}`);
//         } else if (!isAtCurrentLocation && isAvailable) {
//           console.log(`   Serial ${sn.serialNumber} skipped - Location: ${sn.currentLocation} (not current entity)`);
//         }
        
//         return isAvailable && isAtCurrentLocation;
//       })
//       .map((sn) => ({
//         serialNumber: sn.serialNumber,
//         purchaseId: sn.purchaseId,
//         originalOutlet: sn.originalOutlet,
//         currentLocation: sn.currentLocation,
//         status: sn.status,
//       }));

//     console.log(`\n✅ Final available serials count: ${availableSerials.length}`);
//     console.log("========== getCenterSerialNumbers END ==========\n");

//     // Prepare response based on entity type
//     const responseData = {
//       success: true,
//       message: availableSerials.length > 0 
//         ? "Serial numbers retrieved successfully" 
//         : "No available serial numbers found for this product",
//       data: {
//         entityType: entityType,
//         product: {
//           _id: product._id,
//           productTitle: product.productTitle,
//           productCode: product.productCode,
//           trackSerialNumber: product.trackSerialNumber,
//         },
//         entity: {
//           _id: entityId,
//           name: user.center.centerName,
//           code: user.center.centerCode,
//           type: entityType
//         },
//         stockDetails: {
//           _id: stockData._id,
//           totalQuantity: stockData.totalQuantity || 0,
//           availableQuantity: stockData.availableQuantity || 0,
//           inTransitQuantity: stockData.inTransitQuantity || 0,
//           consumedQuantity: stockData.consumedQuantity || 0,
//           lastUpdated: stockData.lastUpdated,
//         },
//         availableSerials,
//         totalAvailable: availableSerials.length,
//       },
//     };

//     // Add backward compatibility fields
//     if (entityType === "Outlet") {
//       responseData.data.outlet = stockData.outlet;
//     } else {
//       responseData.data.center = stockData.center;
//     }

//     res.status(200).json(responseData);
    
//   } catch (error) {
//     console.error("❌ Error retrieving serial numbers:", error);
//     console.error("Error stack:", error.stack);

//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid product ID format",
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Error retrieving serial numbers",
//       error: process.env.NODE_ENV === "development" ? error.message : "Internal server error",
//     });
//   }
// };

// export const getStockRequestCount = async (req, res) => {
//   try {
//     const match = {};

//     if (req.query.center) {
//       match.center = req.query.center;
//     }
//     if (req.query.warehouse) {
//       match.warehouse = req.query.warehouse;
//     }
//     if (req.query.startDate && req.query.endDate) {
//       match.date = {
//         $gte: new Date(req.query.startDate),
//         $lte: new Date(req.query.endDate),
//       };
//     }
//     const summary = await StockRequest.aggregate([
//       { $match: match },
//       {
//         $group: {
//           _id: "$status",
//           count: { $sum: 1 },
//         },
//       },
//     ]);
//     const totalRequests = summary.reduce((acc, cur) => acc + cur.count, 0);

//     const completed =
//       summary.find((s) => s._id === "Completed")?.count || 0;
//     const incomplete =
//       summary.find((s) => s._id === "Incompleted")?.count || 0;

//     return res.status(200).json({
//       success: true,
//       totalRequests,
//       completed,
//       incomplete,
//       summary: summary.reduce((acc, s) => {
//         acc[s._id] = s.count;
//         return acc;
//       }, {}),
//     });
//   } catch (error) {
//     console.error("Error fetching stock request summary:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to fetch stock request summary",
//       error: error.message,
//     });
//   }
// };

// export const getStockRequestNotifications = async (req, res) => {
//   try {
//     const {
//       type,
//       center,
//       days = 7
//     } = req.query;
    
//     const startDate = new Date();
//     startDate.setDate(startDate.getDate() - parseInt(days));
//     startDate.setHours(0, 0, 0, 0);
    
//     const filter = {
//       createdAt: { $gte: startDate }
//     };
    
//     if (center) {
//       filter.center = center;
//     }
    
//     if (type && type !== 'all') {
//       switch (type) {
//         case 'submitted':
//           filter.status = 'Submitted';
//           break;
//         case 'completed':
//           filter.status = 'Completed';
//           break;
//         case 'confirmed':
//           filter.status = 'Confirmed';
//           break;
//         case 'shipped':
//           filter.status = 'Shipped';
//           break;
//         case 'incompleted':
//           filter.status = 'Incompleted';
//           break;
//       }
//     }

//     const stockRequests = await StockRequest.find(filter)
//       .populate("center", "centerName centerCode")
//       .populate("createdBy", "fullName")
//       .populate("approvalInfo.approvedBy", "fullName")
//       .populate("completionInfo.completedBy", "fullName")
//       .populate("incompleteInfo.incompleteBy", "fullName")
//       .sort({ createdAt: -1 })
//       .lean();

//     // Filter out requests with missing center data and format notifications
//     const validStockRequests = stockRequests.filter(request => 
//       request.center && request.center.centerName
//     );

//     const notifications = validStockRequests.map(request => {
//       return formatStockRequestToNotification(request);
//     });

//     res.status(200).json({
//       success: true,
//       message: "Stock request notifications retrieved successfully",
//       data: notifications,
//       totalCount: notifications.length
//     });

//   } catch (error) {
//     console.error("Error retrieving stock request notifications:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error retrieving notifications",
//       error: error.message,
//     });
//   }
// };

// const formatStockRequestToNotification = (stockRequest) => {
//   const formatDate = (date) => {
//     return new Date(date).toLocaleDateString('en-GB', {
//       day: '2-digit',
//       month: 'short',
//       year: 'numeric'
//     });
//   };

//   let title = '';
//   let message = '';
//   let notificationType = '';
//   let timestamp = stockRequest.createdAt;

//   const centerName = stockRequest.center?.centerName || 'Unknown Center';
//   const orderNumber = stockRequest.orderNumber || 'N/A';
//   const createdByName = stockRequest.createdBy?.fullName || 'Unknown User';

//   switch (stockRequest.status) {
//     case 'Submitted':
//       notificationType = 'new_request';
//       title = 'New Stock Request Submitted';
//       message = `New Stock Request No. ${orderNumber} had been Submitted From ${centerName} By ${createdByName} - ${formatDate(stockRequest.createdAt)}`;
//       break;

//     case 'Completed':
//       notificationType = 'request_completed';
//       title = 'Stock Request Completed';
//       const completedBy = stockRequest.completionInfo?.completedBy?.fullName || 
//                          stockRequest.receivingInfo?.receivedBy?.fullName || 
//                          'System';
//       message = `Your indent Request No. ${orderNumber} had been Completed From ${centerName} By ${completedBy} - ${formatDate(stockRequest.completionInfo?.completedOn || stockRequest.updatedAt)}`;
//       timestamp = stockRequest.completionInfo?.completedOn || stockRequest.updatedAt;
//       break;

//     case 'Confirmed':
//       notificationType = 'request_approved';
//       title = 'Stock Request Approved';
//       const approvedBy = stockRequest.approvalInfo?.approvedBy?.fullName || 'System';
//       message = `Stock Request No. ${orderNumber} has been Approved From ${centerName} By ${approvedBy} - ${formatDate(stockRequest.approvalInfo?.approvedAt || stockRequest.updatedAt)}`;
//       timestamp = stockRequest.approvalInfo?.approvedAt || stockRequest.updatedAt;
//       break;

//     case 'Shipped':
//       notificationType = 'request_shipped';
//       title = 'Stock Request Shipped';
//       const shippedBy = stockRequest.shippingInfo?.shippedBy?.fullName || 'System';
//       message = `Stock Request No. ${orderNumber} has been Shipped From ${centerName} By ${shippedBy} - ${formatDate(stockRequest.shippingInfo?.shippedAt || stockRequest.updatedAt)}`;
//       timestamp = stockRequest.shippingInfo?.shippedAt || stockRequest.updatedAt;
//       break;

//     case 'Incompleted':
//       notificationType = 'request_incompleted';
//       title = 'Stock Request Incompleted';
//       const incompletedBy = stockRequest.completionInfo?.incompleteBy?.fullName || 'System';
//       message = `Stock Request No. ${orderNumber} has been Marked Incomplete From ${centerName} By ${incompletedBy} - ${formatDate(stockRequest.completionInfo?.incompleteOn || stockRequest.updatedAt)}`;
//       timestamp = stockRequest.completionInfo?.incompleteOn || stockRequest.updatedAt;
//       break;

//     case 'Rejected':
//       notificationType = 'request_rejected';
//       title = 'Stock Request Rejected';
//       message = `Stock Request No. ${orderNumber} has been Rejected From ${centerName} - ${formatDate(stockRequest.updatedAt)}`;
//       break;

//     default:
//       notificationType = 'status_updated';
//       title = 'Stock Request Updated';
//       message = `Stock Request No. ${orderNumber} status updated to ${stockRequest.status} From ${centerName} - ${formatDate(stockRequest.updatedAt)}`;
//       timestamp = stockRequest.updatedAt;
//   }

//   return {
//     id: stockRequest._id,
//     type: notificationType,
//     title,
//     message,
//     stockRequestId: stockRequest._id,
//     orderNumber: stockRequest.orderNumber,
//     center: stockRequest.center,
//     status: stockRequest.status,
//     timestamp,
//     createdAt: stockRequest.createdAt,
//     isRead: false
//   };
// };

// //Challan Approval
// export const updateWarehouseChallanApproval = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["manage_indent", "stock_transfer_approve_from_outlet"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_indent or stock_transfer_approve_from_outlet permission required.",
//       });
//     }

//     const { id } = req.params;
//     const {warehouseChallanApproval } = req.body;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. You can only update challan approval for stock requests from your own center.",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     if (!["pending", "approved", "rejected"].includes(warehouseChallanApproval)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid challan approval status. Must be one of: pending, approved, rejected",
//       });
//     }

//     const updateData = {
//       warehouseChallanApproval,
//       updatedBy: userId,
//       approvalInfo: {
//         ...stockRequest.approvalInfo,
//       },
//     };

//     if (warehouseChallanApproval === "approved" || warehouseChallanApproval === "rejected") {
//       updateData.approvalInfo.warehouseChallanApprovedAt = new Date();
//       updateData.approvalInfo.warehouseChallanApprovedBy = userId;

//     } else {

//       updateData.approvalInfo.warehouseChallanApprovedAt = undefined;
//       updateData.approvalInfo.warehouseChallanApprovedBy = undefined;
//     }

//     const updatedRequest = await StockRequest.findByIdAndUpdate(
//       id,
//       updateData,
//       { new: true, runValidators: true }
//     )
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode centerType")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("approvalInfo.approvedBy", "_id fullName email")
//       .populate("approvalInfo.warehouseChallanApprovedBy", "_id fullName email")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email");
//     res.status(200).json({
//       success: true,
//       message: `Challan approval status updated to ${warehouseChallanApproval} successfully`,
//       data: updatedRequest,
//     });
//   } catch (error) {
//     console.error("Error updating challan approval:", error);

//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock request ID",
//       });
//     }

//     if (error.name === "ValidationError") {
//       const errors = Object.values(error.errors).map((err) => err.message);
//       return res.status(400).json({
//         success: false,
//         message: "Validation error",
//         errors,
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Error updating challan approval",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

// export const updateCenterChallanApproval = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["manage_indent", "stock_transfer_approve_from_outlet"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_indent or stock_transfer_approve_from_outlet permission required.",
//       });
//     }

//     const { id } = req.params;
//     const { centerChallanApproval } = req.body;

//     const stockRequest = await StockRequest.findById(id);
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. You can only update challan approval for stock requests from your own center.",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     if (!["pending", "approved", "rejected"].includes(centerChallanApproval)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid challan approval status. Must be one of: pending, approved, rejected",
//       });
//     }

//     const updateData = {
//       centerChallanApproval,
//       updatedBy: userId,
//       approvalInfo: {
//         ...stockRequest.approvalInfo,
//       },
//     };

//     if (centerChallanApproval === "approved" || centerChallanApproval === "rejected") {
//       updateData.approvalInfo.centerChallanApprovedAt = new Date();
//       updateData.approvalInfo.centerChallanApprovedBy = userId;
//     } else {

//       updateData.approvalInfo.centerChallanApprovedAt = undefined;
//       updateData.approvalInfo.centerChallanApprovedBy = undefined;
//     }

//     const updatedRequest = await StockRequest.findByIdAndUpdate(
//       id,
//       updateData,
//       { new: true, runValidators: true }
//     )
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode centerType")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("approvalInfo.approvedBy", "_id fullName email")
//       .populate("approvalInfo.centerChallanApprovedBy", "_id fullName email")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email");

//       res.status(200).json({
//       success: true,
//       message: `Challan approval status updated to ${centerChallanApproval} successfully`,
//       data: updatedRequest,
//     });
//   } catch (error) {
//     console.error("Error updating challan approval:", error);

//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock request ID",
//       });
//     }

//     if (error.name === "ValidationError") {
//       const errors = Object.values(error.errors).map((err) => err.message);
//       return res.status(400).json({
//         success: false,
//         message: "Validation error",
//         errors,
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Error updating challan approval",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     })
//   }
// };  

// export const exportStockRequestsToExcel = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["indent_all_center", "indent_own_center"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. indent_own_center or indent_all_center permission required.",
//       });
//     }

//     const {
//       startDate,
//       endDate,
//       center: centerId,
//       reseller: resellerId,
//       status = "Completed",
//       orderNumber,
//       challanNo,
//     } = req.query;

//     // Build filter
//     let filter = {};

//     // Status filter - default to Completed if not specified
//     if (status) {
//       if (Array.isArray(status)) {
//         filter.status = { $in: status };
//       } else if (status.includes(',')) {
//         filter.status = { $in: status.split(',') };
//       } else {
//         filter.status = status;
//       }
//     } else {
//       filter.status = "Completed"; // Default to completed requests
//     }

//     // Date range filter
//     if (startDate || endDate) {
//       filter.createdAt = {};
//       if (startDate) {
//         const start = new Date(startDate);
//         if (isNaN(start.getTime())) {
//           return res.status(400).json({
//             success: false,
//             message: "Invalid startDate format. Please use YYYY-MM-DD format."
//           });
//         }
//         start.setHours(0, 0, 0, 0);
//         filter.createdAt.$gte = start;
//       }
//       if (endDate) {
//         const end = new Date(endDate);
//         if (isNaN(end.getTime())) {
//           return res.status(400).json({
//             success: false,
//             message: "Invalid endDate format. Please use YYYY-MM-DD format."
//           });
//         }
//         end.setHours(23, 59, 59, 999);
//         filter.createdAt.$lte = end;
//       }
//     }

//     // Order number filter
//     if (orderNumber) {
//       filter.orderNumber = { $regex: orderNumber, $options: 'i' };
//     }

//     // Challan number filter
//     if (challanNo) {
//       filter.challanNo = { $regex: challanNo, $options: 'i' };
//     }

//     // Reseller filter - find centers under this reseller
//     let resellerCenterIds = null;
//     if (resellerId) {
//       if (!mongoose.Types.ObjectId.isValid(resellerId)) {
//         return res.status(400).json({
//           success: false,
//           message: `Invalid reseller ID format: ${resellerId}`
//         });
//       }

//       const Center = mongoose.model("Center");
//       const matchingCenters = await Center.find({
//         reseller: new mongoose.Types.ObjectId(resellerId),
//         centerType: "Center"
//       }).select('_id');

//       if (matchingCenters.length === 0) {
//         return res.status(200).json({
//           success: true,
//           message: "No stock requests found for this reseller",
//           data: [],
//         });
//       }

//       resellerCenterIds = matchingCenters.map(c => c._id);
//     }

//     // Center filter with reseller intersection
//     if (resellerCenterIds) {
//       if (centerId) {
//         let requestedCenterIds = [];
//         if (Array.isArray(centerId)) {
//           requestedCenterIds = centerId.map(c => new mongoose.Types.ObjectId(c));
//         } else if (centerId.includes(',')) {
//           requestedCenterIds = centerId.split(',').map(c => new mongoose.Types.ObjectId(c));
//         } else if (mongoose.Types.ObjectId.isValid(centerId)) {
//           requestedCenterIds = [new mongoose.Types.ObjectId(centerId)];
//         }

//         const intersectionIds = requestedCenterIds.filter(requestedId =>
//           resellerCenterIds.some(resellerId => resellerId.toString() === requestedId.toString())
//         );

//         if (intersectionIds.length === 0) {
//           return res.status(200).json({
//             success: true,
//             message: "No stock requests found matching both reseller and center filters",
//             data: [],
//           });
//         }

//         filter.center = { $in: intersectionIds };
//       } else {
//         filter.center = { $in: resellerCenterIds };
//       }
//     } else if (centerId) {
//       if (Array.isArray(centerId)) {
//         filter.center = { $in: centerId.map(c => new mongoose.Types.ObjectId(c)) };
//       } else if (centerId.includes(',')) {
//         filter.center = { $in: centerId.split(',').map(c => new mongoose.Types.ObjectId(c)) };
//       } else if (mongoose.Types.ObjectId.isValid(centerId)) {
//         filter.center = new mongoose.Types.ObjectId(centerId);
//       }
//     }

//     // Apply user center permission filter
//     if (
//       permissions.indent_own_center &&
//       !permissions.indent_all_center &&
//       userCenter
//     ) {
//       const userCenterId = userCenter._id || userCenter;
//       if (filter.center) {
//         if (filter.center.$in) {
//           filter.center.$in = filter.center.$in.filter(centerId =>
//             centerId.toString() === userCenterId.toString()
//           );
//           if (filter.center.$in.length === 0) {
//             filter.center = { $in: [] };
//           }
//         } else {
//           filter.center = userCenterId;
//         }
//       } else {
//         filter.center = userCenterId;
//       }
//     }

//     console.log('Export filter:', JSON.stringify(filter, null, 2));

//     // Fetch stock requests with populated data
//     const populateOptions = [
//       {
//         path: 'center',
//         select: 'centerName centerCode reseller',
//         populate: {
//           path: 'reseller',
//           select: 'businessName name'
//         }
//       },
//       {
//         path: 'warehouse',
//         select: 'centerName centerCode'
//       },
//       {
//         path: 'completionInfo.completedBy',
//         select: 'fullName'
//       }
//     ];

//     const stockRequests = await StockRequest.find(filter)
//       .populate(populateOptions)
//       .sort({ createdAt: -1 })
//       .lean();

//     if (stockRequests.length === 0) {
//       return res.status(200).json({
//         success: true,
//         message: "No stock requests found for the selected criteria",
//         data: [],
//       });
//     }

//     // Create Excel workbook and worksheet
//     const workbook = new ExcelJS.Workbook();
//     const worksheet = workbook.addWorksheet('Stock Requests Report');

//     // Define columns
//     worksheet.columns = [
//       { header: 'S.No', key: 'sno', width: 8 },
//       { header: 'ORDER DATE', key: 'orderDate', width: 15 },
//       { header: 'ORDER NUMBER', key: 'orderNumber', width: 20 },
//       { header: 'CHALLAN NO', key: 'challanNo', width: 20 },
//       { header: 'CHALLAN DATE', key: 'challanDate', width: 15 },
//       { header: 'WAREHOUSE BRANCH', key: 'warehouseBranch', width: 25 },
//       { header: 'CENTER NAME', key: 'centerName', width: 25 },
//       { header: 'RESELLER NAME', key: 'resellerName', width: 25 },
//       { header: 'STATUS', key: 'status', width: 15 },
//       { header: 'COMPLETED AT', key: 'completedAt', width: 20 },
//       { header: 'ORDER CREATED AT', key: 'createdAt', width: 20 },
//     ];

//     // Style the header row
//     worksheet.getRow(1).font = { bold: true };
//     worksheet.getRow(1).fill = {
//       type: 'pattern',
//       pattern: 'solid',
//       fgColor: { argb: 'FF4F81BD' }
//     };
//     worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

//     // Add data rows
//     let sno = 1;
//     stockRequests.forEach((request) => {
//       const row = worksheet.addRow({
//         sno: sno++,
//         orderDate: request.date ? new Date(request.date).toLocaleDateString('en-GB') : '',
//         orderNumber: request.orderNumber || '',
//         challanNo: request.challanNo || '',
//         challanDate: request.challanDate ? new Date(request.challanDate).toLocaleDateString('en-GB') : '',
//         warehouseBranch: request.warehouse?.centerName || request.warehouse?.centerCode || '',
//         centerName: request.center?.centerName || '',
//         resellerName: request.center?.reseller?.businessName || request.center?.reseller?.name || '',
//         status: request.status || '',
//         completedAt: request.completionInfo?.completedOn ? new Date(request.completionInfo.completedOn).toLocaleString() : 
//                      (request.receivingInfo?.receivedAt ? new Date(request.receivingInfo.receivedAt).toLocaleString() : ''),
//         createdAt: request.createdAt ? new Date(request.createdAt).toLocaleString() : '',
//       });

//       // Apply borders to each cell in the row
//       row.eachCell((cell) => {
//         cell.border = {
//           top: { style: 'thin' },
//           left: { style: 'thin' },
//           bottom: { style: 'thin' },
//           right: { style: 'thin' }
//         };
//       });
//     });

//     // Auto-filter for the header row
//     worksheet.autoFilter = {
//       from: 'A1',
//       to: worksheet.getColumn(worksheet.columns.length).letter + '1'
//     };

//     // Freeze the header row
//     worksheet.views = [
//       { state: 'frozen', ySplit: 1 }
//     ];

//     // Set response headers for Excel file download
//     const filename = `stock_requests_report_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
    
//     res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
//     res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

//     // Write to response
//     await workbook.xlsx.write(res);
//     res.end();

//   } catch (error) {
//     console.error("Error exporting stock requests to Excel:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error exporting stock requests to Excel",
//       error: error.message,
//     });
//   }
// };



import StockRequest from "../models/StockRequest.js";
import Center from "../models/Center.js";
import User from "../models/User.js";
import StockPurchase from "../models/StockPurchase.js";
import CenterStock from "../models/CenterStock.js";
import mongoose from "mongoose";

/**
 * Synchronize a StockRequest received-quantity change into CenterStock.
 *
 * IMPORTANT:
 * - This helper is only for NON-SERIALIZED products.
 * - Serialized products must be processed through completeStockRequest()
 *   / completeIncompleteRequest(), because their serialNumbers array must
 *   also be updated.
 * - Delta based: only the quantity difference is applied, preventing
 *   duplicate stock when an already-received request is edited.
 */
const syncReceivedQuantityToCenterStock = async ({
  centerId,
  productId,
  oldReceivedQuantity = 0,
  newReceivedQuantity = 0,
}) => {
  const Product = mongoose.model("Product");

  const oldQty = Number(oldReceivedQuantity) || 0;
  const newQty = Number(newReceivedQuantity) || 0;
  const delta = newQty - oldQty;

  if (delta === 0) {
    return null;
  }

  const product = await Product.findById(productId).select(
    "_id productTitle trackSerialNumber"
  );

  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  if (product.trackSerialNumber === "Yes") {
    throw new Error(
      `Received quantity for serialized product "${product.productTitle}" must be updated through the completion endpoint so serial numbers remain synchronized.`
    );
  }

  if (delta > 0) {
    return CenterStock.findOneAndUpdate(
      {
        center: centerId,
        product: productId,
      },
      {
        $inc: {
          totalQuantity: delta,
          availableQuantity: delta,
        },
        $set: {
          lastUpdated: new Date(),
        },
        $setOnInsert: {
          center: centerId,
          product: productId,
          inTransitQuantity: 0,
          consumedQuantity: 0,
          serialNumbers: [],
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );
  }

  const removeQuantity = Math.abs(delta);

  const stock = await CenterStock.findOne({
    center: centerId,
    product: productId,
  });

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

  stock.totalQuantity = Math.max(
    0,
    (stock.totalQuantity || 0) - removeQuantity
  );
  stock.availableQuantity = Math.max(
    0,
    (stock.availableQuantity || 0) - removeQuantity
  );
  stock.lastUpdated = new Date();

  return stock.save();
};

/**
 * Apply receivedQuantity changes to CenterStock for an update operation.
 *
 * This is deliberately separate from completeStockRequest(), which already
 * performs the physical receipt/source-stock transfer itself.
 */
const syncReceivedQuantityChanges = async ({
  stockRequest,
  nextProducts,
}) => {
  if (!Array.isArray(nextProducts)) {
    return;
  }

  const Product = mongoose.model("Product");

  for (const nextProduct of nextProducts) {
    const existingProduct = stockRequest.products.find(
      (p) =>
        p.product?.toString() === nextProduct.product?.toString()
    );

    if (!existingProduct) {
      continue;
    }

    const oldReceived = Number(existingProduct.receivedQuantity) || 0;
    const newReceived = Number(nextProduct.receivedQuantity) || 0;

    if (oldReceived === newReceived) {
      continue;
    }

    const product = await Product.findById(nextProduct.product).select(
      "_id productTitle trackSerialNumber"
    );

    if (!product) {
      throw new Error(`Product ${nextProduct.product} not found`);
    }

    /*
     * Generic update endpoints cannot safely mutate serialized receipts,
     * because CenterStock.serialNumbers must change together with quantity.
     * Force those through completeStockRequest().
     */
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


const checkStockRequestPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];
  const indentModule = userPermissions.find((perm) => perm.module === "Indent");

  if (!indentModule) {
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    manage_indent: indentModule.permissions.includes("manage_indent"),
    indent_all_center: indentModule.permissions.includes("indent_all_center"),
    indent_own_center: indentModule.permissions.includes("indent_own_center"),
    delete_indent_all_center: indentModule.permissions.includes(
      "delete_indent_all_center"
    ),
    delete_indent_own_center: indentModule.permissions.includes(
      "delete_indent_own_center"
    ),
    stock_transfer_approve_from_outlet: indentModule.permissions.includes(
      "stock_transfer_approve_from_outlet"
    ),
    complete_indent: indentModule.permissions.includes("complete_indent"),
  };

  const hasRequiredPermission = requiredPermissions.some(
    (perm) => permissions[perm]
  );

  return {
    hasAccess: hasRequiredPermission,
    permissions,
    userCenter: req.user.center,
  };
};

const checkCenterAccess = (stockRequest, userCenter, permissions) => {
  if (permissions.indent_all_center) {
    return true;
  }

  if (permissions.indent_own_center && userCenter) {
    const userCenterId = userCenter._id || userCenter;
    const requestCenterId = stockRequest.center._id || stockRequest.center;
    return userCenterId.toString() === requestCenterId.toString();
  }

  return false;
};

const getOutletStockForRequests = async (warehouseId, productIds) => {
  try {
    const OutletStock = mongoose.model("OutletStock");
    
    const outletStockData = await OutletStock.find({
      outlet: warehouseId,
      product: { $in: productIds }
    })
    .populate("outlet", "centerName centerCode")
    .select("product totalQuantity availableQuantity inTransitQuantity serialNumbers");
    
    const outletStockMap = new Map();
    
    outletStockData.forEach((item) => {
      const availableSerials = item.serialNumbers
        .filter(sn => sn.status === "available")
        .map(sn => sn.serialNumber);
      
      outletStockMap.set(item.product.toString(), {
        totalQuantity: item.totalQuantity,
        availableQuantity: item.availableQuantity,
        inTransitQuantity: item.inTransitQuantity,
        hasSerialNumbers: item.serialNumbers.length > 0,
        availableSerials: availableSerials,
        availableSerialsCount: availableSerials.length,
        outletName: item.outlet?.centerName || "Unknown Outlet"
      });
    });

    return outletStockMap;
  } catch (error) {
    console.error("Error fetching outlet stock for requests:", error);
    throw error;
  }
};

export const createStockRequest = async (req, res) => {
  try {
    const { hasAccess, permissions } = checkStockRequestPermissions(req, [
      "manage_indent",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent permission required.",
      });
    }
    const {
      warehouse,
      remark,
      products,
      status = "Draft",
      orderNumber,
      date,
    } = req.body;

    if (!orderNumber || orderNumber.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Order number is required",
      });
    }

    const trimmedOrderNumber = orderNumber.trim();

    const existingRequest = await StockRequest.findOne({
      orderNumber: trimmedOrderNumber,
    });

    if (existingRequest) {
      return res.status(409).json({
        success: false,
        message:
          "Order number already exists. Please use a unique order number.",
        duplicateOrderNumber: trimmedOrderNumber,
        existingRequestId: existingRequest._id,
      });
    }

    let requestDate = new Date();
    if (date) {
      requestDate = new Date(date);
      if (isNaN(requestDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format. Please provide a valid date.",
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const providedDate = new Date(requestDate);
      providedDate.setHours(0, 0, 0, 0);
    }

    const user = await User.findById(req.user.id).populate("center");
    if (!user || !user.center) {
      return res.status(400).json({
        success: false,
        message: "User center information not found",
      });
    }

    const centerId = user.center._id;

    if (permissions.indent_own_center && !permissions.indent_all_center) {
      const userCenterId = user.center._id || user.center;
    }

    const centerExists = await Center.findById(centerId);
    if (!centerExists) {
      return res.status(404).json({
        success: false,
        message: "Center not found",
      });
    }

    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Products array is required and cannot be empty",
      });
    }

    for (const product of products) {
      if (!product.product || !product.quantity) {
        return res.status(400).json({
          success: false,
          message: "Each product must have product ID and quantity",
        });
      }

      if (product.quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: "Product quantity must be greater than 0",
        });
      }
    }

    const stockRequest = new StockRequest({
      orderNumber: trimmedOrderNumber,
      warehouse,
      center: centerId,
      remark: remark || "",
      products,
      date: requestDate,
      status,
      centerChallanApproval: "pending",
      warehouseChallanApproval: "pending",
      createdBy: req.user.id,
    });

    const savedStockRequest = await stockRequest.save();

    const populatedRequest = await StockRequest.findById(savedStockRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("createdBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("approvalInfo.warehouseChallanApprovedBy","_id fullName email" )
      .populate("approvalInfo.centerChallanApprovedBy","_id fullName email" )
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email");

    res.status(201).json({
      success: true,
      message: "Stock request created successfully",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error creating stock request:", error);

    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern)[0];
      if (duplicateField === "orderNumber") {
        return res.status(409).json({
          success: false,
          message:
            "Order number already exists. Please use a unique order number.",
          duplicateOrderNumber: req.body.orderNumber,
        });
      }
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: `Invalid ${error.path}: ${error.value}`,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating stock request",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
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

const buildDateFilter = (
  dateFilter,
  customStartDate,
  customEndDate,
  startDate,
  endDate
) => {
  if (dateFilter) {
    const dateRange = getDateRange(dateFilter, customStartDate, customEndDate);
    if (dateRange) {
      return {
        $gte: dateRange.start,
        $lte: dateRange.end,
      };
    }
  }

  if (startDate || endDate) {
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    return dateFilter;
  }

  return null;
};

const getBulkCenterStock = async (requests) => {
  const centerProductMap = new Map();

  requests.forEach((request) => {
    if (!request.center?._id) return;

    const centerId = request.center._id.toString();
    const productIds = request.products
      .map((p) => p.product?._id)
      .filter(Boolean);

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
        _id: {
          center: "$center",
          product: "$product",
        },
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
    status,
    center,
    outlet,
    warehouse,
    startDate,
    endDate,
    createdAtStart,
    createdAtEnd,
    orderNumber,
    search,
    dateFilter,
    customStartDate,
    customEndDate,
    product, // ✅ ADDED product filter
  } = query;

  const filter = {};

  const statusFilter = buildArrayFilter(status);
  if (statusFilter) filter.status = statusFilter;

  const centerFilter = buildArrayFilter(center);
  if (centerFilter) {
    if (Array.isArray(centerFilter.$in)) {
      filter.center = { 
        $in: centerFilter.$in.map(id => 
          mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
        )
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
          $in: warehouseFilter.$in.map(id => 
            mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
          )
        };
      } else if (mongoose.Types.ObjectId.isValid(warehouseFilter)) {
        filter.warehouse = new mongoose.Types.ObjectId(warehouseFilter);
      } else {
        filter.warehouse = warehouseFilter;
      }
    }
  }

  const dateFilterObj = buildDateFilter(
    dateFilter,
    customStartDate,
    customEndDate,
    startDate,
    endDate
  );
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
  
  // ✅ ADDED: Product filter
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

  console.log('Final filter:', JSON.stringify(filter, null, 2));
  return filter;
};

const buildSortOptions = (sortBy = "createdAt", sortOrder = "desc") => {
  const validSortFields = [
    "challanNo",
    "challanDate",
    "createdAt",
    "updatedAt",
    "date",
    "orderNumber",
    "status",
    "approvalInfo.approvedAt",
    "shippingInfo.shippedAt",
    "receivingInfo.receivedAt",
  ];

  const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "createdAt";
  return { [actualSortBy]: sortOrder === "desc" ? -1 : 1 };
};

const populateOptions = [
  { path: "warehouse", select: "_id centerName centerCode centerType" },
  { path: "center", select: "_id centerName centerCode centerType",
    populate: [
      {
        path: "reseller",
        select: "_id businessName contactNumber name mobile email gstNumber panNumber address1 address2 city state "
      },
      {
        path: "area",
        select: "_id areaName"
      }
    ]
   },
  {
    path: "products.product",
    select: "_id productTitle productCode productPrice salePrice hsnCode",
  },
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

export const getAllStockRequests = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["indent_all_center", "indent_own_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. indent_own_center or indent_all_center permission required.",
      });
    }
    
    const {
      page = 1,
      limit = 100,
      sortBy = "createdAt",
      sortOrder = "desc",
      ...filterParams
    } = req.query;

    console.log('=== getAllStockRequests - Query Parameters ===');
    console.log('filterParams:', filterParams);
    console.log('product filter:', filterParams.product);
    console.log('==============================================');

    let filter = buildFilter(filterParams);

    if (filterParams.reseller) {
      const resellerFilter = buildArrayFilter(filterParams.reseller);
      let centerFilter = {};
      
      if (resellerFilter) {
        if (Array.isArray(resellerFilter.$in)) {
          centerFilter.reseller = { 
            $in: resellerFilter.$in.map(id => 
              mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
            )
          };
        } else if (mongoose.Types.ObjectId.isValid(resellerFilter)) {
          centerFilter.reseller = new mongoose.Types.ObjectId(resellerFilter);
        } else {
          centerFilter.reseller = resellerFilter;
        }

        const matchingCenters = await Center.find(centerFilter).select('_id');
        const centerIds = matchingCenters.map(center => center._id);

        if (centerIds.length > 0) {
          if (filter.center) {
            if (filter.center.$in) {
              filter.center.$in = filter.center.$in.filter(centerId => 
                centerIds.some(matchingId => matchingId.toString() === centerId.toString())
              );
            } else {
              if (!centerIds.some(id => id.toString() === filter.center.toString())) {
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

    if (
      permissions.indent_own_center &&
      !permissions.indent_all_center &&
      userCenter
    ) {
      const userCenterId = userCenter._id || userCenter;
      if (filter.center) {
        if (filter.center.$in) {
          filter.center.$in = filter.center.$in.filter(centerId => 
            centerId.toString() === userCenterId.toString()
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

    console.log('Final filter for query:', JSON.stringify(filter, null, 2));

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
      return res.status(200).json({
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
      });
    }

    const stockMap = await getBulkCenterStock(stockRequests);
    
    const resellerStockMap = new Map();
    const centerToResellerMap = new Map();
    
    const centerIds = stockRequests.map(req => req.center?._id).filter(Boolean);
    const allProductIds = [];
    
    stockRequests.forEach(request => {
      request.products.forEach(product => {
        if (product.product?._id) {
          allProductIds.push(product.product._id.toString());
        }
      });
    });
    
    const uniqueProductIds = [...new Set(allProductIds)];
    
    if (centerIds.length > 0 && uniqueProductIds.length > 0) {
      const centersWithResellers = await Center.find({
        _id: { $in: centerIds }
      }).populate('reseller', '_id businessName').select('_id reseller');
      
      centersWithResellers.forEach(center => {
        if (center.reseller) {
          centerToResellerMap.set(center._id.toString(), center.reseller._id);
        }
      });
      
      const uniqueResellerIds = [...new Set([...centerToResellerMap.values()])];
      
      if (uniqueResellerIds.length > 0) {
        const ResellerStock = mongoose.model("ResellerStock");
        const resellerStocks = await ResellerStock.find({
          reseller: { $in: uniqueResellerIds },
          product: { $in: uniqueProductIds.map(id => new mongoose.Types.ObjectId(id)) }
        }).lean();
        
        resellerStocks.forEach(stock => {
          const key = `${stock.reseller}_${stock.product}`;
          
          let damageRepairCount = 0;
          let centerReturnCount = 0;
          let availableSerials = [];
          
          if (stock.serialNumbers && stock.serialNumbers.length > 0) {
            const availableSerialsArray = stock.serialNumbers.filter(sn => 
              sn.status === "available"
            );
            
            availableSerials = availableSerialsArray.map(sn => sn.serialNumber);
            
            damageRepairCount = availableSerialsArray.filter(
              sn => sn.sourceType === "damage_repair"
            ).length;
            
            centerReturnCount = availableSerialsArray.filter(
              sn => sn.sourceType === "center_return"
            ).length;
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
              directPurchaseQuantity: (stock.availableQuantity || 0) - damageRepairCount - centerReturnCount
            },
            availableSerials: availableSerials,
            availableSerialsCount: availableSerials.length,
            damageRepairSerialsCount: damageRepairCount,
            centerReturnSerialsCount: centerReturnCount
          });
        });
      }
    }

    const defaultResellerStock = {
      totalQuantity: 0,
      availableQuantity: 0,
      availableBreakdown: {
        damageRepair: 0,
        centerReturn: 0,
        directPurchase: 0,
        total: 0
      },
      sourceBreakdown: {
        damageRepairQuantity: 0,
        centerReturnQuantity: 0,
        directPurchaseQuantity: 0
      },
      availableSerials: [],
      availableSerialsCount: 0,
      damageRepairCount: 0,
      centerReturnCount: 0,
      hasResellerStock: false
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
          resellerStock: resellerStockInfo ? {
            totalQuantity: resellerStockInfo.totalQuantity || 0,
            availableQuantity: resellerStockInfo.availableQuantity || 0,
            availableBreakdown: {
              damageRepair: resellerStockInfo.sourceBreakdown?.damageRepairQuantity || 0,
              centerReturn: resellerStockInfo.sourceBreakdown?.centerReturnQuantity || 0,
              directPurchase: resellerStockInfo.sourceBreakdown?.directPurchaseQuantity || 0,
              total: resellerStockInfo.availableQuantity || 0
            },
            sourceBreakdown: resellerStockInfo.sourceBreakdown || {
              damageRepairQuantity: 0,
              centerReturnQuantity: 0,
              directPurchaseQuantity: 0
            },
            availableSerials: resellerStockInfo.availableSerials || [],
            availableSerialsCount: resellerStockInfo.availableSerialsCount || 0,
            damageRepairCount: resellerStockInfo.damageRepairSerialsCount || 0,
            centerReturnCount: resellerStockInfo.centerReturnSerialsCount || 0,
            hasResellerStock: true
          } : defaultResellerStock
        };
      });

      const resellerStockTotals = productsWithEnhancedData.reduce((totals, product) => {
        const resellerStock = product.resellerStock || defaultResellerStock;
        const availableBreakdown = resellerStock.availableBreakdown || defaultResellerStock.availableBreakdown;
        
        totals.totalAvailable += resellerStock.availableQuantity || 0;
        totals.damageRepair += availableBreakdown.damageRepair || 0;
        totals.centerReturn += availableBreakdown.centerReturn || 0;
        totals.directPurchase += availableBreakdown.directPurchase || 0;
        return totals;
      }, {
        totalAvailable: 0,
        damageRepair: 0,
        centerReturn: 0,
        directPurchase: 0
      });

      return {
        ...request,
        products: productsWithEnhancedData,
        stockSummary: {
          centerStock: productsWithEnhancedData.reduce((sum, product) => 
            sum + (product.centerStockQuantity || 0), 0
          ),
          resellerStock: {
            totalAvailable: resellerStockTotals.totalAvailable,
            breakdown: {
              damageRepair: resellerStockTotals.damageRepair,
              centerReturn: resellerStockTotals.centerReturn,
              directPurchase: resellerStockTotals.directPurchase,
              percentage: {
                damageRepair: resellerStockTotals.totalAvailable > 0 ? 
                  Math.round((resellerStockTotals.damageRepair / resellerStockTotals.totalAvailable) * 100) : 0,
                centerReturn: resellerStockTotals.totalAvailable > 0 ? 
                  Math.round((resellerStockTotals.centerReturn / resellerStockTotals.totalAvailable) * 100) : 0,
                directPurchase: resellerStockTotals.totalAvailable > 0 ? 
                  Math.round((resellerStockTotals.directPurchase / resellerStockTotals.totalAvailable) * 100) : 0
              }
            }
          },
          resellerInfo: resellerId ? {
            hasReseller: true,
            resellerId: resellerId
          } : {
            hasReseller: false
          }
        }
      };
    });

    const statusStats = statusCounts.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});

    const overallStats = stockRequestsWithEnhancedData.reduce((stats, request) => {
      stats.totalRequests += 1;
      
      const stockSummary = request.stockSummary || { resellerStock: { totalAvailable: 0, breakdown: {} } };
      const resellerStock = stockSummary.resellerStock || { totalAvailable: 0, breakdown: {} };
      const breakdown = resellerStock.breakdown || {};
      
      stats.totalResellerAvailable += resellerStock.totalAvailable || 0;
      stats.totalDamageRepair += breakdown.damageRepair || 0;
      stats.totalCenterReturn += breakdown.centerReturn || 0;
      stats.totalDirectPurchase += breakdown.directPurchase || 0;
      
      if (stockSummary.resellerInfo?.hasReseller) {
        stats.requestsWithReseller += 1;
      }
      
      return stats;
    }, {
      totalRequests: 0,
      totalResellerAvailable: 0,
      totalDamageRepair: 0,
      totalCenterReturn: 0,
      totalDirectPurchase: 0,
      requestsWithReseller: 0
    });

    res.status(200).json({
      success: true,
      message: "Stock requests retrieved successfully",
      data: stockRequestsWithEnhancedData,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
      filters: {
        status: statusStats,
        total: total,
      },
      summary: {
        overallResellerStock: {
          totalAvailable: overallStats.totalResellerAvailable,
          breakdown: {
            damageRepair: overallStats.totalDamageRepair,
            centerReturn: overallStats.totalCenterReturn,
            directPurchase: overallStats.totalDirectPurchase
          },
          percentage: {
            damageRepair: overallStats.totalResellerAvailable > 0 ? 
              Math.round((overallStats.totalDamageRepair / overallStats.totalResellerAvailable) * 100) : 0,
            centerReturn: overallStats.totalResellerAvailable > 0 ? 
              Math.round((overallStats.totalCenterReturn / overallStats.totalResellerAvailable) * 100) : 0,
            directPurchase: overallStats.totalResellerAvailable > 0 ? 
              Math.round((overallStats.totalDirectPurchase / overallStats.totalResellerAvailable) * 100) : 0
          }
        },
        requestsWithResellerStock: overallStats.requestsWithReseller,
        totalRequestsWithReseller: overallStats.totalRequests
      }
    });
  } catch (error) {
    console.error("Error retrieving stock requests:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving stock requests",
      error: error.message,
    });
  }
};

export const getStockRequestById = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["indent_all_center", "indent_own_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. indent_own_center or indent_all_center permission required.",
      });
    }

    const { id } = req.params;

    const stockRequest = await StockRequest.findById(id)
      .populate("warehouse", "_id centerName centerCode centerType email addressLine1 addressLine2 city state")
      .populate({
        path: "center",
        select: "_id centerName centerCode centerType email addressLine1 addressLine2 city state",
        populate: [
          {
            path: "reseller",
            select: "_id businessName contactNumber name mobile email gstNumber panNumber address1 address2 city state"
          },
          {
            path: "area",
            select: "_id areaName"
          }
        ]
      })
      .populate(
        "products.product",
        "_id productTitle productCode salePrice trackSerialNumber"
      )
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("approvalInfo.warehouseChallanApprovedBy","_id fullName email" )
      .populate("approvalInfo.centerChallanApprovedBy","_id fullName email" )
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.completedBy", "_id fullName email")
      .populate("incompleteInfo.incompleteBy", "_id fullName email") 
      .populate("rejectionInfo.rejectedBy", "_id fullName email")
      .lean();

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
          "Access denied. You can only view stock requests from your own center.",
      });
    }

    const productIds = stockRequest.products.map((p) => p.product._id);

    const centerStock = await CenterStock.aggregate([
      {
        $match: {
          center: stockRequest.center._id,
          product: { $in: productIds },
        },
      },
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

    const outletStockMap = await getOutletStockForRequests(
      stockRequest.warehouse._id,
      productIds
    );

    const ResellerStock = mongoose.model("ResellerStock");
    const resellerId = stockRequest.center?.reseller?._id;
    
    let resellerStockMap = new Map();
    
    if (resellerId) {
      const resellerStocks = await ResellerStock.find({
        reseller: resellerId,
        product: { $in: productIds }
      }).select("product availableQuantity totalQuantity consumedQuantity serialNumbers");
      
      resellerStocks.forEach((stock) => {
        const availableSerials = stock.serialNumbers
          .filter(sn => sn.status === "available")
          .map(sn => sn.serialNumber);
        
        resellerStockMap.set(stock.product.toString(), {
          totalQuantity: stock.totalQuantity,
          availableQuantity: stock.availableQuantity,
          consumedQuantity: stock.consumedQuantity,
          damagedQuantity: stock.damagedQuantity,
          repairQuantity: stock.repairQuantity,
          hasSerialNumbers: stock.serialNumbers.length > 0,
          availableSerials: availableSerials,
          availableSerialsCount: availableSerials.length
        });
      });
    }

    const centerStockDetails = await CenterStock.find({
      center: stockRequest.center._id,
      product: { $in: productIds }
    }).select("product serialNumbers");

    const centerSerialNumbersMap = new Map();
    centerStockDetails.forEach(stock => {
      const availableSerials = stock.serialNumbers
        .filter(sn => sn.status === "available")
        .map(sn => sn.serialNumber);
      
      centerSerialNumbersMap.set(stock.product.toString(), {
        hasSerialNumbers: stock.serialNumbers.length > 0,
        availableSerials: availableSerials,
        availableSerialsCount: availableSerials.length,
        allSerials: stock.serialNumbers
      });
    });

    const productsWithEnhancedData = stockRequest.products.map((product) => {
      const productId = product.product._id.toString();
      const stockInfo = centerStockMap[productId] || {
        totalQuantity: 0,
        availableQuantity: 0,
        consumedQuantity: 0,
        inTransitQuantity: 0,
      };

      const outletStock = outletStockMap.get(productId) || {
        totalQuantity: 0,
        availableQuantity: 0,
        inTransitQuantity: 0,
      };

      const resellerStock = resellerStockMap.get(productId) || {
        totalQuantity: 0,
        availableQuantity: 0,
        consumedQuantity: 0,
        damagedQuantity: 0,
        repairQuantity: 0,
        availableSerials: [],
        availableSerialsCount: 0
      };

      const centerSerials = centerSerialNumbersMap.get(productId) || {
        hasSerialNumbers: false,
        availableSerials: [],
        availableSerialsCount: 0,
        allSerials: []
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
          availableSerials: outletStock.availableSerials || []
        },
        centerStockSerials: {
          hasSerialNumbers: centerSerials.hasSerialNumbers,
          availableSerials: centerSerials.availableSerials,
          availableSerialsCount: centerSerials.availableSerialsCount,
          allSerials: centerSerials.allSerials
        },
        resellerStock: {
          totalQuantity: resellerStock.totalQuantity,
          availableQuantity: resellerStock.availableQuantity,
          consumedQuantity: resellerStock.consumedQuantity,
          damagedQuantity: resellerStock.damagedQuantity,
          repairQuantity: resellerStock.repairQuantity,
          hasSerialNumbers: resellerStock.hasSerialNumbers,
          availableSerials: resellerStock.availableSerials,
          availableSerialsCount: resellerStock.availableSerialsCount
        },
        approvedSerials: product.approvedSerials || [],
        serialNumbers: product.serialNumbers || [],
        transferredSerials: product.transferredSerials || [],
        serialSummary: {
          approvedCount: product.approvedSerials?.length || 0,
          transferredCount: product.transferredSerials?.length || 0,
          requiresSerialNumbers: product.product.trackSerialNumber === "Yes",
          centerAvailableSerials: centerSerials.availableSerialsCount,
          resellerAvailableSerials: resellerStock.availableSerialsCount
        },
      };
    });

    const totalCenterAvailable = productsWithEnhancedData.reduce(
      (sum, product) => sum + product.centerStockQuantity, 0
    );
    
    const totalResellerAvailable = productsWithEnhancedData.reduce(
      (sum, product) => sum + product.resellerStock.availableQuantity, 0
    );
    
    const totalOutletAvailable = productsWithEnhancedData.reduce(
      (sum, product) => sum + product.outletStock.availableQuantity, 0
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
        resellerId: resellerId,
        centerName: stockRequest.center?.centerName || "N/A"
      }
    };

    res.status(200).json({
      success: true,
      message: "Stock request retrieved successfully",
      data: stockRequestWithEnhancedData,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock request ID",
      });
    }

    console.error("Error retrieving stock request:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving stock request",
      error: error.message,
    });
  }
};

export const updateStockRequest = async (req, res) => {
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
    const {
      warehouse,
      center,
      remark,
      products,
      status,
      approvalInfo,
      shippingInfo,
      receivingInfo,
      completionInfo,
      orderNumber,
      rejectionReason, 
    } = req.body;

    const existingRequest = await StockRequest.findById(id);
    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(existingRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only manage stock requests from your own center.",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const updateData = {
      updatedBy: userId,
      ...(warehouse && { warehouse }),
      ...(center && { center }),
      ...(remark !== undefined && { remark }),
      ...(status && { status }),
      ...(orderNumber && { orderNumber: orderNumber.trim() }),
      ...(approvalInfo && {
        approvalInfo: { ...existingRequest.approvalInfo, ...approvalInfo },
      }),
      ...(shippingInfo && {
        shippingInfo: { ...existingRequest.shippingInfo, ...shippingInfo },
      }),
      ...(receivingInfo && {
        receivingInfo: { ...existingRequest.receivingInfo, ...receivingInfo },
      }),
      ...(completionInfo && {
        completionInfo: {
          ...existingRequest.completionInfo,
          ...completionInfo,
        },
      }),
    };

    if (status === "Rejected" && existingRequest.status !== "Rejected") {
      if (!rejectionReason || rejectionReason.trim() === '') {
        return res.status(400).json({
          success: false,
          message: "Rejection reason is required when rejecting a stock request",
        });
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
        updateData.products = existingRequest.products.map(
          (existingProduct, index) => {
            const newProduct = products.find(
              (p) => p.product.toString() === existingProduct.product.toString()
            );
            if (newProduct) {
              return {
                ...existingProduct.toObject(),
                quantity:
                  newProduct.quantity !== undefined
                    ? newProduct.quantity
                    : existingProduct.quantity,
                productRemark:
                  newProduct.productRemark !== undefined
                    ? newProduct.productRemark
                    : existingProduct.productRemark,
                // receivedQuantity is synchronized below through
                // syncReceivedQuantityChanges() so CenterStock never falls
                // out of sync with the request.
                receivedQuantity:
                  newProduct.receivedQuantity !== undefined
                    ? newProduct.receivedQuantity
                    : existingProduct.receivedQuantity,
                receivedRemark:
                  newProduct.receivedRemark !== undefined
                    ? newProduct.receivedRemark
                    : existingProduct.receivedRemark,

                approvedSerials:
                  newProduct.approvedSerials !== undefined
                    ? newProduct.approvedSerials
                    : existingProduct.approvedSerials,
              };
            }
            return existingProduct;
          }
        );
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

    // Keep CenterStock synchronized whenever this endpoint changes
    // receivedQuantity. completeStockRequest() is NOT affected because it
    // already performs the physical receipt transfer itself.
    if (updateData.products) {
      await syncReceivedQuantityChanges({
        stockRequest: existingRequest,
        nextProducts: updateData.products,
      });
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
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
    res.status(200).json({
      success: true,
      message: "Stock request updated successfully",
      data: updatedRequest,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock request ID",
      });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message:
          "Order number already exists. Please use a different order number.",
      });
    }

    console.error("Error updating stock request:", error);
    res.status(500).json({
      success: false,
      message: "Error updating stock request",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

async function revertStockForRejectedRequest(stockRequest) {
  try {
    const OutletStock = mongoose.model("OutletStock");
    const CenterStock = mongoose.model("CenterStock");

    for (const productItem of stockRequest.products) {
      const outletStock = await OutletStock.findOne({
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
          const serial = outletStock.serialNumbers.find(
            (sn) => sn.serialNumber === serialNumber
          );

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
            } 
            else if (serial.status === "transferred") {
              serial.status = "available";
              serial.currentLocation = stockRequest.warehouse;

              serial.transferHistory = serial.transferHistory.filter(
                (transfer) =>
                  transfer.toCenter?.toString() !== stockRequest.center.toString()
              );

              transferredSerials.push(serialNumber);
              revertedCount++;
              console.log(`✅ Reverted serial ${serialNumber} from TRANSFERRED to AVAILABLE`);
            }
            else if (serial.status === "available") {
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
            
            const centerStock = await CenterStock.findOne({
              center: stockRequest.center,
              product: productItem.product,
            });

            if (centerStock) {
              const serialsToRemove = transferredSerials.filter(serial => 
                centerStock.serialNumbers.some(sn => sn.serialNumber === serial)
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
      } 
      else if (productItem.approvedQuantity && productItem.approvedQuantity > 0) {
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
          const centerStock = await CenterStock.findOne({
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
    
  } catch (error) {
    console.error("❌ Error reverting stock for rejected request:", error);
    throw new Error(`Failed to revert stock: ${error.message}`);
  }
}

export const deleteStockRequest = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["delete_indent_all_center", "delete_indent_own_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. delete_indent_own_center or delete_indent_all_center permission required.",
      });
    }

    const { id } = req.params;

    const stockRequest = await StockRequest.findById(id);

    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (
      permissions.delete_indent_own_center &&
      !permissions.delete_indent_all_center &&
      userCenter
    ) {
      const userCenterId = userCenter._id || userCenter;
      const requestCenterId = stockRequest.center._id || stockRequest.center;
      if (userCenterId.toString() !== requestCenterId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only delete stock requests from your own center.",
        });
      }
    }

    if (
      !["Submitted", "Incompleted", "Draft", "Completed", "Confirmed"].includes(
        stockRequest.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Only Submitted, Incompleted, Draft, Confirmed and Completed stock requests can be deleted",
      });
    }

    await StockRequest.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Stock request deleted successfully",
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock request ID",
      });
    }

    console.error("Error deleting stock request:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting stock request",
      error: error.message,
    });
  }
};

export const validateSerialNumbers = async (req, res) => {
  try {
    const { id } = req.params;
    const { productApprovals } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    const validationResults = await stockRequest.validateSerialNumbers(
      productApprovals
    );

    const hasErrors = validationResults.some((result) => !result.valid);

    res.status(200).json({
      success: true,
      message: hasErrors
        ? "Some serial numbers validation failed"
        : "All serial numbers are valid",
      data: validationResults,
      isValid: !hasErrors,
    });
  } catch (error) {
    console.error("Error validating serial numbers:", error);
    res.status(500).json({
      success: false,
      message: "Error validating serial numbers",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const approveStockRequest = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["stock_transfer_approve_from_outlet", "manage_indent"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. stock_transfer_approve_from_outlet or manage_indent permission required.",
      });
    }

    const { id } = req.params;
    const { productApprovals } = req.body;

    const stockRequest = await StockRequest.findById(id)
      .populate("center", "reseller centerType centerName centerCode")
      .populate("warehouse", "centerType centerName centerCode");

    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only approve stock requests from your own center.",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const resellerId = stockRequest.center?.reseller?._id || stockRequest.center?.reseller;
    const centerType = stockRequest.center?.centerType;

    if (centerType === "Center" && !resellerId) {
      return res.status(400).json({
        success: false,
        message: `Center "${stockRequest.center?.centerName || stockRequest.center}" is of type "Center" but does not have an associated reseller. Please update the center information.`,
        centerId: stockRequest.center?._id,
        centerName: stockRequest.center?.centerName,
      });
    }

    const ResellerStock = mongoose.model("ResellerStock");
    const OutletStock = mongoose.model("OutletStock");
    const Product = mongoose.model("Product");

    if (productApprovals && productApprovals.length > 0) {
      for (const approval of productApprovals) {
        const productItem = stockRequest.products.find(
          (p) => p.product.toString() === approval.productId.toString()
        );

        if (!productItem) {
          return res.status(400).json({
            success: false,
            message: `Product ${approval.productId} not found in stock request`,
          });
        }

        if (approval.approvedQuantity === undefined || approval.approvedQuantity === null) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity is required for product ${productItem.product}`,
          });
        }

        if (typeof approval.approvedQuantity !== "number" || isNaN(approval.approvedQuantity)) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity must be a valid number for product ${productItem.product}`,
          });
        }

        if (approval.approvedQuantity < 0) {
          return res.status(400).json({
            success: false,
            message: `Approved quantity cannot be negative for product ${productItem.product}`,
          });
        }

        if (approval.approvedQuantity === 0 && (!approval.approvedRemark || approval.approvedRemark.trim() === "")) {
          return res.status(400).json({
            success: false,
            message: `Approval remark is required when approved quantity is zero for product ${productItem.product}`,
          });
        }

        const productDoc = await Product.findById(approval.productId);
        if (!productDoc) {
          return res.status(400).json({
            success: false,
            message: `Product document not found for ID ${approval.productId}`,
          });
        }

        const tracksSerialNumbers = productDoc.trackSerialNumber === "Yes";

        let resellerAvailable = 0;
        let outletAvailable = 0;
        let hasResellerStock = false;

        if (resellerId) {
          const resellerStock = await ResellerStock.findOne({
            reseller: resellerId,
            product: approval.productId,
          });
          if (resellerStock) {
            resellerAvailable = resellerStock.availableQuantity || 0;
            hasResellerStock = true;
          }
        }

        const outletStockDoc = await OutletStock.findOne({
          outlet: stockRequest.warehouse,
          product: approval.productId,
        });
        if (outletStockDoc) {
          outletAvailable = outletStockDoc.availableQuantity || 0;
        }

        let fromResellerQty = 0;
        let fromOutletQty = 0;
        let fromResellerSerials = [];
        let fromOutletSerials = [];

        if (tracksSerialNumbers && approval.approvedSerials && approval.approvedSerials.length > 0) {
          if (approval.approvedSerials.length !== approval.approvedQuantity) {
            return res.status(400).json({
              success: false,
              message: `Number of serial numbers (${approval.approvedSerials.length}) must match approved quantity (${approval.approvedQuantity}) for product ${productDoc.productTitle}`,
            });
          }

          const serials = approval.approvedSerials;

          if (hasResellerStock && resellerAvailable > 0) {
            const resellerStockDoc = await ResellerStock.findOne({
              reseller: resellerId,
              product: approval.productId,
            });

            if (resellerStockDoc) {
              for (const serialNumber of serials) {
                const serial = resellerStockDoc.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber && sn.status === "available"
                );
                if (serial) {
                  fromResellerSerials.push(serialNumber);
                }
              }
            }
          }

          fromOutletSerials = serials.filter(
            (sn) => !fromResellerSerials.includes(sn)
          );

          fromResellerQty = fromResellerSerials.length;
          fromOutletQty = fromOutletSerials.length;

          if (fromOutletQty > outletAvailable) {
            return res.status(400).json({
              success: false,
              message: `Insufficient outlet stock for product "${productDoc.productTitle}". Outlet available: ${outletAvailable}, required from outlet: ${fromOutletQty}`,
            });
          }

          if (fromResellerSerials.length > 0 && hasResellerStock) {
            const resellerStockDoc = await ResellerStock.findOne({
              reseller: resellerId,
              product: approval.productId,
            });

            for (const serialNumber of fromResellerSerials) {
              const serial = resellerStockDoc?.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber && sn.status === "available"
              );
              if (!serial) {
                return res.status(400).json({
                  success: false,
                  message: `Serial number ${serialNumber} is not available in reseller stock for product "${productDoc.productTitle}"`,
                });
              }
            }
          }

          if (fromOutletSerials.length > 0 && outletStockDoc) {
            for (const serialNumber of fromOutletSerials) {
              const serial = outletStockDoc.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber && sn.status === "available"
              );
              if (!serial) {
                return res.status(400).json({
                  success: false,
                  message: `Serial number ${serialNumber} is not available in outlet stock for product "${productDoc.productTitle}"`,
                });
              }
            }
          }
        } else {
          if (approval.approvedQuantity > 0) {
            fromResellerQty = Math.min(approval.approvedQuantity, resellerAvailable);
            const remaining = approval.approvedQuantity - fromResellerQty;

            if (remaining > outletAvailable) {
              return res.status(400).json({
                success: false,
                message: `Insufficient stock for product "${productDoc.productTitle}". ` +
                  `Reseller available: ${resellerAvailable}, Outlet available: ${outletAvailable}, ` +
                  `Total approved: ${approval.approvedQuantity}, Total available: ${resellerAvailable + outletAvailable}`,
              });
            }

            fromOutletQty = remaining;
          }
        }

        if (fromResellerQty + fromOutletQty !== approval.approvedQuantity) {
          return res.status(400).json({
            success: false,
            message: `Source breakdown mismatch for product "${productDoc.productTitle}". ` +
              `Expected ${approval.approvedQuantity}, got Reseller: ${fromResellerQty} + Outlet: ${fromOutletQty}`,
          });
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

      for (const approval of productApprovals) {
        if (approval.approvedQuantity > 0 && approval.sourceBreakdown.fromOutlet.quantity > 0) {
          const outletStock = await OutletStock.findOne({
            outlet: stockRequest.warehouse,
            product: approval.productId,
          });

          const outletQty = approval.sourceBreakdown.fromOutlet.quantity;
          const outletSerials = approval.sourceBreakdown.fromOutlet.serials;

          if (!outletStock) {
            return res.status(400).json({
              success: false,
              message: `Outlet stock record not found for product ${approval.productId}`,
            });
          }

          if (outletStock.availableQuantity < outletQty) {
            return res.status(400).json({
              success: false,
              message: `Outlet stock changed! Available now: ${outletStock.availableQuantity}, Required: ${outletQty}. Please retry.`,
            });
          }

          if (outletSerials.length > 0) {
            for (const serialNumber of outletSerials) {
              const serial = outletStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );

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
              } else {
                return res.status(400).json({
                  success: false,
                  message: `Serial number ${serialNumber} is no longer available in outlet stock`,
                });
              }
            }

            outletStock.availableQuantity -= outletSerials.length;
            outletStock.inTransitQuantity += outletSerials.length;
          } else {
            const updateResult = await OutletStock.updateOne(
              {
                _id: outletStock._id,
                availableQuantity: { $gte: outletQty }
              },
              {
                $inc: {
                  availableQuantity: -outletQty,
                  inTransitQuantity: outletQty
                }
              }
            );

            if (updateResult.modifiedCount === 0) {
              return res.status(409).json({
                success: false,
                message: `Stock changed during approval for product. Please retry.`,
              });
            }
            
            continue;
          }
          
          await outletStock.save();
        }

        if (approval.sourceBreakdown.fromReseller.quantity > 0 && resellerId) {
          const resellerStock = await ResellerStock.findOne({
            reseller: resellerId,
            product: approval.productId,
          });

          const resellerQty = approval.sourceBreakdown.fromReseller.quantity;
          const resellerSerials = approval.sourceBreakdown.fromReseller.serials;

          if (!resellerStock) {
            return res.status(400).json({
              success: false,
              message: `Reseller stock record not found for product ${approval.productId}`,
            });
          }

          if (resellerStock.availableQuantity < resellerQty) {
            return res.status(400).json({
              success: false,
              message: `Reseller stock changed! Available now: ${resellerStock.availableQuantity}, Required: ${resellerQty}. Please retry.`,
            });
          }

          if (resellerSerials.length > 0) {
            for (const serialNumber of resellerSerials) {
              const serial = resellerStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );

              if (serial && serial.status === "available") {
                serial.status = "consumed";
                serial.currentLocation = stockRequest.center;
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
                return res.status(400).json({
                  success: false,
                  message: `Serial number ${serialNumber} is no longer available in reseller stock`,
                });
              }
            }

            resellerStock.availableQuantity -= resellerSerials.length;
            resellerStock.consumedQuantity += resellerSerials.length;
          } else {
            const updateResult = await ResellerStock.updateOne(
              {
                _id: resellerStock._id,
                availableQuantity: { $gte: resellerQty }
              },
              {
                $inc: {
                  availableQuantity: -resellerQty,
                  consumedQuantity: resellerQty
                }
              }
            );

            if (updateResult.modifiedCount === 0) {
              return res.status(409).json({
                success: false,
                message: `Reseller stock changed during approval. Please retry.`,
              });
            }
            continue;
          }

          await resellerStock.save();
        }
      }
    }

    const updatedProducts = stockRequest.products.map((productItem) => {
      const approval = productApprovals?.find(
        (pa) => pa.productId.toString() === productItem.product.toString()
      );

      if (approval) {
        return {
          ...productItem.toObject(),
          approvedQuantity: approval.approvedQuantity,
          approvedRemark: approval.approvedRemark || "",
          approvedSerials: approval.approvedSerials || [],
          sourceBreakdown: approval.sourceBreakdown || {
            fromReseller: { quantity: 0, serials: [] },
            fromOutlet: { quantity: 0, serials: [] },
            totalApproved: 0,
          },
        };
      }
      return productItem;
    });

    stockRequest.products = updatedProducts;
    await stockRequest.save();

    const updatedRequest = await stockRequest.approveRequest(
      userId,
      productApprovals
    );

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Stock request approved successfully",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error approving stock request:", error);

    if (
      error.message.includes("Number of serial numbers") ||
      error.message.includes("Duplicate serial numbers") ||
      error.message.includes("serial numbers not available") ||
      error.message.includes("Approved quantity") ||
      error.message.includes("Serial numbers are required") ||
      error.message.includes("Serial numbers should not be provided") ||
      error.message.includes("Approved quantity is required") ||
      error.message.includes("Approved quantity must be a valid number") ||
      error.message.includes("Approved quantity cannot be negative") ||
      error.message.includes("Approval remark is required") ||
      error.message.includes("No stock available") ||
      error.message.includes("Insufficient stock") ||
      error.message.includes("Stock changed")
    ) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: error.message,
      });
    }

    if (
      error.code === 11000 &&
      error.keyPattern &&
      error.keyPattern.challanNo
    ) {
      return res.status(400).json({
        success: false,
        message: "Duplicate challan number generated. Please try again.",
        error: "Challan number conflict",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error approving stock request",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const shipStockRequest = async (req, res) => {
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
    const {
      shippedDate,
      expectedDeliveryDate,
      shipmentDetails,
      shipmentRemark,
      documents,
    } = req.body;

    const stockRequest = await StockRequest.findById(id);
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
          "Access denied. You can only ship stock requests from your own center.",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const shippingDetails = {
      shippedDate: new Date(shippedDate),
      ...(expectedDeliveryDate && {
        expectedDeliveryDate: new Date(expectedDeliveryDate),
      }),
      ...(shipmentDetails && { shipmentDetails }),
      ...(shipmentRemark && { shipmentRemark }),
      ...(documents && {
        documents: Array.isArray(documents) ? documents : [documents],
      }),
    };

    const updatedRequest = await stockRequest.shipRequest(
      userId,
      shippingDetails
    );

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Stock request shipped successfully",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error shipping stock request:", error);
    res.status(500).json({
      success: false,
      message: "Error shipping stock request",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const updateShippingInfo = async (req, res) => {
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
    const {
      shippedDate,
      expectedDeliveryDate,
      shipmentDetails,
      shipmentRemark,
      documents,
    } = req.body;

    const stockRequest = await StockRequest.findById(id);
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
          "Access denied. You can only update shipping info for stock requests from your own center.",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const shippingDetails = {
      ...(shippedDate && { shippedDate: new Date(shippedDate) }),
      ...(expectedDeliveryDate && {
        expectedDeliveryDate: new Date(expectedDeliveryDate),
      }),
      ...(shipmentDetails && { shipmentDetails }),
      ...(shipmentRemark && { shipmentRemark }),
      ...(documents && {
        documents: Array.isArray(documents) ? documents : [documents],
      }),
    };

    const updatedRequest = await stockRequest.updateShippingInfo(
      shippingDetails
    );

    updatedRequest.updatedBy = userId;
    await updatedRequest.save();

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Shipping information updated successfully",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error updating shipping information:", error);
    res.status(500).json({
      success: false,
      message: "Error updating shipping information",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const rejectShipment = async (req, res) => {
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

    const stockRequest = await StockRequest.findById(id);
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
          "Access denied. You can only reject shipments for stock requests from your own center.",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const updatedRequest = await stockRequest.rejectShipment(userId);

    updatedRequest.updatedBy = userId;
    await updatedRequest.save();

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate(
        "shippingInfo.shipmentRejected.rejectedBy",
        "_id fullName email"
      )
      .populate("updatedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message:
        "Shipment rejected successfully. Shipping details cleared and status reverted to Confirmed.",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error rejecting shipment:", error);
    res.status(500).json({
      success: false,
      message: "Error rejecting shipment",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const markAsIncomplete = async (req, res) => {
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
        message: "Access denied. You can only mark stock requests from your own center as incomplete.",
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
          (p) => p.product.toString() === receivedProduct.productId.toString()
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
          const productDoc = await Product.findById(receivedProduct.productId);
          const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";
          
          const sourceBreakdown = productItem.sourceBreakdown || {
            fromReseller: { quantity: 0, serials: [] },
            fromOutlet: { quantity: 0, serials: [] }
          };

          const resellerQuantity = sourceBreakdown.fromReseller.quantity || 0;
          
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
                if (tracksSerialNumbers && sourceBreakdown.fromReseller.serials) {
                  const serialsToRestore = sourceBreakdown.fromReseller.serials.slice(
                    receivedQuantity, 
                    receivedQuantity + resellerRestoreQuantity
                  );

                  for (const serialNumber of serialsToRestore) {
                    const serial = resellerStock.serialNumbers.find(
                      sn => sn.serialNumber === serialNumber
                    );

                    if (serial && serial.status === "consumed") {
                      serial.status = "available";
                      serial.consumedDate = null;
                      serial.consumedBy = null;
                      serial.currentLocation = null;
                      
                      serial.transferHistory = serial.transferHistory.filter(
                        th => th.referenceId?.toString() !== stockRequest._id.toString()
                      );
                      
                      console.log(`[DEBUG] Restored reseller serial ${serialNumber}`);
                    }
                  }

                  resellerStock.availableQuantity += serialsToRestore.length;
                  resellerStock.consumedQuantity -= serialsToRestore.length;
                } else {
                  resellerStock.availableQuantity += resellerRestoreQuantity;
                  resellerStock.consumedQuantity -= resellerRestoreQuantity;
                }

                await resellerStock.save();
                console.log(`[DEBUG] Restored ${resellerRestoreQuantity} units to reseller stock`);
              }
            }
          }

          const outletQuantity = sourceBreakdown.fromOutlet.quantity || 0;
          const outletRestoreQuantity = Math.min(quantityToRestore, outletQuantity);
          
          if (outletRestoreQuantity > 0) {
            const outletStock = await OutletStock.findOne({
              outlet: stockRequest.warehouse,
              product: receivedProduct.productId,
            });

            if (outletStock) {
              if (tracksSerialNumbers && sourceBreakdown.fromOutlet.serials) {
                const serialsToRestore = sourceBreakdown.fromOutlet.serials.slice(
                  receivedQuantity,
                  receivedQuantity + outletRestoreQuantity
                );

                for (const serialNumber of serialsToRestore) {
                  const serial = outletStock.serialNumbers.find(
                    sn => sn.serialNumber === serialNumber
                  );

                  if (serial && serial.status === "in_transit") {
                    serial.status = "available";
                    serial.currentLocation = stockRequest.warehouse;
                    
                    if (serial.transferHistory.length > 0) {
                      const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
                      if (lastTransfer.status === "in_transit") {
                        serial.transferHistory.pop();
                      }
                    }
                    
                    console.log(`[DEBUG] Restored outlet serial ${serialNumber}`);
                  }
                }

                outletStock.availableQuantity += serialsToRestore.length;
                outletStock.inTransitQuantity -= serialsToRestore.length;
              } else {
                outletStock.availableQuantity += outletRestoreQuantity;
                outletStock.inTransitQuantity -= outletRestoreQuantity;
              }

              await outletStock.save();
              console.log(`[DEBUG] Restored ${outletRestoreQuantity} units to outlet stock`);
            }
          }
        }
      }
    }

    if (receivedProducts && Array.isArray(receivedProducts)) {
      stockRequest.products = stockRequest.products.map((productItem) => {
        const receivedProduct = receivedProducts.find(
          (rp) => rp.productId.toString() === productItem.product.toString()
        );

        if (receivedProduct) {
          return {
            ...productItem.toObject(),
            receivedQuantity: receivedProduct.receivedQuantity || 0,
            receivedRemark: receivedProduct.receivedRemark || "",
            receivedSerials: receivedProduct.receivedSerials || [],
          };
        }
        return productItem;
      });
    }

    const currentDate = new Date();

    stockRequest.status = "Incompleted";
    stockRequest.updatedBy = userId;
    
    stockRequest.incompleteInfo = {
      incompleteOn: currentDate,
      incompleteBy: userId,
      incompleteRemark: incompleteRemark || "",
      incompleteReceipts: receivedProducts ? receivedProducts.map(rp => ({
        productId: rp.productId,
        receivedQuantity: rp.receivedQuantity,
        receivedRemark: rp.receivedRemark || "",
        receivedSerials: rp.receivedSerials || [],
      })) : []
    };

    stockRequest.completionInfo = {
      completedOn: undefined,
      completedBy: undefined,
    };

    const updatedRequest = await stockRequest.save();

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("incompleteInfo.incompleteBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: "Stock request marked as incomplete successfully. Reseller stock restored for unreceived quantities.",
      data: populatedRequest,
    });
  } catch (error) {
    console.error("Error marking stock request as incomplete:", error);
    res.status(500).json({
      success: false,
      message: "Error marking stock request as incomplete",
      error: error.message,
    });
  }
};

export const completeIncompleteRequest = async (req, res) => {
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
    const { productApprovals, productReceipts } = req.body;

    console.log("\n🔥🔥🔥 ========== COMPLETE INCOMPLETE REQUEST ========== 🔥🔥🔥");
    console.log(`📅 Time: ${new Date().toISOString()}`);
    console.log(`🆔 Request ID: ${id}`);
    console.log(`📦 productApprovals:`, JSON.stringify(productApprovals, null, 2));
    console.log("🔥🔥🔥 ===================================================== 🔥🔥🔥\n");

    const stockRequest = await StockRequest.findById(id)
      .populate("center", "reseller")
      .populate("warehouse", "_id");

    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (stockRequest.status !== "Incompleted") {
      return res.status(400).json({
        success: false,
        message: "Only incomplete stock requests can be completed",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    if ((!productApprovals || productApprovals.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Product approvals are required",
      });
    }

    const Product = mongoose.model("Product");
    const ResellerStock = mongoose.model("ResellerStock");
    const OutletStock = mongoose.model("OutletStock");
    const CenterStock = mongoose.model("CenterStock");

    const resellerId = stockRequest.center?.reseller?._id;

    for (const approval of productApprovals) {
      const productItem = stockRequest.products.find(
        (p) => p.product.toString() === approval.productId.toString()
      );
      
      if (!productItem) {
        return res.status(400).json({
          success: false,
          message: `Product ${approval.productId} not found in stock request`,
        });
      }
      
      const sourceTotal = (productItem.sourceBreakdown?.fromReseller?.quantity || 0) + 
                          (productItem.sourceBreakdown?.fromOutlet?.quantity || 0);
      
      if (approval.approvedQuantity > sourceTotal) {
        console.log(`❌ VALIDATION FAILED: Product ${approval.productId}`);
        console.log(`   Requested: ${approval.approvedQuantity}`);
        console.log(`   Available in source breakdown: ${sourceTotal}`);
        
        return res.status(400).json({
          success: false,
          message: `Cannot approve ${approval.approvedQuantity} units. Only ${sourceTotal} units were originally approved.`,
          requested: approval.approvedQuantity,
          maxAllowed: sourceTotal,
          productId: approval.productId,
        });
      }
      
      console.log(`✅ VALIDATION PASSED: Product ${approval.productId}`);
    }

    for (const approval of productApprovals) {
      const productId = approval.productId;
      const newApprovedQuantity = approval.approvedQuantity;
      const approvedRemark = approval.approvedRemark || "";
      const approvedSerials = approval.approvedSerials || [];
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📦 PROCESSING PRODUCT: ${productId}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      
      const productItem = stockRequest.products.find(
        (p) => p.product.toString() === productId.toString()
      );
      
      if (!productItem) {
        console.log(`❌ Product not found, skipping`);
        continue;
      }
      
      const currentApprovedQuantity = productItem.approvedQuantity || 0;
      const quantityToTransfer = newApprovedQuantity;
      
      console.log(`📊 Current Approved: ${currentApprovedQuantity}`);
      console.log(`📊 New Approved: ${newApprovedQuantity}`);
      console.log(`📊 Quantity to Transfer: ${quantityToTransfer}`);
      
      const productDoc = await Product.findById(productId);
      if (!productDoc) {
        console.log(`❌ Product document not found`);
        continue;
      }
      
      const tracksSerialNumbers = productDoc.trackSerialNumber === "Yes";
      const sourceBreakdown = productItem.sourceBreakdown || {
        fromReseller: { quantity: 0, serials: [] },
        fromOutlet: { quantity: 0, serials: [] },
        totalApproved: currentApprovedQuantity
      };
      
      console.log(`💰 Source - Reseller: ${sourceBreakdown.fromReseller.quantity}, Outlet: ${sourceBreakdown.fromOutlet.quantity}`);
      
      let fromResellerTransfer = sourceBreakdown.fromReseller.quantity;
      let fromOutletTransfer = sourceBreakdown.fromOutlet.quantity;
      
      console.log(`📊 Distribution - Reseller: ${fromResellerTransfer}, Outlet: ${fromOutletTransfer}`);
      
      if (fromResellerTransfer > 0 && resellerId) {
        console.log(`\n🟣 RESELLER STOCK UPDATE`);
        
        const resellerStock = await ResellerStock.findOne({
          reseller: resellerId,
          product: productId,
        });

        if (!resellerStock) {
          return res.status(400).json({
            success: false,
            message: `Reseller stock not found for product ${productDoc.productTitle}`,
          });
        }

        console.log(`   BEFORE - Available: ${resellerStock.availableQuantity}, Consumed: ${resellerStock.consumedQuantity}`);
        
        if (tracksSerialNumbers) {
          const resellerSerials = sourceBreakdown.fromReseller.serials || [];
          const serialsToTransfer = resellerSerials.slice(0, fromResellerTransfer);
          
          for (const serialNumber of serialsToTransfer) {
            const serial = resellerStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
            if (serial && serial.status === "available") {
              serial.status = "consumed";
              serial.consumedDate = new Date();
              serial.consumedBy = userId;
              serial.currentLocation = stockRequest.center;
              serial.transferHistory.push({
                fromCenter: null,
                toCenter: stockRequest.center,
                transferDate: new Date(),
                transferType: "outbound_transfer",
                remark: "Incomplete request completion",
                transferredBy: userId,
                referenceId: stockRequest._id,
              });
              console.log(`     ✅ Serial ${serialNumber} consumed from RESELLER available stock`);
            }
          }
        }
        
        resellerStock.availableQuantity -= fromResellerTransfer;
        resellerStock.consumedQuantity += fromResellerTransfer;
        await resellerStock.save();
        
        console.log(`   AFTER - Available: ${resellerStock.availableQuantity}, Consumed: ${resellerStock.consumedQuantity}`);
        console.log(`   ✅ Deducted ${fromResellerTransfer} units from RESELLER AVAILABLE stock`);
      }
      
      if (fromOutletTransfer > 0) {
        console.log(`\n🟠 OUTLET STOCK UPDATE - DEDUCTING FROM AVAILABLE ONLY`);
        
        const outletStock = await OutletStock.findOne({
          outlet: stockRequest.warehouse,
          product: productId,
        });

        if (!outletStock) {
          return res.status(400).json({
            success: false,
            message: `Outlet stock not found for product ${productDoc.productTitle}`,
          });
        }

        console.log(`   BEFORE - Available: ${outletStock.availableQuantity}, InTransit: ${outletStock.inTransitQuantity}, Total: ${outletStock.totalQuantity}`);
        
        if (tracksSerialNumbers) {
          const outletSerials = sourceBreakdown.fromOutlet.serials || [];
          const serialsToTransfer = outletSerials.slice(0, fromOutletTransfer);
          
          for (const serialNumber of serialsToTransfer) {
            const serial = outletStock.serialNumbers.find(sn => sn.serialNumber === serialNumber);
            if (serial) {
              serial.status = "transferred";
              serial.currentLocation = stockRequest.center;
              serial.transferredDate = new Date();
              
              serial.transferHistory.push({
                fromCenter: stockRequest.warehouse,
                toCenter: stockRequest.center,
                transferDate: new Date(),
                transferType: "outlet_to_center",
                status: "completed",
                remark: "Incomplete request completion - final transfer",
                transferredBy: userId,
                referenceId: stockRequest._id,
              });
              console.log(`     ✅ Serial ${serialNumber} transferred from OUTLET available stock`);
            }
          }
          
          outletStock.availableQuantity -= fromOutletTransfer;
          outletStock.totalQuantity -= fromOutletTransfer;
          
          console.log(`     ✅ Deducted ${fromOutletTransfer} units from OUTLET AVAILABLE stock`);
        } else {
          console.log(`   📍 Non-Serialized: Need to transfer ${fromOutletTransfer} units`);
          
          if (outletStock.availableQuantity < fromOutletTransfer) {
            console.log(`   ❌ Insufficient available stock!`);
            return res.status(400).json({
              success: false,
              message: `Insufficient outlet available stock. Available: ${outletStock.availableQuantity}, Required: ${fromOutletTransfer}`,
            });
          }
          
          outletStock.availableQuantity -= fromOutletTransfer;
          outletStock.totalQuantity -= fromOutletTransfer;
          
          console.log(`     ✅ Deducted ${fromOutletTransfer} units from OUTLET AVAILABLE stock`);
          console.log(`     (in_transit stock remains unchanged: ${outletStock.inTransitQuantity})`);
        }
        
        await outletStock.save();
        console.log(`   AFTER - Available: ${outletStock.availableQuantity}, InTransit: ${outletStock.inTransitQuantity}, Total: ${outletStock.totalQuantity}`);
      }
      
      if (quantityToTransfer > 0) {
        console.log(`\n🟢 CENTER STOCK UPDATE`);
        
        let centerStock = await CenterStock.findOne({
          center: stockRequest.center,
          product: productId,
        });

        if (!centerStock) {
          centerStock = new CenterStock({
            center: stockRequest.center,
            product: productId,
            totalQuantity: 0,
            availableQuantity: 0,
            inTransitQuantity: 0,
            consumedQuantity: 0,
            serialNumbers: [],
          });
          console.log(`   📍 Created new center stock`);
        }

        console.log(`   BEFORE - Total: ${centerStock.totalQuantity}, Available: ${centerStock.availableQuantity}`);
        
        if (tracksSerialNumbers) {
          const resellerSerials = sourceBreakdown.fromReseller.serials || [];
          const outletSerials = sourceBreakdown.fromOutlet.serials || [];
          const serialsToAdd = [
            ...resellerSerials.slice(0, fromResellerTransfer),
            ...outletSerials.slice(0, fromOutletTransfer)
          ];
          
          for (const serialNumber of serialsToAdd) {
            const exists = centerStock.serialNumbers.some(sn => sn.serialNumber === serialNumber);
            if (!exists) {
              centerStock.serialNumbers.push({
                serialNumber: serialNumber,
                purchaseId: new mongoose.Types.ObjectId(),
                originalOutlet: stockRequest.warehouse,
                status: "available",
                currentLocation: stockRequest.center,
                transferHistory: [{
                  fromCenter: stockRequest.warehouse,
                  toCenter: stockRequest.center,
                  transferDate: new Date(),
                  transferType: "inbound_transfer",
                  remark: "Incomplete request completion",
                  referenceId: stockRequest._id,
                  transferredBy: userId,
                }],
              });
              centerStock.totalQuantity += 1;
              centerStock.availableQuantity += 1;
              console.log(`     ✅ Added serial ${serialNumber} to CENTER`);
            }
          }
        } else {
          centerStock.totalQuantity += quantityToTransfer;
          centerStock.availableQuantity += quantityToTransfer;
          console.log(`     ✅ Added ${quantityToTransfer} units to CENTER`);
        }
        
        await centerStock.save();
        console.log(`   AFTER - Total: ${centerStock.totalQuantity}, Available: ${centerStock.availableQuantity}`);
      }
      
      productItem.approvedQuantity = newApprovedQuantity;
      productItem.approvedRemark = approvedRemark;
      if (tracksSerialNumbers) productItem.approvedSerials = approvedSerials;
      productItem.receivedQuantity = quantityToTransfer;
      
      console.log(`✅ Product ${productDoc.productTitle} completed!`);
    }
    
    stockRequest.status = "Completed";
    stockRequest.receivingInfo = {
      receivedAt: new Date(),
      receivedBy: userId,
      receivedRemark: "Completed from incomplete request",
    };
    stockRequest.completionInfo = {
      completedOn: new Date(),
      completedBy: userId,
    };
    stockRequest.updatedBy = userId;

    const updatedRequest = await stockRequest.save();

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.completedBy", "_id fullName email");

    console.log("\n✅✅✅ INCOMPLETE REQUEST COMPLETED SUCCESSFULLY! ✅✅✅\n");

    res.status(200).json({
      success: true,
      message: "Incomplete stock request completed successfully",
      data: populatedRequest,
    });
    
  } catch (error) {
    console.error("\n🔴 ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Error completing incomplete stock request",
      error: error.message,
    });
  }
};

export const completeStockRequest = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["complete_indent", "manage_indent"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. complete_indent or manage_indent permission required.",
      });
    }

    const { id } = req.params;
    const { productReceipts, receivedRemark } = req.body;

    console.log(`[DEBUG] =========================================`);
    console.log(`[DEBUG] Completing stock request: ${id}`);
    console.log(`[DEBUG] Raw productReceipts from body:`, JSON.stringify(productReceipts, null, 2));
    console.log(`[DEBUG] =========================================`);

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    console.log(`[DEBUG] Stock request status: ${stockRequest.status}`);
    console.log(`[DEBUG] Stock request products before completion:`);
    stockRequest.products.forEach((p, idx) => {
      console.log(`[DEBUG]   Product ${idx + 1}:`);
      console.log(`[DEBUG]     - Product ID: ${p.product}`);
      console.log(`[DEBUG]     - Approved Quantity: ${p.approvedQuantity}`);
      console.log(`[DEBUG]     - Source Breakdown:`, JSON.stringify(p.sourceBreakdown, null, 2));
      if (p.approvedSerials && p.approvedSerials.length > 0) {
        console.log(`[DEBUG]     - Approved Serials: ${p.approvedSerials.join(', ')}`);
      }
    });

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. You can only complete stock requests from your own center.",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    if (
      !productReceipts ||
      !Array.isArray(productReceipts) ||
      productReceipts.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Product receipts are required",
      });
    }

    const Product = mongoose.model("Product");
    const ResellerStock = mongoose.model("ResellerStock");
    const OutletStock = mongoose.model("OutletStock");
    const CenterStock = mongoose.model("CenterStock");

    const productDocCache = new Map();

    for (const receipt of productReceipts) {
      if (!receipt.productId) continue;
      const key = receipt.productId.toString();
      if (!productDocCache.has(key)) {
        const productDoc = await Product.findById(receipt.productId);
        const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";
        productDocCache.set(key, { productDoc, tracksSerialNumbers });
        console.log(`[DEBUG] Cached product doc for ${key}: trackSerialNumber="${productDoc?.trackSerialNumber}", tracksSerialNumbers=${tracksSerialNumbers}`);
      }
    }

    for (const receipt of productReceipts) {
      if (!receipt.productId) {
        return res.status(400).json({
          success: false,
          message: "Product ID is required for each product receipt",
        });
      }

      if (
        receipt.receivedQuantity === undefined ||
        receipt.receivedQuantity === null
      ) {
        return res.status(400).json({
          success: false,
          message: `Received quantity is required for product ${receipt.productId}`,
        });
      }

      if (
        typeof receipt.receivedQuantity !== "number" ||
        isNaN(receipt.receivedQuantity)
      ) {
        return res.status(400).json({
          success: false,
          message: `Received quantity must be a valid number for product ${receipt.productId}`,
        });
      }

      if (receipt.receivedQuantity < 0) {
        return res.status(400).json({
          success: false,
          message: `Received quantity cannot be negative for product ${receipt.productId}`,
        });
      }

      if (!Number.isInteger(receipt.receivedQuantity)) {
        return res.status(400).json({
          success: false,
          message: `Received quantity must be an integer for product ${receipt.productId}`,
        });
      }

      const productItem = stockRequest.products.find(
        (p) => p.product.toString() === receipt.productId.toString()
      );

      if (!productItem) {
        return res.status(400).json({
          success: false,
          message: `Product ${receipt.productId} not found in stock request`,
        });
      }

      if (productItem.approvedQuantity === 0) {
        console.log(`[DEBUG] Skipping validation for product ${receipt.productId} - approved quantity is 0`);
        
        if (receipt.receivedQuantity > 0) {
          return res.status(400).json({
            success: false,
            message: `Cannot receive ${receipt.receivedQuantity} units for product ${receipt.productId} because approved quantity is 0.`,
          });
        }
        continue;
      }

      if (receipt.receivedQuantity > productItem.approvedQuantity) {
        return res.status(400).json({
          success: false,
          message: `❌ Received quantity (${receipt.receivedQuantity}) CANNOT exceed approved quantity (${productItem.approvedQuantity}) for product ${receipt.productId}`,
        });
      }

      if (receipt.receivedQuantity === 0 && productItem.approvedQuantity > 0) {
        return res.status(400).json({
          success: false,
          message: `❌ Cannot mark as COMPLETED with 0 received quantity for product ${receipt.productId}. Approved quantity is ${productItem.approvedQuantity}. Please receive the items or use INCOMPLETE endpoint.`,
        });
      }

      const { productDoc, tracksSerialNumbers } = productDocCache.get(receipt.productId.toString());

      console.log(`[DEBUG][VALIDATION] Product ${receipt.productId}:`);
      console.log(`[DEBUG][VALIDATION]   tracksSerialNumbers=${tracksSerialNumbers}`);
      console.log(`[DEBUG][VALIDATION]   receivedQuantity=${receipt.receivedQuantity}`);
      console.log(`[DEBUG][VALIDATION]   receivedSerials type=${typeof receipt.receivedSerials}, value=`, JSON.stringify(receipt.receivedSerials));

      if (tracksSerialNumbers) {
        if (!receipt.receivedSerials || receipt.receivedSerials.length === 0) {
          const stockProductItem = stockRequest.products.find(
            (p) => p.product.toString() === receipt.productId.toString()
          );
          
          if (stockProductItem && stockProductItem.approvedSerials && stockProductItem.approvedSerials.length > 0) {
            if (receipt.receivedQuantity === stockProductItem.approvedQuantity) {
              receipt.receivedSerials = [...stockProductItem.approvedSerials];
              console.log(`[DEBUG][AUTO-ASSIGN] Auto-assigned all ${receipt.receivedSerials.length} serials for product ${receipt.productId}`);
            } 
            else if (receipt.receivedQuantity < stockProductItem.approvedQuantity) {
              receipt.receivedSerials = stockProductItem.approvedSerials.slice(0, receipt.receivedQuantity);
              console.log(`[DEBUG][AUTO-ASSIGN] Auto-assigned ${receipt.receivedSerials.length} serials (partial) for product ${receipt.productId}`);
            }
            else {
              return res.status(400).json({
                success: false,
                message: `Received quantity (${receipt.receivedQuantity}) cannot exceed approved quantity (${stockProductItem.approvedQuantity}) for product ${productDoc.productTitle}`,
              });
            }
          } else {
            return res.status(400).json({
              success: false,
              message: `No approved serials found for product ${productDoc.productTitle}. Cannot auto-assign.`,
            });
          }
        }

        const receivedSerials = Array.isArray(receipt.receivedSerials)
          ? receipt.receivedSerials
          : [];

        if (receipt.receivedQuantity > 0) {
          if (receivedSerials.length !== receipt.receivedQuantity) {
            return res.status(400).json({
              success: false,
              message: `Number of received serials (${receivedSerials.length}) must match received quantity (${receipt.receivedQuantity}) for product ${productDoc.productTitle}`,
            });
          }

          if (receivedSerials.length > 0) {
            const uniqueSerials = new Set(receivedSerials);
            if (uniqueSerials.size !== receivedSerials.length) {
              return res.status(400).json({
                success: false,
                message: `Duplicate serial numbers found for product ${productDoc.productTitle}`,
              });
            }
          }
        } else {
          if (receivedSerials.length > 0) {
            return res.status(400).json({
              success: false,
              message: `Received serial numbers should not be provided when received quantity is zero for product ${productDoc.productTitle}`,
            });
          }
        }
      } else {
        if (receipt.receivedSerials && receipt.receivedSerials.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Received serial numbers should not be provided for product ${productDoc.productTitle} as it does not track serial numbers`,
          });
        }
      }
    }

    for (const receipt of productReceipts) {
      const productItem = stockRequest.products.find(
        (p) => p.product.toString() === receipt.productId.toString()
      );

      if (!productItem) {
        return res.status(400).json({
          success: false,
          message: `Product ${receipt.productId} not found in stock request`,
        });
      }

      if (productItem.approvedQuantity === 0) {
        console.log(`[DEBUG] Skipping processing for product ${receipt.productId} - approved quantity is 0`);
        continue;
      }

      const { productDoc, tracksSerialNumbers } = productDocCache.get(receipt.productId.toString());

      const sourceBreakdown = productItem.sourceBreakdown || {
        fromReseller: { quantity: 0, serials: [] },
        fromOutlet: { quantity: 0, serials: [] },
        totalApproved: productItem.approvedQuantity || 0
      };

      const totalApproved = sourceBreakdown.totalApproved || productItem.approvedQuantity || 0;
      const receivedCount = receipt.receivedQuantity;

      const receivedSerialsFromBody = Array.isArray(receipt.receivedSerials)
        ? receipt.receivedSerials
        : [];

      console.log(`\n[DEBUG] =========================================`);
      console.log(`[DEBUG] Processing product: ${receipt.productId}`);
      console.log(`[DEBUG] =========================================`);
      console.log(`[DEBUG] tracksSerialNumbers: ${tracksSerialNumbers}`);
      console.log(`[DEBUG] Total approved: ${totalApproved}`);
      console.log(`[DEBUG] Received count: ${receivedCount}`);
      console.log(`[DEBUG] receivedSerialsFromBody (${receivedSerialsFromBody.length}): ${receivedSerialsFromBody.join(', ') || 'none'}`);
      console.log(`[DEBUG] Source breakdown:`);
      console.log(`[DEBUG]   - From Reseller: ${sourceBreakdown.fromReseller.quantity} units${sourceBreakdown.fromReseller.serials?.length > 0 ? ` (${sourceBreakdown.fromReseller.serials.length} serials)` : ''}`);
      console.log(`[DEBUG]   - From Outlet: ${sourceBreakdown.fromOutlet.quantity} units${sourceBreakdown.fromOutlet.serials?.length > 0 ? ` (${sourceBreakdown.fromOutlet.serials.length} serials)` : ''}`);

      let fromResellerReceived = 0;
      let fromOutletReceived = 0;
      let serialsToReceive = [];
      let serialsToReturn = [];

      if (tracksSerialNumbers) {
        console.log(`[DEBUG] Product tracks serial numbers - using serialized distribution logic`);

        const allApprovedSerials = [
          ...(sourceBreakdown.fromReseller.serials || []),
          ...(sourceBreakdown.fromOutlet.serials || [])
        ];
        console.log(`[DEBUG] All approved serials (${allApprovedSerials.length}): ${allApprovedSerials.join(', ')}`);

        if (receivedCount === 0) {
          serialsToReceive = [];
          serialsToReturn = [...allApprovedSerials];
          fromResellerReceived = 0;
          fromOutletReceived = 0;

          console.log(`[DEBUG] Zero receipt - returning all ${serialsToReturn.length} serials`);
        } else {
          serialsToReceive = receivedSerialsFromBody;

          console.log(`[DEBUG] serialsToReceive (${serialsToReceive.length}): ${serialsToReceive.join(', ')}`);

          const invalidSerials = serialsToReceive.filter(
            (serial) => !allApprovedSerials.includes(serial)
          );
          if (invalidSerials.length > 0) {
            return res.status(400).json({
              success: false,
              message: `Invalid serial numbers received: ${invalidSerials.join(', ')}. These were not approved for this request.`,
            });
          }

          fromResellerReceived = serialsToReceive.filter((serial) =>
            sourceBreakdown.fromReseller.serials?.includes(serial)
          ).length;
          fromOutletReceived = serialsToReceive.filter((serial) =>
            sourceBreakdown.fromOutlet.serials?.includes(serial)
          ).length;

          serialsToReturn = allApprovedSerials.filter(
            (serial) => !serialsToReceive.includes(serial)
          );

          console.log(`[DEBUG] Serialized distribution:`);
          console.log(`[DEBUG]   - Received from Reseller: ${fromResellerReceived}`);
          console.log(`[DEBUG]   - Received from Outlet: ${fromOutletReceived}`);
          console.log(`[DEBUG]   - Returning: ${serialsToReturn.length} serials (${serialsToReturn.join(', ') || 'none'})`);
        }
      } else {
        console.log(`[DEBUG] Product does NOT track serial numbers - using quantity-based distribution`);

        const resellerRatio =
          totalApproved > 0
            ? sourceBreakdown.fromReseller.quantity / totalApproved
            : 0;
        fromResellerReceived = Math.round(receivedCount * resellerRatio);
        fromOutletReceived = receivedCount - fromResellerReceived;

        fromResellerReceived = Math.min(
          fromResellerReceived,
          sourceBreakdown.fromReseller.quantity
        );
        fromOutletReceived = Math.min(
          fromOutletReceived,
          sourceBreakdown.fromOutlet.quantity
        );

        let totalFromSources = fromResellerReceived + fromOutletReceived;
        if (totalFromSources !== receivedCount && totalFromSources < receivedCount) {
          const difference = receivedCount - totalFromSources;
          if (
            sourceBreakdown.fromOutlet.quantity - fromOutletReceived >= difference
          ) {
            fromOutletReceived += difference;
          } else if (
            sourceBreakdown.fromReseller.quantity - fromResellerReceived >=
            difference
          ) {
            fromResellerReceived += difference;
          }
        }

        console.log(`[DEBUG] Quantity-based distribution:`);
        console.log(`[DEBUG]   - From Reseller: ${fromResellerReceived} units`);
        console.log(`[DEBUG]   - From Outlet: ${fromOutletReceived} units`);
      }

      if (sourceBreakdown.fromOutlet.quantity > 0) {
        const outletStock = await OutletStock.findOne({
          outlet: stockRequest.warehouse,
          product: receipt.productId,
        });

        if (!outletStock) {
          return res.status(400).json({
            success: false,
            message: `No stock found in outlet for product ${receipt.productId}`,
          });
        }

        console.log(`\n[DEBUG] --- Outlet Stock Updates ---`);
        console.log(`[DEBUG] Before update:`);
        console.log(`[DEBUG]   Available: ${outletStock.availableQuantity}`);
        console.log(`[DEBUG]   InTransit: ${outletStock.inTransitQuantity}`);
        console.log(`[DEBUG]   Total: ${outletStock.totalQuantity}`);

        const outletSerials = sourceBreakdown.fromOutlet.serials || [];

        if (tracksSerialNumbers && outletSerials.length > 0) {
          const receivedOutletSerials = serialsToReceive.filter((serial) =>
            outletSerials.includes(serial)
          );

          let transferredCount = 0;

          if (receivedOutletSerials.length > 0) {
            console.log(`[DEBUG] Marking ${receivedOutletSerials.length} serials as transferred to center`);

            for (const serialNumber of receivedOutletSerials) {
              const serial = outletStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );

              if (serial) {
                console.log(`[DEBUG]     Serial ${serialNumber} status before: ${serial.status}`);
                
                if (serial.status === 'available') {
                  serial.status = 'transferred';
                  serial.currentLocation = stockRequest.center;
                  serial.transferredTo = stockRequest.center;
                  serial.transferDate = new Date();
                  
                  if (!serial.transferHistory) {
                    serial.transferHistory = [];
                  }
                  serial.transferHistory.push({
                    fromLocation: stockRequest.warehouse,
                    toLocation: stockRequest.center,
                    transferDate: new Date(),
                    transferType: 'outlet_to_center',
                    requestId: stockRequest._id
                  });
                  
                  transferredCount++;
                  console.log(`[DEBUG]     ✓ Serial ${serialNumber} was available, now transferred`);
                } else {
                  console.log(`[DEBUG]     ⚠ Serial ${serialNumber} has unexpected status: ${serial.status}`);
                }
              } else {
                console.log(`[DEBUG]     ❌ Serial ${serialNumber} not found in outlet stock`);
              }
            }
          }

          const returnedOutletSerials = serialsToReturn.filter((serial) =>
            outletSerials.includes(serial)
          );

          let returnedCount = 0;

          if (returnedOutletSerials.length > 0) {
            console.log(`[DEBUG] Returning ${returnedOutletSerials.length} serials back to available stock`);

            for (const serialNumber of returnedOutletSerials) {
              const serial = outletStock.serialNumbers.find(
                (sn) => sn.serialNumber === serialNumber
              );

              if (serial && (serial.status === 'transferred' || serial.status === 'in_transit')) {
                serial.status = 'available';
                serial.currentLocation = stockRequest.warehouse;
                serial.transferredTo = null;
                serial.transferDate = null;
                
                returnedCount++;
                console.log(`[DEBUG]     ✓ Serial ${serialNumber} reverted to available`);
              } else if (serial && serial.status === 'available') {
                console.log(`[DEBUG]     ⚠ Serial ${serialNumber} already available`);
              }
            }
          }

          outletStock.availableQuantity = Math.max(0, outletStock.availableQuantity - transferredCount + returnedCount);
          
          const actualInTransit = outletStock.serialNumbers.filter(
            sn => sn.status === 'transferred' && 
                  sn.currentLocation?.toString() !== stockRequest.warehouse.toString()
          ).length;
          
          outletStock.inTransitQuantity = actualInTransit;
          
          outletStock.totalQuantity = outletStock.serialNumbers.length;
          
          console.log(`[DEBUG] After outlet update:`);
          console.log(`[DEBUG]   Available: ${outletStock.availableQuantity}`);
          console.log(`[DEBUG]   InTransit: ${outletStock.inTransitQuantity}`);
          console.log(`[DEBUG]   Total: ${outletStock.totalQuantity}`);
          
        } else {
          const returnToOutlet = sourceBreakdown.fromOutlet.quantity - fromOutletReceived;

          if (fromOutletReceived > 0) {
            console.log(`[DEBUG] Transferring ${fromOutletReceived} units from outlet to center`);
          }

          outletStock.availableQuantity = Math.max(0, outletStock.availableQuantity - fromOutletReceived + (returnToOutlet > 0 ? returnToOutlet : 0));
          outletStock.totalQuantity = Math.max(0, outletStock.totalQuantity - fromOutletReceived);
          
          outletStock.inTransitQuantity = 0;

          console.log(`[DEBUG] After outlet update:`);
          console.log(`[DEBUG]   Available: ${outletStock.availableQuantity}`);
          console.log(`[DEBUG]   InTransit: ${outletStock.inTransitQuantity}`);
          console.log(`[DEBUG]   Total: ${outletStock.totalQuantity}`);
        }

        await outletStock.save();
      }

      if (sourceBreakdown.fromReseller.quantity > 0) {
        const resellerId =
          stockRequest.center?.reseller?._id || stockRequest.center?.reseller;
        if (resellerId) {
          const resellerStock = await ResellerStock.findOne({
            reseller: resellerId,
            product: receipt.productId,
          });

          if (resellerStock) {
            console.log(`\n[DEBUG] --- Reseller Stock Updates ---`);
            console.log(`[DEBUG] Before update:`);
            console.log(`[DEBUG]   Available: ${resellerStock.availableQuantity}`);
            console.log(`[DEBUG]   Consumed: ${resellerStock.consumedQuantity}`);

            const resellerSerials = sourceBreakdown.fromReseller.serials || [];

            if (tracksSerialNumbers && resellerSerials.length > 0) {
              const receivedResellerSerials = serialsToReceive.filter(
                (serial) => resellerSerials.includes(serial)
              );

              if (receivedResellerSerials.length > 0) {
                console.log(`[DEBUG] Confirming consumption of ${receivedResellerSerials.length} reseller serials`);

                for (const serialNumber of receivedResellerSerials) {
                  const serial = resellerStock.serialNumbers.find(
                    (sn) => sn.serialNumber === serialNumber
                  );

                  if (serial && serial.status === "available") {
                    serial.status = "consumed";
                    serial.consumedDate = new Date();
                    serial.consumedBy = userId;
                    console.log(`[DEBUG]     ✓ Serial ${serialNumber} marked as consumed`);
                  } else if (serial && serial.status === "consumed") {
                    console.log(`[DEBUG]     ✓ Serial ${serialNumber} already consumed`);
                  }
                }
              }

              const returnedResellerSerials = serialsToReturn.filter(
                (serial) => resellerSerials.includes(serial)
              );

              if (returnedResellerSerials.length > 0) {
                console.log(`[DEBUG] Returning ${returnedResellerSerials.length} reseller serials back to available`);

                for (const serialNumber of returnedResellerSerials) {
                  const serial = resellerStock.serialNumbers.find(
                    (sn) => sn.serialNumber === serialNumber
                  );

                  if (serial && serial.status === "consumed") {
                    serial.status = "available";
                    serial.consumedDate = undefined;
                    serial.consumedBy = undefined;
                    console.log(`[DEBUG]     ✓ Serial ${serialNumber} reverted to available`);
                  } else if (serial && serial.status === "available") {
                    console.log(`[DEBUG]     ✓ Serial ${serialNumber} already available`);
                  }
                }

                resellerStock.availableQuantity += returnedResellerSerials.length;
                resellerStock.consumedQuantity -= returnedResellerSerials.length;
              }
            } else {
              const returnToReseller =
                sourceBreakdown.fromReseller.quantity - fromResellerReceived;

              if (fromResellerReceived > 0) {
                console.log(`[DEBUG] Confirming consumption of ${fromResellerReceived} units from reseller`);
              }

              if (returnToReseller > 0) {
                console.log(`[DEBUG] Returning ${returnToReseller} units back to reseller available stock`);
                resellerStock.availableQuantity += returnToReseller;
                resellerStock.consumedQuantity -= returnToReseller;
              }
            }

            console.log(`[DEBUG] After reseller update:`);
            console.log(`[DEBUG]   Available: ${resellerStock.availableQuantity}`);
            console.log(`[DEBUG]   Consumed: ${resellerStock.consumedQuantity}`);

            await resellerStock.save();
          }
        }
      }

      if (receivedCount > 0) {
        console.log(`\n[DEBUG] --- Center Stock Updates ---`);

        let centerStock = await CenterStock.findOne({
          center: stockRequest.center,
          product: receipt.productId,
        });

        if (!centerStock) {
          centerStock = new CenterStock({
            center: stockRequest.center,
            product: receipt.productId,
            totalQuantity: 0,
            availableQuantity: 0,
            inTransitQuantity: 0,
            consumedQuantity: 0,
            serialNumbers: [],
          });
          console.log(`[DEBUG] Created new center stock record`);
        } else {
          console.log(`[DEBUG] Found existing center stock record`);
          console.log(`[DEBUG]   Before - Total: ${centerStock.totalQuantity}, Available: ${centerStock.availableQuantity}`);
        }

        if (tracksSerialNumbers && serialsToReceive.length > 0) {
          console.log(`[DEBUG] Adding ${serialsToReceive.length} serials to center stock`);

          let addedCount = 0;
          let reactivatedCount = 0;

          for (const serialNumber of serialsToReceive) {
            const existingSerialIndex = centerStock.serialNumbers.findIndex(
              (sn) => sn.serialNumber === serialNumber
            );

            if (existingSerialIndex !== -1) {
              const existingSerial =
                centerStock.serialNumbers[existingSerialIndex];

              if (
                existingSerial.status === "damaged" ||
                existingSerial.status === "damage_pending"
              ) {
                existingSerial.status = "available";
                existingSerial.currentLocation = stockRequest.center;

                existingSerial.transferHistory.push({
                  fromCenter: stockRequest.warehouse,
                  toCenter: stockRequest.center,
                  transferDate: new Date(),
                  transferType: "inbound_transfer",
                  remark: "Stock request completion - reactivated damaged stock",
                  referenceId: stockRequest._id,
                  transferredBy: userId,
                });

                reactivatedCount++;
                centerStock.availableQuantity += 1;
                console.log(`[DEBUG]     ✓ Reactivated damaged serial ${serialNumber}`);
              } else if (existingSerial.status === "available") {
                console.log(`[DEBUG]     ⚠ Serial ${serialNumber} already available in center stock`);
              }
            } else {
              let purchaseId = new mongoose.Types.ObjectId();
              let originalOutlet = stockRequest.warehouse;

              const outletStock = await OutletStock.findOne({
                outlet: stockRequest.warehouse,
                product: receipt.productId,
                "serialNumbers.serialNumber": serialNumber,
              });

              if (outletStock) {
                const outletSerial = outletStock.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );
                if (outletSerial && outletSerial.purchaseId) {
                  purchaseId = outletSerial.purchaseId;
                }
                if (outletSerial && outletSerial.originalOutlet) {
                  originalOutlet = outletSerial.originalOutlet;
                }
              }

              centerStock.serialNumbers.push({
                serialNumber: serialNumber,
                purchaseId: purchaseId,
                originalOutlet: originalOutlet,
                status: "available",
                currentLocation: stockRequest.center,
                transferHistory: [
                  {
                    fromCenter: stockRequest.warehouse,
                    toCenter: stockRequest.center,
                    transferDate: new Date(),
                    transferType: "inbound_transfer",
                    remark: "Stock request completion",
                    referenceId: stockRequest._id,
                    transferredBy: userId,
                  },
                ],
              });

              addedCount++;
              centerStock.totalQuantity += 1;
              centerStock.availableQuantity += 1;
              console.log(`[DEBUG]     ✓ Added new serial ${serialNumber}`);
            }
          }

          console.log(`[DEBUG] Summary: Added ${addedCount} new serials, reactivated ${reactivatedCount} damaged serials`);
        } else if (!tracksSerialNumbers && receivedCount > 0) {
          centerStock.totalQuantity += receivedCount;
          centerStock.availableQuantity += receivedCount;
          console.log(`[DEBUG] Added ${receivedCount} non-serialized units to center stock`);
        }

        console.log(`[DEBUG] After center update - Total: ${centerStock.totalQuantity}, Available: ${centerStock.availableQuantity}`);
        await centerStock.save();
      } else {
        console.log(`[DEBUG] No items received, skipping center stock update`);
      }

      productItem.receivedQuantity = receipt.receivedQuantity;
      productItem.receivedRemark = receipt.receivedRemark || "";

      if (tracksSerialNumbers && serialsToReceive.length > 0) {
        productItem.transferredSerials = serialsToReceive;
      }

      console.log(`[DEBUG] Product ${receipt.productId} processed successfully`);
      console.log(`[DEBUG]   Received: ${receipt.receivedQuantity}`);
      console.log(`[DEBUG]   From Reseller: ${fromResellerReceived}`);
      console.log(`[DEBUG]   From Outlet: ${fromOutletReceived}`);
      if (tracksSerialNumbers) {
        console.log(`[DEBUG]   Serials received: ${serialsToReceive.join(', ') || 'none'}`);
        console.log(`[DEBUG]   Serials returned: ${serialsToReturn.join(', ') || 'none'}`);
      }
    }

    stockRequest.status = "Completed";
    stockRequest.receivingInfo = {
      receivedAt: new Date(),
      receivedBy: userId,
      receivedRemark: receivedRemark || "",
    };
    stockRequest.completionInfo = {
      completedOn: new Date(),
      completedBy: userId,
    };
    stockRequest.updatedBy = userId;

    const updatedRequest = await stockRequest.save();

    const populatedRequest = await StockRequest.findById(updatedRequest._id)
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("completionInfo.completedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    console.log(`\n[DEBUG] =========================================`);
    console.log(`[DEBUG] Stock request ${id} completed successfully!`);
    console.log(`[DEBUG] =========================================\n`);

    res.status(200).json({
      success: true,
      message: `Stock request completed successfully. Received ${productReceipts.reduce(
        (sum, r) => sum + r.receivedQuantity,
        0
      )} units.`,
      data: populatedRequest,
    });
  } catch (error) {
    console.error("[ERROR] Error completing stock request:", error);
    console.error("[ERROR] Stack trace:", error.stack);

    if (
      error.message.includes("Insufficient stock") ||
      error.message.includes("serial numbers not available") ||
      error.message.includes("No serial numbers assigned") ||
      error.message.includes("Received quantity") ||
      error.message.includes("Product ID") ||
      error.message.includes("exceed approved quantity") ||
      error.message.includes("Cannot read properties of undefined")
    ) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: error.message,
      });
    }
    if (error.message.includes("Path `inTransitQuantity`")) {
      return res.status(400).json({
        success: false,
        message:
          "Stock quantity calculation error. Please check stock levels and try again.",
        error: error.message,
      });
    }
    res.status(500).json({
      success: false,
      message: "Error completing stock request",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const updateStockRequestStatus = async (req, res) => {
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
    const { status, ...additionalInfo } = req.body;

    const stockRequest = await StockRequest.findById(id);
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
          "Access denied. You can only update status for stock requests from your own center.",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const updateData = {
      status,
      updatedBy: userId,
    };

    const currentDate = new Date();

    switch (status) {
      case "Confirmed":
        if (additionalInfo.productApprovals) {
          const validationResults = await stockRequest.validateSerialNumbers(
            additionalInfo.productApprovals
          );
          const invalidResults = validationResults.filter(
            (result) => !result.valid
          );

          if (invalidResults.length > 0) {
            return res.status(400).json({
              success: false,
              message: "Serial number validation failed",
              validationErrors: invalidResults,
            });
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
          return res.status(400).json({
            success: false,
            message:
              "Product receipts are required when completing a stock request. Use completeStockRequest for the actual receipt operation.",
          });
        }

        /*
         * This endpoint historically changed receivedQuantity only, which
         * caused Usage Summary to show the purchase while CenterStock stayed
         * at zero.
         *
         * We now apply the exact receivedQuantity delta to CenterStock for
         * non-serialized products. Serialized products are rejected here
         * because changing their quantity without moving serialNumbers would
         * corrupt stock.
         */
        const nextProducts = stockRequest.products.map((productItem) => {
          const receipt = additionalInfo.productReceipts.find(
            (pr) =>
              pr.productId?.toString() === productItem.product?.toString()
          );

          if (!receipt) {
            return productItem.toObject();
          }

          const receivedQuantity = Number(receipt.receivedQuantity);

          if (!Number.isInteger(receivedQuantity) || receivedQuantity < 0) {
            throw new Error(
              `Received quantity must be a non-negative integer for product ${productItem.product}`
            );
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

        await syncReceivedQuantityChanges({
          stockRequest,
          nextProducts,
        });

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

    const updatedRequest = await StockRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("shippingInfo.shippedBy", "_id fullName email")
      .populate("receivingInfo.receivedBy", "_id fullName email")
      .populate("incompleteInfo.incompleteBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

    res.status(200).json({
      success: true,
      message: `Stock request status updated to ${status}`,
      data: updatedRequest,
    });
  } catch (error) {
    console.error("Error updating stock request status:", error);

    if (
      error.message.includes("serial numbers") ||
      error.message.includes("Insufficient stock") ||
      error.message.includes("Received quantity cannot exceed")
    ) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error updating stock request status",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

// export const updateApprovedQuantities = async (req, res) => {
//   try {
//     const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
//       req,
//       ["manage_indent"]
//     );

//     if (!hasAccess) {
//       return res.status(403).json({
//         success: false,
//         message: "Access denied. manage_indent permission required.",
//       });
//     }

//     const { id } = req.params;
//     const { productApprovals } = req.body;

//     const stockRequest = await StockRequest.findById(id)
//       .populate("center", "reseller")
//       .populate("warehouse", "_id");
    
//     if (!stockRequest) {
//       return res.status(404).json({
//         success: false,
//         message: "Stock request not found",
//       });
//     }

//     if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
//       return res.status(403).json({
//         success: false,
//         message:
//           "Access denied. You can only update approved quantities for stock requests from your own center.",
//       });
//     }

//     const userId = req.user?.id;
//     if (!userId) {
//       return res.status(400).json({
//         success: false,
//         message: "User authentication required",
//       });
//     }

//     const OutletStock = mongoose.model("OutletStock");
//     const ResellerStock = mongoose.model("ResellerStock");
//     const Product = mongoose.model("Product");

//     const resellerId = stockRequest.center?.reseller?._id;

//     for (const approval of productApprovals) {
//       const productItem = stockRequest.products.find(
//         (p) => p.product.toString() === approval.productId.toString()
//       );

//       if (!productItem) {
//         return res.status(400).json({
//           success: false,
//           message: `Product ${approval.productId} not found in stock request`,
//         });
//       }

//       const currentApprovedQuantity = productItem.approvedQuantity || 0;
//       const newApprovedQuantity = approval.approvedQuantity;
      
//       const productDoc = await Product.findById(approval.productId);
//       const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

//       console.log(`[DEBUG] Processing product ${approval.productId}:`);
//       console.log(`[DEBUG] Current approved: ${currentApprovedQuantity}, New approved: ${newApprovedQuantity}`);

//       let newSourceBreakdown = {
//         fromReseller: { quantity: 0, serials: [] },
//         fromOutlet: { quantity: 0, serials: [] },
//         totalApproved: newApprovedQuantity
//       };

//       if (newApprovedQuantity > 0) {
//         let resellerAvailable = 0;
//         let outletAvailable = 0;
//         let resellerStockDoc = null;
//         let outletStockDoc = null;

//         if (resellerId) {
//           resellerStockDoc = await ResellerStock.findOne({
//             reseller: resellerId,
//             product: approval.productId,
//           });
//           if (resellerStockDoc) {
//             resellerAvailable = resellerStockDoc.availableQuantity || 0;
//           }
//         }

//         outletStockDoc = await OutletStock.findOne({
//           outlet: stockRequest.warehouse,
//           product: approval.productId,
//         });
//         if (outletStockDoc) {
//           outletAvailable = outletStockDoc.availableQuantity || 0;
//         }

//         if (tracksSerialNumbers && approval.approvedSerials && approval.approvedSerials.length > 0) {
//           const serials = approval.approvedSerials;
        
//           if (resellerStockDoc) {
//             for (const serialNumber of serials) {
//               const serial = resellerStockDoc.serialNumbers.find(
//                 sn => sn.serialNumber === serialNumber && sn.status === "available"
//               );
//               if (serial) {
//                 newSourceBreakdown.fromReseller.serials.push(serialNumber);
//               }
//             }
//           }
//           newSourceBreakdown.fromOutlet.serials = serials.filter(
//             sn => !newSourceBreakdown.fromReseller.serials.includes(sn)
//           );
          
//           newSourceBreakdown.fromReseller.quantity = newSourceBreakdown.fromReseller.serials.length;
//           newSourceBreakdown.fromOutlet.quantity = newSourceBreakdown.fromOutlet.serials.length;
//         } else {
//           newSourceBreakdown.fromReseller.quantity = Math.min(newApprovedQuantity, resellerAvailable);
//           newSourceBreakdown.fromOutlet.quantity = newApprovedQuantity - newSourceBreakdown.fromReseller.quantity;
//         }
//         if (newSourceBreakdown.fromReseller.quantity + newSourceBreakdown.fromOutlet.quantity !== newApprovedQuantity) {
//           return res.status(400).json({
//             success: false,
//             message: `Source breakdown calculation error for product ${productDoc?.productTitle}. Expected ${newApprovedQuantity}, got Reseller: ${newSourceBreakdown.fromReseller.quantity}, Outlet: ${newSourceBreakdown.fromOutlet.quantity}`,
//           });
//         }

//         const currentSourceBreakdown = productItem.sourceBreakdown || {
//           fromReseller: { quantity: 0, serials: [] },
//           fromOutlet: { quantity: 0, serials: [] }
//         };

//         if (outletStockDoc) {
//           const currentOutletQty = currentSourceBreakdown.fromOutlet.quantity;
//           const newOutletQty = newSourceBreakdown.fromOutlet.quantity;
//           const outletQtyDiff = newOutletQty - currentOutletQty;

//           if (outletQtyDiff > 0) {
//             if (tracksSerialNumbers) {
//               const newOutletSerials = newSourceBreakdown.fromOutlet.serials.filter(
//                 serial => !currentSourceBreakdown.fromOutlet.serials.includes(serial)
//               );
              
//               for (const serialNumber of newOutletSerials) {
//                 const serial = outletStockDoc.serialNumbers.find(
//                   sn => sn.serialNumber === serialNumber
//                 );

//                 if (serial && serial.status === "available") {
//                   serial.status = "in_transit";
//                   serial.currentLocation = stockRequest.warehouse;
//                   serial.transferHistory.push({
//                     fromCenter: stockRequest.warehouse,
//                     toCenter: stockRequest.center,
//                     transferDate: new Date(),
//                     transferType: "outlet_to_center",
//                     status: "in_transit",
//                   });
//                 }
//               }
//             }
            
//             outletStockDoc.availableQuantity -= outletQtyDiff;
//             outletStockDoc.inTransitQuantity += outletQtyDiff;
//           } else if (outletQtyDiff < 0) {
//             const outletQtyToRevert = Math.abs(outletQtyDiff);
            
//             if (tracksSerialNumbers) {
//               const serialsToRevert = currentSourceBreakdown.fromOutlet.serials.filter(
//                 serial => !newSourceBreakdown.fromOutlet.serials.includes(serial)
//               );
              
//               for (const serialNumber of serialsToRevert) {
//                 const serial = outletStockDoc.serialNumbers.find(
//                   sn => sn.serialNumber === serialNumber
//                 );

//                 if (serial && serial.status === "in_transit") {
//                   serial.status = "available";
//                   serial.currentLocation = stockRequest.warehouse;

//                   if (serial.transferHistory.length > 0) {
//                     const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
//                     if (lastTransfer.status === "in_transit") {
//                       serial.transferHistory.pop();
//                     }
//                   }
//                 }
//               }
//             }
            
//             outletStockDoc.availableQuantity += outletQtyToRevert;
//             outletStockDoc.inTransitQuantity -= outletQtyToRevert;
//           }

//           await outletStockDoc.save();
//         }

//         if (resellerStockDoc) {
//           const currentResellerQty = currentSourceBreakdown.fromReseller.quantity;
//           const newResellerQty = newSourceBreakdown.fromReseller.quantity;
//           const resellerQtyDiff = newResellerQty - currentResellerQty;

//           if (resellerQtyDiff > 0) {
//             if (tracksSerialNumbers) {
//               const newResellerSerials = newSourceBreakdown.fromReseller.serials.filter(
//                 serial => !currentSourceBreakdown.fromReseller.serials.includes(serial)
//               );
              
//               for (const serialNumber of newResellerSerials) {
//                 const serial = resellerStockDoc.serialNumbers.find(
//                   sn => sn.serialNumber === serialNumber
//                 );

//                 if (serial && serial.status === "available") {
//                   serial.status = "consumed";
//                   serial.consumedDate = new Date();
//                   serial.consumedBy = userId;
//                   serial.currentLocation = stockRequest.center;
//                 }
//               }
//             }
            
//             resellerStockDoc.availableQuantity -= resellerQtyDiff;
//             resellerStockDoc.consumedQuantity += resellerQtyDiff;
//           } else if (resellerQtyDiff < 0) {
//             const resellerQtyToRevert = Math.abs(resellerQtyDiff);
            
//             if (tracksSerialNumbers) {
//               const serialsToRevert = currentSourceBreakdown.fromReseller.serials.filter(
//                 serial => !newSourceBreakdown.fromReseller.serials.includes(serial)
//               );
              
//               for (const serialNumber of serialsToRevert) {
//                 const serial = resellerStockDoc.serialNumbers.find(
//                   sn => sn.serialNumber === serialNumber
//                 );

//                 if (serial && serial.status === "consumed") {
//                   serial.status = "available";
//                   serial.consumedDate = null;
//                   serial.consumedBy = null;
//                   serial.currentLocation = null;
//                 }
//               }
//             }
            
//             resellerStockDoc.availableQuantity += resellerQtyToRevert;
//             resellerStockDoc.consumedQuantity -= resellerQtyToRevert;
//           }

//           await resellerStockDoc.save();
//         }
//       } else {
//         const currentSourceBreakdown = productItem.sourceBreakdown || {
//           fromReseller: { quantity: 0, serials: [] },
//           fromOutlet: { quantity: 0, serials: [] }
//         };
//         if (currentSourceBreakdown.fromOutlet.quantity > 0) {
//           const outletStockDoc = await OutletStock.findOne({
//             outlet: stockRequest.warehouse,
//             product: approval.productId,
//           });

//           if (outletStockDoc) {
//             if (tracksSerialNumbers) {
//               for (const serialNumber of currentSourceBreakdown.fromOutlet.serials) {
//                 const serial = outletStockDoc.serialNumbers.find(
//                   sn => sn.serialNumber === serialNumber
//                 );

//                 if (serial && serial.status === "in_transit") {
//                   serial.status = "available";
//                   serial.currentLocation = stockRequest.warehouse;
                  
//                   if (serial.transferHistory.length > 0) {
//                     const lastTransfer = serial.transferHistory[serial.transferHistory.length - 1];
//                     if (lastTransfer.status === "in_transit") {
//                       serial.transferHistory.pop();
//                     }
//                   }
//                 }
//               }
//             }
            
//             outletStockDoc.availableQuantity += currentSourceBreakdown.fromOutlet.quantity;
//             outletStockDoc.inTransitQuantity -= currentSourceBreakdown.fromOutlet.quantity;
//             await outletStockDoc.save();
//           }
//         }
//         if (currentSourceBreakdown.fromReseller.quantity > 0 && resellerStockDoc) {
//           const resellerStockDoc = await ResellerStock.findOne({
//             reseller: resellerId,
//             product: approval.productId,
//           });

//           if (resellerStockDoc) {
//             if (tracksSerialNumbers) {
//               for (const serialNumber of currentSourceBreakdown.fromReseller.serials) {
//                 const serial = resellerStockDoc.serialNumbers.find(
//                   sn => sn.serialNumber === serialNumber
//                 );

//                 if (serial && serial.status === "consumed") {
//                   serial.status = "available";
//                   serial.consumedDate = null;
//                   serial.consumedBy = null;
//                   serial.currentLocation = null;
//                 }
//               }
//             }
            
//             resellerStockDoc.availableQuantity += currentSourceBreakdown.fromReseller.quantity;
//             resellerStockDoc.consumedQuantity -= currentSourceBreakdown.fromReseller.quantity;
//             await resellerStockDoc.save();
//           }
//         }
//       }

//       productItem.sourceBreakdown = newSourceBreakdown;
//       productItem.approvedQuantity = newApprovedQuantity;
//       productItem.approvedRemark = approval.approvedRemark || "";
//       if (tracksSerialNumbers) {
//         productItem.approvedSerials = approval.approvedSerials || [];
//       }
//     }

//     if (stockRequest.status === "Submitted") {
//       stockRequest.status = "Confirmed";
//       stockRequest.approvalInfo = {
//         ...stockRequest.approvalInfo,
//         approvedBy: userId,
//         approvedAt: new Date(),
//       };
//     }

//     stockRequest.updatedBy = userId;
//     await stockRequest.save();

//     const populatedRequest = await StockRequest.findById(stockRequest._id)
//       .populate("warehouse", "_id centerName centerCode centerType")
//       .populate("center", "_id centerName centerCode")
//       .populate("products.product", "_id productTitle productCode productImage")
//       .populate("createdBy", "_id fullName email")
//       .populate("updatedBy", "_id fullName email")
//       .populate("approvalInfo.approvedBy", "_id fullName email");

//     res.status(200).json({
//       success: true,
//       message: "Approved quantities updated successfully",
//       data: populatedRequest,
//     });
//   } catch (error) {
//     console.error("Error updating approved quantities:", error);

//     if (error.name === "CastError") {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid stock request ID",
//       });
//     }

//     if (error.name === "ValidationError") {
//       const errors = Object.values(error.errors).map((err) => err.message);
//       return res.status(400).json({
//         success: false,
//         message: "Validation error",
//         errors,
//       });
//     }

//     if (error.message.includes("serial numbers") || error.message.includes("Insufficient stock")) {
//       return res.status(400).json({
//         success: false,
//         message: "Validation failed",
//         error: error.message,
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Error updating approved quantities",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };
export const updateApprovedQuantities = async (req, res) => {
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
    const { productApprovals } = req.body;

    const stockRequest = await StockRequest.findById(id)
      .populate("center", "reseller")
      .populate("warehouse", "_id");

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
          "Access denied. You can only update approved quantities for stock requests from your own center.",
      });
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    const OutletStock = mongoose.model("OutletStock");
    const ResellerStock = mongoose.model("ResellerStock");
    const Product = mongoose.model("Product");

    const resellerId = stockRequest.center?.reseller?._id;

    for (const approval of productApprovals) {
      const productItem = stockRequest.products.find(
        (p) => p.product.toString() === approval.productId.toString()
      );

      if (!productItem) {
        return res.status(400).json({
          success: false,
          message: `Product ${approval.productId} not found in stock request`,
        });
      }

      const currentApprovedQuantity = productItem.approvedQuantity || 0;
      const newApprovedQuantity = approval.approvedQuantity;

      const productDoc = await Product.findById(approval.productId);
      const tracksSerialNumbers = productDoc?.trackSerialNumber === "Yes";

      console.log(`[DEBUG] Processing product ${approval.productId}:`);
      console.log(
        `[DEBUG] Current approved: ${currentApprovedQuantity}, New approved: ${newApprovedQuantity}`
      );

      let newSourceBreakdown = {
        fromReseller: {
          quantity: 0,
          serials: [],
        },
        fromOutlet: {
          quantity: 0,
          serials: [],
        },
        totalApproved: newApprovedQuantity,
      };

      if (newApprovedQuantity > 0) {
        let resellerAvailable = 0;
        let outletAvailable = 0;
        let resellerStockDoc = null;
        let outletStockDoc = null;

        if (resellerId) {
          resellerStockDoc = await ResellerStock.findOne({
            reseller: resellerId,
            product: approval.productId,
          });

          if (resellerStockDoc) {
            resellerAvailable = resellerStockDoc.availableQuantity || 0;
          }
        }

        outletStockDoc = await OutletStock.findOne({
          outlet: stockRequest.warehouse,
          product: approval.productId,
        });

        if (outletStockDoc) {
          outletAvailable = outletStockDoc.availableQuantity || 0;
        }

        if (
          tracksSerialNumbers &&
          approval.approvedSerials &&
          approval.approvedSerials.length > 0
        ) {
          const serials = approval.approvedSerials;

          if (resellerStockDoc) {
            for (const serialNumber of serials) {
              const serial = resellerStockDoc.serialNumbers.find(
                (sn) =>
                  sn.serialNumber === serialNumber &&
                  sn.status === "available"
              );

              if (serial) {
                newSourceBreakdown.fromReseller.serials.push(serialNumber);
              }
            }
          }

          newSourceBreakdown.fromOutlet.serials = serials.filter(
            (sn) =>
              !newSourceBreakdown.fromReseller.serials.includes(sn)
          );

          newSourceBreakdown.fromReseller.quantity =
            newSourceBreakdown.fromReseller.serials.length;

          newSourceBreakdown.fromOutlet.quantity =
            newSourceBreakdown.fromOutlet.serials.length;
        } else {
          newSourceBreakdown.fromReseller.quantity = Math.min(
            newApprovedQuantity,
            resellerAvailable
          );

          newSourceBreakdown.fromOutlet.quantity =
            newApprovedQuantity -
            newSourceBreakdown.fromReseller.quantity;
        }

        if (
          newSourceBreakdown.fromReseller.quantity +
            newSourceBreakdown.fromOutlet.quantity !==
          newApprovedQuantity
        ) {
          return res.status(400).json({
            success: false,
            message: `Source breakdown calculation error for product ${productDoc?.productTitle}. Expected ${newApprovedQuantity}, got Reseller: ${newSourceBreakdown.fromReseller.quantity}, Outlet: ${newSourceBreakdown.fromOutlet.quantity}`,
          });
        }

        const currentSourceBreakdown =
          productItem.sourceBreakdown || {
            fromReseller: {
              quantity: 0,
              serials: [],
            },
            fromOutlet: {
              quantity: 0,
              serials: [],
            },
          };

        if (outletStockDoc) {
          const currentOutletQty =
            currentSourceBreakdown.fromOutlet.quantity;

          const newOutletQty =
            newSourceBreakdown.fromOutlet.quantity;

          const outletQtyDiff =
            newOutletQty - currentOutletQty;

          if (outletQtyDiff > 0) {
            if (tracksSerialNumbers) {
              const newOutletSerials =
                newSourceBreakdown.fromOutlet.serials.filter(
                  (serial) =>
                    !currentSourceBreakdown.fromOutlet.serials.includes(
                      serial
                    )
                );

              for (const serialNumber of newOutletSerials) {
                const serial = outletStockDoc.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );

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
              const serialsToRevert =
                currentSourceBreakdown.fromOutlet.serials.filter(
                  (serial) =>
                    !newSourceBreakdown.fromOutlet.serials.includes(
                      serial
                    )
                );

              for (const serialNumber of serialsToRevert) {
                const serial = outletStockDoc.serialNumbers.find(
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
                }
              }
            }

            outletStockDoc.availableQuantity += outletQtyToRevert;
            outletStockDoc.inTransitQuantity -= outletQtyToRevert;
          }

          await outletStockDoc.save();
        }

        if (resellerStockDoc) {
          const currentResellerQty =
            currentSourceBreakdown.fromReseller.quantity;

          const newResellerQty =
            newSourceBreakdown.fromReseller.quantity;

          const resellerQtyDiff =
            newResellerQty - currentResellerQty;

          if (resellerQtyDiff > 0) {
            if (tracksSerialNumbers) {
              const newResellerSerials =
                newSourceBreakdown.fromReseller.serials.filter(
                  (serial) =>
                    !currentSourceBreakdown.fromReseller.serials.includes(
                      serial
                    )
                );

              for (const serialNumber of newResellerSerials) {
                const serial = resellerStockDoc.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );

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
            const resellerQtyToRevert =
              Math.abs(resellerQtyDiff);

            if (tracksSerialNumbers) {
              const serialsToRevert =
                currentSourceBreakdown.fromReseller.serials.filter(
                  (serial) =>
                    !newSourceBreakdown.fromReseller.serials.includes(
                      serial
                    )
                );

              for (const serialNumber of serialsToRevert) {
                const serial = resellerStockDoc.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );

                if (serial && serial.status === "consumed") {
                  serial.status = "available";
                  serial.consumedDate = null;
                  serial.consumedBy = null;
                  serial.currentLocation = null;
                }
              }
            }

            resellerStockDoc.availableQuantity +=
              resellerQtyToRevert;

            resellerStockDoc.consumedQuantity -=
              resellerQtyToRevert;
          }

          await resellerStockDoc.save();
        }
      } else {
        const currentSourceBreakdown =
          productItem.sourceBreakdown || {
            fromReseller: {
              quantity: 0,
              serials: [],
            },
            fromOutlet: {
              quantity: 0,
              serials: [],
            },
          };

        if (currentSourceBreakdown.fromOutlet.quantity > 0) {
          const outletStockDoc = await OutletStock.findOne({
            outlet: stockRequest.warehouse,
            product: approval.productId,
          });

          if (outletStockDoc) {
            if (tracksSerialNumbers) {
              for (const serialNumber of
                currentSourceBreakdown.fromOutlet.serials) {
                const serial = outletStockDoc.serialNumbers.find(
                  (sn) => sn.serialNumber === serialNumber
                );

                if (
                  serial &&
                  serial.status === "in_transit"
                ) {
                  serial.status = "available";
                  serial.currentLocation =
                    stockRequest.warehouse;

                  if (serial.transferHistory.length > 0) {
                    const lastTransfer =
                      serial.transferHistory[
                        serial.transferHistory.length - 1
                      ];

                    if (
                      lastTransfer.status === "in_transit"
                    ) {
                      serial.transferHistory.pop();
                    }
                  }
                }
              }
            }

            outletStockDoc.availableQuantity +=
              currentSourceBreakdown.fromOutlet.quantity;

            outletStockDoc.inTransitQuantity -=
              currentSourceBreakdown.fromOutlet.quantity;

            await outletStockDoc.save();
          }
        }

        // FIX:
        // resellerStockDoc was previously referenced here before
        // being declared in this scope.
        if (
          currentSourceBreakdown.fromReseller.quantity > 0
        ) {
          const resellerStockDoc =
            await ResellerStock.findOne({
              reseller: resellerId,
              product: approval.productId,
            });

          if (resellerStockDoc) {
            if (tracksSerialNumbers) {
              for (const serialNumber of
                currentSourceBreakdown.fromReseller.serials) {
                const serial =
                  resellerStockDoc.serialNumbers.find(
                    (sn) =>
                      sn.serialNumber === serialNumber
                  );

                if (
                  serial &&
                  serial.status === "consumed"
                ) {
                  serial.status = "available";
                  serial.consumedDate = null;
                  serial.consumedBy = null;
                  serial.currentLocation = null;
                }
              }
            }

            resellerStockDoc.availableQuantity +=
              currentSourceBreakdown.fromReseller.quantity;

            resellerStockDoc.consumedQuantity -=
              currentSourceBreakdown.fromReseller.quantity;

            await resellerStockDoc.save();
          }
        }
      }

      productItem.sourceBreakdown = newSourceBreakdown;
      productItem.approvedQuantity = newApprovedQuantity;
      productItem.approvedRemark =
        approval.approvedRemark || "";

      if (tracksSerialNumbers) {
        productItem.approvedSerials =
          approval.approvedSerials || [];
      }
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

    const populatedRequest =
      await StockRequest.findById(stockRequest._id)
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
        );

    res.status(200).json({
      success: true,
      message: "Approved quantities updated successfully",
      data: populatedRequest,
    });
  } catch (error) {
    console.error(
      "Error updating approved quantities:",
      error
    );

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock request ID",
      });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map(
        (err) => err.message
      );

      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    if (
      error.message?.includes("serial numbers") ||
      error.message?.includes("Insufficient stock")
    ) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error updating approved quantities",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};
export const getMostRecentOrderNumber = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["indent_all_center", "indent_own_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. indent_own_center or indent_all_center permission required.",
      });
    }

    if (
      permissions.indent_own_center &&
      !permissions.indent_all_center &&
      userCenter
    ) {
      const userCenterId = userCenter._id || userCenter;
    }
    const mostRecentRequest = await StockRequest.findOne()
      .sort({ createdAt: -1 })
      .select("orderNumber createdAt")
      .lean();

    if (!mostRecentRequest) {
      return res.status(404).json({
        success: false,
        message: "No stock requests found",
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      message: "Most recent order number retrieved successfully",
      data: {
        orderNumber: mostRecentRequest.orderNumber,
        createdAt: mostRecentRequest.createdAt,
      },
    });
  } catch (error) {
    console.error("Error retrieving most recent order number:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving most recent order number",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const getCenterSerialNumbers = async (req, res) => {
  try {
    const Product = mongoose.model("Product");
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["indent_all_center", "indent_own_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. indent_own_center or indent_all_center permission required.",
      });
    }

    const { productId } = req.params;

    const user = await User.findById(req.user.id).populate("center");
    if (!user || !user.center) {
      return res.status(400).json({
        success: false,
        message: "User center information not found",
      });
    }

    const centerId = user.center._id;

    if (
      permissions.indent_own_center &&
      !permissions.indent_all_center &&
      userCenter
    ) {
      const userCenterId = userCenter._id || userCenter;
      if (userCenterId.toString() !== centerId.toString()) {
        return res.status(403).json({
          success: false,
          message:
            "Access denied. You can only view serial numbers from your own center.",
        });
      }
    }

    const centerStock = await CenterStock.findOne({
      center: centerId,
      product: productId,
    })
      .populate("center", "centerName centerCode centerType")
      .populate("product", "productTitle productCode trackSerialNumber");

    if (!centerStock) {
      return res.status(200).json({
        success: true,
        message: "No stock found for the specified product",
        data: {
          center: await Center.findById(centerId).select(
            "centerName centerCode centerType"
          ),
          product: await Product.findById(productId).select(
            "productTitle productCode trackSerialNumber"
          ),
          availableSerials: [],
          totalAvailable: 0,
          stockSummary: {
            totalQuantity: 0,
            availableQuantity: 0,
            inTransitQuantity: 0,
            consumedQuantity: 0,
          },
        },
      });
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

    res.status(200).json({
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
    });
  } catch (error) {
    console.error("Error retrieving center serial numbers:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error retrieving center serial numbers",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const getStockRequestCount = async (req, res) => {
  try {
    const match = {};

    if (req.query.center) {
      match.center = req.query.center;
    }
    if (req.query.warehouse) {
      match.warehouse = req.query.warehouse;
    }
    if (req.query.startDate && req.query.endDate) {
      match.date = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }
    const summary = await StockRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);
    const totalRequests = summary.reduce((acc, cur) => acc + cur.count, 0);

    const completed =
      summary.find((s) => s._id === "Completed")?.count || 0;
    const incomplete =
      summary.find((s) => s._id === "Incompleted")?.count || 0;

    return res.status(200).json({
      success: true,
      totalRequests,
      completed,
      incomplete,
      summary: summary.reduce((acc, s) => {
        acc[s._id] = s.count;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error("Error fetching stock request summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch stock request summary",
      error: error.message,
    });
  }
};

export const getStockRequestNotifications = async (req, res) => {
  try {
    const {
      type,
      center,
      days = 7
    } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    startDate.setHours(0, 0, 0, 0);

    
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["indent_all_center", "indent_own_center"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. indent_own_center or indent_all_center permission required.",
      });
    }

    const filter = {
      createdAt: { $gte: startDate }
    };

    if (!permissions.indent_all_center && permissions.indent_own_center && userCenter) {
      filter.center = userCenter._id || userCenter;
    } else if (center) {
      filter.center = center;
    }
    
    if (type && type !== 'all') {
      switch (type) {
        case 'submitted':
          filter.status = 'Submitted';
          break;
        case 'completed':
          filter.status = 'Completed';
          break;
        case 'confirmed':
          filter.status = 'Confirmed';
          break;
        case 'shipped':
          filter.status = 'Shipped';
          break;
        case 'incompleted':
          filter.status = 'Incompleted';
          break;
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

    const validStockRequests = stockRequests.filter(request => 
      request.center && request.center.centerName
    );

    const notifications = validStockRequests.map(request => {
      return formatStockRequestToNotification(request);
    });

    res.status(200).json({
      success: true,
      message: "Stock request notifications retrieved successfully",
      data: notifications,
      totalCount: notifications.length
    });

  } catch (error) {
    console.error("Error retrieving stock request notifications:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving notifications",
      error: error.message,
    });
  }
};

const formatStockRequestToNotification = (stockRequest) => {
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  let title = '';
  let message = '';
  let notificationType = '';
  let timestamp = stockRequest.createdAt;

  const centerName = stockRequest.center?.centerName || 'Unknown Center';
  const orderNumber = stockRequest.orderNumber || 'N/A';
  const createdByName = stockRequest.createdBy?.fullName || 'Unknown User';

  switch (stockRequest.status) {
    case 'Submitted':
      notificationType = 'new_request';
      title = 'New Stock Request Submitted';
      message = `New Stock Request No. ${orderNumber} had been Submitted From ${centerName} By ${createdByName} - ${formatDate(stockRequest.createdAt)}`;
      break;

    case 'Completed':
      notificationType = 'request_completed';
      title = 'Stock Request Completed';
      const completedBy = stockRequest.completionInfo?.completedBy?.fullName || 
                         stockRequest.receivingInfo?.receivedBy?.fullName || 
                         'System';
      message = `Your indent Request No. ${orderNumber} had been Completed From ${centerName} By ${completedBy} - ${formatDate(stockRequest.completionInfo?.completedOn || stockRequest.updatedAt)}`;
      timestamp = stockRequest.completionInfo?.completedOn || stockRequest.updatedAt;
      break;

    case 'Confirmed':
      notificationType = 'request_approved';
      title = 'Stock Request Approved';
      const approvedBy = stockRequest.approvalInfo?.approvedBy?.fullName || 'System';
      message = `Stock Request No. ${orderNumber} has been Approved From ${centerName} By ${approvedBy} - ${formatDate(stockRequest.approvalInfo?.approvedAt || stockRequest.updatedAt)}`;
      timestamp = stockRequest.approvalInfo?.approvedAt || stockRequest.updatedAt;
      break;

    case 'Shipped':
      notificationType = 'request_shipped';
      title = 'Stock Request Shipped';
      const shippedBy = stockRequest.shippingInfo?.shippedBy?.fullName || 'System';
      message = `Stock Request No. ${orderNumber} has been Shipped From ${centerName} By ${shippedBy} - ${formatDate(stockRequest.shippingInfo?.shippedAt || stockRequest.updatedAt)}`;
      timestamp = stockRequest.shippingInfo?.shippedAt || stockRequest.updatedAt;
      break;

    case 'Incompleted':
      notificationType = 'request_incompleted';
      title = 'Stock Request Incompleted';
      const incompletedBy = stockRequest.completionInfo?.incompleteBy?.fullName || 'System';
      message = `Stock Request No. ${orderNumber} has been Marked Incomplete From ${centerName} By ${incompletedBy} - ${formatDate(stockRequest.completionInfo?.incompleteOn || stockRequest.updatedAt)}`;
      timestamp = stockRequest.completionInfo?.incompleteOn || stockRequest.updatedAt;
      break;

    case 'Rejected':
      notificationType = 'request_rejected';
      title = 'Stock Request Rejected';
      message = `Stock Request No. ${orderNumber} has been Rejected From ${centerName} - ${formatDate(stockRequest.updatedAt)}`;
      break;

    default:
      notificationType = 'status_updated';
      title = 'Stock Request Updated';
      message = `Stock Request No. ${orderNumber} status updated to ${stockRequest.status} From ${centerName} - ${formatDate(stockRequest.updatedAt)}`;
      timestamp = stockRequest.updatedAt;
  }

  return {
    id: stockRequest._id,
    type: notificationType,
    title,
    message,
    stockRequestId: stockRequest._id,
    orderNumber: stockRequest.orderNumber,
    center: stockRequest.center,
    status: stockRequest.status,
    timestamp,
    createdAt: stockRequest.createdAt,
    isRead: false
  };
};

export const updateWarehouseChallanApproval = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["manage_indent", "stock_transfer_approve_from_outlet"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent or stock_transfer_approve_from_outlet permission required.",
      });
    }

    const { id } = req.params;
    const {warehouseChallanApproval } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update challan approval for stock requests from your own center.",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    if (!["pending", "approved", "rejected"].includes(warehouseChallanApproval)) {
      return res.status(400).json({
        success: false,
        message: "Invalid challan approval status. Must be one of: pending, approved, rejected",
      });
    }

    const updateData = {
      warehouseChallanApproval,
      updatedBy: userId,
      approvalInfo: {
        ...stockRequest.approvalInfo,
      },
    };

    if (warehouseChallanApproval === "approved" || warehouseChallanApproval === "rejected") {
      updateData.approvalInfo.warehouseChallanApprovedAt = new Date();
      updateData.approvalInfo.warehouseChallanApprovedBy = userId;

    } else {

      updateData.approvalInfo.warehouseChallanApprovedAt = undefined;
      updateData.approvalInfo.warehouseChallanApprovedBy = undefined;
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("approvalInfo.warehouseChallanApprovedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");
    res.status(200).json({
      success: true,
      message: `Challan approval status updated to ${warehouseChallanApproval} successfully`,
      data: updatedRequest,
    });
  } catch (error) {
    console.error("Error updating challan approval:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock request ID",
      });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error updating challan approval",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

export const updateCenterChallanApproval = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkStockRequestPermissions(
      req,
      ["manage_indent", "stock_transfer_approve_from_outlet"]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. manage_indent or stock_transfer_approve_from_outlet permission required.",
      });
    }

    const { id } = req.params;
    const { centerChallanApproval } = req.body;

    const stockRequest = await StockRequest.findById(id);
    if (!stockRequest) {
      return res.status(404).json({
        success: false,
        message: "Stock request not found",
      });
    }

    if (!checkCenterAccess(stockRequest, userCenter, permissions)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update challan approval for stock requests from your own center.",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User authentication required",
      });
    }

    if (!["pending", "approved", "rejected"].includes(centerChallanApproval)) {
      return res.status(400).json({
        success: false,
        message: "Invalid challan approval status. Must be one of: pending, approved, rejected",
      });
    }

    const updateData = {
      centerChallanApproval,
      updatedBy: userId,
      approvalInfo: {
        ...stockRequest.approvalInfo,
      },
    };

    if (centerChallanApproval === "approved" || centerChallanApproval === "rejected") {
      updateData.approvalInfo.centerChallanApprovedAt = new Date();
      updateData.approvalInfo.centerChallanApprovedBy = userId;
    } else {

      updateData.approvalInfo.centerChallanApprovedAt = undefined;
      updateData.approvalInfo.centerChallanApprovedBy = undefined;
    }

    const updatedRequest = await StockRequest.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate("warehouse", "_id centerName centerCode centerType")
      .populate("center", "_id centerName centerCode centerType")
      .populate("products.product", "_id productTitle productCode productImage")
      .populate("approvalInfo.approvedBy", "_id fullName email")
      .populate("approvalInfo.centerChallanApprovedBy", "_id fullName email")
      .populate("createdBy", "_id fullName email")
      .populate("updatedBy", "_id fullName email");

      res.status(200).json({
      success: true,
      message: `Challan approval status updated to ${centerChallanApproval} successfully`,
      data: updatedRequest,
    });
  } catch (error) {
    console.error("Error updating challan approval:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid stock request ID",
      });
    }

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error updating challan approval",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    })
  }
};

export const exportStockRequestsToExcel = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: "Excel export function is working",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to export stock requests",
      error: error.message,
    });
  }
};

        