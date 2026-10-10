import mongoose from "mongoose";
import TestingMaterial from "../models/TestingMaterial.js";
import TestingStock from "../models/TestingStock.js";
import OutletStock from "../models/OutletStock.js";
import Center from "../models/Center.js";
import Product from "../models/Product.js";
import { ApiError } from "../utils/ApiError.js";
import { isSuperAdmin } from "../utils/checkPermissions.js";
import { normalizePermissions } from "../middlewares/authorizationMiddleware.js";

const MODULE_NAME = "Testing Material";

const CENTER_FIELDS = "_id centerName centerCode centerType";
const USER_FIELDS = "_id fullName email";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** ApiError that can carry extra response fields (kept from legacy responses). */
export class TestingMaterialServiceError extends ApiError {
  constructor(statusCode, message, extras) {
    super(statusCode, message);
    if (extras) this.extras = extras;
  }
}

const httpError = (status, message, extras) =>
  new TestingMaterialServiceError(status, message, extras);

/** Center-scoping context for the logged-in user (permission names come from DB role). */
const getAccessContext = async (user) => {
  const userCenterId = user.fullUser?.center || null;

  if (isSuperAdmin(user)) {
    return { manageAllCenters: true, userCenterId };
  }

  const groups = await normalizePermissions(user.role?.permissions || []);
  const group = groups.find(
    (item) => item.module?.toLowerCase() === MODULE_NAME.toLowerCase()
  );

  return {
    manageAllCenters: !!group?.permissions?.includes("manage_testing_all_centers"),
    userCenterId,
  };
};

const getUserCenter = async (user) => {
  const centerId = user.fullUser?.center;
  return centerId ? Center.findById(centerId) : null;
};

/** Center to query for under-testing endpoints: query centerId or the user's own Center. */
const resolveQueryCenterId = async (user, centerId) => {
  if (centerId) return centerId;

  const userCenter = await getUserCenter(user);
  if (userCenter && userCenter.centerType === "Center") return userCenter._id;

  throw httpError(400, "Center ID is required or user must be from a Center");
};

const generateRequestNumber = async () => {
  const count = await TestingMaterial.countDocuments();
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const sequence = (count + 1).toString().padStart(4, "0");
  return `TM${year}${month}${day}${sequence}`;
};

const populateRequest = (query, { trackSerial = false, testResults = false } = {}) => {
  query
    .populate("fromCenter", CENTER_FIELDS)
    .populate("toCenter", CENTER_FIELDS)
    .populate(
      "products.product",
      trackSerial
        ? "_id productTitle productCode trackSerialNumber"
        : "_id productTitle productCode"
    )
    .populate("requestedBy", USER_FIELDS)
    .populate("acceptedBy", USER_FIELDS)
    .populate("completedBy", USER_FIELDS);

  if (testResults) {
    query
      .populate("testResults.product", "_id productTitle productCode")
      .populate("testResults.testedBy", USER_FIELDS);
  }

  return query;
};

/* ------------------------------------------------------------------ */
/* 1. Create request                                                   */
/* ------------------------------------------------------------------ */

