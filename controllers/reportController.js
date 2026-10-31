import User from "../models/User.js";
import mongoose from "mongoose";
import StockPurchase from "../models/StockPurchase.js";
import StockRequest from "../models/StockRequest.js";
import StockTransfer from "../models/StockTransfer.js";
import StockUsage from "../models/StockUsage.js";
import CenterStock from "../models/CenterStock.js";
import ReplacementRecord from "../models/ReplacementRecord.js";
import FilledStock from "../models/FilledStock.js";
import Center from '../models/Center.js';
import ExcelJS from 'exceljs';
import Reseller from '../models/Reseller.js';
import   Purchase   from '../models/StockPurchase.js';
import XLSX from "xlsx";
import moment from 'moment';
import { Readable } from 'stream';
import Product from '../models/Product.js';


const checkReportPermissions = (req, requiredPermissions = []) => {
  const userPermissions = req.user.role?.permissions || [];

  const reportModule = userPermissions.find((perm) => perm.module === "Report");

  if (!reportModule) {
    return { hasAccess: false, permissions: {} };
  }

  const permissions = {
    view_own_report: reportModule.permissions.includes("view_own_report"),
    view_all_report: reportModule.permissions.includes("view_all_report"),
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




export const getAllStockPurchasesReports = async (req, res) => {
  try {
    console.log('=== getAllStockPurchasesReports START ===');
    console.log('Request Query:', JSON.stringify(req.query, null, 2));
    
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    console.log('Permissions Check:', {
      hasAccess,
      permissions,
      userCenter: userCenter?._id || userCenter
    });

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      page = 1,
      limit = 100,
      type,
      vendor,
      startDate,
      endDate,
      invoiceNo,
      search,
      center,
      centerId,
      resellerId,
      product,
      productId,
      sortBy = "createdAt",
      sortOrder = "desc",
      format = "json",
    } = req.query;

    const filter = {};

    console.log('Initial filter:', filter);
    console.log('resellerId received:', resellerId);
    console.log('center/centerId received:', { center, centerId });

    // Center/Outlet filtering with Reseller support - FIXED VERSION
    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.outlet = userCenterId;
        console.log('Applied user center filter:', filter.outlet);
      }
    } else if (permissions.view_all_report) {
      // If resellerId is provided, filter centers by reseller
      if (resellerId && mongoose.Types.ObjectId.isValid(resellerId)) {
        console.log('Filtering by resellerId:', resellerId);
        
        // Find all centers belonging to this reseller
        const centers = await Center.find({ 
          reseller: resellerId
        }).select("_id centerName centerCode");
        
        console.log(`Found ${centers.length} centers for reseller ${resellerId}:`, 
          centers.map(c => ({ id: c._id, name: c.centerName, code: c.centerCode })));
        
        if (centers.length === 0) {
          console.log('No centers found for this reseller');
          return res.status(200).json({
            success: true,
            message: "No centers found for this reseller",
            data: [],
            summary: {
              totalPurchases: 0,
              totalAmount: 0,
              totalTransportAmount: 0,
              totalQuantity: 0,
              grandTotal: 0
            },
            filters: {
              reseller: resellerId,
              center: center || centerId || "all",
              product: product || productId || "all",
              type: type || "all",
              vendor: vendor || "all",
              startDate: startDate || "all",
              endDate: endDate || "all",
              invoiceNo: invoiceNo || "all",
              search: search || ""
            },
            pagination: {
              currentPage: parseInt(page),
              totalPages: 0,
              totalItems: 0,
              itemsPerPage: parseInt(limit),
            },
          });
        }
        
        const centerIds = centers.map(c => c._id);
        
        // Check if specific center is provided
        const centerFilterValue = center || centerId;
        if (centerFilterValue && mongoose.Types.ObjectId.isValid(centerFilterValue)) {
          // If specific center is provided, check if it belongs to the reseller
          if (centerIds.some(id => id.toString() === centerFilterValue.toString())) {
            filter.outlet = centerFilterValue;
            console.log('Using specific center within reseller:', centerFilterValue);
          } else {
            // Center doesn't belong to reseller, use all reseller centers
            filter.outlet = { $in: centerIds };
            console.log('Center not in reseller, using all reseller centers:', centerIds.map(id => id.toString()));
          }
        } else {
          // No specific center, use all centers belonging to reseller
          filter.outlet = { $in: centerIds };
          console.log('Using all reseller centers:', centerIds.map(id => id.toString()));
        }
      } else if (resellerId) {
        console.log('Invalid resellerId format:', resellerId);
        return res.status(400).json({
          success: false,
          message: "Invalid resellerId format"
        });
      } else if (center || centerId) {
        // Support both center and centerId parameters without reseller filter
        const centerFilterValue = center || centerId;
        if (mongoose.Types.ObjectId.isValid(centerFilterValue)) {
          filter.outlet = centerFilterValue;
          console.log('Applied center filter:', filter.outlet);
        } else {
          console.log('Invalid center format:', centerFilterValue);
          return res.status(400).json({
            success: false,
            message: "Invalid centerId format"
          });
        }
      }
    }

    // Product filtering
    const productFilterValue = product || productId;
    if (productFilterValue && mongoose.Types.ObjectId.isValid(productFilterValue)) {
      filter["products.product"] = productFilterValue;
      console.log('Applied product filter:', productFilterValue);
    } else if (productFilterValue) {
      console.log('Invalid product ID format:', productFilterValue);
    }

    // Type and Vendor filtering
    if (type) {
      filter.type = type;
      console.log('Applied type filter:', type);
    }
    if (vendor && mongoose.Types.ObjectId.isValid(vendor)) {
      filter.vendor = vendor;
      console.log('Applied vendor filter:', vendor);
    } else if (vendor) {
      console.log('Invalid vendor ID format:', vendor);
    }

    // Enhanced Date range filtering with better validation
    if (startDate || endDate) {
      filter.date = {};
      console.log('Applying date filter:', { startDate, endDate });
      
      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate format. Please use YYYY-MM-DD format."
          });
        }
        start.setHours(0, 0, 0, 0);
        filter.date.$gte = start;
        console.log('Start date set to:', start);
      }
      
      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid endDate format. Please use YYYY-MM-DD format."
          });
        }
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
        console.log('End date set to:', end);
      }
    }

    // Invoice number filtering
    if (invoiceNo) {
      filter.invoiceNo = { $regex: invoiceNo, $options: "i" };
      console.log('Applied invoice filter:', invoiceNo);
    }

    // General search filtering
    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: "i" } },
        { remark: { $regex: search, $options: "i" } },
        { "vendor.businessName": { $regex: search, $options: "i" } },
        { "products.product.productTitle": { $regex: search, $options: "i" } },
        { "outlet.centerName": { $regex: search, $options: "i" } },
        { "outlet.centerCode": { $regex: search, $options: "i" } },
      ];
      console.log('Applied search filter:', search);
    }

    console.log('Final Stock Purchase Filter:', JSON.stringify(filter, null, 2));
    
    // Test query count
    const testCount = await StockPurchase.countDocuments(filter);
    console.log('Matching documents count:', testCount);

    // Sort options
    const sortOptions = {};
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "date",
      "invoiceNo",
      "totalAmount",
    ];
    const actualSortBy = validSortFields.includes(sortBy)
      ? sortBy
      : "createdAt";
    sortOptions[actualSortBy] = sortOrder === "desc" ? -1 : 1;
    
    console.log('Sort options:', sortOptions);

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build query with population
    let query = StockPurchase.find(filter)
      .populate("vendor", "businessName")
      .populate({
        path: "outlet",
        populate: {
          path: "reseller",
          model: "Reseller",
          select: "businessName name mobile email"
        }
      })
      .populate("products.product", "productTitle productCode")
      .sort(sortOptions);

    // Apply pagination only for JSON format
    if (format === "json") {
      query = query.skip(skip).limit(limitNum);
      console.log('Applied pagination:', { pageNum, limitNum, skip });
    }

    const [purchases, total] = await Promise.all([
      query.lean(),
      StockPurchase.countDocuments(filter)
    ]);

    console.log(`Found ${purchases.length} purchases out of ${total} total`);

    // Post-process to filter products array if product filter is applied
    let processedPurchases = purchases;
    if (productFilterValue && mongoose.Types.ObjectId.isValid(productFilterValue)) {
      console.log('Post-processing product filter...');
      processedPurchases = purchases.map(purchase => {
        const filteredProducts = purchase.products.filter(productItem => {
          const productId = productItem.product?._id?.toString() || productItem.product?.toString();
          return productId === productFilterValue;
        });
        
        return {
          ...purchase,
          products: filteredProducts
        };
      }).filter(purchase => purchase.products.length > 0);
      
      console.log(`After product filter: ${processedPurchases.length} purchases`);
    }

    // Get summary statistics
    console.log('Building summary pipeline...');
    const summaryPipeline = [
      { $match: filter },
      { $unwind: "$products" }
    ];

    if (productFilterValue && mongoose.Types.ObjectId.isValid(productFilterValue)) {
      const productObjectId = new mongoose.Types.ObjectId(productFilterValue);
      summaryPipeline.push({
        $match: {
          "products.product": productObjectId
        }
      });
      console.log('Added product filter to summary pipeline');
    }

    summaryPipeline.push(
      {
        $group: {
          _id: null,
          totalPurchases: { $addToSet: "$_id" },
          totalAmount: { $sum: "$totalAmount" },
          totalTransportAmount: { $sum: "$transportAmount" },
          totalQuantity: { $sum: "$products.purchasedQuantity" }
        }
      },
      {
        $project: {
          totalPurchases: { $size: "$totalPurchases" },
          totalAmount: 1,
          totalTransportAmount: 1,
          totalQuantity: 1,
          grandTotal: { $add: ["$totalAmount", "$totalTransportAmount"] }
        }
      }
    );

    console.log('Summary pipeline:', JSON.stringify(summaryPipeline, null, 2));
    
    const summaryStats = await StockPurchase.aggregate(summaryPipeline);
    console.log('Summary stats:', summaryStats);
    
    const summary = summaryStats.length > 0 ? summaryStats[0] : {
      totalPurchases: 0,
      totalAmount: 0,
      totalTransportAmount: 0,
      totalQuantity: 0,
      grandTotal: 0
    };

    const finalTotal = productFilterValue && mongoose.Types.ObjectId.isValid(productFilterValue) 
      ? processedPurchases.length 
      : total;

    console.log('Final total:', finalTotal);

    // Handle Excel export
    if (format === "excel") {
      console.log('Exporting to Excel format');
      return await exportToExcel(processedPurchases, summary, {
        center: center || centerId || "all",
        resellerId: resellerId || "all",
        product: product || productId || "all",
        type: type || "all",
        vendor: vendor || "all",
        startDate: startDate || "all",
        endDate: endDate || "all",
        invoiceNo: invoiceNo || "all",
        search: search || ""
      }, res);
    }

    // Return JSON response
    console.log('Sending JSON response');
    res.status(200).json({
      success: true,
      message: "Stock purchases reports retrieved successfully",
      data: processedPurchases,
      summary: summary,
      filters: {
        reseller: resellerId || "all",
        center: center || centerId || "all",
        product: product || productId || "all",
        type: type || "all",
        vendor: vendor || "all",
        startDate: startDate || "all",
        endDate: endDate || "all",
        invoiceNo: invoiceNo || "all",
        search: search || ""
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(finalTotal / limitNum),
        totalItems: finalTotal,
        itemsPerPage: limitNum,
      },
    });
    
    console.log('=== getAllStockPurchasesReports END ===');
  } catch (error) {
    console.error("Error retrieving stock purchases reports:", error);
    console.error("Error stack:", error.stack);
    handleControllerError(error, res);
  }
};

// Helper function to export data to Excel
async function exportToExcel(purchases, summary, filters, res) {
  try {
    console.log('Generating Excel report...');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Stock Purchases Report');

    // Add title
    worksheet.mergeCells('A1:M1');
    worksheet.getCell('A1').value = 'STOCK PURCHASES REPORT';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };
    
    // Add generation date
    worksheet.mergeCells('A2:M2');
    worksheet.getCell('A2').value = `Generated on: ${moment().format('DD-MM-YYYY HH:mm:ss')}`;
    worksheet.getCell('A2').font = { size: 10 };
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    // Add filters information
    let rowIndex = 4;
    worksheet.getCell(`A${rowIndex}`).value = 'Filters Applied:';
    worksheet.getCell(`A${rowIndex}`).font = { bold: true };
    rowIndex++;

    // Get filter values asynchronously
    const resellerName = filters.resellerId !== 'all' ? await getResellerName(filters.resellerId) : 'All';
    const centerName = filters.center !== 'all' ? await getCenterName(filters.center) : 'All';
    const productName = filters.product !== 'all' ? await getProductName(filters.product) : 'All';
    const vendorName = filters.vendor !== 'all' ? await getVendorName(filters.vendor) : 'All';

    const filterRows = [
      `Reseller: ${resellerName}`,
      `Center: ${centerName}`,
      `Product: ${productName}`,
      `Type: ${filters.type !== 'all' ? filters.type : 'All'}`,
      `Vendor: ${vendorName}`,
      `Date Range: ${filters.startDate !== 'all' ? filters.startDate : 'Start'} to ${filters.endDate !== 'all' ? filters.endDate : 'End'}`,
      `Invoice No: ${filters.invoiceNo !== 'all' ? filters.invoiceNo : 'All'}`,
      `Search: ${filters.search !== 'all' ? filters.search : 'All'}`
    ];

    filterRows.forEach(filterText => {
      worksheet.getCell(`A${rowIndex}`).value = filterText;
      rowIndex++;
    });

    // Add summary section
    rowIndex++;
    worksheet.getCell(`A${rowIndex}`).value = 'Summary:';
    worksheet.getCell(`A${rowIndex}`).font = { bold: true };
    rowIndex++;

    const summaryRows = [
      `Total Purchases: ${summary.totalPurchases}`,
      `Total Quantity: ${summary.totalQuantity}`,
      `Total Amount: ₹${summary.totalAmount.toFixed(2)}`,
      `Total Transport Amount: ₹${summary.totalTransportAmount.toFixed(2)}`,
      `Grand Total: ₹${summary.grandTotal.toFixed(2)}`
    ];

    summaryRows.forEach(summaryText => {
      worksheet.getCell(`A${rowIndex}`).value = summaryText;
      rowIndex++;
    });

    // Add empty row before table
    rowIndex += 2;

    // Define columns for main data
    worksheet.columns = [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Invoice No', key: 'invoiceNo', width: 15 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Reseller', key: 'reseller', width: 20 },
      { header: 'Center', key: 'center', width: 20 },
      { header: 'Vendor', key: 'vendor', width: 20 },
      { header: 'Product Name', key: 'productName', width: 30 },
      { header: 'Product Code', key: 'productCode', width: 15 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Price', key: 'price', width: 12 },
      { header: 'Product Amount', key: 'productAmount', width: 15 },
      { header: 'Transport', key: 'transport', width: 12 },
      { header: 'Total Amount', key: 'totalAmount', width: 15 },
      { header: 'Remark', key: 'remark', width: 20 }
    ];

    // Add data rows
    let serialNo = 1;
    purchases.forEach(purchase => {
      // Get reseller and center info
      const resellerName = purchase.outlet?.reseller?.businessName || purchase.outlet?.reseller?.name || 'N/A';
      const centerName = purchase.outlet?.centerName || purchase.outlet?.name || 'N/A';
      const vendorName = purchase.vendor?.businessName || 'N/A';

      // If there are multiple products, create separate rows for each
      if (purchase.products && purchase.products.length > 0) {
        purchase.products.forEach(product => {
          const row = {
            sno: serialNo++,
            date: moment(purchase.date).format('DD-MM-YYYY'),
            invoiceNo: purchase.invoiceNo,
            type: purchase.type,
            reseller: resellerName,
            center: centerName,
            vendor: vendorName,
            productName: product.product?.productTitle || 'N/A',
            productCode: product.product?.productCode || 'N/A',
            quantity: product.purchasedQuantity,
            price: product.price,
            productAmount: (product.price * product.purchasedQuantity).toFixed(2),
            transport: purchase.transportAmount || 0,
            totalAmount: purchase.totalAmount.toFixed(2),
            remark: purchase.remark || ''
          };
          worksheet.addRow(row);
        });
      } else {
        // Handle case with no products
        const row = {
          sno: serialNo++,
          date: moment(purchase.date).format('DD-MM-YYYY'),
          invoiceNo: purchase.invoiceNo,
          type: purchase.type,
          reseller: resellerName,
          center: centerName,
          vendor: vendorName,
          productName: 'N/A',
          productCode: 'N/A',
          quantity: 0,
          price: 0,
          productAmount: '0.00',
          transport: purchase.transportAmount || 0,
          totalAmount: purchase.totalAmount.toFixed(2),
          remark: purchase.remark || ''
        };
        worksheet.addRow(row);
      }
    });

    // Style the header row
    const headerRow = worksheet.getRow(rowIndex);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    // Add borders to all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=stock_purchases_report_${moment().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
    console.log('Excel report generated successfully');
  } catch (error) {
    console.error('Error generating Excel report:', error);
    throw error;
  }
}

// Helper functions to get names from IDs
async function getResellerName(resellerId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(resellerId)) return resellerId;
    const reseller = await mongoose.model('Reseller').findById(resellerId).select('businessName name');
    return reseller?.businessName || reseller?.name || resellerId;
  } catch (error) {
    console.error('Error getting reseller name:', error);
    return resellerId;
  }
}

async function getCenterName(centerId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(centerId)) return centerId;
    const center = await mongoose.model('Center').findById(centerId).select('centerName centerCode');
    return center?.centerName || center?.centerCode || centerId;
  } catch (error) {
    console.error('Error getting center name:', error);
    return centerId;
  }
}

async function getProductName(productId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(productId)) return productId;
    const product = await mongoose.model('Product').findById(productId).select('productTitle productCode');
    return product?.productTitle || product?.productCode || productId;
  } catch (error) {
    console.error('Error getting product name:', error);
    return productId;
  }
}

async function getVendorName(vendorId) {
  try {
    if (!mongoose.Types.ObjectId.isValid(vendorId)) return vendorId;
    const vendor = await mongoose.model('Vendor').findById(vendorId).select('businessName');
    return vendor?.businessName || vendorId;
  } catch (error) {
    console.error('Error getting vendor name:', error);
    return vendorId;
  }
}

