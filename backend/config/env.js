import dotenv from "dotenv";
dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 5000,
  MONGO_URI: process.env.MONGO_URI || "",

  JWT_SECRET: (process.env.JWT_SECRET || "").trim(),
  JWT_EXPIRES_IN: (process.env.JWT_EXPIRES_IN || "15m").trim(),

  // maps your JWT_REFRESH_* from .env to REFRESH_TOKEN_* used in token.js
  REFRESH_TOKEN_SECRET: (process.env.JWT_REFRESH_SECRET || process.env.REFRESH_TOKEN_SECRET || "").trim(),
  REFRESH_TOKEN_EXPIRES_IN: (process.env.JWT_REFRESH_EXPIRES_IN || process.env.REFRESH_TOKEN_EXPIRES_IN || "7d").trim(),

  ADMIN_NAME: process.env.ADMIN_NAME || "Trunet Administrator",
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "admin",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || "admin@trunet.local",
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "Admin@123",
};