const validateRequestedProducts = async (products, fromCenterId) => {
  const validatedProducts = [];
  const outletStocks = new Map();
  const requestedSerials = new Set();

  for (const item of products) {
    if (!item.product || !item.quantity) {
      throw httpError(400, "Each product must have product ID and quantity");
    }
    if (item.quantity <= 0) {
      throw httpError(400, "Product quantity must be greater than 0");
    }

    const productDoc = await Product.findById(item.product);
    if (!productDoc) {
      throw httpError(404, `Product ${item.product} not found`);
    }

    const key = item.product.toString();
    if (!outletStocks.has(key)) {
      outletStocks.set(
        key,
        await OutletStock.findOne({ outlet: fromCenterId, product: item.product })
      );
    }
    const outletStock = outletStocks.get(key);

    if (!outletStock) {
      throw httpError(
        400,
        `No stock available for product ${productDoc.productTitle} in your outlet`,
        { productId: item.product, productName: productDoc.productTitle }
      );
    }

    if (productDoc.trackSerialNumber === "Yes") {
      if (!item.serialNumbers || !Array.isArray(item.serialNumbers)) {
        throw httpError(
          400,
          `Serial numbers are required for product ${productDoc.productTitle} as it tracks serial numbers`
        );
      }

      if (item.serialNumbers.length !== item.quantity) {
        throw httpError(
          400,
          `Number of serial numbers (${item.serialNumbers.length}) must match quantity (${item.quantity}) for product ${productDoc.productTitle}`
        );
      }

      const duplicateSerials = item.serialNumbers.filter((serialNumber) => {
        const serialKey = `${key}:${serialNumber}`;
        if (requestedSerials.has(serialKey)) return true;
        requestedSerials.add(serialKey);
        return false;
      });

      if (duplicateSerials.length > 0) {
        throw httpError(
          400,
          `Duplicate serial numbers provided for product ${productDoc.productTitle}: ${[...new Set(duplicateSerials)].join(", ")}`,
          { duplicateSerials: [...new Set(duplicateSerials)] }
        );
      }

      const availableSerials = [];
      const unavailableSerials = [];

      for (const serialNumber of item.serialNumbers) {
        const serial = outletStock.serialNumbers.find(
          (sn) =>
            sn.serialNumber === serialNumber &&
            sn.status === "available" &&
            sn.currentLocation?.toString() === fromCenterId.toString()
        );
        (serial ? availableSerials : unavailableSerials).push(serialNumber);
      }

      if (unavailableSerials.length > 0) {
        throw httpError(
          400,
          `Some serial numbers are not available in your outlet stock for product ${productDoc.productTitle}: ${unavailableSerials.join(", ")}`,
          { unavailableSerials, availableSerials }
        );
      }

      validatedProducts.push({
        product: item.product,
        quantity: item.quantity,
        serialNumbers: item.serialNumbers.map((serialNumber) => ({
          serialNumber,
          status: "pending_testing",
        })),
        remark: item.remark || "",
      });
    } else {
      if (item.serialNumbers && item.serialNumbers.length > 0) {
        throw httpError(
          400,
          `Serial numbers should not be provided for product ${productDoc.productTitle} as it does not track serial numbers`
        );
      }

      if (outletStock.availableQuantity < item.quantity) {
        throw httpError(
          400,
          `Insufficient stock available for product ${productDoc.productTitle}. Available: ${outletStock.availableQuantity}, Requested: ${item.quantity}`,
          {
            availableQuantity: outletStock.availableQuantity,
            requestedQuantity: item.quantity,
          }
        );
      }

      validatedProducts.push({
        product: item.product,
        quantity: item.quantity,
        serialNumbers: [],
        remark: item.remark || "",
      });
    }
  }

  return { validatedProducts, outletStocks };
};

/** Marks outlet stock pending_testing WITHOUT decreasing availableQuantity (legacy behavior). */
const markOutletStockPendingTesting = async (
  validatedProducts,
  outletStocks,
  fromCenterId,
  toCenter
) => {
  for (const item of validatedProducts) {
    const outletStock = outletStocks.get(item.product.toString());

    if (item.serialNumbers.length > 0) {
      for (const serialItem of item.serialNumbers) {
        const serial = outletStock.serialNumbers.find(
          (sn) => sn.serialNumber === serialItem.serialNumber
        );

        if (serial) {
          serial.status = "pending_testing";
          serial.transferHistory.push({
            fromCenter: fromCenterId,
            toCenter,
            transferDate: new Date(),
            transferType: "outlet_to_testing",
            status: "pending_testing",
          });
        }
      }
    } else {
      outletStock.pendingTestingQty = (outletStock.pendingTestingQty || 0) + item.quantity;
    }

    await outletStock.save();
  }
};