export const getAllStockRequestsReports = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      page = 1,
      limit = 100,
      status,
      warehouse,
      center,
      centerId,
      product,
      productId,
      startDate,
      endDate,
      createdBy,
      approvedBy,
      shippedBy,
      receivedBy,
      dateField = "createdAt",
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      includeUserDetails = false,
      includeCenterDetails = false,
      statuses,
      stockTransferStatus,
    } = req.query;

    const filter = {};

    console.log('Received query params:', {
      center, centerId, product, productId, startDate, endDate
    });

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        // Match the same "center OR warehouse" logic used by the usage
        // summary report (getStockRequestData), so a center's own
        // requests AND the requests it fulfilled as a warehouse both show up.
        filter.$or = [
          { center: userCenterId },
          { warehouse: userCenterId },
        ];
      }
    } else if (permissions.view_all_report && (center || centerId)) {
      const centerFilterValue = center || centerId;
      // A center can appear on a StockRequest either as the requesting
      // `center` or as the fulfilling `warehouse`. The summary report
      // counts a record under a center if it matches either field, so the
      // detail report must use the same match or valid drill-down clicks
      // (e.g. "Purchase") can return zero rows even with a correct id.
      filter.$or = [
        { center: centerFilterValue },
        { warehouse: centerFilterValue },
      ];
    }

    const productFilterValue = product || productId;

    if (status) {
      filter.status = status;
    }

    if (statuses) {
      const statusArray = Array.isArray(statuses)
        ? statuses
        : statuses.split(",");
      filter.status = { $in: statusArray };
    }

    if (warehouse) {
      filter.warehouse = warehouse;
    }

    if (startDate || endDate) {
      filter[dateField] = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter[dateField].$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter[dateField].$lte = end;
      }
    }

    if (createdBy) {
      filter.createdBy = createdBy;
    }

    if (approvedBy) {
      filter["approvalInfo.approvedBy"] = approvedBy;
    }

    if (shippedBy) {
      filter["shippingInfo.shippedBy"] = shippedBy;
    }

    if (receivedBy) {
      filter["receivingInfo.receivedBy"] = receivedBy;
    }

    if (stockTransferStatus) {
      filter.stockTransferStatus = stockTransferStatus;
    }

    if (search) {
      const searchOr = [
        { orderNumber: { $regex: search, $options: "i" } },
        { remark: { $regex: search, $options: "i" } },
        { "products.productRemark": { $regex: search, $options: "i" } },
        { "approvalInfo.approvedRemark": { $regex: search, $options: "i" } },
        { "shippingInfo.shipmentDetails": { $regex: search, $options: "i" } },
      ];

      // The center/warehouse filter above may already use `$or`. A second
      // top-level `$or` here would silently overwrite it (last write wins
      // on a plain object key), dropping the center filter. Combine both
      // conditions with `$and` instead so a center/warehouse match AND a
      // search match are both required when both are present.
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }

    console.log('Final filter:', JSON.stringify(filter, null, 2));

    let query = StockRequest.find(filter);

    const populateOptions = [
      {
        path: "createdBy",
        select: "fullName email",
      },
      {
        path: "warehouse",
        select: "centerName centerCode centerType",
      },
      {
        path: "center",
        select: "centerName centerCode centerType",
      },
      {
        path: "products.product",
        select: "productTitle productPrice productCode productImage trackSerialNumber",
      },
    ];

    if (includeUserDetails) {
      populateOptions.push(
        { path: "updatedBy", select: "fullName email" },
        { path: "approvalInfo.approvedBy", select: "fullName email" },
        { path: "shippingInfo.shippedBy", select: "fullName email" },
        { path: "receivingInfo.receivedBy", select: "fullName email" },
        { path: "completionInfo.completedBy", select: "fullName email" },
        { path: "completionInfo.incompleteBy", select: "fullName email" }
      );
    }

    if (includeCenterDetails) {
      const centerIndex = populateOptions.findIndex((p) => p.path === "center");
      const warehouseIndex = populateOptions.findIndex(
        (p) => p.path === "warehouse"
      );

      if (centerIndex !== -1) {
        populateOptions[centerIndex].select += " address phone";
      }
      if (warehouseIndex !== -1) {
        populateOptions[warehouseIndex].select += " address phone";
      }
    }

    const sort = {};
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "date",
      "orderNumber",
      "status",
    ];
    const actualSortBy = validSortFields.includes(sortBy)
      ? sortBy
      : "createdAt";
    sort[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [stockRequests, total] = await Promise.all([
      query
        .populate(populateOptions)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      StockRequest.countDocuments(filter)
    ]);

    console.log(`Found ${stockRequests.length} records out of ${total} total`);

    let processedRequests = stockRequests;
    if (productFilterValue) {
      processedRequests = stockRequests.map(request => {
        const filteredProducts = request.products.filter(productItem => {
          if (!productItem.product) return false;
          const productId = productItem.product._id?.toString() || productItem.product?.toString();
          return productId === productFilterValue;
        });
        
        return {
          ...request,
          products: filteredProducts
        };
      }).filter(request => request.products.length > 0); // Remove requests with no matching products
    }

    // Fetch stock data for each product
    const OutletStock = mongoose.model("OutletStock");
    const CenterStock = mongoose.model("CenterStock");

    for (const request of processedRequests) {
      for (const productItem of request.products) {
        if (productItem.product && request.warehouse && request.center) {
          try {
            const outletStock = await OutletStock.findOne({
              outlet: request.warehouse._id,
              product: productItem.product._id,
            })
              .select("availableQuantity totalQuantity inTransitQuantity")
              .lean();

            const centerStock = await CenterStock.findOne({
              center: request.center._id,
              product: productItem.product._id,
            })
              .select(
                "availableQuantity totalQuantity inTransitQuantity consumedQuantity"
              )
              .lean();

            productItem.outletStock = outletStock
              ? {
                  availableQuantity: outletStock.availableQuantity || 0,
                  totalQuantity: outletStock.totalQuantity || 0,
                  inTransitQuantity: outletStock.inTransitQuantity || 0,
                }
              : {
                  availableQuantity: 0,
                  totalQuantity: 0,
                  inTransitQuantity: 0,
                };

            productItem.centerStock = centerStock
              ? {
                  availableQuantity: centerStock.availableQuantity || 0,
                  totalQuantity: centerStock.totalQuantity || 0,
                  inTransitQuantity: centerStock.inTransitQuantity || 0,
                  consumedQuantity: centerStock.consumedQuantity || 0,
                }
              : {
                  availableQuantity: 0,
                  totalQuantity: 0,
                  inTransitQuantity: 0,
                  consumedQuantity: 0,
                };

            if (outletStock) {
              productItem.isStockSufficient =
                productItem.quantity <= outletStock.availableQuantity;
              productItem.stockShortage = Math.max(
                0,
                productItem.quantity - outletStock.availableQuantity
              );
              productItem.fulfillmentPercentage =
                outletStock.availableQuantity > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (productItem.quantity / outletStock.availableQuantity) *
                          100
                      )
                    )
                  : 0;
            } else {
              productItem.isStockSufficient = false;
              productItem.stockShortage = productItem.quantity;
              productItem.fulfillmentPercentage = 0;
            }

            if (centerStock) {
              productItem.projectedCenterStock = {
                availableQuantity:
                  centerStock.availableQuantity +
                  (productItem.receivedQuantity || 0),
                totalQuantity:
                  centerStock.totalQuantity +
                  (productItem.receivedQuantity || 0),
              };
            } else {
              productItem.projectedCenterStock = {
                availableQuantity: productItem.receivedQuantity || 0,
                totalQuantity: productItem.receivedQuantity || 0,
              };
            }
          } catch (error) {
            console.error(
              `Error fetching stock data for product ${productItem.product._id}:`,
              error
            );

            productItem.outletStock = {
              availableQuantity: 0,
              totalQuantity: 0,
              inTransitQuantity: 0,
            };
            productItem.centerStock = {
              availableQuantity: 0,
              totalQuantity: 0,
              inTransitQuantity: 0,
              consumedQuantity: 0,
            };
            productItem.isStockSufficient = false;
            productItem.stockShortage = productItem.quantity;
            productItem.fulfillmentPercentage = 0;
            productItem.projectedCenterStock = {
              availableQuantity: productItem.receivedQuantity || 0,
              totalQuantity: productItem.receivedQuantity || 0,
            };
          }
        } else {
          productItem.outletStock = {
            availableQuantity: 0,
            totalQuantity: 0,
            inTransitQuantity: 0,
          };
          productItem.centerStock = {
            availableQuantity: 0,
            totalQuantity: 0,
            inTransitQuantity: 0,
            consumedQuantity: 0,
          };
          productItem.isStockSufficient = false;
          productItem.stockShortage = productItem.quantity;
          productItem.fulfillmentPercentage = 0;
          productItem.projectedCenterStock = {
            availableQuantity: productItem.receivedQuantity || 0,
            totalQuantity: productItem.receivedQuantity || 0,
          };
        }
      }
    }

    // Get summary statistics
    const summaryStats = await StockRequest.aggregate([
      { $match: filter },
      { $unwind: "$products" },
      ...(productFilterValue ? [{
        $match: {
          "products.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      }] : []),
      {
        $group: {
          _id: null,
          totalRequests: { $addToSet: "$_id" },
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: "$products.quantity" },
          totalReceived: { $sum: "$products.receivedQuantity" }
        }
      },
      {
        $project: {
          totalRequests: { $size: "$totalRequests" },
          totalProducts: 1,
          totalQuantity: 1,
          totalReceived: 1,
          pendingQuantity: { $subtract: ["$totalQuantity", "$totalReceived"] }
        }
      }
    ]);

    const summary = summaryStats.length > 0 ? summaryStats[0] : {
      totalRequests: 0,
      totalProducts: 0,
      totalQuantity: 0,
      totalReceived: 0,
      pendingQuantity: 0
    };

    const statusCounts = await StockRequest.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusFilters = {};
    statusCounts.forEach((item) => {
      statusFilters[item._id] = item.count;
    });

    // Adjust total count if product filter was applied in post-processing
    const finalTotal = productFilterValue ? processedRequests.length : total;

    const response = {
      success: true,
      message: "Stock requests retrieved successfully",
      data: processedRequests,
      summary: summary,
      filters: {
        center: center || centerId || "all",
        product: product || productId || "all",
        status: statusFilters,
        startDate: startDate || "all",
        endDate: endDate || "all",
        warehouse: warehouse || "all",
        total: finalTotal,
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(finalTotal / limitNum),
        totalItems: finalTotal,
        itemsPerPage: limitNum,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching stock requests:", error);
    handleControllerError(error, res);
  }
};

export const getMonthlyStockRequestsSummary = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      month,
      year,
      center,
      centerId,
      resellerId,
      warehouse,
      product,
      productId,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      format = "json",
      sortBy = "center",
      sortOrder = "asc",
    } = req.query;

    console.log("Received query params:", {
      center, centerId, resellerId, product, productId,
      startDate, endDate, month, year, warehouse, format,
    });

    // ============================================================
    // DATE FILTER LOGIC (IST-safe)
    // DB stores `date` at UTC midnight of the IST calendar day
    // (e.g. 23-Sep IST -> 2026-09-23T00:00:00.000Z).
    // ============================================================
    const IST_OFFSET_MS = 330 * 60 * 1000; // +05:30

    const istMidnightUtc = (y, m, d) =>
      new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - IST_OFFSET_MS);

    const parseIstDate = (str, endOfDay = false) => {
      const [y, m, d] = String(str).split("-").map(Number);
      const startUtc = istMidnightUtc(y, m, d);
      return endOfDay
        ? new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1)
        : startUtc;
    };

    let dateFilter = {};
    const currentDate = new Date();
    let periodDisplay = "";

    if (startDate || endDate) {
      if (startDate) dateFilter.$gte = parseIstDate(startDate, false);
      if (endDate) dateFilter.$lte = parseIstDate(endDate, true);
      periodDisplay = `${startDate || "Start"} to ${endDate || "End"}`;
    } else {
      const currentMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
      const currentYear = year ? parseInt(year) : currentDate.getFullYear();

      if (currentMonth < 1 || currentMonth > 12) {
        return res.status(400).json({
          success: false,
          message: "Month must be between 1 and 12",
        });
      }
      if (currentYear < 2000 || currentYear > 2100) {
        return res.status(400).json({
          success: false,
          message: "Year must be between 2000 and 2100",
        });
      }

      dateFilter = {
        $gte: istMidnightUtc(currentYear, currentMonth, 1),
        $lt: istMidnightUtc(
          currentMonth === 12 ? currentYear + 1 : currentYear,
          currentMonth === 12 ? 1 : currentMonth + 1,
          1
        ),
      };
      periodDisplay = `${currentMonth}/${currentYear}`;
    }

    // ============================================================
    // BASE FILTER — built with $and so nothing gets clobbered.
    // ============================================================
    const baseFilter = { date: dateFilter };
    const andConditions = [];

    // ---------- Reseller filter ----------
    if (resellerId && mongoose.Types.ObjectId.isValid(resellerId)) {
      const centersUnderReseller = await mongoose
        .model("Center")
        .find({ reseller: resellerId, status: "Enable" })
        .select("_id");

      const targetCenterIds = centersUnderReseller.map((c) => c._id);
      console.log(
        `Found ${targetCenterIds.length} centers under reseller ${resellerId}`
      );

      if (targetCenterIds.length > 0) {
        andConditions.push({
          $or: [
            { center: { $in: targetCenterIds } },
            { warehouse: { $in: targetCenterIds } },
          ],
        });
      } else {
        andConditions.push({ _id: null });
      }
    }

    // ---------- Specific center filter ----------
    const centerFilterValue = center || centerId;
    if (centerFilterValue && mongoose.Types.ObjectId.isValid(centerFilterValue)) {
      const centerObjectId = new mongoose.Types.ObjectId(centerFilterValue);
      andConditions.push({
        $or: [{ center: centerObjectId }, { warehouse: centerObjectId }],
      });
      console.log(
        "Applied specific center filter (center OR warehouse):",
        centerObjectId
      );
    }

    // ---------- Permission filter ----------
    const hasExplicitScope = Boolean(centerFilterValue || resellerId);
    if (
      permissions.view_own_report &&
      !permissions.view_all_report &&
      !hasExplicitScope
    ) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        const userCenterObjectId = mongoose.Types.ObjectId.isValid(userCenterId)
          ? new mongoose.Types.ObjectId(userCenterId)
          : userCenterId;
        andConditions.push({
          $or: [
            { center: userCenterObjectId },
            { warehouse: userCenterObjectId },
          ],
        });
      }
    }

    // ---------- Warehouse filter ----------
    if (warehouse && mongoose.Types.ObjectId.isValid(warehouse)) {
      baseFilter.warehouse = new mongoose.Types.ObjectId(warehouse);
    }

    if (andConditions.length > 0) {
      baseFilter.$and = andConditions;
    }

    console.log("Base filter:", JSON.stringify(baseFilter, null, 2));

    // ============================================================
    // DIAGNOSTIC — tells us which layer drops the row
    // ============================================================
    try {
      const diagCount = await StockRequest.countDocuments(baseFilter);
      const diagAgg = await StockRequest.aggregate([
        { $match: baseFilter },
        { $count: "n" },
      ]);
      console.log("DIAG countDocuments:", diagCount);
      console.log("DIAG aggregate count:", diagAgg);
      if (diagCount > 0) {
        const sample = await StockRequest.findOne(baseFilter)
          .select("_id center warehouse date")
          .lean();
        console.log("DIAG sample doc:", sample);
      }
    } catch (diagErr) {
      console.error("DIAG error:", diagErr);
    }
    // ============================================================

    // ============================================================
    // AGGREGATION PIPELINE
    // ============================================================
    const productFilterValue = product || productId;

    const aggregationPipeline = [
      { $match: baseFilter },
      { $unwind: "$products" },
    ];

    if (productFilterValue && mongoose.Types.ObjectId.isValid(productFilterValue)) {
      aggregationPipeline.push({
        $match: {
          "products.product": new mongoose.Types.ObjectId(productFilterValue),
        },
      });
    }

    aggregationPipeline.push(
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
          from: "centers",
          localField: "warehouse",
          foreignField: "_id",
          as: "warehouseDetails",
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "products.product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $lookup: {
          from: "centers",
          localField: "centerDetails.reseller",
          foreignField: "_id",
          as: "resellerDetails",
        },
      },
      {
        $project: {
          center: { $arrayElemAt: ["$centerDetails.centerName", 0] },
          centerId: "$center",
          resellerName: { $arrayElemAt: ["$resellerDetails.businessName", 0] },
          resellerId: { $arrayElemAt: ["$resellerDetails._id", 0] },
          parentCenter: { $arrayElemAt: ["$warehouseDetails.centerName", 0] },
          parentCenterId: "$warehouse",
          product: { $arrayElemAt: ["$productDetails.productTitle", 0] },
          productId: "$products.product",
          productCode: { $arrayElemAt: ["$productDetails.productCode", 0] },
          quantity: "$products.quantity",
          approvedQuantity: "$products.approvedQuantity",
          receivedQuantity: "$products.receivedQuantity",
          orderNumber: 1,
          status: 1,
          date: 1,
          createdAt: 1,
        },
      },
      {
        $group: {
          _id: {
            center: "$center",
            centerId: "$centerId",
            resellerName: "$resellerName",
            resellerId: "$resellerId",
            parentCenter: "$parentCenter",
            parentCenterId: "$parentCenterId",
            product: "$product",
            productId: "$productId",
            productCode: "$productCode",
          },
          totalQty: { $sum: "$quantity" },
          totalApproved: { $sum: "$approvedQuantity" },
          totalReceived: { $sum: "$receivedQuantity" },
          requestCount: { $sum: 1 },
          orderNumbers: { $push: "$orderNumber" },
          statuses: { $push: "$status" },
          dates: { $push: "$date" },
        },
      },
      {
        $project: {
          _id: 0,
          center: "$_id.center",
          centerId: "$_id.centerId",
          resellerName: "$_id.resellerName",
          resellerId: "$_id.resellerId",
          parentCenter: "$_id.parentCenter",
          parentCenterId: "$_id.parentCenterId",
          product: "$_id.product",
          productId: "$_id.productId",
          productCode: "$_id.productCode",
          totalQty: 1,
          totalApproved: 1,
          totalReceived: 1,
          requestCount: 1,
          orderNumbers: 1,
          pendingQuantity: { $subtract: ["$totalQty", "$totalReceived"] },
          pendingApproval: { $subtract: ["$totalQty", "$totalApproved"] },
          approvalRate: {
            $cond: {
              if: { $gt: ["$totalQty", 0] },
              then: {
                $multiply: [
                  { $divide: ["$totalApproved", "$totalQty"] },
                  100,
                ],
              },
              else: 0,
            },
          },
          fulfillmentRate: {
            $cond: {
              if: { $gt: ["$totalQty", 0] },
              then: {
                $multiply: [
                  { $divide: ["$totalReceived", "$totalQty"] },
                  100,
                ],
              },
              else: 0,
            },
          },
          statusBreakdown: {
            $arrayToObject: {
              $map: {
                input: "$statuses",
                as: "status",
                in: {
                  k: "$$status",
                  v: {
                    $size: {
                      $filter: {
                        input: "$statuses",
                        as: "s",
                        cond: { $eq: ["$$s", "$$status"] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $sort: {
          [sortBy === "center"
            ? "center"
            : sortBy === "resellerName"
            ? "resellerName"
            : sortBy === "product"
            ? "product"
            : sortBy === "totalQty"
            ? "totalQty"
            : "center"]: sortOrder === "desc" ? -1 : 1,
        },
      }
    );

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let monthlySummary = await StockRequest.aggregate(aggregationPipeline);
    const total = monthlySummary.length;

    console.log(`Aggregation returned ${total} grouped rows`);

    if (format !== "excel") {
      monthlySummary = monthlySummary.slice(skip, skip + limitNum);
    }

    // ============================================================
    // STATISTICS PIPELINE
    // ============================================================
    const statsPipeline = [
      { $match: baseFilter },
      { $unwind: "$products" },
    ];

    if (productFilterValue && mongoose.Types.ObjectId.isValid(productFilterValue)) {
      statsPipeline.push({
        $match: {
          "products.product": new mongoose.Types.ObjectId(productFilterValue),
        },
      });
    }

    statsPipeline.push(
      {
        $group: {
          _id: null,
          totalProductsRequested: { $sum: "$products.quantity" },
          totalApproved: { $sum: "$products.approvedQuantity" },
          totalReceived: { $sum: "$products.receivedQuantity" },
          totalRequests: { $sum: 1 },
          uniqueProducts: { $addToSet: "$products.product" },
          uniqueCenters: { $addToSet: "$center" },
          uniqueWarehouses: { $addToSet: "$warehouse" },
        },
      },
      {
        $project: {
          totalProductsRequested: 1,
          totalApproved: 1,
          totalReceived: 1,
          totalRequests: 1,
          uniqueProductsCount: { $size: "$uniqueProducts" },
          uniqueCentersCount: { $size: "$uniqueCenters" },
          uniqueWarehousesCount: { $size: "$uniqueWarehouses" },
          pendingQuantity: {
            $subtract: ["$totalProductsRequested", "$totalReceived"],
          },
          pendingApproval: {
            $subtract: ["$totalProductsRequested", "$totalApproved"],
          },
          overallApprovalRate: {
            $cond: {
              if: { $gt: ["$totalProductsRequested", 0] },
              then: {
                $multiply: [
                  { $divide: ["$totalApproved", "$totalProductsRequested"] },
                  100,
                ],
              },
              else: 0,
            },
          },
          overallFulfillmentRate: {
            $cond: {
              if: { $gt: ["$totalProductsRequested", 0] },
              then: {
                $multiply: [
                  { $divide: ["$totalReceived", "$totalProductsRequested"] },
                  100,
                ],
              },
              else: 0,
            },
          },
        },
      }
    );

    const statsResult = await StockRequest.aggregate(statsPipeline);
    const stats =
      statsResult.length > 0
        ? statsResult[0]
        : {
            totalProductsRequested: 0,
            totalApproved: 0,
            totalReceived: 0,
            totalRequests: 0,
            uniqueProductsCount: 0,
            uniqueCentersCount: 0,
            uniqueWarehousesCount: 0,
            pendingQuantity: 0,
            pendingApproval: 0,
            overallApprovalRate: 0,
            overallFulfillmentRate: 0,
          };

    // ============================================================
    // EXCEL EXPORT
    // ============================================================
    if (format === "excel") {
      try {
        console.log(
          `[EXPORT] Generating Excel file with ${monthlySummary.length} records`
        );

        const excelData = monthlySummary.map((item, index) => ({
          "S.No": index + 1,
          Reseller: item.resellerName || "N/A",
          Center: item.center,
          Warehouse: item.parentCenter || "N/A",
          Product: item.product,
          "Product Code": item.productCode || "N/A",
          "Requested Qty": item.totalQty,
          "Approved Qty": item.totalApproved,
          "Received Qty": item.totalReceived,
          "Pending Qty": item.pendingQuantity,
          "Pending Approval": item.pendingApproval,
          "Request Count": item.requestCount,
          "Approval Rate (%)": Math.round(item.approvalRate * 100) / 100,
          "Fulfillment Rate (%)": Math.round(item.fulfillmentRate * 100) / 100,
        }));

        const summaryData = [
          {
            "Report Generated": moment().format("DD-MM-YYYY HH:mm:ss"),
            Period: periodDisplay,
            "Reseller ID": resellerId || "All",
            Center: center || centerId || "All",
            Product: product || productId || "All",
            Warehouse: warehouse || "All",
            "Total Requests": stats.totalRequests,
            "Total Products Requested": stats.totalProductsRequested,
            "Total Approved": stats.totalApproved,
            "Total Received": stats.totalReceived,
            "Pending Quantity": stats.pendingQuantity,
            "Pending Approval": stats.pendingApproval,
            "Overall Approval Rate (%)":
              Math.round(stats.overallApprovalRate * 100) / 100,
            "Overall Fulfillment Rate (%)":
              Math.round(stats.overallFulfillmentRate * 100) / 100,
            "Unique Products": stats.uniqueProductsCount,
            "Unique Centers": stats.uniqueCentersCount,
            "Unique Warehouses": stats.uniqueWarehousesCount,
          },
        ];

        const filtersData = [
          {
            Filter: "Applied Value",
            "Start Date": startDate || "Not Applied",
            "End Date": endDate || "Not Applied",
            Month: month || "Current",
            Year: year || "Current",
            "Reseller ID": resellerId || "All",
            "Center ID": center || centerId || "All",
            "Product ID": product || productId || "All",
            "Warehouse ID": warehouse || "All",
          },
        ];

        const workbook = XLSX.utils.book_new();

        const mainSheet = XLSX.utils.json_to_sheet(excelData);
        mainSheet["!cols"] = [
          { wch: 8 }, { wch: 25 }, { wch: 25 }, { wch: 25 },
          { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
          { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
          { wch: 18 }, { wch: 18 },
        ];
        XLSX.utils.book_append_sheet(
          workbook,
          mainSheet,
          "Stock Requests Summary"
        );

        const summarySheet = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

        const filtersSheet = XLSX.utils.json_to_sheet(filtersData);
        XLSX.utils.book_append_sheet(workbook, filtersSheet, "Applied Filters");

        const excelBuffer = XLSX.write(workbook, {
          type: "buffer",
          bookType: "xlsx",
        });

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=stock_requests_summary_${moment().format(
            "YYYY-MM-DD_HH-mm-ss"
          )}.xlsx`
        );
        res.setHeader("Content-Length", excelBuffer.length);

        return res.send(excelBuffer);
      } catch (exportError) {
        console.error("[EXPORT ERROR]", exportError);
        return res.status(500).json({
          success: false,
          message: "Error generating Excel export",
          error: exportError.message,
        });
      }
    }

    // ============================================================
    // JSON RESPONSE
    // ============================================================
    const response = {
      success: true,
      message: `Monthly stock requests summary for ${periodDisplay} retrieved successfully`,
      data: monthlySummary,
      summary: {
        period: periodDisplay,
        dateRange: dateFilter,
        totalProductsRequested: stats.totalProductsRequested,
        totalApproved: stats.totalApproved,
        totalReceived: stats.totalReceived,
        totalRequests: stats.totalRequests,
        pendingQuantity: stats.pendingQuantity,
        pendingApproval: stats.pendingApproval,
        uniqueProducts: stats.uniqueProductsCount,
        uniqueCenters: stats.uniqueCentersCount,
        uniqueWarehouses: stats.uniqueWarehousesCount,
        overallApprovalRate: Math.round(stats.overallApprovalRate * 100) / 100,
        overallFulfillmentRate:
          Math.round(stats.overallFulfillmentRate * 100) / 100,
      },
      filters: {
        reseller: resellerId || "all",
        center: center || centerId || "all",
        product: product || productId || "all",
        warehouse: warehouse || "all",
        startDate: startDate || "auto",
        endDate: endDate || "auto",
        month: month || "current",
        year: year || "current",
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching monthly stock requests summary:", error);
    handleControllerError(error, res);
  }
};

export const getMonthlyStockTransfersSummary = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      month,
      year,
      resellerId,
      fromCenter,
      toCenter,
      product,
      productId,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      format = "json",
      sortBy = "fromCenter",
      sortOrder = "asc",
    } = req.query;

    console.log('Received query params:', {
      fromCenter, toCenter, resellerId, product, productId, startDate, endDate, month, year, status, format
    });

    // ========== DATE FILTER LOGIC ==========
    let dateFilter = {};
    const currentDate = new Date();
    let periodDisplay = '';
    
    if (startDate || endDate) {
      dateFilter = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      periodDisplay = `${startDate || 'Start'} to ${endDate || 'End'}`;
    } else {
      const currentMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
      const currentYear = year ? parseInt(year) : currentDate.getFullYear();

      if (currentMonth < 1 || currentMonth > 12) {
        return res.status(400).json({
          success: false,
          message: "Month must be between 1 and 12",
        });
      }

      if (currentYear < 2000 || currentYear > 2100) {
        return res.status(400).json({
          success: false,
          message: "Year must be between 2000 and 2100",
        });
      }

      dateFilter = {
        $gte: new Date(currentYear, currentMonth - 1, 1),
        $lte: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)
      };
      periodDisplay = `${currentMonth}/${currentYear}`;
    }

    // ========== BASE FILTER ==========
    const baseFilter = {
      createdAt: dateFilter,
    };

    // ========== RESELLER AND CENTER FILTERS ==========
    let targetFromCenterIds = [];
    let targetToCenterIds = [];
    
    if (resellerId && mongoose.Types.ObjectId.isValid(resellerId)) {
      const centersUnderReseller = await mongoose.model('Center').find({ 
        reseller: resellerId,
        status: "Enable"
      }).select("_id");
      
      targetFromCenterIds = centersUnderReseller.map(c => c._id);
      targetToCenterIds = centersUnderReseller.map(c => c._id);
      console.log(`Found ${targetFromCenterIds.length} centers under reseller ${resellerId}`);
      
      if (targetFromCenterIds.length > 0) {
        baseFilter.$or = [
          { fromCenter: { $in: targetFromCenterIds } },
          { toCenter: { $in: targetToCenterIds } }
        ];
      }
    }
    
    if (fromCenter && mongoose.Types.ObjectId.isValid(fromCenter)) {
      if (baseFilter.$or) {
        baseFilter.$or = [{ fromCenter: new mongoose.Types.ObjectId(fromCenter) }];
      } else {
        baseFilter.fromCenter = new mongoose.Types.ObjectId(fromCenter);
      }
      console.log('Applied specific fromCenter filter:', baseFilter.fromCenter);
    }
    
    if (toCenter && mongoose.Types.ObjectId.isValid(toCenter)) {
      if (baseFilter.$or) {
        baseFilter.$or = [{ toCenter: new mongoose.Types.ObjectId(toCenter) }];
      } else if (baseFilter.fromCenter) {
        baseFilter.toCenter = new mongoose.Types.ObjectId(toCenter);
      } else {
        baseFilter.toCenter = new mongoose.Types.ObjectId(toCenter);
      }
      console.log('Applied specific toCenter filter:', baseFilter.toCenter);
    }
    
    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        baseFilter.$or = [
          { fromCenter: mongoose.Types.ObjectId.isValid(userCenterId) 
            ? new mongoose.Types.ObjectId(userCenterId)
            : userCenterId 
          },
          { toCenter: mongoose.Types.ObjectId.isValid(userCenterId) 
            ? new mongoose.Types.ObjectId(userCenterId)
            : userCenterId 
          }
        ];
        delete baseFilter.fromCenter;
        delete baseFilter.toCenter;
      }
    }

    if (status) {
      baseFilter.status = status;
    }

    console.log('Base filter:', JSON.stringify(baseFilter, null, 2));

    // ========== AGGREGATION PIPELINE ==========
    const aggregationPipeline = [
      { $match: baseFilter },
      { $unwind: "$products" }
    ];

    const productFilterValue = product || productId;
    if (productFilterValue && mongoose.Types.ObjectId.isValid(productFilterValue)) {
      aggregationPipeline.push({
        $match: {
          "products.product": new mongoose.Types.ObjectId(productFilterValue)
        }
      });
    }

    aggregationPipeline.push(
      {
        $lookup: {
          from: "centers",
          localField: "fromCenter",
          foreignField: "_id",
          as: "fromCenterDetails",
        },
      },
      {
        $lookup: {
          from: "centers",
          localField: "toCenter",
          foreignField: "_id",
          as: "toCenterDetails",
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "products.product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $lookup: {
          from: "centers",
          localField: "fromCenterDetails.reseller",
          foreignField: "_id",
          as: "fromResellerDetails",
        },
      },
      {
        $lookup: {
          from: "centers",
          localField: "toCenterDetails.reseller",
          foreignField: "_id",
          as: "toResellerDetails",
        },
      },
      {
        $project: {
          fromCenter: { $arrayElemAt: ["$fromCenterDetails.centerName", 0] },
          fromCenterId: "$fromCenter",
          fromResellerName: { $arrayElemAt: ["$fromResellerDetails.businessName", 0] },
          fromResellerId: { $arrayElemAt: ["$fromResellerDetails._id", 0] },
          toCenter: { $arrayElemAt: ["$toCenterDetails.centerName", 0] },
          toCenterId: "$toCenter",
          toResellerName: { $arrayElemAt: ["$toResellerDetails.businessName", 0] },
          toResellerId: { $arrayElemAt: ["$toResellerDetails._id", 0] },
          product: { $arrayElemAt: ["$productDetails.productTitle", 0] },
          productId: "$products.product",
          productCode: { $arrayElemAt: ["$productDetails.productCode", 0] },
          quantity: "$products.quantity",
          approvedQuantity: "$products.approvedQuantity",
          receivedQuantity: "$products.receivedQuantity",
          transferNumber: 1,
          status: 1,
          date: 1,
          createdAt: 1,
        },
      },
      {
        $group: {
          _id: {
            fromCenter: "$fromCenter",
            fromCenterId: "$fromCenterId",
            fromResellerName: "$fromResellerName",
            fromResellerId: "$fromResellerId",
            toCenter: "$toCenter",
            toCenterId: "$toCenterId",
            toResellerName: "$toResellerName",
            toResellerId: "$toResellerId",
            product: "$product",
            productId: "$productId",
            productCode: "$productCode",
          },
          totalRequestedQty: { $sum: "$quantity" },
          totalApprovedQty: { $sum: "$approvedQuantity" },
          totalReceivedQty: { $sum: { $ifNull: ["$receivedQuantity", 0] } },
          transferCount: { $sum: 1 },
          transferNumbers: { $push: "$transferNumber" },
          statuses: { $push: "$status" },
          dates: { $push: "$date" },
        },
      },
      {
        $project: {
          _id: 0,
          fromReseller: "$_id.fromResellerName",
          fromResellerId: "$_id.fromResellerId",
          fromCenter: "$_id.fromCenter",
          fromCenterId: "$_id.fromCenterId",
          toReseller: "$_id.toResellerName",
          toResellerId: "$_id.toResellerId",
          toCenter: "$_id.toCenter",
          toCenterId: "$_id.toCenterId",
          product: "$_id.product",
          productId: "$_id.productId",
          productCode: "$_id.productCode",
          totalRequestedQty: 1,
          totalApprovedQty: 1,
          totalReceivedQty: 1,
          transferCount: 1,
          transferNumbers: 1,
          pendingQuantity: { $subtract: ["$totalRequestedQty", "$totalReceivedQty"] },
          pendingApproval: { $subtract: ["$totalRequestedQty", "$totalApprovedQty"] },
          approvalRate: {
            $cond: {
              if: { $gt: ["$totalRequestedQty", 0] },
              then: { $multiply: [{ $divide: ["$totalApprovedQty", "$totalRequestedQty"] }, 100] },
              else: 0
            }
          },
          fulfillmentRate: {
            $cond: {
              if: { $gt: ["$totalRequestedQty", 0] },
              then: { $multiply: [{ $divide: ["$totalReceivedQty", "$totalRequestedQty"] }, 100] },
              else: 0
            }
          },
          statusBreakdown: {
            $arrayToObject: {
              $map: {
                input: "$statuses",
                as: "status",
                in: {
                  k: "$$status",
                  v: {
                    $size: {
                      $filter: {
                        input: "$statuses",
                        as: "s",
                        cond: { $eq: ["$$s", "$$status"] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $sort: {
          [sortBy === "fromCenter" ? "fromCenter" : 
           sortBy === "toCenter" ? "toCenter" :
           sortBy === "fromReseller" ? "fromReseller" :
           sortBy === "toReseller" ? "toReseller" :
           sortBy === "product" ? "product" :
           sortBy === "totalRequestedQty" ? "totalRequestedQty" : "fromCenter"]: sortOrder === "desc" ? -1 : 1,
        },
      }
    );

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let monthlySummary = await StockTransfer.aggregate(aggregationPipeline);
    const total = monthlySummary.length;

    if (format !== "excel") {
      monthlySummary = monthlySummary.slice(skip, skip + limitNum);
    }

    // ========== STATISTICS PIPELINE ==========
    const statsPipeline = [
      { $match: baseFilter },
      { $unwind: "$products" }
    ];

    if (productFilterValue && mongoose.Types.ObjectId.isValid(productFilterValue)) {
      statsPipeline.push({
        $match: {
          "products.product": new mongoose.Types.ObjectId(productFilterValue)
        }
      });
    }

    statsPipeline.push({
      $group: {
        _id: null,
        totalProductsTransferred: { $sum: "$products.quantity" },
        totalApproved: { $sum: "$products.approvedQuantity" },
        totalReceived: { $sum: "$products.receivedQuantity" },
        totalTransfers: { $sum: 1 },
        uniqueProducts: { $addToSet: "$products.product" },
        uniqueFromCenters: { $addToSet: "$fromCenter" },
        uniqueToCenters: { $addToSet: "$toCenter" },
        uniqueStatuses: { $addToSet: "$status" },
      },
    },
    {
      $project: {
        totalProductsTransferred: 1,
        totalApproved: 1,
        totalReceived: 1,
        totalTransfers: 1,
        uniqueProductsCount: { $size: "$uniqueProducts" },
        uniqueFromCentersCount: { $size: "$uniqueFromCenters" },
        uniqueToCentersCount: { $size: "$uniqueToCenters" },
        uniqueStatusesCount: { $size: "$uniqueStatuses" },
        pendingQuantity: { $subtract: ["$totalProductsTransferred", "$totalReceived"] },
        pendingApproval: { $subtract: ["$totalProductsTransferred", "$totalApproved"] },
        overallApprovalRate: {
          $cond: {
            if: { $gt: ["$totalProductsTransferred", 0] },
            then: { $multiply: [{ $divide: ["$totalApproved", "$totalProductsTransferred"] }, 100] },
            else: 0
          }
        },
        overallFulfillmentRate: {
          $cond: {
            if: { $gt: ["$totalProductsTransferred", 0] },
            then: { $multiply: [{ $divide: ["$totalReceived", "$totalProductsTransferred"] }, 100] },
            else: 0
          }
        },
      },
    });

    const statsResult = await StockTransfer.aggregate(statsPipeline);
    const stats = statsResult.length > 0 ? statsResult[0] : {
      totalProductsTransferred: 0,
      totalApproved: 0,
      totalReceived: 0,
      totalTransfers: 0,
      uniqueProductsCount: 0,
      uniqueFromCentersCount: 0,
      uniqueToCentersCount: 0,
      uniqueStatusesCount: 0,
      pendingQuantity: 0,
      pendingApproval: 0,
      overallApprovalRate: 0,
      overallFulfillmentRate: 0,
    };

    // ========== EXCEL EXPORT HANDLING - SIMPLIFIED ==========
    if (format === "excel") {
      try {
        console.log(`[EXPORT] Generating Excel file with ${monthlySummary.length} records`);

        // Prepare Excel data with ONLY 4 columns as requested
        const excelData = monthlySummary.map((item, index) => ({
          'Center': item.fromCenter || 'N/A',
          'Parent Center': item.toCenter || 'N/A',
          'Product': item.product || 'N/A',
          'Total Qty': item.totalRequestedQty || 0
        }));

        // Create workbook
        const workbook = XLSX.utils.book_new();

        // Main data sheet with only 4 columns
        const mainSheet = XLSX.utils.json_to_sheet(excelData);
        
        // Set column widths
        mainSheet['!cols'] = [
          { wch: 30 }, // Center
          { wch: 30 }, // Parent Center
          { wch: 40 }, // Product
          { wch: 12 }, // Total Qty
        ];

        // Style the header row
        const headerRange = XLSX.utils.decode_range(mainSheet['!ref'] || 'A1:D1');
        for (let C = headerRange.s.c; C <= headerRange.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ r: 0, c: C });
          if (!mainSheet[address]) continue;
          mainSheet[address].s = {
            font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4F81BD" } },
            alignment: { horizontal: "center", vertical: "center" }
          };
        }

        XLSX.utils.book_append_sheet(workbook, mainSheet, 'Stock Transfers Summary');

        // Optional: Add a summary sheet with filter information
        const summaryData = [{
          'Report Generated': moment().format('DD-MM-YYYY HH:mm:ss'),
          'Period': periodDisplay,
          'Reseller ID': resellerId || 'All',
          'From Center': fromCenter || 'All',
          'To Center': toCenter || 'All',
          'Product': product || productId || 'All',
          'Status': status || 'All',
          'Total Records': monthlySummary.length,
          'Total Quantity': stats.totalProductsTransferred
        }];
        
        const summarySheet = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Report Info');

        // Generate Excel file
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=stock_transfers_summary_${moment().format('YYYY-MM-DD')}.xlsx`);
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

    // ========== JSON RESPONSE ==========
    const response = {
      success: true,
      message: `Monthly stock transfers summary for ${periodDisplay} retrieved successfully`,
      data: monthlySummary,
      summary: {
        period: periodDisplay,
        dateRange: dateFilter,
        totalProductsTransferred: stats.totalProductsTransferred,
        totalApproved: stats.totalApproved,
        totalReceived: stats.totalReceived,
        totalTransfers: stats.totalTransfers,
        pendingQuantity: stats.pendingQuantity,
        pendingApproval: stats.pendingApproval,
        uniqueProducts: stats.uniqueProductsCount,
        uniqueFromCenters: stats.uniqueFromCentersCount,
        uniqueToCenters: stats.uniqueToCentersCount,
        uniqueStatuses: stats.uniqueStatusesCount,
        overallApprovalRate: Math.round(stats.overallApprovalRate * 100) / 100,
        overallFulfillmentRate: Math.round(stats.overallFulfillmentRate * 100) / 100,
      },
      filters: {
        reseller: resellerId || "all",
        fromCenter: fromCenter || "all",
        toCenter: toCenter || "all",
        product: product || productId || "all",
        status: status || "all",
        startDate: startDate || "auto",
        endDate: endDate || "auto",
        month: month || "current",
        year: year || "current",
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching monthly stock transfers summary:", error);
    handleControllerError(error, res);
  }
};

export const getAllStockTransfersReports = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      page = 1,
      limit = 100,
      format = "json",
      status,
      fromCenter,
      toCenter,
      center,
      centerId,
      resellerId,
      product,
      productId,
      month,
      year,
      startDate,
      endDate,
      createdBy,
      approvedBy,
      shippedBy,
      receivedBy,
      dateField = "createdAt",
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      includeUserDetails = false,
      includeCenterDetails = false,
      statuses,
    } = req.query;

    const filter = {};

    console.log('Received query params:', {
      center, centerId, resellerId, product, productId, month, year, startDate, endDate, fromCenter, toCenter, format
    });

    // ========== DATE RANGE FILTERING WITH MONTH/YEAR SUPPORT ==========
    let periodDisplay = '';
    const currentDate = new Date();
    
    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter[dateField] = { ...filter[dateField], $gte: start };
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter[dateField] = { ...filter[dateField], $lte: end };
      }
      periodDisplay = `${startDate || 'Start'} to ${endDate || 'End'}`;
    } else if (month || year) {
      const selectedMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
      const selectedYear = year ? parseInt(year) : currentDate.getFullYear();

      if (selectedMonth < 1 || selectedMonth > 12) {
        return res.status(400).json({
          success: false,
          message: "Month must be between 1 and 12",
        });
      }

      if (selectedYear < 2000 || selectedYear > 2100) {
        return res.status(400).json({
          success: false,
          message: "Year must be between 2000 and 2100",
        });
      }

      filter[dateField] = {
        $gte: new Date(selectedYear, selectedMonth - 1, 1),
        $lte: new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999)
      };
      periodDisplay = `${selectedMonth}/${selectedYear}`;
    }

    // ========== RESELLER AND CENTER FILTERING ==========
    let targetCenterIds = [];
    
    if (resellerId && mongoose.Types.ObjectId.isValid(resellerId)) {
      const centersUnderReseller = await mongoose.model('Center').find({ 
        reseller: resellerId,
        status: "Enable"
      }).select("_id");
      
      targetCenterIds = centersUnderReseller.map(c => c._id);
      console.log(`Found ${targetCenterIds.length} centers under reseller ${resellerId}`);
      
      if (targetCenterIds.length > 0) {
        filter.$or = [
          { fromCenter: { $in: targetCenterIds } },
          { toCenter: { $in: targetCenterIds } }
        ];
      }
    }

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.$or = [{ fromCenter: userCenterId }, { toCenter: userCenterId }];
      }
    } else if (permissions.view_all_report) {
      const centerFilterValue = center || centerId;
      if (centerFilterValue && mongoose.Types.ObjectId.isValid(centerFilterValue)) {
        if (filter.$or) {
          filter.$and = [
            { $or: filter.$or },
            { $or: [{ fromCenter: centerFilterValue }, { toCenter: centerFilterValue }] }
          ];
          delete filter.$or;
        } else {
          filter.$or = [
            { fromCenter: centerFilterValue },
            { toCenter: centerFilterValue }
          ];
        }
      } else {
        if (fromCenter && mongoose.Types.ObjectId.isValid(fromCenter)) {
          if (filter.$or) delete filter.$or;
          filter.fromCenter = new mongoose.Types.ObjectId(fromCenter);
        }
        if (toCenter && mongoose.Types.ObjectId.isValid(toCenter)) {
          if (filter.$or) delete filter.$or;
          filter.toCenter = new mongoose.Types.ObjectId(toCenter);
        }
      }
    }

    // ========== PRODUCT FILTERING ==========
    const productFilterValue = product || productId;
    if (productFilterValue && mongoose.Types.ObjectId.isValid(productFilterValue)) {
      filter["products.product"] = new mongoose.Types.ObjectId(productFilterValue);
    }

    // ========== STATUS FILTERING ==========
    if (status) {
      filter.status = status;
    }

    if (statuses) {
      const statusArray = Array.isArray(statuses)
        ? statuses
        : statuses.split(",");
      filter.status = { $in: statusArray };
    }

    // ========== USER FILTERING ==========
    if (createdBy && mongoose.Types.ObjectId.isValid(createdBy)) {
      filter.createdBy = new mongoose.Types.ObjectId(createdBy);
    }

    if (approvedBy && mongoose.Types.ObjectId.isValid(approvedBy)) {
      filter["adminApproval.approvedBy"] = new mongoose.Types.ObjectId(approvedBy);
    }

    if (shippedBy && mongoose.Types.ObjectId.isValid(shippedBy)) {
      filter["shippingInfo.shippedBy"] = new mongoose.Types.ObjectId(shippedBy);
    }

    if (receivedBy && mongoose.Types.ObjectId.isValid(receivedBy)) {
      filter["receivingInfo.receivedBy"] = new mongoose.Types.ObjectId(receivedBy);
    }

    // ========== SEARCH FILTERING ==========
    if (search) {
      filter.$or = [
        { transferNumber: { $regex: search, $options: "i" } },
        { remark: { $regex: search, $options: "i" } },
        { "products.productRemark": { $regex: search, $options: "i" } },
        { "shippingInfo.shipmentDetails": { $regex: search, $options: "i" } },
        {
          "shippingInfo.carrierInfo.trackingNumber": {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    console.log('Final filter:', JSON.stringify(filter, null, 2));

    // ========== BUILD QUERY ==========
    let query = StockTransfer.find(filter);

    const populateOptions = [
      {
        path: "createdBy",
        select: "fullName email",
      },
      {
        path: "fromCenter",
        select: "centerName centerCode centerType",
        populate: {
          path: "reseller",
          select: "businessName email phone"
        }
      },
      {
        path: "toCenter",
        select: "centerName centerCode centerType",
        populate: {
          path: "reseller",
          select: "businessName email phone"
        }
      },
      {
        path: "products.product",
        select: "productTitle productPrice productCode productImage trackSerialNumber",
      },
    ];

    if (includeUserDetails) {
      populateOptions.push(
        { path: "updatedBy", select: "fullName email" },
        { path: "adminApproval.approvedBy", select: "fullName email" },
        { path: "adminApproval.rejectedBy", select: "fullName email" },
        { path: "shippingInfo.shippedBy", select: "fullName email" },
        { path: "receivingInfo.receivedBy", select: "fullName email" },
        { path: "completionInfo.completedBy", select: "fullName email" },
        { path: "completionInfo.incompleteBy", select: "fullName email" }
      );
    }

    const sort = {};
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "date",
      "transferNumber",
      "status",
    ];
    const actualSortBy = validSortFields.includes(sortBy)
      ? sortBy
      : "createdAt";
    sort[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let stockTransfers = await query
      .populate(populateOptions)
      .sort(sort)
      .lean();

    const total = stockTransfers.length;

    if (format !== "excel") {
      stockTransfers = stockTransfers.slice(skip, skip + limitNum);
    }

    let processedTransfers = stockTransfers;
    if (productFilterValue) {
      processedTransfers = stockTransfers.map(transfer => {
        const filteredProducts = transfer.products.filter(productItem => {
          if (!productItem.product) return false;
          const productId = productItem.product._id?.toString() || productItem.product?.toString();
          return productId === productFilterValue;
        });
        
        return {
          ...transfer,
          products: filteredProducts
        };
      }).filter(transfer => transfer.products.length > 0);
    }

    // ========== FETCH STOCK DATA ==========
    const CenterStock = mongoose.model("CenterStock");

    for (const transfer of processedTransfers) {
      for (const productItem of transfer.products) {
        if (productItem.product && transfer.fromCenter && transfer.toCenter) {
          try {
            const fromCenterId = transfer.fromCenter._id || transfer.fromCenter;
            const toCenterId = transfer.toCenter._id || transfer.toCenter;
            const productId = productItem.product._id || productItem.product;

            const fromCenterStock = await CenterStock.findOne({
              center: fromCenterId,
              product: productId,
            }).lean();

            const toCenterStock = await CenterStock.findOne({
              center: toCenterId,
              product: productId,
            }).lean();

            productItem.fromCenterStock = fromCenterStock
              ? {
                  availableQuantity: fromCenterStock.availableQuantity || 0,
                  totalQuantity: fromCenterStock.totalQuantity || 0,
                }
              : { availableQuantity: 0, totalQuantity: 0 };

            productItem.toCenterStock = toCenterStock
              ? {
                  availableQuantity: toCenterStock.availableQuantity || 0,
                  totalQuantity: toCenterStock.totalQuantity || 0,
                }
              : { availableQuantity: 0, totalQuantity: 0 };
          } catch (error) {
            productItem.fromCenterStock = { availableQuantity: 0, totalQuantity: 0 };
            productItem.toCenterStock = { availableQuantity: 0, totalQuantity: 0 };
          }
        }
      }
    }

    // ========== SUMMARY STATISTICS ==========
    const summaryStats = await StockTransfer.aggregate([
      { $match: filter },
      { $unwind: "$products" },
      ...(productFilterValue ? [{
        $match: {
          "products.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      }] : []),
      {
        $group: {
          _id: null,
          totalTransfers: { $addToSet: "$_id" },
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: "$products.quantity" },
          totalApproved: { $sum: "$products.approvedQuantity" },
          totalShipped: { $sum: "$products.shippedQuantity" },
          totalReceived: { $sum: "$products.receivedQuantity" }
        }
      },
      {
        $project: {
          totalTransfers: { $size: "$totalTransfers" },
          totalProducts: 1,
          totalQuantity: 1,
          totalApproved: 1,
          totalShipped: 1,
          totalReceived: 1,
          pendingApproval: { $subtract: ["$totalQuantity", "$totalApproved"] },
          pendingShipment: { $subtract: ["$totalApproved", "$totalShipped"] },
          pendingReceipt: { $subtract: ["$totalShipped", "$totalReceived"] }
        }
      }
    ]);

    const summary = summaryStats.length > 0 ? summaryStats[0] : {
      totalTransfers: 0,
      totalProducts: 0,
      totalQuantity: 0,
      totalApproved: 0,
      totalShipped: 0,
      totalReceived: 0,
      pendingApproval: 0,
      pendingShipment: 0,
      pendingReceipt: 0
    };

    const statusCounts = await StockTransfer.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusFilters = {};
    statusCounts.forEach((item) => {
      statusFilters[item._id] = item.count;
    });

    const finalTotal = productFilterValue ? processedTransfers.length : total;

    // ========== EXCEL EXPORT WITH REQUIRED FORMAT ==========
    if (format === "excel") {
      try {
        console.log(`[EXPORT] Generating Excel file with ${processedTransfers.length} transfers`);

        // Prepare Excel data in the exact format requested
        const excelData = [];
        
        processedTransfers.forEach((transfer) => {
          transfer.products.forEach((productItem) => {
            excelData.push({
              'Invoice No.': transfer.transferNumber || 'N/A',
              'Date': transfer.date ? moment(transfer.date).format('DD MMM YYYY') : (transfer.createdAt ? moment(transfer.createdAt).format('DD MMM YYYY') : 'N/A'),
              'Center': transfer.fromCenter?.centerName || 'N/A',
              'Parent Center': transfer.toCenter?.centerName || 'N/A',
              'Product': productItem.product?.productTitle || 'N/A',
              'Quantity': productItem.quantity || 0,
              'Center Stock': productItem.fromCenterStock?.availableQuantity || 0,
              'Parent Stock': productItem.toCenterStock?.availableQuantity || 0,
              'Product Remark': productItem.productRemark || transfer.remark || 'N/A',
              'Approved Quantity': productItem.approvedQuantity || 0,
              'Approved Remark': productItem.approvedRemark || transfer.adminApproval?.remark || 'N/A',
              'Received Qty.': productItem.receivedQuantity || 0,
              'Received Remark': productItem.receivedRemark || transfer.receivingInfo?.remark || 'N/A',
            });
          });
        });

        // Summary sheet data
        const summaryData = [{
          'Report Generated': moment().format('DD-MM-YYYY HH:mm:ss'),
          'Period': periodDisplay || 'All Time',
          'Date Field': dateField,
          'Start Date': startDate || (month ? `Month ${month}/${year}` : 'Not Applied'),
          'End Date': endDate || (month ? `Month ${month}/${year}` : 'Not Applied'),
          'Reseller ID': resellerId || 'All',
          'From Center': fromCenter || center || centerId || 'All',
          'To Center': toCenter || 'All',
          'Product': product || productId || 'All',
          'Status': status || statuses || 'All',
          'Total Transfers': summary.totalTransfers,
          'Total Products': summary.totalProducts,
          'Total Quantity': summary.totalQuantity,
          'Total Approved': summary.totalApproved,
          'Total Shipped': summary.totalShipped,
          'Total Received': summary.totalReceived,
          'Pending Approval': summary.pendingApproval,
          'Pending Shipment': summary.pendingShipment,
          'Pending Receipt': summary.pendingReceipt,
        }];

        // Filters applied sheet
        const filtersData = [{
          'Filter Name': 'Applied Value',
          'Reseller ID': resellerId || 'All',
          'From Center ID': fromCenter || 'All',
          'To Center ID': toCenter || 'All',
          'Center ID': center || centerId || 'All',
          'Product ID': product || productId || 'All',
          'Status': status || statuses || 'All',
          'Start Date': startDate || 'Not Applied',
          'End Date': endDate || 'Not Applied',
          'Month': month || 'Not Applied',
          'Year': year || 'Not Applied',
          'Date Field': dateField,
          'Created By': createdBy || 'All',
          'Approved By': approvedBy || 'All',
          'Shipped By': shippedBy || 'All',
          'Received By': receivedBy || 'All',
          'Search Term': search || 'None',
        }];

        // Create workbook
        const workbook = XLSX.utils.book_new();

        // Main data sheet with required columns
        const mainSheet = XLSX.utils.json_to_sheet(excelData);
        
        // Set column widths
        mainSheet['!cols'] = [
          { wch: 20 }, // Invoice No.
          { wch: 15 }, // Date
          { wch: 25 }, // Center
          { wch: 25 }, // Parent Center
          { wch: 40 }, // Product
          { wch: 10 }, // Quantity
          { wch: 12 }, // Center Stock
          { wch: 12 }, // Parent Stock
          { wch: 30 }, // Product Remark
          { wch: 15 }, // Approved Quantity
          { wch: 30 }, // Approved Remark
          { wch: 15 }, // Received Qty.
          { wch: 30 }, // Received Remark
        ];

        // Style the header row (make it bold)
        const headerRange = XLSX.utils.decode_range(mainSheet['!ref'] || 'A1:M1');
        for (let C = headerRange.s.c; C <= headerRange.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ r: 0, c: C });
          if (!mainSheet[address]) continue;
          mainSheet[address].s = {
            font: { bold: true, sz: 12 },
            fill: { fgColor: { rgb: "4F81BD" } },
            alignment: { horizontal: "center" }
          };
        }

        XLSX.utils.book_append_sheet(workbook, mainSheet, 'Stock Transfers');

        // Summary sheet
        const summarySheet = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

        // Filters sheet
        const filtersSheet = XLSX.utils.json_to_sheet(filtersData);
        XLSX.utils.book_append_sheet(workbook, filtersSheet, 'Applied Filters');

        // Status breakdown sheet
        const statusData = Object.keys(statusFilters).map(status => ({
          'Status': status,
          'Count': statusFilters[status]
        }));
        const statusSheet = XLSX.utils.json_to_sheet(statusData);
        XLSX.utils.book_append_sheet(workbook, statusSheet, 'Status Breakdown');

        // Generate Excel file
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=stock_transfers_${moment().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`);
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

    // ========== JSON RESPONSE ==========
    const response = {
      success: true,
      message: "Stock transfers retrieved successfully",
      data: processedTransfers,
      summary: {
        period: periodDisplay || 'All Time',
        totalTransfers: summary.totalTransfers,
        totalProducts: summary.totalProducts,
        totalQuantity: summary.totalQuantity,
        totalApproved: summary.totalApproved,
        totalShipped: summary.totalShipped,
        totalReceived: summary.totalReceived,
        pendingApproval: summary.pendingApproval,
        pendingShipment: summary.pendingShipment,
        pendingReceipt: summary.pendingReceipt,
      },
      filters: {
        reseller: resellerId || "all",
        center: center || centerId || "all",
        fromCenter: fromCenter || "all",
        toCenter: toCenter || "all",
        product: product || productId || "all",
        status: statusFilters,
        dateRange: {
          startDate: startDate || (month ? `Month ${month}/${year}` : "all"),
          endDate: endDate || (month ? `Month ${month}/${year}` : "all"),
          dateField: dateField,
        },
        search: search || "none",
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(finalTotal / limitNum),
        totalItems: finalTotal,
        itemsPerPage: limitNum,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching stock transfers:", error);
    handleControllerError(error, res);
  }
};

export const getMonthlyStockUsageSummary = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      month,
      year,
      center,
      centerId,
      resellerId,
      usageType,
      product,
      productId,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      format = "json",
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    console.log('Received query params:', {
      center, centerId, resellerId, usageType, product, productId, status, startDate, endDate, month, year, format
    });

    // ========== DATE FILTER LOGIC ==========
    let dateFilter = {};
    const currentDate = new Date();
    let periodDisplay = '';
    
    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      periodDisplay = `${startDate || 'Start'} to ${endDate || 'End'}`;
    } else {
      const currentMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
      const currentYear = year ? parseInt(year) : currentDate.getFullYear();

      if (currentMonth < 1 || currentMonth > 12) {
        return res.status(400).json({
          success: false,
          message: "Month must be between 1 and 12",
        });
      }

      if (currentYear < 2000 || currentYear > 2100) {
        return res.status(400).json({
          success: false,
          message: "Year must be between 2000 and 2100",
        });
      }

      dateFilter = {
        $gte: new Date(currentYear, currentMonth - 1, 1),
        $lte: new Date(currentYear, currentMonth, 0, 23, 59, 59, 999)
      };
      periodDisplay = `${currentMonth}/${currentYear}`;
    }

    const baseFilter = { date: dateFilter };

    // ========== RESELLER AND CENTER FILTERS ==========
    let targetCenterIds = [];
    
    if (resellerId && mongoose.Types.ObjectId.isValid(resellerId)) {
      const centersUnderReseller = await mongoose.model('Center').find({ 
        reseller: resellerId,
        status: "Enable"
      }).select("_id");
      
      targetCenterIds = centersUnderReseller.map(c => c._id);
      console.log(`Found ${targetCenterIds.length} centers under reseller ${resellerId}`);
      
      if (targetCenterIds.length > 0) {
        baseFilter.center = { $in: targetCenterIds };
      }
    }

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        baseFilter.center = mongoose.Types.ObjectId.isValid(userCenterId) 
          ? new mongoose.Types.ObjectId(userCenterId)
          : userCenterId;
      }
    } else if (permissions.view_all_report) {
      const centerFilterValue = center || centerId;
      if (centerFilterValue && mongoose.Types.ObjectId.isValid(centerFilterValue)) {
        baseFilter.center = new mongoose.Types.ObjectId(centerFilterValue);
      }
    }

    if (usageType) baseFilter.usageType = usageType;
    if (status) baseFilter.status = status;

    console.log('Base filter:', JSON.stringify(baseFilter, null, 2));

    // ========== AGGREGATION PIPELINE ==========
    const aggregationPipeline = [
      { $match: baseFilter },
      { $unwind: "$items" }
    ];

    const productFilterValue = product || productId;
    if (productFilterValue && mongoose.Types.ObjectId.isValid(productFilterValue)) {
      aggregationPipeline.push({
        $match: {
          "items.product": new mongoose.Types.ObjectId(productFilterValue)
        }
      });
    }

    aggregationPipeline.push(
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
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customerDetails",
        },
      },
      {
        $lookup: {
          from: "buildings",
          localField: "fromBuilding",
          foreignField: "_id",
          as: "buildingDetails",
        },
      },
      {
        $project: {
          date: 1,
          usageType: 1,
          center: { $arrayElemAt: ["$centerDetails.centerName", 0] },
          centerId: "$center",
          product: { $arrayElemAt: ["$productDetails.productTitle", 0] },
          productId: "$items.product",
          productCode: { $arrayElemAt: ["$productDetails.productCode", 0] },
          productType: { $arrayElemAt: ["$productDetails.productCategory.productCategory", 0] },
          quantity: "$items.quantity",
          customerName: { $arrayElemAt: ["$customerDetails.name", 0] },
          customerMobile: { $arrayElemAt: ["$customerDetails.mobile", 0] },
          customerAddress: { $arrayElemAt: ["$customerDetails.address1", 0] },
          buildingName: { $arrayElemAt: ["$buildingDetails.buildingName", 0] },
          buildingAddress: { $arrayElemAt: ["$buildingDetails.address1", 0] },
          status: 1,
          remark: 1,
          connectionType: 1,
          packageDuration: 1,
          packageAmount: 1,
          onuCharges: 1,
          installationCharges: 1,
          shiftingAmount: 1,
          wireChangeAmount: 1,
        },
      },
      {
        $addFields: {
          userOrBuilding: {
            $cond: {
              if: { $eq: ["$usageType", "Customer"] },
              then: "$customerName",
              else: { $ifNull: ["$buildingName", "$customerName"] }
            }
          },
          address: {
            $cond: {
              if: { $eq: ["$usageType", "Customer"] },
              then: "$customerAddress",
              else: { $ifNull: ["$buildingAddress", "$customerAddress"] }
            }
          },
          mobile: {
            $cond: {
              if: { $eq: ["$usageType", "Customer"] },
              then: "$customerMobile",
              else: "N/A"
            }
          }
        }
      },
      {
        $project: {
          Date: "$date",
          Type: "$usageType",
          Center: "$center",
          CenterId: "$centerId", // Added CenterId field
          Product: "$product",
          ProductId: "$productId", // Added ProductId field
          ProductType: "$productType",
          Qty: "$quantity",
          UserBuilding: "$userOrBuilding",
          Address: "$address",
          Mobile: "$mobile",
          PackageDuration: "$packageDuration",
          Status: "$status",
          ONUChrg: "$onuCharges",
          PktAmt: "$packageAmount",
          InstChrg: "$installationCharges",
          ShiftingAmount: "$shiftingAmount",
          WireChangeAmount: "$wireChangeAmount",
          TotalAmount: {
            $add: [
              { $ifNull: ["$packageAmount", 0] },
              { $ifNull: ["$onuCharges", 0] },
              { $ifNull: ["$installationCharges", 0] },
              { $ifNull: ["$shiftingAmount", 0] },
              { $ifNull: ["$wireChangeAmount", 0] }
            ]
          },
          Reason: "$remark"
        }
      },
      {
        $sort: {
          [sortBy === "date" ? "Date" : 
           sortBy === "center" ? "Center" :
           sortBy === "product" ? "Product" : "Date"]: sortOrder === "desc" ? -1 : 1,
        },
      }
    );

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let monthlySummary = await StockUsage.aggregate(aggregationPipeline);
    const total = monthlySummary.length;

    if (format !== "excel") {
      monthlySummary = monthlySummary.slice(skip, skip + limitNum);
    }

    // ========== STATISTICS ==========
    const statsPipeline = [
      { $match: baseFilter },
      { $unwind: "$items" }
    ];

    if (productFilterValue && mongoose.Types.ObjectId.isValid(productFilterValue)) {
      statsPipeline.push({
        $match: {
          "items.product": new mongoose.Types.ObjectId(productFilterValue)
        }
      });
    }

    statsPipeline.push({
      $group: {
        _id: null,
        totalProductsUsed: { $sum: "$items.quantity" },
        totalUsages: { $sum: 1 },
        totalRevenue: {
          $sum: {
            $add: [
              "$packageAmount",
              "$onuCharges",
              "$installationCharges",
              "$shiftingAmount",
              "$wireChangeAmount",
            ],
          },
        },
        uniqueProducts: { $addToSet: "$items.product" },
        uniqueCenters: { $addToSet: "$center" },
      },
    });

    const statsResult = await StockUsage.aggregate(statsPipeline);
    const basicStats = statsResult.length > 0 ? statsResult[0] : {
      totalProductsUsed: 0,
      totalUsages: 0,
      totalRevenue: 0,
      uniqueProductsCount: 0,
      uniqueCentersCount: 0,
    };

    // ========== EXCEL EXPORT ==========
    if (format === "excel") {
      try {
        console.log(`[EXPORT] Generating Excel file with ${monthlySummary.length} records`);

        // Prepare Excel data with all requested columns including CenterId and ProductId
        const excelData = monthlySummary.map((item, index) => ({
          'Date': item.Date ? moment(item.Date).format('DD-MM-YYYY') : 'N/A',
          'Type': item.Type || 'N/A',
          'Center': item.Center || 'N/A',
          'Center ID': item.CenterId ? item.CenterId.toString() : 'N/A', // Added Center ID column
          'Product': item.Product || 'N/A',
          'Product ID': item.ProductId ? item.ProductId.toString() : 'N/A', // Added Product ID column
          'Product Type': item.ProductType || 'N/A',
          'Qty': item.Qty || 0,
          'User/Building': item.UserBuilding || 'N/A',
          'Address': item.Address || 'N/A',
          'Mobile': item.Mobile || 'N/A',
          'Package Duration': item.PackageDuration || 'N/A',
          'Status': item.Status || 'N/A',
          'ONU Chrg.': item.ONUChrg || 0,
          'Pkt. Amt.': item.PktAmt || 0,
          'Inst. Chrg.': item.InstChrg || 0,
          'Shifting Amount': item.ShiftingAmount || 0,
          'Wire Change Amount': item.WireChangeAmount || 0,
          'Total Amount': item.TotalAmount || 0,
          'Reason': item.Reason || 'N/A',
        }));

        // Create workbook
        const workbook = XLSX.utils.book_new();

        // Main data sheet
        const mainSheet = XLSX.utils.json_to_sheet(excelData);
        
        // Set column widths
        mainSheet['!cols'] = [
          { wch: 12 }, // Date
          { wch: 15 }, // Type
          { wch: 25 }, // Center
          { wch: 25 }, // Center ID (new)
          { wch: 35 }, // Product
          { wch: 25 }, // Product ID (new)
          { wch: 15 }, // Product Type
          { wch: 8 },  // Qty
          { wch: 25 }, // User/Building
          { wch: 40 }, // Address
          { wch: 15 }, // Mobile
          { wch: 15 }, // Package Duration
          { wch: 12 }, // Status
          { wch: 12 }, // ONU Chrg.
          { wch: 12 }, // Pkt. Amt.
          { wch: 12 }, // Inst. Chrg.
          { wch: 12 }, // Shifting Amount
          { wch: 15 }, // Wire Change Amount
          { wch: 15 }, // Total Amount
          { wch: 30 }, // Reason
        ];

        // Style header row
        const headerRange = XLSX.utils.decode_range(mainSheet['!ref'] || 'A1:T1');
        for (let C = headerRange.s.c; C <= headerRange.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ r: 0, c: C });
          if (!mainSheet[address]) continue;
          mainSheet[address].s = {
            font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4F81BD" } },
            alignment: { horizontal: "center", vertical: "center" }
          };
        }

        XLSX.utils.book_append_sheet(workbook, mainSheet, 'Stock Usage Summary');

        // Summary sheet
        const summaryData = [{
          'Report Generated': moment().format('DD-MM-YYYY HH:mm:ss'),
          'Period': periodDisplay,
          'Reseller ID': resellerId || 'All',
          'Center ID': center || centerId || 'All', // Added Center ID in summary
          'Usage Type': usageType || 'All',
          'Product': product || productId || 'All',
          'Product ID': productId || product || 'All', // Added Product ID in summary
          'Status': status || 'All',
          'Total Usages': basicStats.totalUsages,
          'Total Products Used': basicStats.totalProductsUsed,
          'Total Revenue': basicStats.totalRevenue,
          'Unique Centers': basicStats.uniqueCentersCount,
          'Unique Products': basicStats.uniqueProductsCount,
        }];
        
        const summarySheet = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=stock_usage_summary_${moment().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`);
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

    // ========== JSON RESPONSE ==========
    const response = {
      success: true,
      message: `Monthly stock usage summary for ${periodDisplay} retrieved successfully`,
      data: monthlySummary,
      summary: {
        period: periodDisplay,
        totalProductsUsed: basicStats.totalProductsUsed,
        totalUsages: basicStats.totalUsages,
        totalRevenue: basicStats.totalRevenue,
        uniqueProducts: basicStats.uniqueProductsCount,
        uniqueCenters: basicStats.uniqueCentersCount,
      },
      filters: {
        reseller: resellerId || "all",
        center: center || centerId || "all",
        centerId: centerId || center || "all", // Added centerId in filters
        product: product || productId || "all",
        productId: productId || product || "all", // Added productId in filters
        usageType: usageType || "all",
        status: status || "all",
        startDate: startDate || "auto",
        endDate: endDate || "auto",
        month: month || "current",
        year: year || "current",
      },
      pagination: format !== "excel" ? {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      } : null,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching monthly stock usage summary:", error);
    handleControllerError(error, res);
  }
};

export const getAllStockUsageReports = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      page = 1,
      limit = 100,
      format = "json",
      status,
      center,
      centerId,
      resellerId,
      usageType,
      product,
      productId,
      connectionType,
      customer,
      month,
      year,
      startDate,
      endDate,
      createdBy,
      approvedBy,
      rejectedBy,
      dateField = "date",
      search,
      sortBy = "date",
      sortOrder = "desc",
      includeUserDetails = false,
      includeCenterDetails = false,
      includeCustomerDetails = false,
      includeBuildingDetails = false,
      includeControlRoomDetails = false,
      statuses,
    } = req.query;

    console.log('Received query params:', {
      center, centerId, resellerId, usageType, product, productId, connectionType, 
      customer, month, year, startDate, endDate, status, format
    });

    const filter = {};

    // ========== DATE RANGE FILTERING ==========
    let periodDisplay = '';
    const currentDate = new Date();
    
    if (startDate || endDate) {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter[dateField] = { ...filter[dateField], $gte: start };
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter[dateField] = { ...filter[dateField], $lte: end };
      }
      periodDisplay = `${startDate || 'Start'} to ${endDate || 'End'}`;
    } else if (month || year) {
      const selectedMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
      const selectedYear = year ? parseInt(year) : currentDate.getFullYear();

      if (selectedMonth < 1 || selectedMonth > 12) {
        return res.status(400).json({
          success: false,
          message: "Month must be between 1 and 12",
        });
      }

      if (selectedYear < 2000 || selectedYear > 2100) {
        return res.status(400).json({
          success: false,
          message: "Year must be between 2000 and 2100",
        });
      }

      filter[dateField] = {
        $gte: new Date(selectedYear, selectedMonth - 1, 1),
        $lte: new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999)
      };
      periodDisplay = `${selectedMonth}/${selectedYear}`;
    }

    // ========== RESELLER AND CENTER FILTERS ==========
    let targetCenterIds = [];
    
    if (resellerId && mongoose.Types.ObjectId.isValid(resellerId)) {
      const centersUnderReseller = await mongoose.model('Center').find({ 
        reseller: resellerId,
        status: "Enable"
      }).select("_id");
      
      targetCenterIds = centersUnderReseller.map(c => c._id);
      console.log(`Found ${targetCenterIds.length} centers under reseller ${resellerId}`);
      
      if (targetCenterIds.length > 0) {
        filter.center = { $in: targetCenterIds };
      }
    }

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        // A usage record can belong to a center either as the primary
        // `center` or as the `toCenter` (e.g. Building-to-Building shifting
        // entries). The usage summary report (getStockUsageData) already
        // counts a record under a center if it matches either field — the
        // detail report must use the same match, or a valid drill-down
        // click (e.g. the "Usage" column) can return zero rows even with a
        // correct centerId.
        filter.$or = [
          { center: userCenterId },
          { toCenter: userCenterId },
        ];
      }
    } else if (permissions.view_all_report) {
      const centerFilterValue = center || centerId;
      if (centerFilterValue && mongoose.Types.ObjectId.isValid(centerFilterValue)) {
        const centerObjectId = new mongoose.Types.ObjectId(centerFilterValue);
        filter.$or = [
          { center: centerObjectId },
          { toCenter: centerObjectId },
        ];
      }
    }

    // ========== OTHER FILTERS ==========
    if (status) filter.status = status;
    if (statuses) {
      const statusArray = Array.isArray(statuses) ? statuses : statuses.split(",");
      filter.status = { $in: statusArray };
    }
    if (usageType) filter.usageType = usageType;
    if (customer && mongoose.Types.ObjectId.isValid(customer)) {
      filter.customer = new mongoose.Types.ObjectId(customer);
    }

    const productFilterValue = product || productId;
    if (productFilterValue && mongoose.Types.ObjectId.isValid(productFilterValue)) {
      filter["items.product"] = new mongoose.Types.ObjectId(productFilterValue);
    }
    
    if (connectionType) filter.connectionType = connectionType;

    if (createdBy && mongoose.Types.ObjectId.isValid(createdBy)) {
      filter.createdBy = new mongoose.Types.ObjectId(createdBy);
    }
    if (approvedBy && mongoose.Types.ObjectId.isValid(approvedBy)) {
      filter.approvedBy = new mongoose.Types.ObjectId(approvedBy);
    }
    if (rejectedBy && mongoose.Types.ObjectId.isValid(rejectedBy)) {
      filter.rejectedBy = new mongoose.Types.ObjectId(rejectedBy);
    }

    if (search) {
      const searchOr = [
        { remark: { $regex: search, $options: "i" } },
        { approvalRemark: { $regex: search, $options: "i" } },
        { rejectionRemark: { $regex: search, $options: "i" } },
        { "items.serialNumbers": { $regex: search, $options: "i" } },
      ];

      // The center/toCenter filter above may already use `$or`. A second
      // top-level `$or` here would silently overwrite it (last write wins
      // on a plain object key), dropping the center filter. Combine both
      // conditions with `$and` instead so a center match AND a search
      // match are both required when both are present.
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }

    console.log('Final filter:', JSON.stringify(filter, null, 2));

    // ========== BUILD QUERY WITH ALL POPULATES ==========
    let query = StockUsage.find(filter);

    const populateOptions = [
      {
        path: "createdBy",
        select: "fullName email",
      },
      {
        path: "center",
        select: "centerName centerCode centerType",
        populate: { path: "reseller", select: "businessName email phone" }
      },
      {
        path: "customer",
        select: "username name email mobile address1 address2 city state pincode connectionType",
      },
      {
        path: "fromBuilding",
        select: "buildingName displayName address1 address2 landmark pincode city",
      },
      {
        path: "toBuilding",
        select: "buildingName displayName address1 address2 landmark pincode city",
      },
      {
        path: "fromControlRoom",
        select: "buildingName displayName address1 address2 landmark pincode city",
      },
      {
        path: "items.product",
        select: "productTitle productPrice productCode productImage productCategory trackSerialNumber",
        populate: { path: "productCategory", select: "productCategory" },
      },
    ];

    if (includeUserDetails) {
      populateOptions.push(
        { path: "approvedBy", select: "fullName email" },
        { path: "rejectedBy", select: "fullName email" }
      );
    }

    // ========== SORTING ==========
    const sort = {};
    const validSortFields = ["createdAt", "updatedAt", "date", "usageType", "status", "connectionType"];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "date";
    sort[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let stockUsages = await query
      .sort(sort)
      .populate(populateOptions)
      .lean();

    const total = stockUsages.length;

    if (format !== "excel") {
      stockUsages = stockUsages.slice(skip, skip + limitNum);
    }

    // ========== PROCESS DATA FOR EXCEL ==========
    for (const usage of stockUsages) {
      usage.totalRevenue =
        (usage.packageAmount || 0) +
        (usage.onuCharges || 0) +
        (usage.installationCharges || 0) +
        (usage.shiftingAmount || 0) +
        (usage.wireChangeAmount || 0);

      usage.totalQuantityUsed = usage.items.reduce((sum, item) => sum + item.quantity, 0);
      
      // Get user/building info
      if (usage.usageType === "Customer") {
        usage.userOrBuilding = usage.customer?.name || usage.customer?.username || 'N/A';
        usage.address = usage.customer?.address1 || 'N/A';
        usage.mobile = usage.customer?.mobile || 'N/A';
      } else if (usage.usageType === "Building" || usage.usageType === "Building to Building") {
        usage.userOrBuilding = usage.fromBuilding?.buildingName || 'N/A';
        usage.address = usage.fromBuilding?.address1 || 'N/A';
        usage.mobile = 'N/A';
      } else {
        usage.userOrBuilding = 'N/A';
        usage.address = 'N/A';
        usage.mobile = 'N/A';
      }
    }

    // ========== STATISTICS ==========
    const revenueStats = await StockUsage.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: {
              $add: ["$packageAmount", "$onuCharges", "$installationCharges", "$shiftingAmount", "$wireChangeAmount"],
            },
          },
          totalCustomerUsages: { $sum: { $cond: [{ $eq: ["$usageType", "Customer"] }, 1, 0] } },
        },
      },
    ]);

    // ========== EXCEL EXPORT WITH FULL COLUMNS ==========
    if (format === "excel") {
      try {
        console.log(`[EXPORT] Generating Excel file with ${stockUsages.length} usage records`);

        // Prepare Excel data with all requested columns
        const excelData = [];
        
        stockUsages.forEach((usage) => {
          usage.items.forEach((item) => {
            excelData.push({
              'Date': usage.date ? moment(usage.date).format('DD-MM-YYYY') : (usage.createdAt ? moment(usage.createdAt).format('DD-MM-YYYY') : 'N/A'),
              'Type': usage.usageType || 'N/A',
              'Center': usage.center?.centerName || 'N/A',
              'Product': item.product?.productTitle || 'N/A',
              'Product Type': item.product?.productCategory?.productCategory || 'N/A',
              'Qty': item.quantity || 0,
              'User/Building': usage.userOrBuilding || 'N/A',
              'Address': usage.address || 'N/A',
              'Mobile': usage.mobile || 'N/A',
              'Package Duration': usage.packageDuration || 'N/A',
              'Status': usage.status || 'N/A',
              'ONU Chrg.': usage.onuCharges || 0,
              'Pkt. Amt.': usage.packageAmount || 0,
              'Inst. Chrg.': usage.installationCharges || 0,
              'Shifting Amount': usage.shiftingAmount || 0,
              'Wire Change Amount': usage.wireChangeAmount || 0,
              'Total Amount': usage.totalRevenue || 0,
              'Reason': usage.remark || usage.approvalRemark || usage.rejectionRemark || 'N/A',
            });
          });
        });

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
          { wch: 15 }, // Product Type
          { wch: 8 },  // Qty
          { wch: 25 }, // User/Building
          { wch: 40 }, // Address
          { wch: 15 }, // Mobile
          { wch: 15 }, // Package Duration
          { wch: 12 }, // Status
          { wch: 12 }, // ONU Chrg.
          { wch: 12 }, // Pkt. Amt.
          { wch: 12 }, // Inst. Chrg.
          { wch: 12 }, // Shifting Amount
          { wch: 15 }, // Wire Change Amount
          { wch: 15 }, // Total Amount
          { wch: 30 }, // Reason
        ];

        // Style header row
        const headerRange = XLSX.utils.decode_range(mainSheet['!ref'] || 'A1:R1');
        for (let C = headerRange.s.c; C <= headerRange.e.c; ++C) {
          const address = XLSX.utils.encode_cell({ r: 0, c: C });
          if (!mainSheet[address]) continue;
          mainSheet[address].s = {
            font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "4F81BD" } },
            alignment: { horizontal: "center", vertical: "center" }
          };
        }

        XLSX.utils.book_append_sheet(workbook, mainSheet, 'Stock Usage Report');

        // Summary sheet
        const summaryData = [{
          'Report Generated': moment().format('DD-MM-YYYY HH:mm:ss'),
          'Period': periodDisplay || 'All Time',
          'Reseller ID': resellerId || 'All',
          'Center ID': center || centerId || 'All',
          'Usage Type': usageType || 'All',
          'Product': product || productId || 'All',
          'Connection Type': connectionType || 'All',
          'Status': status || statuses || 'All',
          'Total Records': stockUsages.length,
          'Total Items Used': excelData.length,
          'Total Revenue': revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0,
        }];
        
        const summarySheet = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=stock_usage_report_${moment().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`);
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

    // ========== JSON RESPONSE ==========
    const response = {
      success: true,
      message: "Stock usage reports retrieved successfully",
      data: stockUsages,
      pagination: format !== "excel" ? {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      } : null,
      summary: {
        period: periodDisplay || 'All Time',
        totalRecords: total,
        totalRevenue: revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0,
        totalCustomerUsages: revenueStats.length > 0 ? revenueStats[0].totalCustomerUsages : 0,
      },
      appliedFilters: {
        reseller: resellerId || "all",
        center: center || centerId || "all",
        usageType: usageType || "all",
        product: product || productId || "all",
        connectionType: connectionType || "all",
        customer: customer || "all",
        startDate: startDate || (month ? `Month ${month}/${year}` : "none"),
        endDate: endDate || (month ? `Month ${month}/${year}` : "none"),
        status: status || "all",
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching stock usage reports:", error);
    handleControllerError(error, res);
  }
};

function getUsageTypeDetails(usage) {
  const details = {
    entityName: "",
    entityAddress: "",
    entityContact: "",
    entityType: usage.usageType,
  };

  switch (usage.usageType) {
    case "Customer":
      if (usage.customer) {
        details.entityName = usage.customer.name || usage.customer.username;
        details.entityAddress = `${usage.customer.address1 || ""} ${
          usage.customer.address2 || ""
        } ${usage.customer.city || ""} ${usage.customer.state || ""}`.trim();
        details.entityContact = usage.customer.mobile || usage.customer.email;
        details.connectionType = usage.connectionType;
      }
      break;

    case "Building":
      if (usage.fromBuilding) {
        details.entityName = usage.fromBuilding.buildingName;
        details.entityAddress = `${usage.fromBuilding.address1 || ""} ${
          usage.fromBuilding.address2 || ""
        } ${usage.fromBuilding.landmark || ""} ${
          usage.fromBuilding.pincode || ""
        }`.trim();
        details.displayName = usage.fromBuilding.displayName;
      }
      break;

    case "Building to Building":
      if (usage.fromBuilding && usage.toBuilding) {
        details.entityName = `${usage.fromBuilding.buildingName} → ${usage.toBuilding.buildingName}`;
        details.entityAddress = `From: ${
          usage.fromBuilding.address1 || ""
        } | To: ${usage.toBuilding.address1 || ""}`;
        details.fromBuilding = usage.fromBuilding.buildingName;
        details.toBuilding = usage.toBuilding.buildingName;
      }
      break;

    case "Control Room":
      if (usage.fromControlRoom) {
        details.entityName = usage.fromControlRoom.buildingName;
        details.entityAddress = `${usage.fromControlRoom.address1 || ""} ${
          usage.fromControlRoom.address2 || ""
        } ${usage.fromControlRoom.landmark || ""} ${
          usage.fromControlRoom.pincode || ""
        }`.trim();
        details.displayName = usage.fromControlRoom.displayName;
      }
      break;

    case "Damage":
      details.entityName = "Damage Report";
      details.entityAddress = usage.center?.centerName || "Unknown Center";
      break;

    case "Stolen from Center":
      details.entityName = "Stolen from Center";
      details.entityAddress = usage.center?.centerName || "Unknown Center";
      break;

    case "Stolen from Field":
      details.entityName = "Stolen from Field";
      details.entityAddress = usage.center?.centerName || "Unknown Center";
      break;

    case "Other":
      details.entityName = "Other Usage";
      details.entityAddress = usage.center?.centerName || "Unknown Center";
      break;
  }

  return details;
}

export const getAllStolenStockReports = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      page = 1,
      limit = 100,
      center,
      centerId,
      product,
      productId,
      stolenFrom,
      status,
      startDate,
      endDate,
      createdBy,
      dateField = "date",
      search,
      sortBy = "date",
      sortOrder = "desc",
      includeUserDetails = false,
      includeCenterDetails = false,
    } = req.query;

    const filter = {
      usageType: {
        $in: ["Stolen from Center", "Stolen from Field"],
      },
    };

    console.log('Received query params:', {
      center, centerId, product, productId, startDate, endDate, stolenFrom, status
    });

    // Center filtering with permission check
    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.center = userCenterId;
      }
    } else if (permissions.view_all_report && (center || centerId)) {
      // Support both center and centerId parameters
      const centerFilterValue = center || centerId;
      filter.center = centerFilterValue;
    }

    // Product filtering
    const productFilterValue = product || productId;
    if (productFilterValue) {
      filter["items.product"] = productFilterValue;
    }

    // Stolen from and status filtering
    if (stolenFrom) filter.usageType = stolenFrom;
    if (status) filter.status = status;

    // Date range filtering with proper time boundaries
    if (startDate || endDate) {
      filter[dateField] = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter[dateField].$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter[dateField].$lte = end;
      }
    }

    if (createdBy) {
      filter.createdBy = createdBy;
    }

    // Enhanced search filtering
    if (search) {
      filter.$or = [
        { remark: { $regex: search, $options: "i" } },
        { "items.serialNumbers": { $regex: search, $options: "i" } },
        { "items.product.productTitle": { $regex: search, $options: "i" } },
        { "items.product.productCode": { $regex: search, $options: "i" } },
        { "center.centerName": { $regex: search, $options: "i" } },
        { "center.centerCode": { $regex: search, $options: "i" } },
      ];
    }

    console.log('Final filter:', JSON.stringify(filter, null, 2));

    // Use regular find with populate for better compatibility
    let query = StockUsage.find(filter);

    // Populate options
    const populateOptions = [
      {
        path: "createdBy",
        select: "fullName email",
      },
      {
        path: "center",
        select: "centerName centerCode centerType",
      },
      {
        path: "items.product",
        select: "productTitle productPrice productCode productImage trackSerialNumber",
      },
    ];

    if (includeUserDetails) {
      populateOptions.push(
        { path: "approvedBy", select: "fullName email" },
        { path: "rejectedBy", select: "fullName email" }
      );
    }

    if (includeCenterDetails) {
      const centerIndex = populateOptions.findIndex((p) => p.path === "center");
      if (centerIndex !== -1) {
        populateOptions[centerIndex].select += " address phone";
      }
    }

    // Sort options
    const sort = {};
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "date",
      "usageType",
      "status",
    ];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "date";
    sort[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [stolenStockReports, total] = await Promise.all([
      query
        .populate(populateOptions)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      StockUsage.countDocuments(filter)
    ]);

    console.log(`Found ${stolenStockReports.length} records out of ${total} total`);

    // Post-process to filter items array if product filter is applied
    let processedReports = stolenStockReports;
    if (productFilterValue) {
      processedReports = stolenStockReports.map(report => {
        const filteredItems = report.items.filter(item => {
          if (!item.product) return false;
          const productId = item.product._id?.toString() || item.product?.toString();
          return productId === productFilterValue;
        });
        
        return {
          ...report,
          items: filteredItems
        };
      }).filter(report => report.items.length > 0); // Remove reports with no matching items
    }

    // Fetch stock data for each product and calculate totals
    const CenterStock = mongoose.model("CenterStock");

    for (const report of processedReports) {
      // Remove unnecessary fields
      delete report.packageAmount;
      delete report.onuCharges;
      delete report.installationCharges;
      delete report.shiftingAmount;
      delete report.wireChangeAmount;

      for (const item of report.items) {
        // Remove unnecessary fields
        delete item.oldStock;
        delete item.newStock;

        if (item.product && report.center) {
          try {
            const centerStock = await CenterStock.findOne({
              center: report.center._id,
              product: item.product._id,
            })
              .select("availableQuantity totalQuantity")
              .lean();

            item.currentCenterStock = centerStock
              ? {
                  availableQuantity: centerStock.availableQuantity || 0,
                  totalQuantity: centerStock.totalQuantity || 0,
                }
              : {
                  availableQuantity: 0,
                  totalQuantity: 0,
                };
          } catch (error) {
            console.error(
              `Error fetching center stock for stolen product ${item.product._id}:`,
              error
            );
            item.currentCenterStock = {
              availableQuantity: 0,
              totalQuantity: 0,
            };
          }
        } else {
          item.currentCenterStock = {
            availableQuantity: 0,
            totalQuantity: 0,
          };
        }
      }

      // Calculate total stolen quantity for this report
      report.totalStolenQuantity = report.items.reduce(
        (sum, item) => sum + item.quantity,
        0
      );
    }

    // Get summary statistics
    const summaryStats = await StockUsage.aggregate([
      { $match: filter },
      { $unwind: "$items" },
      ...(productFilterValue ? [{
        $match: {
          "items.product": mongoose.Types.ObjectId.isValid(productFilterValue) 
            ? new mongoose.Types.ObjectId(productFilterValue)
            : productFilterValue
        }
      }] : []),
      {
        $group: {
          _id: null,
          totalReports: { $addToSet: "$_id" },
          totalItems: { $sum: 1 },
          totalStolenQuantity: { $sum: "$items.quantity" },
          byStolenFrom: {
            $push: {
              type: "$usageType",
              quantity: "$items.quantity"
            }
          }
        }
      },
      {
        $project: {
          totalReports: { $size: "$totalReports" },
          totalItems: 1,
          totalStolenQuantity: 1,
          stolenFromCenter: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$byStolenFrom",
                    as: "item",
                    cond: { $eq: ["$$item.type", "Stolen from Center"] }
                  }
                },
                as: "centerItem",
                in: "$$centerItem.quantity"
              }
            }
          },
          stolenFromField: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$byStolenFrom",
                    as: "item",
                    cond: { $eq: ["$$item.type", "Stolen from Field"] }
                  }
                },
                as: "fieldItem",
                in: "$$fieldItem.quantity"
              }
            }
          }
        }
      }
    ]);

    const summary = summaryStats.length > 0 ? summaryStats[0] : {
      totalReports: 0,
      totalItems: 0,
      totalStolenQuantity: 0,
      stolenFromCenter: 0,
      stolenFromField: 0
    };

    // Get status counts
    const statusCounts = await StockUsage.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusFilters = {};
    statusCounts.forEach((item) => {
      statusFilters[item._id] = item.count;
    });

    // Get stolen from counts
    const stolenFromCounts = await StockUsage.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$usageType",
          count: { $sum: 1 },
        },
      },
    ]);

    const stolenFromFilters = {};
    stolenFromCounts.forEach((item) => {
      stolenFromFilters[item._id] = item.count;
    });

    // Adjust total count if product filter was applied in post-processing
    const finalTotal = productFilterValue ? processedReports.length : total;

    const response = {
      success: true,
      message: "Stolen stock reports retrieved successfully",
      data: processedReports,
      summary: summary,
      filters: {
        center: center || centerId || "all",
        product: product || productId || "all",
        stolenFrom: stolenFrom || "all",
        status: status || "all",
        startDate: startDate || "all",
        endDate: endDate || "all",
        createdBy: createdBy || "all",
        total: finalTotal,
        statusCounts: statusFilters,
        stolenFromCounts: stolenFromFilters,
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(finalTotal / limitNum),
        totalItems: finalTotal,
        itemsPerPage: limitNum,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching stolen stock reports:", error);
    handleControllerError(error, res);
  }
};

export const getProductDetailsBySerialNumber = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      page = 1,
      limit = 50,
      serialNumber,
      center,
      product,
      productId,  // ADDED: Support for productId parameter
      status,
      startDate,
      endDate,
      search,
    } = req.query;

    const filter = {};
    
    // ========== BUILD FILTER ==========
    if (status === "Own Product") {
      if (req.user && req.user.center) {
        const userCenterId = req.user.center._id || req.user.center;
        if (userCenterId) {
          filter.center = userCenterId;
        }
      }
    }

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.center = userCenterId;
      }
    } else if (permissions.view_all_report && center && status !== "Own Product") {
      filter.center = center;
    }

    // ========== FIXED: Product filter ==========
    // Support both 'product' and 'productId' parameters
    const productFilterValue = product || productId;
    if (productFilterValue && mongoose.Types.ObjectId.isValid(productFilterValue)) {
      // The field in CenterStock is 'product' (not 'items.product')
      filter.product = mongoose.Types.ObjectId.isValid(productFilterValue) 
        ? new mongoose.Types.ObjectId(productFilterValue)
        : productFilterValue;
      console.log('Applied product filter:', filter.product);
    }

    if (startDate || endDate) {
      filter.lastUpdated = {};
      if (startDate) filter.lastUpdated.$gte = new Date(startDate);
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        filter.lastUpdated.$lte = endDateObj;
      }
    }

    // ========== BUILD AGGREGATION PIPELINE FOR EFFICIENCY ==========
    const pipeline = [
      { $match: filter },
      { $unwind: "$serialNumbers" },
    ];

    // Add serial number filter
    if (serialNumber) {
      pipeline.push({
        $match: { "serialNumbers.serialNumber": serialNumber }
      });
    }

    // Add search filter
    if (search) {
      pipeline.push({
        $match: {
          "serialNumbers.serialNumber": { $regex: search, $options: "i" }
        }
      });
    }

    // Add status filters
    if (status && status !== "all" && status !== "Own Product") {
      if (status === "Not in Use") {
        pipeline.push({
          $match: { "serialNumbers.status": { $nin: ["consumed", "damaged"] } }
        });
      } else {
        pipeline.push({
          $match: { "serialNumbers.status": status }
        });
      }
    }

    // ========== GET TOTAL COUNT ==========
    const countPipeline = [...pipeline, { $count: "total" }];
    const totalResult = await CenterStock.aggregate(countPipeline);
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    const currentPage = parseInt(page);
    const itemsPerPage = parseInt(limit);
    const totalPages = Math.ceil(total / itemsPerPage);
    const skip = (currentPage - 1) * itemsPerPage;

    // ========== FETCH WITH PAGINATION ==========
    const paginatedPipeline = [
      ...pipeline,
      { $skip: skip },
      { $limit: itemsPerPage },
      // Group back to original structure
      {
        $group: {
          _id: "$_id",
          center: { $first: "$center" },
          product: { $first: "$product" },
          serialNumbers: { $push: "$serialNumbers" },
          lastUpdated: { $first: "$lastUpdated" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
        }
      }
    ];

    const centerStocks = await CenterStock.aggregate(paginatedPipeline);

    // ========== POPULATE DATA ==========
    // Get all center IDs, product IDs, purchase IDs, etc. for batch population
    const centerIds = [];
    const productIds = [];
    const purchaseIds = [];
    const locationIds = [];
    const outletIds = [];
    const consumerIds = [];

    centerStocks.forEach(doc => {
      if (doc.center) centerIds.push(doc.center);
      if (doc.product) productIds.push(doc.product);
      
      doc.serialNumbers.forEach(serial => {
        if (serial.purchaseId) purchaseIds.push(serial.purchaseId);
        if (serial.currentLocation) locationIds.push(serial.currentLocation);
        if (serial.originalOutlet) outletIds.push(serial.originalOutlet);
        if (serial.consumedBy) consumerIds.push(serial.consumedBy);
      });
    });

    // Batch fetch all referenced data
    const [
      centers,
      products,
      purchases,
      locations,
      outlets,
      consumers
    ] = await Promise.all([
      centerIds.length > 0 ? Center.find({ _id: { $in: centerIds } }).select("_id centerName centerCode centerType address phone").lean() : [],
      productIds.length > 0 ? Product.find({ _id: { $in: productIds } }).select("_id productTitle productCode productPrice productImage productCategory trackSerialNumber").lean() : [],
      purchaseIds.length > 0 ? StockPurchase.find({ _id: { $in: purchaseIds } }).select("_id invoiceNo purchaseDate vendor").populate("vendor", "_id name").lean() : [],
      locationIds.length > 0 ? Center.find({ _id: { $in: locationIds } }).select("_id centerName centerCode centerType").lean() : [],
      outletIds.length > 0 ? Center.find({ _id: { $in: outletIds } }).select("_id centerName centerCode centerType").lean() : [],
      consumerIds.length > 0 ? User.find({ _id: { $in: consumerIds } }).select("_id fullName email").lean() : []
    ]);

    // Create lookup maps
    const centerMap = {};
    centers.forEach(c => centerMap[c._id.toString()] = c);

    const productMap = {};
    products.forEach(p => productMap[p._id.toString()] = p);

    const purchaseMap = {};
    purchases.forEach(p => purchaseMap[p._id.toString()] = p);

    const locationMap = {};
    locations.forEach(l => locationMap[l._id.toString()] = l);

    const outletMap = {};
    outlets.forEach(o => outletMap[o._id.toString()] = o);

    const consumerMap = {};
    consumers.forEach(c => consumerMap[c._id.toString()] = c);

    // ========== BUILD SERIAL DETAILS ==========
    const serialDetails = [];

    for (const centerStock of centerStocks) {
      if (!Array.isArray(centerStock.serialNumbers)) {
        continue;
      }

      const centerData = centerMap[centerStock.center?.toString()] || null;
      const productData = productMap[centerStock.product?.toString()] || null;

      // ========== FIXED: Skip if product doesn't match ==========
      if (productFilterValue && productData) {
        const productIdStr = productData._id.toString();
        if (productIdStr !== productFilterValue) {
          continue; // Skip this centerStock if product doesn't match
        }
      }

      for (const serial of centerStock.serialNumbers) {
        if (!serial || !serial.serialNumber) {
          continue;
        }

        const serialValue = String(serial.serialNumber).trim();
        if (!serialValue) {
          continue;
        }

        // Additional filters that couldn't be applied in aggregation
        if (serialNumber && serialValue !== serialNumber) {
          continue;
        }

        if (search && !serialValue.toLowerCase().includes(String(search).toLowerCase())) {
          continue;
        }

        // Get consumption details if needed
        let consumptionDetails = null;
        if (serial.status === "consumed" || serial.status === "damaged") {
          consumptionDetails = await getConsumptionDetails(serial.serialNumber);
        }

        // Get transfer history
        const latestTransfer = serial.transferHistory && serial.transferHistory.length > 0
          ? serial.transferHistory[serial.transferHistory.length - 1]
          : null;

        let actionAt = "";
        let actionType = "";
        let actionDate = "";

        if (latestTransfer) {
          const fromCenter = latestTransfer.fromCenter?.centerName || "Unknown";
          const toCenter = latestTransfer.toCenter?.centerName || "";
          actionAt = toCenter ? `${fromCenter} → ${toCenter}` : fromCenter;
          actionType = latestTransfer.transferType || "transfer";
          actionDate = latestTransfer.transferDate || centerStock.lastUpdated;
        } else if (serial.consumedDate) {
          actionAt = "Consumed";
          actionType = "consumption";
          actionDate = serial.consumedDate;
        } else if (serial.status === "available") {
          actionAt = centerData?.centerName || "Unknown Center";
          actionType = "available";
          actionDate = centerStock.lastUpdated;
        } else {
          actionAt = centerData?.centerName || "Unknown Center";
          actionType = serial.status || "unknown";
          actionDate = centerStock.lastUpdated;
        }

        const purchaseData = purchaseMap[serial.purchaseId?.toString()] || null;
        const locationData = locationMap[serial.currentLocation?.toString()] || null;
        const outletData = outletMap[serial.originalOutlet?.toString()] || null;
        const consumerData = consumerMap[serial.consumedBy?.toString()] || null;

        const serialDetail = {
          _id: serial._id,
          Serial: serialValue,
          PurchaseCenter: outletData
            ? {
                _id: outletData._id,
                name: outletData.centerName,
              }
            : "Unknown Outlet",
          Center: centerData
            ? {
                _id: centerData._id,
                name: centerData.centerName,
              }
            : null,
          Product: productData
            ? {
                _id: productData._id,
                name: productData.productTitle,
                code: productData.productCode,
                price: productData.productPrice,
              }
            : null,
          ProductCode: productData?.productCode || null,
          ProductPrice: productData?.productPrice || null,
          Status: serial.status,
          CurrentLocation: locationData
            ? {
                _id: locationData._id,
                name: locationData.centerName,
              }
            : centerData
            ? {
                _id: centerData._id,
                name: centerData.centerName,
              }
            : null,
          ActionDate: actionDate,
          PurchaseInfo: purchaseData
            ? {
                _id: purchaseData._id,
                invoiceNo: purchaseData.invoiceNo,
                purchaseDate: purchaseData.purchaseDate,
                vendor: purchaseData.vendor
                  ? {
                      _id: purchaseData.vendor._id,
                      name: purchaseData.vendor.name,
                    }
                  : null,
              }
            : null,
          ConsumptionDetails: consumptionDetails,
        };

        serialDetails.push(serialDetail);
      }
    }

    // Sort by ActionDate descending
    serialDetails.sort((a, b) => {
      if (!a.ActionDate) return 1;
      if (!b.ActionDate) return -1;
      return new Date(b.ActionDate) - new Date(a.ActionDate);
    });

    // ========== GET STATUS STATISTICS ==========
    const statsPipeline = [
      { $match: filter },
      { $unwind: "$serialNumbers" },
      // Apply same filters to stats
      ...(serialNumber ? [{ $match: { "serialNumbers.serialNumber": serialNumber } }] : []),
      ...(search ? [{ $match: { "serialNumbers.serialNumber": { $regex: search, $options: "i" } } }] : []),
      ...(status && status !== "all" && status !== "Own Product" ? 
        (status === "Not in Use" ? 
          [{ $match: { "serialNumbers.status": { $nin: ["consumed", "damaged"] } } }] : 
          [{ $match: { "serialNumbers.status": status } }]
        ) : []
      ),
      {
        $group: {
          _id: "$serialNumbers.status",
          count: { $sum: 1 },
        },
      },
    ];

    const statsResult = await CenterStock.aggregate(statsPipeline);
    const statusStats = {};
    statsResult.forEach((item) => {
      statusStats[item._id] = item.count;
    });

    const response = {
      success: true,
      message: "Product details by serial number retrieved successfully",
      data: serialDetails,
      pagination: {
        currentPage: currentPage,
        totalPages: totalPages,
        totalItems: total,
        itemsPerPage: itemsPerPage,
      },
      statistics: {
        totalSerials: total,
        statusBreakdown: statusStats,
      },
      appliedFilters: {
        product: productFilterValue || "all",
        center: center || "all",
        status: status || "all",
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching product details by serial number:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch product details by serial number",
      error: error.message,
    });
  }
};


async function getConsumptionDetails(serialNumber) {
  try {
    const stockUsage = await StockUsage.findOne({
      "items.serialNumbers": serialNumber,
      status: { $in: ["completed", "pending"] },
    })
      .populate([
        {
          path: "center",
          select: "_id centerName centerCode centerType",
        },
        {
          path: "customer",
          select: "_id name customerCode phone",
        },
        {
          path: "fromBuilding",
          select: "_id buildingName buildingCode",
        },
        {
          path: "toBuilding",
          select: "_id buildingName buildingCode",
        },
        {
          path: "fromControlRoom",
          select: "_id controlRoomName controlRoomCode",
        },
        {
          path: "createdBy",
          select: "_id fullName email",
        },
        {
          path: "approvedBy",
          select: "_id fullName email",
        },
        {
          path: "rejectedBy",
          select: "_id fullName email",
        },
        {
          path: "items.product",
          select: "_id productTitle productCode",
        },
      ])
      .lean();

    if (!stockUsage) {
      return null;
    }

    const consumedItem = stockUsage.items.find(
      (item) => item.serialNumbers && item.serialNumbers.includes(serialNumber)
    );

    if (!consumedItem) {
      return null;
    }

    return {
      usageType: stockUsage.usageType,
      usageDate: stockUsage.date,
      center: stockUsage.center
        ? {
            _id: stockUsage.center._id,
            name: stockUsage.center.centerName,
            code: stockUsage.center.centerCode,
            type: stockUsage.center.centerType,
          }
        : null,
      customer: stockUsage.customer
        ? {
            _id: stockUsage.customer._id,
            name: stockUsage.customer.name,
            code: stockUsage.customer.customerCode,
            phone: stockUsage.customer.phone,
          }
        : null,
      fromBuilding: stockUsage.fromBuilding
        ? {
            _id: stockUsage.fromBuilding._id,
            name: stockUsage.fromBuilding.buildingName,
            code: stockUsage.fromBuilding.buildingCode,
          }
        : null,
      toBuilding: stockUsage.toBuilding
        ? {
            _id: stockUsage.toBuilding._id,
            name: stockUsage.toBuilding.buildingName,
            code: stockUsage.toBuilding.buildingCode,
          }
        : null,
      fromControlRoom: stockUsage.fromControlRoom
        ? {
            _id: stockUsage.fromControlRoom._id,
            name: stockUsage.fromControlRoom.controlRoomName,
            code: stockUsage.fromControlRoom.controlRoomCode,
          }
        : null,
      connectionType: stockUsage.connectionType,
      reason: stockUsage.reason,
      remark: stockUsage.remark,
      packageAmount: stockUsage.packageAmount,
      packageDuration: stockUsage.packageDuration,
      onuCharges: stockUsage.onuCharges,
      installationCharges: stockUsage.installationCharges,
      shiftingAmount: stockUsage.shiftingAmount,
      wireChangeAmount: stockUsage.wireChangeAmount,
      status: stockUsage.status,
      createdBy: stockUsage.createdBy
        ? {
            _id: stockUsage.createdBy._id,
            name: stockUsage.createdBy.fullName,
            email: stockUsage.createdBy.email,
          }
        : null,
      approvedBy: stockUsage.approvedBy
        ? {
            _id: stockUsage.approvedBy._id,
            name: stockUsage.approvedBy.fullName,
            email: stockUsage.approvedBy.email,
          }
        : null,
      rejectedBy: stockUsage.rejectedBy
        ? {
            _id: stockUsage.rejectedBy._id,
            name: stockUsage.rejectedBy?.fullName,
            email: stockUsage.rejectedBy?.email,
          }
        : null,
      approvalRemark: stockUsage.approvalRemark,
      approvalDate: stockUsage.approvalDate,
      rejectionRemark: stockUsage.rejectionRemark,
      rejectionDate: stockUsage.rejectionDate,
      product: consumedItem.product
        ? {
            _id: consumedItem.product._id,
            name: consumedItem.product.productTitle,
            code: consumedItem.product.productCode,
          }
        : null,
      quantity: consumedItem.quantity,
      oldStock: consumedItem.oldStock,
      newStock: consumedItem.newStock,
      totalStock: consumedItem.totalStock,
      stockUsageId: stockUsage._id,
    };
  } catch (error) {
    console.error("Error fetching consumption details:", error);
    return null;
  }
}


export const getONUTrackReport = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      center,
      usageType,
      status,
      dateFilter,
      startDate,
      endDate,
      customer,
      search,
      product,
      reseller,
      resellerId,
      connectionType,
      month,
      year,
      page = 1,
      limit = 100,
      format = "json",
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const filter = {};

    // ========== DATE RANGE FILTERING WITH MONTH/YEAR SUPPORT ==========
    if (startDate || endDate || month || year) {
      let start, end;
      
      if (startDate && endDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      } else if (month) {
        const targetYear = year || new Date().getFullYear();
        const targetMonth = parseInt(month) - 1;
        start = new Date(targetYear, targetMonth, 1);
        end = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);
      }
      
      if (start && end) {
        filter.date = { $gte: start, $lte: end };
      }
    }

    if (status === "Own Product") {
      // Show data only for the logged-in user's center/outlet
      if (req.user && req.user.center) {
        const userCenterId = req.user.center._id || req.user.center;
        if (userCenterId) {
          filter.center = userCenterId;
        }
      }
    } else if (status === "Not in Use") {
      // Filter for serial numbers that are NOT consumed or damaged
      // This will be handled in the post-processing stage
    } else if (status && status !== "all") {
      // Handle specific status filters (consumed, damaged, etc.)
      // This will be handled in the post-processing stage
    }
    // If status is "all" or empty, show all data

    // 🔹 Center logic (only apply if not in "Own Product" mode)
    if (status !== "Own Product") {
      if (
        permissions.view_usage_own_center &&
        !permissions.view_usage_all_center &&
        userCenter
      ) {
        filter.center = userCenter._id || userCenter;
      } else if (center) {
        filter.center = center;
      }
    }

    // 🔹 Reseller filter (using resellerId or reseller)
    const resellerFilterValue = resellerId || reseller;
    if (resellerFilterValue && mongoose.Types.ObjectId.isValid(resellerFilterValue)) {
      const centers = await Center.find({ reseller: resellerFilterValue }).select('_id');
      const centerIds = centers.map(c => c._id);
      
      if (centerIds.length > 0) {
        if (filter.center) {
          filter.center = { $in: centerIds, $eq: filter.center };
        } else {
          filter.center = { $in: centerIds };
        }
      } else {
        filter.center = null;
      }
    }

    // 🔹 Product filter
    if (product && mongoose.Types.ObjectId.isValid(product)) {
      filter["items.product"] = product;
    }

    // 🔹 Connection Type filter
    if (connectionType) {
      filter.connectionType = connectionType;
    }

    if (usageType) filter.usageType = usageType;
    if (customer) filter.customer = customer;
    
    if (dateFilter || startDate || endDate) {
      filter.date = buildDateFilter(dateFilter, startDate, endDate);
    }

    if (search) {
      filter.$or = [
        { "center.centerName": { $regex: search, $options: "i" } },
        { "customer.name": { $regex: search, $options: "i" } },
        { "items.product.productTitle": { $regex: search, $options: "i" } },
        { "items.serialNumbers": { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const stockUsage = await StockUsage.find(filter)
      .populate({
        path: "center",
        select: "centerName centerCode reseller area centerType",
        populate: [
          { path: "reseller", select: "businessName" },
          { path: "area", select: "areaName" },
        ],
      })
      .populate("customer", "username name email mobile address1 address2 city")
      .populate("createdBy", "name email")
      .populate({
        path: "items.product",
        select: "productTitle productCode _id productPrice trackSerialNumber",
        transform: (doc) => {
          if (doc) {
            return {
              productId: doc._id,
              productTitle: doc.productTitle,
              productCode: doc.productCode,
              productPrice: doc.productPrice,
              trackSerialNumber: doc.trackSerialNumber,
            };
          }
          return doc;
        },
      })
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // ========== FIX: Safe handling of center-product pairs ==========
    const centerProductPairs = [];
    
    stockUsage.forEach((usage) => {
      // Skip if usage doesn't have items or center
      if (!usage.items || !usage.center) return;
      
      usage.items.forEach((item) => {
        // Skip if item doesn't have product or productId
        if (!item.product || !item.product.productId) return;
        
        // Get center ID safely
        const centerId = usage.center._id;
        if (!centerId) return;
        
        centerProductPairs.push({
          center: centerId.toString(),
          product: item.product.productId.toString(),
        });
      });
    });

    // ========== Fetch CenterStock data only if we have valid pairs ==========
    let centerStocks = [];
    let centerStockMap = {};

    if (centerProductPairs.length > 0) {
      // 🔹 Get unique pairs
      const uniquePairs = Array.from(
        new Set(centerProductPairs.map((p) => `${p.center}_${p.product}`))
      ).map((key) => {
        const [center, product] = key.split("_");
        return { center, product };
      });

      // 🔹 Fetch all relevant CenterStock documents
      centerStocks = await CenterStock.find({
        $or: uniquePairs.map((p) => ({
          center: p.center,
          product: p.product,
        })),
      })
        .select("center product serialNumbers.serialNumber serialNumbers.status serialNumbers.currentLocation serialNumbers.purchaseId serialNumbers.consumedDate")
        .lean();

      // 🔹 Build lookup map: { centerId_productId: { serialNumber: {status, currentLocation, purchaseId, consumedDate} } }
      centerStocks.forEach((cs) => {
        const key = `${cs.center.toString()}_${cs.product.toString()}`;
        centerStockMap[key] = {};
        cs.serialNumbers.forEach((sn) => {
          centerStockMap[key][sn.serialNumber] = {
            status: sn.status,
            currentLocation: sn.currentLocation,
            purchaseId: sn.purchaseId,
            consumedDate: sn.consumedDate,
          };
        });
      });
    }

    // ========== Merge updated serial statuses into response ==========
    const filteredStockUsage = stockUsage
      .map((usage) => {
        // Skip if no center or items
        if (!usage.center || !usage.items) {
          return null;
        }

        const updatedItems = usage.items
          .map((item) => {
            // Skip if no product or productId
            if (!item.product || !item.product.productId) {
              return null;
            }

            const key = `${usage.center._id.toString()}_${item.product.productId.toString()}`;
            const stockMap = centerStockMap[key] || {};

            const updatedSerials = (item.serialNumbers || [])
              .map((sn) => {
                const serialData = stockMap[sn];
                return {
                  serialNumber: sn,
                  status: serialData ? serialData.status : "unknown",
                  currentLocation: serialData ? serialData.currentLocation : null,
                  purchaseId: serialData ? serialData.purchaseId : null,
                  consumedDate: serialData ? serialData.consumedDate : null,
                };
              })
              .filter((serial) => {
                // Apply status filtering
                if (status === "all" || !status) {
                  return true; // Show all
                } else if (status === "consumed") {
                  return serial.status === "consumed";
                } else if (status === "damaged") {
                  return serial.status === "damaged";
                } else if (status === "Not in Use") {
                  return serial.status !== "consumed" && serial.status !== "damaged";
                } else if (status === "Own Product") {
                  return true; // Already filtered by center
                }
                return true;
              });

            // Return null if no serials after filtering
            if (updatedSerials.length === 0) {
              return null;
            }

            return {
              ...item,
              serialNumbers: updatedSerials,
            };
          })
          .filter((item) => item !== null);

        // Return null if no items after filtering
        if (updatedItems.length === 0) {
          return null;
        }

        return {
          ...usage,
          items: updatedItems,
        };
      })
      .filter((usage) => usage !== null);

    // ========== Pagination count (after filtering) ==========
    let total = 0;
    
    if (status && status !== "all" && status !== "Own Product") {
      // For status filters, count after applying the filters
      const allStockUsage = await StockUsage.find(filter)
        .populate({
          path: "center",
          select: "centerName centerCode reseller area centerType",
          populate: [
            { path: "reseller", select: "businessName" },
            { path: "area", select: "areaName" },
          ],
        })
        .populate({
          path: "items.product",
          select: "productTitle productCode _id productPrice trackSerialNumber",
        })
        .lean();

      // Count after filtering
      const filteredCount = allStockUsage.filter(usage => {
        if (!usage.center || !usage.items) return false;
        
        return usage.items.some(item => {
          if (!item.product || !item.product._id) return false;
          
          const key = `${usage.center._id.toString()}_${item.product._id.toString()}`;
          const stockMap = centerStockMap[key] || {};
          
          return (item.serialNumbers || []).some(sn => {
            const serialData = stockMap[sn];
            const serialStatus = serialData ? serialData.status : "unknown";
            
            if (status === "consumed") return serialStatus === "consumed";
            if (status === "damaged") return serialStatus === "damaged";
            if (status === "Not in Use") return serialStatus !== "consumed" && serialStatus !== "damaged";
            return true;
          });
        });
      }).length;
      
      total = filteredCount;
    } else {
      // For "all" or "Own Product" status, use the original count
      total = await StockUsage.countDocuments(filter);
    }

    const totalPages = Math.ceil(total / limitNum);

    // ========== EXCEL EXPORT ==========
    if (format === "excel") {
      try {
        console.log(`[EXPORT] Generating Excel file with ONU track data`);

        // Prepare Excel data with requested columns
        const excelData = [];
        
        for (const usage of filteredStockUsage) {
          if (!usage.items) continue;
          
          for (const item of usage.items) {
            if (!item.serialNumbers) continue;
            
            for (const serial of item.serialNumbers) {
              const activationDate = serial.consumedDate || usage.date;
              
              excelData.push({
                'Activation Date': activationDate ? moment(activationDate).format('DD-MM-YYYY') : 'N/A',
                'Customer': usage.customer?.name || usage.customer?.username || 'N/A',
                'Serial Number': serial.serialNumber,
                'Connection Type': usage.connectionType || 'N/A',
                'Reseller Name': usage.center?.reseller?.businessName || 'N/A',
                'Area': usage.center?.area?.areaName || 'N/A',
                'Center': usage.center?.centerName || 'N/A',
                'ONU Amount': usage.onuCharges || 0,
              });
            }
          }
        }

        // Create workbook
        const workbook = XLSX.utils.book_new();

        // Main data sheet
        const mainSheet = XLSX.utils.json_to_sheet(excelData);
        
        // Set column widths
        mainSheet['!cols'] = [
          { wch: 15 }, // Activation Date
          { wch: 25 }, // Customer
          { wch: 20 }, // Serial Number
          { wch: 15 }, // Connection Type
          { wch: 25 }, // Reseller Name
          { wch: 20 }, // Area
          { wch: 25 }, // Center
          { wch: 12 }, // ONU Amount
        ];

        XLSX.utils.book_append_sheet(workbook, mainSheet, 'ONU Track Report');

        // Generate Excel file
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=onu_track_report_${moment().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`);
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

    // ========== RESPONSE ==========
    res.json({
      success: true,
      data: filteredStockUsage,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: total,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      filters: {
        status: status || 'all',
        product: product || '',
        reseller: reseller || resellerId || '',
        search: search || '',
        usageType: usageType || '',
        customer: customer || '',
        connectionType: connectionType || '',
        startDate: startDate || '',
        endDate: endDate || '',
        month: month || '',
        year: year || '',
      }
    });

  } catch (error) {
    console.error("Get All Stock Usage Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch stock usage data",
      error: error.message,
    });
  }
};

