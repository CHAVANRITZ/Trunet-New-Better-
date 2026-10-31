import mongoose from "mongoose";
import { env } from "./env.js";

/**
 * Establishes a connection to MongoDB.
 *
 * The database connection is kept separate from the Express
 * application so that database concerns remain centralized
 * and reusable.
 */
export async function connectDatabase() {
    if (!env.MONGO_URI) {
        throw new Error("MONGO_URI is not configured.");
    }

    try {
        await mongoose.connect(env.MONGO_URI);

        console.log("MongoDB connected successfully.");
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);

        throw error;
    }
}