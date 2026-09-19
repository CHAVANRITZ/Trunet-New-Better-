import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/authRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import productCategoryRoutes from "./routes/productCategoryRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import { errorMiddleware } from "./middlewares/errorMiddleware.js";
import roleRoutes from "./routes/roleRoutes.js";


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
    "/api/v1/roles",
    roleRoutes
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