export const getReplacementRecords = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(req, [
      "view_own_report",
      "view_all_report",
    ]);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      startDate,
      endDate,
      usageType,
      product,
      center,
      connectionType,
      reason,
      page = 1,
      limit = 100,
      sortBy = "date",
      sortOrder = "desc"
    } = req.query;

    console.log('Received query params:', {
      center, product, startDate, endDate, usageType, connectionType
    });

    const filter = {};

    if (permissions.view_own_report && !permissions.view_all_report) {
      const userCenterId = userCenter?._id || userCenter;
      if (userCenterId) {
        filter.center = userCenterId;
      }
    } else if (permissions.view_all_report && center) {
      filter.center = mongoose.Types.ObjectId.isValid(center) 
        ? new mongoose.Types.ObjectId(center)
        : center;
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

    if (product) {
      filter.product = mongoose.Types.ObjectId.isValid(product) 
        ? new mongoose.Types.ObjectId(product)
        : product;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    const validSortFields = [
      "date",
      "usageType",
      "connectionType",
      "createdAt",
      "customerName",
      "buildingName"
    ];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "date";
    sort[actualSortBy] = sortOrder === "desc" ? -1 : 1;

    console.log('Final filter:', JSON.stringify(filter, null, 2));

    const replacementRecords = await ReplacementRecord.find(filter)
      .populate("product", "productTitle productCode productCategory")
      .populate("center", "centerName centerCode centerType address phone")
      .populate("replacedBy", "name email fullName username")
      .populate("originalUsageId", "usageType remark date customer connectionType")
      .populate("entityId")
      .sort(sort)
      .skip(skip)
      .limit(limitNum);

    const total = await ReplacementRecord.countDocuments(filter);
    const totalPages = Math.ceil(total / limitNum);
    const statsPipeline = [
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          totalQty: { $sum: "$qty" },
          totalDamageQty: { $sum: "$damageQty" },
          totalPackageAmount: { $sum: "$packageAmount" },
          totalOnuCharges: { $sum: "$onuCharges" },
          totalInstallationCharges: { $sum: "$installationCharges" },
        }
      }
    ];

    const statsResult = await ReplacementRecord.aggregate(statsPipeline);
    const stats = statsResult.length > 0 ? statsResult[0] : {
      totalRecords: 0,
      totalQty: 0,
      totalDamageQty: 0,
      totalPackageAmount: 0,
      totalOnuCharges: 0,
      totalInstallationCharges: 0,
    };

    const usageTypeStats = await ReplacementRecord.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$usageType",
          count: { $sum: 1 },
          totalQty: { $sum: "$qty" }
        }
      }
    ]);

    const usageTypeBreakdown = {};
    usageTypeStats.forEach(stat => {
      usageTypeBreakdown[stat._id] = {
        count: stat.count,
        totalQty: stat.totalQty
      };
    });

    const connectionTypeStats = await ReplacementRecord.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$connectionType",
          count: { $sum: 1 }
        }
      }
    ]);

    const connectionTypeBreakdown = {};
    connectionTypeStats.forEach(stat => {
      connectionTypeBreakdown[stat._id] = stat.count;
    });

    const formattedRecords = replacementRecords.map(record => ({
      _id: record._id,
      date: record.date,
      usageType: record.usageType,
      connectionType: record.connectionType,
      reason: record.reason,
      connectionDescription: getConnectionDescription(record.connectionType, record.reason),
      packageAmount: record.packageAmount,
      packageDuration: record.packageDuration,
      onuCharges: record.onuCharges,
      installationCharges: record.installationCharges,
      product: record.product,
      replaceFor: record.replaceFor,
      replaceProductName: record.replaceProductName,
      qty: record.qty,
      damageQty: record.damageQty,
      buildingName: record.buildingName,
      customerName: record.customerName,
      mobile: record.mobile,
      statusReason: record.statusReason,
      oldSerialNumber: record.oldSerialNumber,
      newSerialNumber: record.newSerialNumber,
      center: record.center,
      replacedBy: record.replacedBy,
      originalUsage: record.originalUsageId,
      createdAt: record.createdAt
    }));

    res.json({
      success: true,
      data: formattedRecords,
      summary: {
        totalRecords: stats.totalRecords,
        totalQty: stats.totalQty,
        totalDamageQty: stats.totalDamageQty,
        totalPackageAmount: stats.totalPackageAmount,
        totalOnuCharges: stats.totalOnuCharges,
        totalInstallationCharges: stats.totalInstallationCharges,
        usageTypeBreakdown: usageTypeBreakdown,
        connectionTypeBreakdown: connectionTypeBreakdown
      },
      filters: {
        center: center || "all",
        product: product || "all",
        startDate: startDate || "none",
        endDate: endDate || "none",
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: total,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Get replacement records error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch replacement records",
    });
  }
};