export const createRequest = async (user, { toCenter, products, remark }) => {
  const userCenter = await getUserCenter(user);
  if (!userCenter) {
    throw httpError(400, "User center information not found");
  }

  const fromCenterId = userCenter._id;

  if (userCenter.centerType !== "Outlet") {
    throw httpError(
      400,
      "User must be from an Outlet center to create testing material request"
    );
  }

  const toCenterDoc = await Center.findById(toCenter);
  if (!toCenterDoc) {
    throw httpError(404, "Destination center not found");
  }

  if (!products || !Array.isArray(products) || products.length === 0) {
    throw httpError(400, "Products array is required and cannot be empty");
  }

  const { validatedProducts, outletStocks } = await validateRequestedProducts(
    products,
    fromCenterId
  );

  try {
    const testingMaterial = await new TestingMaterial({
      requestNumber: await generateRequestNumber(),
      fromCenter: fromCenterId,
      toCenter,
      products: validatedProducts,
      status: "pending_testing",
      requestedBy: user.id,
      remark: remark || "",
    }).save();

    await markOutletStockPendingTesting(
      validatedProducts,
      outletStocks,
      fromCenterId,
      toCenter
    );

    return populateRequest(TestingMaterial.findById(testingMaterial._id), {
      trackSerial: true,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      throw httpError(400, "Validation error", {
        errors: Object.values(error.errors).map((err) => err.message),
        details: error.errors,
      });
    }

    if (error.code === 11000 && error.keyValue?.requestNumber) {
      throw httpError(400, "Duplicate request number generated. Please try again.", {
        duplicateRequestNumber: error.keyValue.requestNumber,
      });
    }

    throw error;
  }
};

/* ------------------------------------------------------------------ */
/* 2. Accept request                                                   */
/* ------------------------------------------------------------------ */

/**
 * Validates every product and mutates outlet stock in memory only.
 * Nothing is persisted until all products pass validation.
 */
export const acceptRequest = async (user, id, { remark } = {}) => {
  const testingMaterial = await TestingMaterial.findById(id)
    .populate("fromCenter", CENTER_FIELDS)
    .populate("toCenter", CENTER_FIELDS);

  if (!testingMaterial) {
    throw httpError(404, "Testing material request not found");
  }

  const userCenter = await getUserCenter(user);

  if (!userCenter) {
    throw httpError(400, "User center information not found");
  }

  if (
    userCenter._id.toString() !==
    testingMaterial.toCenter._id.toString()
  ) {
    throw httpError(
      403,
      "You can only accept testing material requests sent to your center"
    );
  }

  if (testingMaterial.status !== "pending_testing") {
    throw httpError(
      400,
      `Testing material request is already ${testingMaterial.status}`
    );
  }

  // Prepare and validate all stock changes before persisting them.
  const prepareAcceptance = async (request) => {
    const outletStocks = new Map();
    const plan = [];

    for (const productItem of request.products) {
      const productDoc = await Product.findById(productItem.product);

      if (!productDoc) {
        throw httpError(
          404,
          `Product ${productItem.product} not found`
        );
      }

      const key = productItem.product.toString();

      if (!outletStocks.has(key)) {
        outletStocks.set(
          key,
          await OutletStock.findOne({
            outlet: request.fromCenter._id,
            product: productItem.product,
          })
        );
      }

      const outletStock = outletStocks.get(key);

      if (!outletStock) {
        throw httpError(
          400,
          `Outlet stock not found for product ${productDoc.productTitle}`
        );
      }

      const serialsForTestingStock = [];
      const serialNumbers = productItem.serialNumbers || [];

      if (serialNumbers.length > 0) {
        for (const serialItem of serialNumbers) {
          const serial = outletStock.serialNumbers.find(
            (sn) => sn.serialNumber === serialItem.serialNumber
          );

          if (!serial) {
            throw httpError(
              400,
              `Serial number ${serialItem.serialNumber} not found in outlet stock`
            );
          }

          if (serial.status !== "pending_testing") {
            throw httpError(
              400,
              `Serial number ${serialItem.serialNumber} is not in pending_testing status. Current status: ${serial.status}`
            );
          }

          serial.status = "under_testing";
          serial.currentLocation = request.toCenter._id;

          serial.transferHistory.push({
            fromCenter: request.fromCenter._id,
            toCenter: request.toCenter._id,
            transferDate: new Date(),
            transferType: "outlet_to_testing",
            status: "under_testing",
          });

          serialsForTestingStock.push({
            serialNumber: serialItem.serialNumber,
            status: "under_testing",
          });
        }

        if (serialNumbers.length !== productItem.quantity) {
          throw httpError(
            400,
            `Serial number count does not match quantity for product ${productDoc.productTitle}`
          );
        }

        outletStock.availableQuantity -= productItem.quantity;
      } else {
        if (outletStock.pendingTestingQty < productItem.quantity) {
          throw httpError(
            400,
            `Invalid pending testing quantity for product ${productDoc.productTitle}. Available: ${outletStock.pendingTestingQty}, Requested: ${productItem.quantity}`
          );
        }

        outletStock.pendingTestingQty -= productItem.quantity;
        outletStock.availableQuantity -= productItem.quantity;
      }

      plan.push({
        productItem,
        outletStock,
        serialsForTestingStock,
      });
    }

    return plan;
  };

  try {
    const plan = await prepareAcceptance(testingMaterial);

    for (const {
      productItem,
      outletStock,
      serialsForTestingStock,
    } of plan) {
      await outletStock.save();

      await TestingStock.updateTestingStock(
        testingMaterial.toCenter._id,
        productItem.product,
        productItem.quantity,
        serialsForTestingStock,
        testingMaterial.fromCenter._id,
        testingMaterial._id,
        "testing_inbound"
      );
    }

    testingMaterial.status = "under_testing";
    testingMaterial.acceptedBy = user.id;
    testingMaterial.acceptedAt = new Date();

    if (remark) {
      testingMaterial.remark = remark;
    }

    testingMaterial.products.forEach((product) => {
      product.serialNumbers?.forEach((serial) => {
        serial.status = "under_testing";
      });
    });

    await testingMaterial.save();

    return populateRequest(
      TestingMaterial.findById(testingMaterial._id)
    );
  } catch (error) {
    if (error.message?.includes("already exists in TestingStock")) {
      throw httpError(
        400,
        "Duplicate serial numbers detected. Some products are already in testing.",
        { error: error.message }
      );
    }

    if (error.name === "ValidationError") {
      throw httpError(400, "Validation error", {
        error: error.message,
        details: error.errors,
      });
    }

    throw error;
  }
};
/* ------------------------------------------------------------------ */
/* 3. List requests                                                    */
/* ------------------------------------------------------------------ */

const parseStatusFilter = (status) => {
  const list = Array.isArray(status) ? status : String(status).split(",");
  return list.map((s) => String(s).trim()).filter((s) => s.length > 0);
};

export const getAllRequests = async (user, query) => {
  const {
    page,
    limit,
    sortBy = "createdAt",
    sortOrder = "desc",
    status,
    fromCenter,
    toCenter,
    startDate,
    endDate,
  } = query;

  const { manageAllCenters, userCenterId } = await getAccessContext(user);
  const filter = {};

  if (status) {
    const statuses = parseStatusFilter(status);
    if (statuses.length > 0) filter.status = { $in: statuses };
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  if (manageAllCenters) {
    if (fromCenter) filter.fromCenter = fromCenter;
    if (toCenter) filter.toCenter = toCenter;
  } else if (userCenterId) {
    filter.$or = [{ fromCenter: userCenterId }, { toCenter: userCenterId }];
  }

  const pageNumber = Number.parseInt(page, 10) || 1;
  const limitNumber = Number.parseInt(limit, 10) || 100;

  const [data, total, statusCounts] = await Promise.all([
    populateRequest(TestingMaterial.find(filter))
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .limit(limitNumber)
      .skip((pageNumber - 1) * limitNumber)
      .lean(),
    TestingMaterial.countDocuments(filter),
    TestingMaterial.aggregate([
      { $match: filter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const statusStats = statusCounts.reduce((acc, stat) => {
    acc[stat._id] = stat.count;
    return acc;
  }, {});

  return {
    data,
    pagination: {
      currentPage: pageNumber,
      totalPages: Math.ceil(total / limitNumber),
      totalItems: total,
      itemsPerPage: limitNumber,
    },
    filters: { status: statusStats, total },
  };
};

/* ------------------------------------------------------------------ */
/* 4. Get by ID                                                        */
/* ------------------------------------------------------------------ */

export const getRequestById = async (user, id) => {
  const testingMaterial = await populateRequest(TestingMaterial.findById(id), {
    trackSerial: true,
    testResults: true,
  });

  if (!testingMaterial) {
    throw httpError(404, "Testing material request not found");
  }

  const { manageAllCenters, userCenterId } = await getAccessContext(user);

  if (!manageAllCenters && userCenterId) {
    const centerId = userCenterId.toString();
    if (
      testingMaterial.fromCenter._id.toString() !== centerId &&
      testingMaterial.toCenter._id.toString() !== centerId
    ) {
      throw httpError(403, "Access denied. You can only view requests from/to your center.");
    }
  }

  return testingMaterial;
};

/* ------------------------------------------------------------------ */
/* 5. Under-testing products                                           */
/* ------------------------------------------------------------------ */

const countByStatus = (serialNumbers = []) =>
  serialNumbers.reduce((acc, serial) => {
    acc[serial.status] = (acc[serial.status] || 0) + 1;
    return acc;
  }, {});

const collectSerialReferences = (testingStocks) => {
  const outletIds = new Set();
  const requestIds = new Set();

  for (const stock of testingStocks) {
    for (const serial of stock.serialNumbers || []) {
      if (serial.originalOutlet) outletIds.add(serial.originalOutlet.toString());
      if (serial.testingRequestId) requestIds.add(serial.testingRequestId.toString());
    }
  }

  return { outletIds: [...outletIds], requestIds: [...requestIds] };
};

const indexById = (docs) =>
  docs.reduce((acc, doc) => {
    acc[doc._id.toString()] = doc;
    return acc;
  }, {});

export const getAllUnderTestingProducts = async (user, { centerId }) => {
  const queryCenterId = await resolveQueryCenterId(user, centerId);

  const testingStocks = await TestingStock.find({
    center: queryCenterId,
    underTestingQuantity: { $gt: 0 },
  })
    .populate("center", "_id centerName centerCode")
    .populate("product", "_id productTitle productCode trackSerialNumber category brand")
    .lean();

  const { outletIds, requestIds } = collectSerialReferences(testingStocks);

  const [outletDocs, requestDocs] = await Promise.all([
    outletIds.length
      ? Center.find({ _id: { $in: outletIds } })
          .select("_id centerName centerCode")
          .lean()
      : [],
    requestIds.length
      ? TestingMaterial.find({ _id: { $in: requestIds } })
          .select("_id requestNumber status requestedAt")
          .populate("requestedBy", USER_FIELDS)
          .lean()
      : [],
  ]);

  const outlets = indexById(outletDocs);
  const testingRequests = indexById(requestDocs);

  const products = testingStocks.map((stock) => {
    const serialsUnderTesting = stock.serialNumbers.filter(
      (serial) => serial.status === "under_testing"
    );

    const serialsData =
      stock.product?.trackSerialNumber === "Yes"
        ? serialsUnderTesting.map((serial) => ({
            serialNumber: serial.serialNumber,
            status: serial.status,
            testResult: serial.testResult,
            testRemark: serial.testRemark,
            testedAt: serial.testedAt,
            originalOutlet:
              outlets[serial.originalOutlet?.toString()] || serial.originalOutlet,
            testingRequest: testingRequests[serial.testingRequestId?.toString()] || null,
            currentLocation: serial.currentLocation,
            addedToTesting:
              serial.transferHistory?.[0]?.transferDate || serial._id.getTimestamp(),
          }))
        : [];

    const stockOutletIds = [
      ...new Set(
        stock.serialNumbers
          .filter((serial) => serial.originalOutlet)
          .map((serial) => serial.originalOutlet.toString())
      ),
    ];

    return {
      _id: stock._id,
      center: stock.center,
      product: stock.product,
      quantities: {
        total: stock.totalQuantity,
        available: stock.availableQuantity,
        underTesting: stock.underTestingQuantity,
        tested: stock.testedQuantity,
        passed: stock.passedQuantity,
        failed: stock.failedQuantity,
      },
      serialized: stock.product?.trackSerialNumber === "Yes",
      serialNumbers: {
        total: stock.serialNumbers.length,
        underTesting: serialsUnderTesting.length,
        byStatus: countByStatus(stock.serialNumbers),
        data: serialsData,
      },
      outlets: stockOutletIds.map((id) => outlets[id]).filter(Boolean),
      lastUpdated: stock.lastUpdated,
      createdAt: stock.createdAt,
    };
  });

  const productSummary = products.reduce((acc, item) => {
    const productId = item.product._id.toString();
    if (!acc[productId]) {
      acc[productId] = { product: item.product, totalUnderTesting: 0, testingStocks: [] };
    }
    acc[productId].totalUnderTesting += item.quantities.underTesting;
    acc[productId].testingStocks.push({
      testingStockId: item._id,
      quantity: item.quantities.underTesting,
      center: item.center,
    });
    return acc;
  }, {});

  return {
    products,
    summary: Object.values(productSummary),
    totalProducts: products.length,
    totalUnderTestingItems: products.reduce((sum, p) => sum + p.quantities.underTesting, 0),
    centerId: queryCenterId,
  };
};

/* ------------------------------------------------------------------ */
/* 6. Under-testing serials by product                                 */
/* ------------------------------------------------------------------ */

export const getUnderTestingSerialsByProduct = async (
  user,
  productId,
  { centerId, status = "under_testing", search }
) => {
  const queryCenterId = await resolveQueryCenterId(user, centerId);

  const product = await Product.findById(productId);
  if (!product) {
    throw httpError(404, "Product not found");
  }

  const testingStock = await TestingStock.findOne({
    center: queryCenterId,
    product: productId,
  })
    .populate("center", "_id centerName ")
    .populate("product", "_id productTitle productCode trackSerialNumber")
    .populate({
      path: "serialNumbers.testingRequestId",
      select: "requestNumber status requestedBy requestedAt fromCenter",
      populate: { path: "requestedBy", select: "fullName email" },
    })
    .populate({
      path: "serialNumbers.currentLocation",
      select: "centerName centerCode",
    })
    .lean();

  if (!testingStock) {
    return {
      found: false,
      data: {
        centerId: queryCenterId,
        productId,
        underTestingSerials: [],
        summary: { totalSerials: 0, underTesting: 0, tested: 0, failed: 0 },
      },
    };
  }

  let filteredSerials = testingStock.serialNumbers.filter(
    (serial) => serial.status === status
  );

  if (search) {
    const term = search.toLowerCase();
    filteredSerials = filteredSerials.filter(
      (serial) =>
        serial.serialNumber.toLowerCase().includes(term) ||
        serial.testingRequestId?.requestNumber?.toLowerCase().includes(term)
    );
  }

  const serialDate = (serial) =>
    new Date(serial.transferHistory[0]?.transferDate || serial._id.getTimestamp());
  filteredSerials.sort((a, b) => serialDate(b) - serialDate(a));

  return {
    found: true,
    data: {
      testingStockId: testingStock._id,
      center: testingStock.center,
      product: testingStock.product,
      quantities: {
        total: testingStock.totalQuantity,
        underTesting: testingStock.underTestingQuantity,
        passed: testingStock.passedQuantity,
        failed: testingStock.failedQuantity,
      },
      availableSerials: filteredSerials.map((serial) => ({
        serialNumber: serial.serialNumber,
        status: serial.status,
        testResult: serial.testResult,
        currentLocation: serial.currentLocation,
      })),
      filters: { status, centerId: queryCenterId, searchApplied: !!search },
    },
  };
};