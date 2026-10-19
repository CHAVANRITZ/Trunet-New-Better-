    import express from "express";
    import cors from "cors";
    import helmet from "helmet";
    import rateLimit from "express-rate-limit";
    import repairCostRoutes from "./routes/repairCostRoutes.js";
    import authRoutes from "./routes/authRoutes.js";
    import healthRoutes from "./routes/healthRoutes.js";
    import productCategoryRoutes from "./routes/productCategoryRoutes.js";
    import productRoutes from "./routes/productRoutes.js";
    import resellerRoutes from "./routes/resellerRoutes.js";
    import centerRoutes from "./routes/centerRoutes.js";
    import areaRoutes from "./routes/areaRoutes.js";
    import customerRoutes from "./routes/customerRoutes.js";
    import buildingRoutes from "./routes/buildingRoutes.js";
    import controlRoomRoutes from "./routes/controlRoomRoutes.js";
    import roleRoutes from "./routes/roleRoutes.js";
    import vendorRoutes from "./routes/vendorRoutes.js";
    import warehouseRoutes from "./routes/warehouseRoutes.js";
    import stockTransferRoutes from "./routes/stockTransferRoutes.js";
    import stockPurchaseRoutes from "./routes/stockPurchaseRoutes.js";
    import stockRequestRoutes from "./routes/stockRequestRoutes.js";
    import raisePORoutes from "./routes/raisePORoutes.js";
    import testingMaterialRoutes from "./routes/testingMaterialRoutes.js";
    import stockUsageRoutes from "./routes/stockUsageRoutes.js";
    import shiftingRequestRoutes from "./routes/shiftingRequestRoutes.js";
    import usageSummaryRoutes from "./routes/usageSummaryRoutes.js";
    import invoiceRoutes from "./routes/invoiceRoutes.js";
    import packageDurationRoutes from "./routes/packageDurationRoutes.js";
    import faultyStockRoutes from "./routes/faultyStockRoutes.js";
    import reportRoutes from "./routes/reportRoutes.js";
    import reportSubmissionRoutes from "./routes/reportSubmissionRoutes.js";
    import availableReportRoutes from "./routes/availabelReportRoutes.js";
    import centerStockImportRoutes from "./routes/centerStockImportRoutes.js";
    import centerReturnRoutes from "./routes/centerReturnRoutes.js";
    import damageReturnRoutes from "./routes/damageReturnRoutes.js";
    import { errorMiddleware } from "./middlewares/errorMiddleware.js";
    import getAllDataRoutes from "./routes/getAllDataRoutes.js";
    const app = express();

    // Global middleware
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 6000,
        standardHeaders: true,
        legacyHeaders: false
    });

    app.use("/api", apiLimiter);

    // API routes
    app.use("/api/v1/health", healthRoutes);
    app.use("/api/v1/auth", authRoutes);
    // app.use("/api/v1/product-categories", productCategoryRoutes);
    app.use("/api/v1/product-category", productCategoryRoutes);
    app.use("/api/v1/products", productRoutes);
    app.use("/api/v1/vendor", vendorRoutes);
    app.use("/api/v1/role", roleRoutes);
    app.use("/api/v1/resellers", resellerRoutes);
    // Compatibility with existing frontend reseller-stock endpoints
    app.use("/api/v1/resellerStock", resellerRoutes);
    app.use("/api/v1/centers", centerRoutes);
    app.use("/api/v1/areas", areaRoutes);
    app.use("/api/v1/customers", customerRoutes);
    app.use("/api/v1/buildings", buildingRoutes);
    app.use("/api/v1/controlRooms", controlRoomRoutes);
    app.use("/api/v1/warehouses", warehouseRoutes);
    app.use("/api/v1/stocktransfer", stockTransferRoutes);
    app.use("/api/v1/stockpurchase", stockPurchaseRoutes);
    app.use("/api/v1/stockrequest", stockRequestRoutes);
    app.use("/api/v1/raisePO", raisePORoutes);
    app.use("/api/v1/testing-material", testingMaterialRoutes);
    app.use("/api/v1/stockusage", stockUsageRoutes);
    app.use("/api/v1/shiftingrequest", shiftingRequestRoutes);
    app.use("/api/v1", usageSummaryRoutes);
    app.use("/api/v1/invoices", invoiceRoutes);
    app.use("/api/v1", getAllDataRoutes);
    // Package Duration and Faulty Stock
    app.use("/api/v1/packageDuration", packageDurationRoutes);
    app.use("/api/v1/faulty-stock", faultyStockRoutes);
    app.use("/api/v1/repaired-cost", repairCostRoutes);
    // Reports
    app.use("/api/v1/reports", reportRoutes);
    app.use("/api/v1/reportsubmission", reportSubmissionRoutes);
    app.use("/api/v1/available-reports", availableReportRoutes);
    app.use("/api/v1/availableStock", availableReportRoutes);
    // Sakshi's Center Stock Import and Center Returns
    app.use("/api/v1/center-stock", centerStockImportRoutes);
    app.use("/api/v1/center-returns", centerReturnRoutes);
    app.use("/api/v1/damage-returns", damageReturnRoutes);
    // Error handling must come after all routes
    app.use(errorMiddleware);

    export default app;