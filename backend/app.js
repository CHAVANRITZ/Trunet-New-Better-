import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

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
import { errorMiddleware } from "./middlewares/errorMiddleware.js";
import stockUsageRoutes from "./routes/stockUsageRoutes.js";

const app = express();
/*
 * ------------------------------------------------------------
 * Global middleware
 * ------------------------------------------------------------
 */

// Adds security-related HTTP headers.
app.use(helmet());

// Allows the frontend to communicate with the backend.
app.use(cors());

// Parses incoming JSON request bodies.
app.use(express.json());

// Prevents excessively frequent requests from a single client.
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 6000,
    standardHeaders: true,
    legacyHeaders: false
});

app.use("/api", apiLimiter);

/*
 * ------------------------------------------------------------
 * API routes
 * ------------------------------------------------------------
 */

app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);

app.use(
    "/api/v1/product-categories",
    productCategoryRoutes
);

app.use(
    "/api/v1/products",
    productRoutes
);

app.use(
    "/api/v1/vendors",
    vendorRoutes
);

app.use(
    "/api/v1/roles",
    roleRoutes
);

app.use("/api/v1/resellers", resellerRoutes);
app.use("/api/v1/centers", centerRoutes);
app.use("/api/v1/areas", areaRoutes);

app.use("/api/v1/customers", customerRoutes);
app.use("/api/v1/buildings", buildingRoutes);
app.use("/api/v1/control-rooms", controlRoomRoutes);

app.use("/api/v1/warehouses", warehouseRoutes);
app.use(
    "/api/v1/stock-transfers",
    stockTransferRoutes
);
app.use(
    "/api/v1/stockpurchase",
    stockPurchaseRoutes
);
app.use(
    "/api/v1/stockrequest",
    stockRequestRoutes
);

app.use(
    "/api/v1/raise-pos",
    raisePORoutes
);
app.use(
    "/api/v1/testing-materials",
    testingMaterialRoutes
);

app.use(
    "/api/v1/stock-usage",
    stockUsageRoutes
);
/*
 * ------------------------------------------------------------
 * Error handling
 * ------------------------------------------------------------
 *
 * This must be registered after all routes so that errors
 * propagated from controllers and services reach this middleware.
 */
app.use(errorMiddleware);

export default app;