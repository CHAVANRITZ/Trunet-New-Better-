import dotenv from "dotenv";

// Load environment variables from the backend .env file.
dotenv.config();

/**
 * Centralized application configuration.
 *
 * Keeping environment variables in one module prevents the rest
 * of the application from accessing process.env directly.
 */
export const env = {
    NODE_ENV: process.env.NODE_ENV || "development",

    PORT: Number(process.env.PORT) || 5000,

    MONGO_URI: process.env.MONGO_URI || "",

    JWT_SECRET: process.env.JWT_SECRET || "",

    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "15m",

    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || "",

    REFRESH_TOKEN_EXPIRES_IN:
        process.env.REFRESH_TOKEN_EXPIRES_IN || "7d"
};