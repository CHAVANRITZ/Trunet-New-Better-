import app from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/db.js";

/**
 * Starts the Trunet backend.
 *
 * The database connection is established before accepting
 * HTTP requests so the application does not start in a
 * partially initialized state.
 */
async function startServer() {
    try {
        await connectDatabase();

        app.listen(env.PORT, () => {
            console.log(`Trunet API running on port ${env.PORT}`);
        });
    } catch (error) {
        console.error("Failed to start Trunet API:", error.message);

        process.exit(1);
    }
}

startServer();