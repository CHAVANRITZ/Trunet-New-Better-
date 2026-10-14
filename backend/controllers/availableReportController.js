import CenterStock from "../models/CenterStock.js";
import Center from "../models/Center.js";
import Product from "../models/Product.js";
import User from "../models/User.js";
import StockUsage from "../models/StockUsage.js";
import OutletStock from "../models/OutletStock.js";
import StockPurchase from "../models/StockPurchase.js";
import mongoose from "mongoose";
import DamageReturn from "../models/DamageReturn.js";
import Reseller from "../models/Reseller.js";
import XLSX from "xlsx";


const checkAvailableStockPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];
  console.log(userPermissions);
  const availableStockModule = userPermissions.find(
    (perm) => perm.module === "Available Stock"
  );

  if (!availableStockModule) {
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    available_stock_own_center: availableStockModule.permissions.includes(
      "available_stock_own_center"
    ),
    available_stock_all_center: availableStockModule.permissions.includes(
      "available_stock_all_center"
    ),
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

const handleControllerError = (error, res) => {
  console.error("Controller Error:", error);

  if (
    error.message.includes("User center information not found") ||
    error.message.includes("User authentication required") ||
    error.message.includes("User not found") ||
    error.message.includes("User ID is required") ||
    error.message.includes("Access denied")
  ) {
    return res.status(400).json({
      success: false,
      message: error.message,
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

  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format",
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Internal server error",
  });
};


const buildArrayFilter = (value) => {
  if (!value) return null;

  const values = value.includes(",") 
    ? value.split(",").map(item => item.trim())
    : [value];
  
  const objectIds = values.map(item => {
    if (mongoose.Types.ObjectId.isValid(item)) {
      return new mongoose.Types.ObjectId(item);
    }
    return item;
  });
  
  return objectIds.length === 1 ? objectIds[0] : { $in: objectIds };
};

const buildCenterStockFilter = (query, permissions, userCenter) => {
  const {
    centerId,
    center, 
    product,
    search,
    lowStockThreshold = 10,
  } = query;

  const filter = {};

  // Permission-based center filtering
  if (
    permissions.available_stock_own_center &&
    !permissions.available_stock_all_center &&
    userCenter
  ) {
    filter.center = new mongoose.Types.ObjectId(userCenter._id || userCenter);
  } else if (centerId || center) {
    // Support both centerId and center parameters
    const centerFilterValue = centerId || center;
    const centerFilter = buildArrayFilter(centerFilterValue);
    if (centerFilter) filter.center = centerFilter;
  }

  // Product filter
  const productFilter = buildArrayFilter(product);
  if (productFilter) filter.product = productFilter;

  return filter;
};


export const getCenterAllStock = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkAvailableStockPermissions(req, [
        "available_stock_own_center",
        "available_stock_all_center",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. available_stock_own_center or available_stock_all_center permission required.",
      });
    }

    const {
      page = 1,
      limit = 100,
      centerId,
      center,
      product,
      search,
      sortBy = "productName",
      sortOrder = "asc",
      includeSerials = false,
      lowStockThreshold = 10,
      ...filterParams
    } = req.query;

    // Build filter using the new helper function
    const filter = buildCenterStockFilter(
      { centerId, center, product, search, lowStockThreshold, ...filterParams },
      permissions,
      userCenter
    );

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build base aggregation pipeline
    const aggregationPipeline = [
      { $match: filter },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $lookup: {
          from: "centers",
          localField: "center",
          foreignField: "_id",
          as: "centerDetails",
        },
      },
      {
        $lookup: {
          from: "productcategories",
          localField: "productDetails.productCategory",
          foreignField: "_id",
          as: "categoryDetails",
        },
      },
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$centerDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$categoryDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
    ];

    // Add search filter at the beginning if search exists
    if (search) {
      aggregationPipeline.unshift({
        $match: {
          $or: [
            { "productDetails.productTitle": { $regex: search, $options: "i" } },
            { "productDetails.productCode": { $regex: search, $options: "i" } },
            { "centerDetails.centerName": { $regex: search, $options: "i" } },
            { "centerDetails.centerCode": { $regex: search, $options: "i" } },
            { "categoryDetails.productCategory": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Add fields and projections
    aggregationPipeline.push(
      {
        $addFields: {
          damagedQuantity: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "damaged"] },
              },
            },
          },
          availableSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "available"] },
              },
            },
          },
          consumedSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "consumed"] },
              },
            },
          },
          inTransitSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "in_transit"] },
              },
            },
          },
          transferredSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "transferred"] },
              },
            },
          },
        },
      },
      {
        $project: {
          center: 1,
          product: 1,
          totalQuantity: 1,
          availableQuantity: 1,
          inTransitQuantity: 1,
          consumedQuantity: 1,
          lastUpdated: 1,
          productName: "$productDetails.productTitle",
          productCode: "$productDetails.productCode",
          productCategory: {
            _id: "$categoryDetails._id",
            name: "$categoryDetails.productCategory",
          },
          trackSerialNumber: "$productDetails.trackSerialNumber",
          centerName: "$centerDetails.centerName",
          centerCode: "$centerDetails.centerCode",
          centerType: "$centerDetails.centerType",
          serialNumbers: includeSerials === "true" ? "$serialNumbers" : [],
          damagedQuantity: 1,
          availableSerialsCount: 1,
          consumedSerialsCount: 1,
          inTransitSerialsCount: 1,
          transferredSerialsCount: 1,
          effectiveAvailableQuantity: {
            $cond: {
              if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
              then: "$availableSerialsCount",
              else: {
                $max: [
                  0,
                  { $subtract: ["$availableQuantity", "$damagedQuantity"] },
                ],
              },
            },
          },
          stockStatus: {
            $cond: {
              if: {
                $lt: [
                  {
                    $cond: {
                      if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
                      then: "$availableSerialsCount",
                      else: {
                        $max: [
                          0,
                          {
                            $subtract: [
                              "$availableQuantity",
                              "$damagedQuantity",
                            ],
                          },
                        ],
                      },
                    },
                  },
                  parseInt(lowStockThreshold),
                ],
              },
              then: "low_stock",
              else: {
                $cond: {
                  if: {
                    $eq: [
                      {
                        $cond: {
                          if: {
                            $eq: ["$productDetails.trackSerialNumber", "Yes"],
                          },
                          then: "$availableSerialsCount",
                          else: {
                            $max: [
                              0,
                              {
                                $subtract: [
                                  "$availableQuantity",
                                  "$damagedQuantity",
                                ],
                              },
                            ],
                          },
                        },
                      },
                      0,
                    ],
                  },
                  then: "out_of_stock",
                  else: "in_stock",
                },
              },
            },
          },
        },
      }
    );

    // Create count pipeline (without skip/limit)
    const countPipeline = [...aggregationPipeline];
    countPipeline.push({ $count: "total" });

    // Add sorting and pagination to main pipeline
    const sortConfig = {};
    const validSortFields = [
      "productName", "productCode", "centerName", "centerCode", 
      "effectiveAvailableQuantity", "stockStatus", "lastUpdated"
    ];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "productName";
    sortConfig[actualSortBy] = sortOrder === "desc" ? -1 : 1;
    
    aggregationPipeline.push(
      { $sort: sortConfig },
      { $skip: skip },
      { $limit: limitNum }
    );

    const [stockData, countResult] = await Promise.all([
      CenterStock.aggregate(aggregationPipeline),
      CenterStock.aggregate(countPipeline),
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(total / limitNum);

    // Summary statistics
    const summaryStats = await CenterStock.aggregate([
      { $match: filter },
      {
        $addFields: {
          damagedQuantity: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "damaged"] },
              },
            },
          },
          availableSerialsCount: {
            $size: {
              $filter: {
                input: "$serialNumbers",
                as: "serial",
                cond: { $eq: ["$$serial.status", "available"] },
              },
            },
          },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: "$totalQuantity" },
          totalAvailable: { $sum: "$availableQuantity" },
          totalInTransit: { $sum: "$inTransitQuantity" },
          totalConsumed: { $sum: "$consumedQuantity" },
          totalDamaged: { $sum: "$damagedQuantity" },
          totalEffectiveAvailable: {
            $sum: {
              $cond: {
                if: { $eq: ["$productDetails.trackSerialNumber", "Yes"] },
                then: "$availableSerialsCount",
                else: {
                  $max: [
                    0,
                    { $subtract: ["$availableQuantity", "$damagedQuantity"] },
                  ],
                },
              },
            },
          },
          lowStockItems: {
            $sum: {
              $cond: [
                {
                  $and: [
                    {
                      $lt: [
                        {
                          $cond: {
                            if: {
                              $eq: ["$productDetails.trackSerialNumber", "Yes"],
                            },
                            then: "$availableSerialsCount",
                            else: {
                              $max: [
                                0,
                                {
                                  $subtract: [
                                    "$availableQuantity",
                                    "$damagedQuantity",
                                  ],
                                },
                              ],
                            },
                          },
                        },
                        parseInt(lowStockThreshold),
                      ],
                    },
                    {
                      $gt: [
                        {
                          $cond: {
                            if: {
                              $eq: ["$productDetails.trackSerialNumber", "Yes"],
                            },
                            then: "$availableSerialsCount",
                            else: {
                              $max: [
                                0,
                                {
                                  $subtract: [
                                    "$availableQuantity",
                                    "$damagedQuantity",
                                  ],
                                },
                              ],
                            },
                          },
                        },
                        0,
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
          outOfStockItems: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    {
                      $cond: {
                        if: {
                          $eq: ["$productDetails.trackSerialNumber", "Yes"],
                        },
                        then: "$availableSerialsCount",
                        else: {
                          $max: [
                            0,
                            {
                              $subtract: [
                                "$availableQuantity",
                                "$damagedQuantity",
                              ],
                            },
                          ],
                        },
                      },
                    },
                    0,
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const summary =
      summaryStats.length > 0
        ? summaryStats[0]
        : {
            totalProducts: 0,
            totalQuantity: 0,
            totalAvailable: 0,
            totalInTransit: 0,
            totalConsumed: 0,
            totalDamaged: 0,
            totalEffectiveAvailable: 0,
            lowStockItems: 0,
            outOfStockItems: 0,
          };

    // Get center info
    let centerInfo = null;
    if (filter.center) {
      try {
        // Handle single center or multiple centers
        if (typeof filter.center === 'object' && filter.center.$in && filter.center.$in.length > 0) {
          // For multiple centers, get the first one
          centerInfo = await Center.findById(filter.center.$in[0]).select(
            "centerName centerCode centerType address phone email"
          );
        } else {
          // For single center
          const centerId = typeof filter.center === 'object' ? filter.center : filter.center;
          centerInfo = await Center.findById(centerId).select(
            "centerName centerCode centerType address phone email"
          );
        }
      } catch (error) {
        console.error("Error fetching center info:", error);
      }
    } else if (
      permissions.available_stock_own_center &&
      !permissions.available_stock_all_center &&
      userCenter
    ) {
      centerInfo = await Center.findById(userCenter._id || userCenter).select(
        "centerName centerCode centerType address phone email"
      );
    }

    res.status(200).json({
      success: true,
      message: "Center stock data retrieved successfully",
      data: {
        stock: stockData,
        summary: {
          ...summary,
          inStockItems:
            summary.totalProducts -
            summary.lowStockItems -
            summary.outOfStockItems,
        },
        center: centerInfo,
        filters: {
          center: filter.center || "all",
          product: product || "all",
          search: search || "",
          lowStockThreshold: parseInt(lowStockThreshold),
        },
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: total,
          itemsPerPage: limitNum,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
        permissions: {
          canViewAllCenters: permissions.available_stock_all_center,
          canViewOwnCenter: permissions.available_stock_own_center,
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving center stock:", error);
    handleControllerError(error, res);
  }
};

const buildAvailableProductsFilter = (query, permissions, userCenter) => {
  const {
    centerId,
    center,
    product,
    search,
    category,
  } = query;

  const filter = {};
  if (
    permissions.available_stock_own_center &&
    !permissions.available_stock_all_center &&
    userCenter
  ) {
    filter.center = new mongoose.Types.ObjectId(userCenter._id || userCenter);
  } else if (centerId || center) {
    const centerFilterValue = centerId || center;
    const centerFilter = buildArrayFilter(centerFilterValue);
    if (centerFilter) filter.center = centerFilter;
  }

  const productFilter = buildArrayFilter(product);
  if (productFilter) filter.product = productFilter;
  const categoryFilter = buildArrayFilter(category);
  if (categoryFilter) filter.category = categoryFilter;

  return filter;
};

export const getAllAvailableProductsWithStock = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } =
      checkAvailableStockPermissions(req, [
        "available_stock_own_center",
        "available_stock_all_center",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. available_stock_own_center or available_stock_all_center permission required.",
      });
    }

    const {
      page = 1,
      limit = 100,
      search,
      category,
      centerId,
      center,
      product,
      sortBy = "productName",
      sortOrder = "asc",
      export: isExport = false,
      startDate,
      endDate,
      resellerId,
      centerIds,
      productIds,
      stockStatus,
      minStock,
      maxStock,
      ...filterParams
    } = req.query;

    // ========== MANDATORY DATE FILTER FOR EXPORT ==========
    if (isExport === "true" || isExport === true) {
      if (!startDate && !endDate) {
        return res.status(400).json({
          success: false,
          message: "Date range (startDate and/or endDate) is required for Excel export. Please provide at least one date filter.",
        });
      }
      
      // Validate date formats
      if (startDate && isNaN(new Date(startDate).getTime())) {
        return res.status(400).json({
          success: false,
          message: `Invalid startDate format: ${startDate}. Please use valid ISO date format.`,
        });
      }
      
      if (endDate && isNaN(new Date(endDate).getTime())) {
        return res.status(400).json({
          success: false,
          message: `Invalid endDate format: ${endDate}. Please use valid ISO date format.`,
        });
      }
      
      console.log(`[EXPORT] Export requested with date filter - StartDate: ${startDate}, EndDate: ${endDate}`);
    }

const user = await User.findById(req.user.id)
  .populate("center", "centerName centerCode centerType reseller");

    if (!user || !user.center) {
      return res.status(400).json({
        success: false,
        message: "User center information not found",
      });
    }

    const defaultCenterId = user.center._id;
    
    // Build filters
    const filter = buildAvailableProductsFilter(
      { centerId, center, product, search, category, ...filterParams },
      permissions,
      userCenter
    );
    
    const specificCenterId = filter.center ? filter.center : defaultCenterId;
    
    // ========== RESELLER FILTER LOGIC ==========
    let targetCenterIds = [];
    let selectedReseller = null;
    
    // If resellerId is provided, fetch reseller details
    if (resellerId) {
      selectedReseller = await Reseller.findById(resellerId).select("businessName _id");
      if (!selectedReseller) {
        return res.status(400).json({
          success: false,
          message: `Reseller with ID ${resellerId} not found`,
        });
      }
      console.log(`[RESELLER FILTER] Filtering by reseller: ${selectedReseller.businessName} (${resellerId})`);
    }
    
    // Case 1: User requested specific center(s) - use ONLY those
    if (centerIds) {
      const centerIdArray = Array.isArray(centerIds) ? centerIds : centerIds.split(',');
      targetCenterIds = centerIdArray;
      console.log(`[CENTER FILTER] Using specific center IDs: ${centerIdArray.join(', ')}`);
    } 
    else if (specificCenterId) {
      targetCenterIds = [specificCenterId];
      console.log(`[CENTER FILTER] Using single center ID: ${specificCenterId}`);
    }
    // Case 2: User requested all centers under a specific reseller
    else if (resellerId) {
      const centersUnderReseller = await Center.find({ 
        reseller: resellerId,
        status: "Enable"
      }).select("_id centerName centerCode centerType reseller");
      
      if (centersUnderReseller.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No active centers found under this reseller`,
        });
      }
      
      targetCenterIds = centersUnderReseller.map(c => c._id);
      console.log(`[RESELLER FILTER] Found ${targetCenterIds.length} centers under reseller`);
    }
    // Case 3: User has permission to view all centers and requested it
    else if (req.query.viewAllCenters === "true" && permissions.available_stock_all_center) {
      const userResellerId = user.center.reseller;
      if (userResellerId) {
        const centersUnderReseller = await Center.find({ 
          reseller: userResellerId,
          status: "Enable"
        }).select("_id centerName centerCode centerType reseller");
        targetCenterIds = centersUnderReseller.map(c => c._id);
        console.log(`[VIEW ALL] User has permission, fetching all centers under reseller: ${userResellerId}`);
      } else {
        targetCenterIds = [defaultCenterId];
        console.log(`[VIEW ALL] No reseller found, using default center: ${defaultCenterId}`);
      }
    }
    // Case 4: Default - only user's own center
    else {
      targetCenterIds = [defaultCenterId];
      console.log(`[DEFAULT] Using user's own center: ${defaultCenterId}`);
    }

    // Remove duplicates if any
    targetCenterIds = [...new Set(targetCenterIds.map(id => id.toString()))];
    console.log(`[FINAL CENTERS] Total unique centers to fetch: ${targetCenterIds.length}`);

    // Validate centers exist
    const targetCenters = await Center.find({
      _id: { $in: targetCenterIds }
    }).select("_id centerName centerCode centerType reseller")
      .populate("reseller", "businessName _id");

    if (!targetCenters || targetCenters.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid centers found",
      });
    }

    console.log("[TARGET CENTERS]", targetCenters.map(c => ({
      id: c._id,
      name: c.centerName,
      reseller: c.reseller?.businessName
    })));

    // ========== PRODUCT FILTER ==========
    const productFilter = {};

    if (search) {
      productFilter.$or = [
        { productTitle: { $regex: search, $options: "i" } },
        { productCode: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { "productCategory.productCategory": { $regex: search, $options: "i" } },
      ];
      console.log(`[SEARCH] Searching for: ${search}`);
    }

    if (category) {
      const categoryId = await getCategoryId(category);
      if (categoryId) {
        productFilter.productCategory = categoryId;
        console.log(`[CATEGORY] Filtering by category ID: ${categoryId}`);
      }
    }

    if (productIds) {
      const productIdArray = Array.isArray(productIds) ? productIds : productIds.split(',');
      productFilter._id = { $in: productIdArray };
      console.log(`[PRODUCT IDs] Filtering by ${productIdArray.length} specific products`);
    } else if (product) {
      const productFilterObj = buildArrayFilter(product);
      if (productFilterObj) {
        productFilter._id = productFilterObj;
        console.log(`[PRODUCT] Filtering by product: ${product}`);
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    let products, totalProducts;
    
    if (isExport === "true" || isExport === true) {
      // For export, get ALL products without pagination
      products = await Product.find(productFilter)
        .populate("productCategory", "productCategory categoryCode")
        .select(
          "productTitle productCode description productCategory productPrice trackSerialNumber productImage"
        )
        .sort({ productTitle: 1 })
        .lean();
      totalProducts = products.length;
      console.log(`[EXPORT] Exporting ${totalProducts} products with date filter`);
    } else {
      const skip = (pageNum - 1) * limitNum;
      
      [products, totalProducts] = await Promise.all([
        Product.find(productFilter)
          .populate("productCategory", "productCategory categoryCode")
          .select(
            "productTitle productCode description productCategory productPrice trackSerialNumber productImage"
          )
          .sort({ productTitle: 1 })
          .limit(limitNum)
          .skip(skip)
          .lean(),
        Product.countDocuments(productFilter),
      ]);
      console.log(`[PAGINATION] Page ${pageNum}, Limit ${limitNum}, Total products: ${totalProducts}`);
    }

    if (!products || products.length === 0) {
      const responseData = {
        success: true,
        message: "No products found",
        data: {
          stock: [],
          summary: {
            totalProducts: 0,
            totalQuantity: 0,
            totalAvailable: 0,
            totalInTransit: 0,
            totalConsumed: 0,
            totalDamaged: 0,
            totalDamageReturn: 0,
            totalEffectiveAvailable: 0,
            lowStockItems: 0,
            outOfStockItems: 0,
            inStockItems: 0,
          },
          centers: targetCenters,
          filters: {
            centers: targetCenterIds,
            reseller: resellerId || null,
            resellerName: selectedReseller?.businessName || null,
            product: product || "all",
            products: productIds || "all",
            search: search || "",
            category: category || "all",
            startDate: startDate || null,
            endDate: endDate || null,
            stockStatus: stockStatus || "all",
            minStock: minStock || null,
            maxStock: maxStock || null,
          },
          permissions: {
            canViewAllCenters: permissions.available_stock_all_center,
            canViewOwnCenter: permissions.available_stock_own_center,
          },
        },
      };

      if (!isExport) {
        responseData.data.pagination = {
          currentPage: pageNum,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: limitNum,
          hasNext: false,
          hasPrev: false,
        };
      }

      return res.status(200).json(responseData);
    }

    const productIds_list = products.map((product) => product._id);
    
    // ========== DATE RANGE FILTER - PROPERLY IMPLEMENTED ==========
    const dateFilter = {};
    
    // CRITICAL FIX: Date filter for all stock-related queries
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      
      if (startDate) {
        const startDateTime = new Date(startDate);
        startDateTime.setHours(0, 0, 0, 0);
        dateFilter.createdAt.$gte = startDateTime;
        console.log(`[DATE FILTER] Start date: ${startDateTime.toISOString()}`);
      }
      
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        dateFilter.createdAt.$lte = endDateTime;
        console.log(`[DATE FILTER] End date: ${endDateTime.toISOString()}`);
      }
    } else {
      console.log(`[DATE FILTER] No date filter applied`);
    }

    // Get stock data for all centers
    let allStockData = [];
    
    for (const center of targetCenters) {
      let centerStockInfo = [];
      
      // Damage Return with date filter
      const damageReturnMatch = {
        center: center._id,
        status: "approved",
        product: { $in: productIds_list }
      };
      
      if (startDate || endDate) {
        damageReturnMatch.createdAt = dateFilter.createdAt;
        console.log(`[DAMAGE RETURN] Applying date filter to damage returns for center ${center.centerName}`);
      }
      
      const damageReturnData = await DamageReturn.aggregate([
        { $match: damageReturnMatch },
        { $group: {
          _id: "$product",
          damageReturnQuantity: { $sum: "$quantity" },
          damageReturnEntries: { $sum: 1 }
        }}
      ]);

      const damageReturnMap = new Map();
      damageReturnData.forEach(item => {
        damageReturnMap.set(item._id.toString(), {
          damageReturnQuantity: item.damageReturnQuantity,
          damageReturnEntries: item.damageReturnEntries
        });
      });

      if (center.centerType === "Outlet") {
        // Outlet stock query with date filter on purchase
        const purchaseMatch = {
          outlet: center._id,
          "products.product": { $in: productIds_list }
        };
        
        if (startDate || endDate) {
          purchaseMatch.createdAt = dateFilter.createdAt;
          console.log(`[OUTLET ${center.centerName}] Applying date filter to purchases`);
        }
        
        const [outletStockData, purchaseData] = await Promise.all([
          OutletStock.find({
            outlet: center._id,
            product: { $in: productIds_list },
          }).select(
            "product totalQuantity availableQuantity inTransitQuantity serialNumbers"
          ).lean(),

          StockPurchase.aggregate([
            { $match: purchaseMatch },
            { $unwind: "$products" },
            { $match: { "products.product": { $in: productIds_list } }},
            { $group: {
              _id: "$products.product",
              totalPurchased: { $sum: "$products.purchasedQuantity" },
              totalAvailable: { $sum: "$products.availableQuantity" },
              purchaseCount: { $sum: 1 },
            }},
          ]),
        ]);

        const outletStockMap = new Map();
        outletStockData.forEach((item) => {
          const damagedQuantity = item.serialNumbers.filter(
            (sn) => sn.status === "damaged"
          ).length;
          const damageReturnInfo = damageReturnMap.get(item.product.toString());

          outletStockMap.set(item.product.toString(), {
            currentTotalQuantity: item.totalQuantity,
            currentAvailableQuantity: item.availableQuantity,
            currentInTransitQuantity: item.inTransitQuantity,
            serialNumbersCount: item.serialNumbers.length,
            hasSerialNumbers: item.serialNumbers.length > 0,
            damagedQuantity: damagedQuantity,
            damageReturnQuantity: damageReturnInfo?.damageReturnQuantity || 0,
            damageReturnEntries: damageReturnInfo?.damageReturnEntries || 0,
            effectiveAvailableQuantity: Math.max(
              0,
              item.availableQuantity - damagedQuantity
            ),
          });
        });

        const purchaseMap = new Map();
        purchaseData.forEach((item) => {
          purchaseMap.set(item._id.toString(), {
            totalPurchased: item.totalPurchased,
            totalAvailable: item.totalAvailable,
            purchaseCount: item.purchaseCount,
          });
        });

        centerStockInfo = productIds_list.map((productId) => {
          const outletStock = outletStockMap.get(productId.toString());
          const purchaseInfo = purchaseMap.get(productId.toString());

          return {
            _id: productId,
            centerId: center._id,
            centerName: center.centerName,
            centerCode: center.centerCode,
            centerType: center.centerType,
            reseller: center.reseller,
            totalPurchased: purchaseInfo?.totalPurchased || 0,
            totalAvailable: purchaseInfo?.totalAvailable || 0,
            purchaseCount: purchaseInfo?.purchaseCount || 0,
            currentTotalQuantity: outletStock?.currentTotalQuantity || 0,
            currentAvailableQuantity: outletStock?.currentAvailableQuantity || 0,
            currentInTransitQuantity: outletStock?.currentInTransitQuantity || 0,
            serialNumbersCount: outletStock?.serialNumbersCount || 0,
            hasSerialNumbers: outletStock?.hasSerialNumbers || false,
            damagedQuantity: outletStock?.damagedQuantity || 0,
            damageReturnQuantity: outletStock?.damageReturnQuantity || 0,
            damageReturnEntries: outletStock?.damageReturnEntries || 0,
            effectiveAvailableQuantity: outletStock?.effectiveAvailableQuantity || 0,
          };
        });
      } else if (center.centerType === "Center") {
        const centerStockMatch = {
          center: center._id,
          product: { $in: productIds_list }
        };
        
        if (startDate || endDate) {
          centerStockMatch.createdAt = dateFilter.createdAt;
          console.log(`[CENTER ${center.centerName}] Applying date filter to center stock`);
        }
        
        const centerStockData = await CenterStock.aggregate([
          { $match: centerStockMatch },
          { $addFields: {
            damagedQuantity: {
              $size: {
                $filter: {
                  input: "$serialNumbers",
                  as: "serial",
                  cond: { $eq: ["$$serial.status", "damaged"] },
                },
              },
            },
            availableSerialsCount: {
              $size: {
                $filter: {
                  input: "$serialNumbers",
                  as: "serial",
                  cond: { $eq: ["$$serial.status", "available"] },
                },
              },
            },
          }},
          { $lookup: {
            from: "products",
            localField: "product",
            foreignField: "_id",
            as: "productDetails",
          }},
          { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true }},
          { $group: {
            _id: "$product",
            totalQuantity: { $sum: "$totalQuantity" },
            availableQuantity: { $sum: "$availableQuantity" },
            inTransitQuantity: { $sum: "$inTransitQuantity" },
            damagedQuantity: { $sum: "$damagedQuantity" },
            availableSerialsCount: { $sum: "$availableSerialsCount" },
            stockEntries: { $sum: 1 },
            trackSerialNumber: { $first: "$productDetails.trackSerialNumber" },
          }},
          { $project: {
            totalQuantity: 1,
            availableQuantity: 1,
            inTransitQuantity: 1,
            damagedQuantity: 1,
            availableSerialsCount: 1,
            stockEntries: 1,
            trackSerialNumber: 1,
            effectiveAvailableQuantity: {
              $cond: {
                if: { $eq: ["$trackSerialNumber", "Yes"] },
                then: "$availableSerialsCount",
                else: { $max: [0, { $subtract: ["$availableQuantity", "$damagedQuantity"] }] },
              },
            },
          }},
        ]);

        centerStockInfo = centerStockData.map(item => {
          const damageReturnInfo = damageReturnMap.get(item._id.toString());
          return {
            ...item,
            centerId: center._id,
            centerName: center.centerName,
            centerCode: center.centerCode,
            centerType: center.centerType,
            reseller: center.reseller,
            damageReturnQuantity: damageReturnInfo?.damageReturnQuantity || 0,
            damageReturnEntries: damageReturnInfo?.damageReturnEntries || 0
          };
        });
        
        const existingProductIds = new Set(centerStockData.map(item => item._id.toString()));
        const missingProducts = productIds_list.filter(id => !existingProductIds.has(id.toString()));
        
        for (const productId of missingProducts) {
          const damageReturnInfo = damageReturnMap.get(productId.toString());
          if (damageReturnInfo && damageReturnInfo.damageReturnQuantity > 0) {
            centerStockInfo.push({
              _id: productId,
              centerId: center._id,
              centerName: center.centerName,
              centerCode: center.centerCode,
              centerType: center.centerType,
              reseller: center.reseller,
              totalQuantity: 0,
              availableQuantity: 0,
              inTransitQuantity: 0,
              damagedQuantity: 0,
              availableSerialsCount: 0,
              stockEntries: 0,
              trackSerialNumber: "No",
              effectiveAvailableQuantity: 0,
              damageReturnQuantity: damageReturnInfo.damageReturnQuantity,
              damageReturnEntries: damageReturnInfo.damageReturnEntries
            });
          }
        }
      }
      
      allStockData.push(...centerStockInfo);
    }

    // Build stock map
    const stockMap = new Map();
    allStockData.forEach((item) => {
      const key = `${item.centerId}_${item._id}`;
      stockMap.set(key, item);
    });

    // Format products with stock data
    let formattedProducts = [];
    
    for (const product of products) {
      const productId = product._id.toString();
      const productCategory = product.productCategory
        ? {
            _id: product.productCategory._id,
            name: product.productCategory.productCategory,
            code: product.productCategory.categoryCode,
          }
        : null;
      
      for (const center of targetCenters) {
        const stockKey = `${center._id}_${productId}`;
        const stockData = stockMap.get(stockKey) || {
          totalQuantity: 0,
          availableQuantity: 0,
          inTransitQuantity: 0,
          damagedQuantity: 0,
          damageReturnQuantity: 0,
          damageReturnEntries: 0,
          availableSerialsCount: 0,
          effectiveAvailableQuantity: 0,
          totalPurchased: 0,
          currentAvailableQuantity: 0,
        };
        
        let stockInfo = {};
        
        if (center.centerType === "Outlet") {
          stockInfo = {
            totalQuantity: stockData.currentTotalQuantity || 0,
            availableQuantity: stockData.currentAvailableQuantity || 0,
            inTransitQuantity: stockData.currentInTransitQuantity || 0,
            consumedQuantity: 0,
            damagedQuantity: stockData.damagedQuantity || 0,
            damageReturnQuantity: stockData.damageReturnQuantity || 0,
            damageReturnEntries: stockData.damageReturnEntries || 0,
            availableSerialsCount: stockData.serialNumbersCount || 0,
            consumedSerialsCount: 0,
            inTransitSerialsCount: 0,
            transferredSerialsCount: 0,
            effectiveAvailableQuantity: stockData.effectiveAvailableQuantity || 0,
          };
        } else {
          stockInfo = {
            totalQuantity: stockData.totalQuantity || 0,
            availableQuantity: stockData.availableQuantity || 0,
            inTransitQuantity: stockData.inTransitQuantity || 0,
            consumedQuantity: 0,
            damagedQuantity: stockData.damagedQuantity || 0,
            damageReturnQuantity: stockData.damageReturnQuantity || 0,
            damageReturnEntries: stockData.damageReturnEntries || 0,
            availableSerialsCount: stockData.availableSerialsCount || 0,
            consumedSerialsCount: 0,
            inTransitSerialsCount: 0,
            transferredSerialsCount: 0,
            effectiveAvailableQuantity: stockData.effectiveAvailableQuantity || 0,
          };
        }
        
        const effectiveQty = stockInfo.effectiveAvailableQuantity;
        
        // Apply stock status filter
        let includeProduct = true;
        if (stockStatus) {
          if (stockStatus === "out_of_stock" && effectiveQty !== 0) includeProduct = false;
          if (stockStatus === "low_stock" && (effectiveQty === 0 || effectiveQty >= 10)) includeProduct = false;
          if (stockStatus === "in_stock" && effectiveQty === 0) includeProduct = false;
        }
        
        if (minStock && effectiveQty < parseInt(minStock)) includeProduct = false;
        if (maxStock && effectiveQty > parseInt(maxStock)) includeProduct = false;
        
        if (!includeProduct) continue;
        
        const stockStatusText = effectiveQty === 0
          ? "out_of_stock"
          : effectiveQty < 10
          ? "low_stock"
          : "in_stock";
        
        formattedProducts.push({
          _id: product._id,
          product: product._id,
          productName: product.productTitle,
          productCode: product.productCode,
          productDescription: product.description,
          productPrice: product.productPrice,
          productImage: product.productImage,
          productCategory: productCategory,
          trackSerialNumber: product.trackSerialNumber,
          center: center._id,
          centerName: center.centerName,
          centerCode: center.centerCode,
          centerType: center.centerType,
          resellerId: center.reseller?._id,
          resellerName: center.reseller?.businessName,
          ...stockInfo,
          stockStatus: stockStatusText,
          lastUpdated: new Date().toISOString(),
          serialNumbers: [],
        });
      }
    }

    // Sorting
    const validSortFields = [
      "productName", "productCode", "effectiveAvailableQuantity", 
      "stockStatus", "totalQuantity", "availableQuantity", "damageReturnQuantity",
      "centerName", "centerCode", "resellerName"
    ];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "productName";
    
    formattedProducts.sort((a, b) => {
      let aValue = a[actualSortBy];
      let bValue = b[actualSortBy];
      
      if (actualSortBy === "effectiveAvailableQuantity" || 
          actualSortBy === "totalQuantity" || 
          actualSortBy === "availableQuantity" ||
          actualSortBy === "damageReturnQuantity") {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      } else {
        aValue = String(aValue || "").toLowerCase();
        bValue = String(bValue || "").toLowerCase();
      }
      
      const multiplier = sortOrder === "desc" ? -1 : 1;
      
      if (aValue < bValue) return -1 * multiplier;
      if (aValue > bValue) return 1 * multiplier;
      return 0;
    });

    // Summary
    const summary = {
      totalProducts: formattedProducts.length,
      totalQuantity: formattedProducts.reduce((sum, p) => sum + p.totalQuantity, 0),
      totalAvailable: formattedProducts.reduce((sum, p) => sum + p.availableQuantity, 0),
      totalInTransit: formattedProducts.reduce((sum, p) => sum + p.inTransitQuantity, 0),
      totalConsumed: formattedProducts.reduce((sum, p) => sum + p.consumedQuantity, 0),
      totalDamaged: formattedProducts.reduce((sum, p) => sum + p.damagedQuantity, 0),
      totalDamageReturn: formattedProducts.reduce((sum, p) => sum + p.damageReturnQuantity, 0),
      totalEffectiveAvailable: formattedProducts.reduce((sum, p) => sum + p.effectiveAvailableQuantity, 0),
      lowStockItems: formattedProducts.filter(p => p.stockStatus === "low_stock").length,
      outOfStockItems: formattedProducts.filter(p => p.stockStatus === "out_of_stock").length,
      inStockItems: formattedProducts.filter(p => p.stockStatus === "in_stock").length,
    };

    // ========== EXCEL EXPORT HANDLING ==========
    if (isExport === "true" || isExport === true) {
      try {
        console.log(`[EXPORT] Generating Excel file with ${formattedProducts.length} records`);
        
        // Prepare data for Excel
        const excelData = formattedProducts.map(item => ({
          'Product Name': item.productName,
          'Product Code': item.productCode,
          'Product Category': item.productCategory?.name || 'N/A',
          'Reseller Name': item.resellerName || 'N/A',
          'Center Name': item.centerName,
          'Center Code': item.centerCode,
          'Center Type': item.centerType,
          'Total Quantity': item.totalQuantity,
          'Available Quantity': item.availableQuantity,
          'In Transit Quantity': item.inTransitQuantity,
          'Damaged Quantity': item.damagedQuantity,
          'Damage Return Quantity': item.damageReturnQuantity,
          'Effective Available Quantity': item.effectiveAvailableQuantity,
          'Stock Status': item.stockStatus === 'out_of_stock' ? 'Out of Stock' : 
                         item.stockStatus === 'low_stock' ? 'Low Stock' : 'In Stock',
          'Track Serial Number': item.trackSerialNumber === 'Yes' ? 'Yes' : 'No',
          'Product Price': item.productPrice || 0,
          'Last Updated': new Date(item.lastUpdated).toLocaleString(),
        }));
        
        // Add summary sheet
        const summaryData = [{
          'Report Generated': new Date().toLocaleString(),
          'Date Range': `${startDate || 'All'} to ${endDate || 'All'}`,
          'Reseller Filter': selectedReseller?.businessName || 'All Resellers',
          'Centers': targetCenters.map(c => c.centerName).join(', '),
          'Total Products': summary.totalProducts,
          'Total Quantity': summary.totalQuantity,
          'Total Available': summary.totalAvailable,
          'Total Effective Available': summary.totalEffectiveAvailable,
          'Low Stock Items': summary.lowStockItems,
          'Out of Stock Items': summary.outOfStockItems,
          'In Stock Items': summary.inStockItems,
        }];
        
        // Create workbook
        const workbook = XLSX.utils.book_new();
        
        // Main data sheet
        const mainSheet = XLSX.utils.json_to_sheet(excelData);
        
        // Set column widths for better readability
        mainSheet['!cols'] = [
          { wch: 30 }, // Product Name
          { wch: 20 }, // Product Code
          { wch: 20 }, // Product Category
          { wch: 25 }, // Reseller Name
          { wch: 25 }, // Center Name
          { wch: 15 }, // Center Code
          { wch: 15 }, // Center Type
          { wch: 15 }, // Total Quantity
          { wch: 15 }, // Available Quantity
          { wch: 15 }, // In Transit Quantity
          { wch: 15 }, // Damaged Quantity
          { wch: 15 }, // Damage Return Quantity
          { wch: 15 }, // Effective Available Quantity
          { wch: 15 }, // Stock Status
          { wch: 15 }, // Track Serial Number
          { wch: 15 }, // Product Price
          { wch: 20 }, // Last Updated
        ];
        
        XLSX.utils.book_append_sheet(workbook, mainSheet, 'Stock Report');
        
        // Summary sheet
        const summarySheet = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
        
        // Filters applied sheet
        const filtersData = [{
          'Filter Type': 'Applied Value',
          'Start Date': startDate || 'Not Applied',
          'End Date': endDate || 'Not Applied',
          'Reseller': selectedReseller?.businessName || 'All Resellers',
          'Reseller ID': resellerId || 'All',
          'Centers': targetCenters.map(c => c.centerName).join(', '),
          'Center IDs': targetCenterIds.join(', '),
          'Stock Status': stockStatus || 'All',
          'Search Term': search || 'None',
          'Category': category || 'All',
          'Min Stock': minStock || 'None',
          'Max Stock': maxStock || 'None',
          'Product IDs': productIds || 'All',
        }];
        
        const filtersSheet = XLSX.utils.json_to_sheet(filtersData);
        XLSX.utils.book_append_sheet(workbook, filtersSheet, 'Applied Filters');
        
        // Generate Excel file
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        // Set response headers for file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=stock_report_${new Date().toISOString().split('T')[0]}.xlsx`);
        res.setHeader('Content-Length', excelBuffer.length);
        
        return res.send(excelBuffer);
        
      } catch (exportError) {
        console.error("[EXPORT ERROR]", exportError);
        return res.status(500).json({
          success: false,
          message: "Error generating Excel export",
          error: exportError.message
        });
      }
    }

    // ========== NON-EXPORT RESPONSE ==========
    const responseData = {
      success: true,
      message: `Products with stock information retrieved successfully`,
      data: {
        stock: formattedProducts,
        summary: summary,
        centers: targetCenters.map(c => ({
          _id: c._id,
          centerName: c.centerName,
          centerCode: c.centerCode,
          centerType: c.centerType,
          reseller: c.reseller
        })),
        filters: {
          centers: targetCenterIds,
          reseller: resellerId || null,
          resellerName: selectedReseller?.businessName || null,
          product: product || "all",
          products: productIds || "all",
          search: search || "",
          category: category || "all",
          startDate: startDate || null,
          endDate: endDate || null,
          stockStatus: stockStatus || "all",
          minStock: minStock || null,
          maxStock: maxStock || null,
        },
        permissions: {
          canViewAllCenters: permissions.available_stock_all_center,
          canViewOwnCenter: permissions.available_stock_own_center,
        },
      },
    };

    if (!isExport) {
      const totalFilteredProducts = formattedProducts.length;
      responseData.data.pagination = {
        currentPage: pageNum,
        totalPages: Math.ceil(totalFilteredProducts / limitNum),
        totalItems: totalFilteredProducts,
        itemsPerPage: limitNum,
        hasNext: pageNum < Math.ceil(totalFilteredProducts / limitNum),
        hasPrev: pageNum > 1,
      };
      
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      responseData.data.stock = formattedProducts.slice(startIndex, endIndex);
    }

    console.log(`[SUCCESS] Returned ${formattedProducts.length} stock records`);
    res.status(200).json(responseData);
    
  } catch (error) {
    console.error("[ERROR] Error retrieving products with stock:", error);
    handleControllerError(error, res);
  }
};

const buildArrayFilterStockUsage = (value) => {
  if (!value) return null;
  const values = value.includes(",") 
    ? value.split(",").map(item => item.trim())
    : [value];
  const objectIds = values.map(item => {
    if (mongoose.Types.ObjectId.isValid(item)) {
      return new mongoose.Types.ObjectId(item);
    }
    return item;
  });
  
  return objectIds.length === 1 ? objectIds[0] : { $in: objectIds };
};

const buildStockUsageFilter = (query, permissions, userCenter) => {
  const {
    centerId,
    center,
    usageType,
    status,
    product,
    productId, 
    startDate,
    endDate,
    createdBy,
    search,
  } = query;

  const filter = {};
  if (
    permissions.available_stock_own_center &&
    !permissions.available_stock_all_center &&
    userCenter
  ) {
    filter.center = new mongoose.Types.ObjectId(userCenter._id || userCenter);
  } else if (centerId || center) {
    const centerFilterValue = centerId || center;
    const centerFilter = buildArrayFilter(centerFilterValue);
    if (centerFilter) filter.center = centerFilter;
  } else if (permissions.available_stock_all_center) {
  } else {
    filter.center = new mongoose.Types.ObjectId(userCenter._id || userCenter);
  }
  if (usageType && usageType !== 'all') {
    const usageTypeFilter = buildArrayFilter(usageType);
    if (usageTypeFilter) filter.usageType = usageTypeFilter;
  }
  if (status && status !== 'all') {
    const statusFilter = buildArrayFilter(status);
    if (statusFilter) filter.status = statusFilter;
  }
  const productFilterValue = product || productId;
  if (productFilterValue && productFilterValue !== 'all') {
    const productFilter = buildArrayFilterStockUsage(productFilterValue);
    if (productFilter) {
      filter.items = {
        $elemMatch: {
          product: productFilter
        }
      };
    }
  }
  if (createdBy && createdBy !== 'all') {
    const createdByFilter = buildArrayFilterStockUsage(createdBy);
    if (createdByFilter) filter.createdBy = createdByFilter;
  }
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filter.date.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.date.$lte = end;
    }
  }
  if (search && search.trim() !== '') {
    filter.$or = [
      { remark: { $regex: search.trim(), $options: "i" } },
      { "items.productRemark": { $regex: search.trim(), $options: "i" } },
    ];
  }

  console.log('Final filter:', JSON.stringify(filter, null, 2));
  return filter;
};

const buildStockUsageSortOptions = (sortBy = "date", sortOrder = "desc") => {
  const validSortFields = [
    "date",
    "createdAt",
    "updatedAt",
    "usageType",
    "status",
  ];

  const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "date";
  return { [actualSortBy]: sortOrder === "desc" ? -1 : 1 };
};

export const getStockUsageByCenter = async (req, res) => {
  try {
    console.log('========== START getStockUsageByCenter ==========');
    console.log('Full req.query:', JSON.stringify(req.query, null, 2));
    
    const { hasAccess, permissions, userCenter } =
      checkAvailableStockPermissions(req, [
        "available_stock_own_center",
        "available_stock_all_center",
      ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. available_stock_own_center or available_stock_all_center permission required.",
      });
    }

    const {
      page = 1,
      limit = 100,
      sortBy = "date",
      sortOrder = "desc",
      startDate,
      endDate,
      export: isExport = false,
      centerId,
      center,
      centerIds,
      resellerId,
      usageType,
      status,
      product,
      productId,
      search,
      ...filterParams
    } = req.query;

    console.log('Extracted params:', { page, limit, sortBy, sortOrder, startDate, endDate, isExport });
    console.log('Filter params:', { centerId, center, centerIds, resellerId, usageType, status, product, productId, search });
    
    // ========== MANDATORY DATE FILTER FOR EXPORT ==========
    if (isExport === "true" || isExport === true) {
      if (!startDate && !endDate) {
        return res.status(400).json({
          success: false,
          message: "Date range (startDate and/or endDate) is required for Excel export. Please provide at least one date filter.",
        });
      }
      
      if (startDate && isNaN(new Date(startDate).getTime())) {
        return res.status(400).json({
          success: false,
          message: `Invalid startDate format: ${startDate}. Please use YYYY-MM-DD format.`
        });
      }
      
      if (endDate && isNaN(new Date(endDate).getTime())) {
        return res.status(400).json({
          success: false,
          message: `Invalid endDate format: ${endDate}. Please use YYYY-MM-DD format.`
        });
      }
      
      console.log(`[EXPORT] Export requested with date filter - StartDate: ${startDate}, EndDate: ${endDate}`);
    }
    
    // ========== RESELLER AND CENTER FILTER LOGIC ==========
    let targetCenterIds = [];
    
    // Case 1: If centerIds provided directly
    if (centerIds) {
      const centerIdArray = Array.isArray(centerIds) ? centerIds : centerIds.split(',');
      targetCenterIds = centerIdArray;
      console.log(`Using specific center IDs: ${targetCenterIds.join(', ')}`);
    }
    // Case 2: If single centerId provided
    else if (centerId) {
      targetCenterIds = [centerId];
      console.log(`Using single center ID: ${centerId}`);
    }
    // Case 3: If resellerId provided, get all centers under that reseller
    else if (resellerId) {
      const centersUnderReseller = await Center.find({ 
        reseller: resellerId,
        status: "Enable"
      }).select("_id");
      
      if (centersUnderReseller.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No active centers found under reseller ID: ${resellerId}`,
        });
      }
      
      targetCenterIds = centersUnderReseller.map(c => c._id.toString());
      console.log(`Found ${targetCenterIds.length} centers under reseller ${resellerId}: ${targetCenterIds.join(', ')}`);
    }
    // Case 4: Use user's own center
    else {
      const user = await User.findById(req.user._id).populate("center");
      if (user && user.center) {
        targetCenterIds = [user.center._id.toString()];
        console.log(`Using user's own center: ${user.center._id}`);
      }
    }
    
    // Remove duplicates
    targetCenterIds = [...new Set(targetCenterIds)];
    
    // ========== BUILD FILTER ==========
    const filter = {};
    
    // Apply center filter if we have target centers
    if (targetCenterIds.length > 0) {
      filter.center = { $in: targetCenterIds };
      console.log(`Filtering by centers: ${targetCenterIds.join(', ')}`);
    }
    
    // Usage Type filter
    if (usageType && usageType !== 'all') {
      filter.usageType = usageType;
      console.log(`Filter by usageType: ${usageType}`);
    }
    
    // Status filter
    if (status && status !== 'all') {
      filter.status = status;
      console.log(`Filter by status: ${status}`);
    }
    
    // Date range filter
    if (startDate || endDate) {
      filter.date = {};
      
      if (startDate) {
        const startDateTime = new Date(startDate);
        startDateTime.setUTCHours(0, 0, 0, 0);
        filter.date.$gte = startDateTime;
        console.log(`Start date filter: ${filter.date.$gte.toISOString()}`);
      }
      
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setUTCHours(23, 59, 59, 999);
        filter.date.$lte = endDateTime;
        console.log(`End date filter: ${filter.date.$lte.toISOString()}`);
      }
    }
    
    // Search filter
    if (search && search !== '') {
      filter.$or = [
        { remark: { $regex: search, $options: "i" } },
        { usageType: { $regex: search, $options: "i" } }
      ];
      console.log(`Search filter: ${search}`);
    }

    console.log('========== FINAL MONGODB FILTER ==========');
    console.log('Final filter:', JSON.stringify(filter, null, 2));

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = {};
    sortOptions[sortBy === 'date' ? 'date' : 'createdAt'] = sortOrder === 'desc' ? -1 : 1;
    
    // ========== FETCH DATA ==========
    let stockUsages, total;
    
    const query = StockUsage.find(filter)
      .populate("center", "centerName centerCode centerType")
      .populate("customer", "name username mobile")
      .populate("fromBuilding", "buildingName displayName")
      .populate("toBuilding", "buildingName displayName")
      .populate("fromControlRoom", "buildingName displayName")
      .populate({
        path: "items.product",
        select: "productTitle productCode productCategory trackSerialNumber",
      })
      .sort(sortOptions);
    
    if (isExport === "true" || isExport === true) {
      stockUsages = await query.lean();
      total = stockUsages.length;
      console.log(`[EXPORT] Exporting ${total} stock usage records`);
    } else {
      total = await StockUsage.countDocuments(filter);
      stockUsages = await query.skip(skip).limit(limitNum).lean();
      console.log(`Found ${stockUsages.length} records out of ${total} total`);
    }

    // Process and format the data
    const formattedData = [];
    let totalUsageSum = 0;
    let totalDamageSum = 0;
    const usageTypeMap = new Map();

    for (const usage of stockUsages) {
      let itemsToProcess = usage.items || [];
      
      // Apply product filter at item level
      if (productId && productId !== 'all') {
        const productIdsArray = productId.split(',');
        itemsToProcess = itemsToProcess.filter(item => {
          const itemProductId = item.product?._id ? item.product._id.toString() : item.product?.toString();
          return productIdsArray.some(pid => itemProductId === pid);
        });
      } else if (product && product !== 'all') {
        const productIdsArray = product.split(',');
        itemsToProcess = itemsToProcess.filter(item => {
          const itemProductId = item.product?._id ? item.product._id.toString() : item.product?.toString();
          return productIdsArray.some(pid => itemProductId === pid);
        });
      }

      for (const [itemIndex, item] of itemsToProcess.entries()) {
        let damageQty = 0;
        if (usage.usageType === "Damage" && usage.status === "completed") {
          damageQty = item.quantity || 0;
        }
        
        totalUsageSum += item.quantity || 0;
        totalDamageSum += damageQty;
        
        // Track by usage type for summary
        if (!usageTypeMap.has(usage.usageType)) {
          usageTypeMap.set(usage.usageType, { totalUsage: 0, totalDamage: 0, count: 0 });
        }
        const typeStats = usageTypeMap.get(usage.usageType);
        typeStats.totalUsage += item.quantity || 0;
        typeStats.totalDamage += damageQty;
        typeStats.count += 1;

        let entityName = "N/A";
        switch (usage.usageType) {
          case "Customer":
            entityName = usage.customer?.name || "Unknown Customer";
            break;
          case "Building":
            entityName = usage.fromBuilding?.buildingName || "Unknown Building";
            break;
          case "Building to Building":
            entityName = `${usage.fromBuilding?.buildingName || "Unknown"} → ${
              usage.toBuilding?.buildingName || "Unknown"
            }`;
            break;
          case "Control Room":
            entityName = usage.fromControlRoom?.buildingName || "Unknown Control Room";
            break;
          default:
            entityName = usage.usageType;
        }
        
        const tracksSerial = item.product?.trackSerialNumber === "Yes";
        let serialNumbers = [];
        
        if (tracksSerial && item.serialNumbers && item.serialNumbers.length > 0) {
          serialNumbers = item.serialNumbers;
        }

        formattedData.push({
          _id: `${usage._id}_${itemIndex}`,
          Date: usage.date ? new Date(usage.date).toISOString().split('T')[0] : "N/A",
          Type: usage.usageType || "N/A",
          Center: usage.center?.centerName || "Unknown Center",
          Product: item.product?.productTitle || "Unknown Product",
          ProductCode: item.product?.productCode || "N/A",
          "Old Stock": item.oldStock || 0,
          Quantity: item.quantity || 0,
          "Damage Quantity": damageQty,
          "New Stock": item.newStock || 0,
          Entity: entityName,
          Remark: usage.remark || "",
          Status: usage.status || "N/A",
          "Track Serial Number": item.product?.trackSerialNumber || "No",
          "Serial Numbers": serialNumbers.length > 0 ? serialNumbers.join(', ') : "N/A",
          "Serial Count": serialNumbers.length,
        });
      }
    }

    console.log(`Total Usage Sum: ${totalUsageSum}, Total Damage Sum: ${totalDamageSum}`);
    console.log(`Unique centers in result: ${[...new Set(formattedData.map(d => d.Center))].join(', ')}`);

    // Convert usage type map to array
    const byUsageType = Array.from(usageTypeMap.entries()).map(([type, stats]) => ({
      _id: type,
      totalUsage: stats.totalUsage,
      totalDamage: stats.totalDamage,
      count: stats.count
    }));

    // Get center info for response
    let centerInfo = null;
    if (targetCenterIds.length === 1) {
      centerInfo = await Center.findById(targetCenterIds[0]).select("centerName centerCode centerType");
    }

    // ========== EXCEL EXPORT HANDLING ==========
    if (isExport === "true" || isExport === true) {
      try {
        console.log(`[EXPORT] Generating Excel file with ${formattedData.length} records`);
        
        // Prepare data for Excel main sheet
        const excelData = formattedData.map(item => ({
          'Date': item.Date,
          'Type': item.Type,
          'Center': item.Center,
          'Product': item.Product,
          'Product Code': item.ProductCode,
          'Old Stock': item['Old Stock'],
          'Quantity': item.Quantity,
          'Damage Quantity': item['Damage Quantity'],
          'New Stock': item['New Stock'],
          'Entity': item.Entity,
          'Remark': item.Remark,
          'Status': item.Status,
          'Track Serial Number': item['Track Serial Number'],
          'Serial Numbers': item['Serial Numbers'],
          'Serial Count': item['Serial Count'],
        }));
        
        // Summary sheet data
        const summaryData = [{
          'Report Generated': new Date().toLocaleString(),
          'Date Range': `${startDate || 'All'} to ${endDate || 'All'}`,
          'Reseller ID': resellerId || 'All',
          'Center IDs': targetCenterIds.join(', '),
          'Total Records': total,
          'Total Items Used': totalUsageSum,
          'Total Damaged Items': totalDamageSum,
          'Unique Transactions': formattedData.length,
        }];
        
        // Usage Type Summary
        const usageTypeSummary = byUsageType.map(type => ({
          'Usage Type': type._id,
          'Total Usage Quantity': type.totalUsage,
          'Total Damage Quantity': type.totalDamage,
          'Number of Transactions': type.count,
        }));
        
        // Filters applied sheet
        const filtersData = [{
          'Filter Name': 'Applied Value',
          'Start Date': startDate || 'Not Applied',
          'End Date': endDate || 'Not Applied',
          'Reseller ID': resellerId || 'Not Applied',
          'Center IDs': targetCenterIds.join(', ') || 'All Centers',
          'Usage Type': usageType || 'All',
          'Status': status || 'All',
          'Product ID': productId || product || 'All',
          'Search Term': search || 'None',
          'Sort By': sortBy,
          'Sort Order': sortOrder,
        }];
        
        // Create workbook
        const workbook = XLSX.utils.book_new();
        
        // Main data sheet
        const mainSheet = XLSX.utils.json_to_sheet(excelData);
        
        // Set column widths
        mainSheet['!cols'] = [
          { wch: 12 }, // Date
          { wch: 15 }, // Type
          { wch: 25 }, // Center
          { wch: 35 }, // Product
          { wch: 15 }, // Product Code
          { wch: 12 }, // Old Stock
          { wch: 10 }, // Quantity
          { wch: 12 }, // Damage Quantity
          { wch: 12 }, // New Stock
          { wch: 30 }, // Entity
          { wch: 40 }, // Remark
          { wch: 12 }, // Status
          { wch: 15 }, // Track Serial Number
          { wch: 40 }, // Serial Numbers
          { wch: 12 }, // Serial Count
        ];
        
        XLSX.utils.book_append_sheet(workbook, mainSheet, 'Stock Transactions');
        
        // Summary sheet
        const summarySheet = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
        
        // Usage Type Summary sheet
        if (usageTypeSummary.length > 0) {
          const usageTypeSheet = XLSX.utils.json_to_sheet(usageTypeSummary);
          XLSX.utils.book_append_sheet(workbook, usageTypeSheet, 'Usage Type Summary');
        }
        
        // Filters sheet
        const filtersSheet = XLSX.utils.json_to_sheet(filtersData);
        XLSX.utils.book_append_sheet(workbook, filtersSheet, 'Applied Filters');
        
        // Generate Excel file
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=stock_usage_report_${new Date().toISOString().split('T')[0]}.xlsx`);
        res.setHeader('Content-Length', excelBuffer.length);
        
        return res.send(excelBuffer);
        
      } catch (exportError) {
        console.error("[EXPORT ERROR]", exportError);
        return res.status(500).json({
          success: false,
          message: "Error generating Excel export",
          error: exportError.message
        });
      }
    }

    // ========== NON-EXPORT RESPONSE ==========
    console.log('========== END getStockUsageByCenter - SUCCESS ==========');
    
    res.status(200).json({
      success: true,
      message: "Stock usage by center retrieved successfully",
      data: formattedData,
      center: centerInfo ? {
        id: centerInfo._id,
        name: centerInfo.centerName,
        code: centerInfo.centerCode,
        type: centerInfo.centerType,
      } : null,
      summary: {
        totalRecords: total,
        totalUsage: totalUsageSum,
        totalDamage: totalDamageSum,
        byUsageType: byUsageType,
      },
      permissions: {
        canViewAllCenters: permissions.available_stock_all_center,
        canViewOwnCenter: permissions.available_stock_own_center,
        currentAccess: permissions.available_stock_all_center
          ? "all_centers"
          : "own_center",
      },
      pagination: !(isExport === "true" || isExport === true) ? {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      } : undefined,
      filters: {
        centers: targetCenterIds,
        resellerId: resellerId || null,
        usageType: usageType || "all",
        status: status || "all",
        product: productId || product || "all",
        startDate: startDate || "all",
        endDate: endDate || "all",
        search: search || "",
      }
    });
  } catch (error) {
    console.error("========== ERROR in getStockUsageByCenter ==========");
    console.error("Error details:", error);
    console.error("Error stack:", error.stack);
    handleControllerError(error, res);
  }
};