const getConnectionDescription = (connectionType, reason) => {
  const descriptions = {
    "NC": "New Connection",
    "Convert": "Conversion", 
    "Shifting": "Shifting",
    "Repair": "Repair"
  };
  return descriptions[connectionType] || descriptions[reason] || "Other";
};



export const getAllFilledStock = async (req, res) => {
  try {
    const { hasAccess, permissions, userCenter } = checkReportPermissions(
      req,
      [ "view_own_report",
        "view_all_report",
      ]
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message:
          "Access denied. view_own_report or view_all_report permission required.",
      });
    }

    const {
      center,
      customer,
      product,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 100,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};
    if (permissions.view_all_report) {
      if (center) {
        query.center = center;
      }
    } else if (permissions.view_own_report) {
      if (userCenter) {
        query.center = userCenter._id || userCenter;
      } else {
        return res.status(400).json({
          success: false,
          message: "User must be associated with a center",
        });
      }
    
      if (center && center !== (userCenter._id || userCenter).toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only view your center data.",
        });
      }
    }

    if (customer) query.customer = customer;
    if (product) query.product = product;
    if (status) query.status = status;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const total = await FilledStock.countDocuments(query);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === "desc" ? -1 : 1;

    const filledStocks = await FilledStock.find(query)
      .populate("customer", "name username mobile email")
      .populate("product", "productTitle productCode category")
      .populate("center", "centerName centerCode address")
      .populate("shiftingRequestId", "date fromCenter toCenter status")
      .populate("originalUsageId", "date usageType remark")
      .sort(sortConfig)
      .skip(skip)
      .limit(parseInt(limit));
    
    const formattedData = filledStocks.map(stock => ({
      _id: stock._id,
      "CustomerName": stock.customer?.name || "",
      "CustomerUsername": stock.customer?.username || "",
      "CustomerMobile": stock.customer?.mobile || "",
      "ProductName": stock.product?.productTitle || "",
      "ProductCode": stock.product?.productCode || "",
      "CenterName": stock.center?.centerName || "",
      "CenterCode": stock.center?.centerCode || "",
      "Quantity": stock.quantity,
      "SerialNumbers": stock.serialNumbers.map(sn => ({
        serialNumber: sn.serialNumber,
        status: sn.status,
        assignedDate: sn.assignedDate
      })),
      "ShiftingDate": stock.shiftingRequestId?.date || stock.createdAt,
      "OriginalUsageType": stock.originalUsageId?.usageType || "N/A",
      "Status": stock.status,
      "LastUpdated": stock.lastUpdated,
      "CreatedAt": stock.createdAt
    }));

    res.status(200).json({
      success: true,
      data: formattedData,
      pagination: {
        total,
        currentPage: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
      accessInfo: {
        canViewAll: permissions.view_all_report,
        userCenter: userCenter ? {
          id: userCenter._id || userCenter,
          name: req.user.center?.centerName || "User Center"
        } : null
      }
    });
  } catch (error) {
    console.error("Error fetching filled stock:", error);
    handleControllerError(error, res);
  }
};