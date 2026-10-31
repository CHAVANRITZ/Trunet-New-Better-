import "dotenv/config";

import mongoose from "mongoose";

import Role from "./models/Role.js";
import User from "./models/User.js";
import { hashPassword } from "./utils/password.js";

async function main() {
    const {
        MONGO_URI,
        ADMIN_NAME,
        ADMIN_USERNAME,
        ADMIN_EMAIL,
        ADMIN_PASSWORD
    } = process.env;

    // 1. Validate the environment configuration.
    if (!MONGO_URI) {
        throw new Error("MONGO_URI is missing from .env");
    }

    if (!ADMIN_NAME || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
        throw new Error(
            "ADMIN_NAME, ADMIN_USERNAME and ADMIN_PASSWORD must be configured in .env"
        );
    }

    const username = ADMIN_USERNAME.trim().toLowerCase();
    const email = ADMIN_EMAIL?.trim().toLowerCase();

    if (!username || !ADMIN_NAME.trim() || !ADMIN_PASSWORD) {
        throw new Error("Admin configuration contains empty required values.");
    }

    // 2. Connect to the configured MongoDB database.
    await mongoose.connect(MONGO_URI);

    console.log(`Connected to database: ${mongoose.connection.name}`);

    // 3. Check whether the admin user already exists.
    const existingUser = await User.findOne({
        $or: [
            { username },
            ...(email ? [{ email }] : [])
        ]
    });

    if (existingUser) {
        console.log(
            "An account with this username or email already exists."
        );
        console.log("No existing user was changed.");
        return;
    }

    // 4. Find the Super Admin role, or create it.
    let role = await Role.findOne({
        roleTitle: "superadmin"
    });

    if (!role) {
        role = await Role.create({
            roleTitle: "superadmin",
            permissions: [],
            isSuperAdmin: true,
            createdBy: null
        });

        console.log("Super Admin role created.");
    } else if (!role.isSuperAdmin) {
        // Ensure the existing superadmin role is recognized as such.
        role.isSuperAdmin = true;
        await role.save();

        console.log("Existing Super Admin role flag enabled.");
    } else {
        console.log("Super Admin role already exists.");
    }

    // 5. Hash the password using TruNet's existing bcrypt utility.
    const passwordHash = await hashPassword(ADMIN_PASSWORD);

    // 6. Create the initial administrator account.
    const user = await User.create({
        fullName: ADMIN_NAME.trim(),
        username,
        ...(email ? { email } : {}),
        password: passwordHash,
        role: role._id,
        isSuperAdmin: true,
        status: "Enable",
        center: null,
        accessibleCenters: []
    });

    console.log("\nInitial Super Admin created successfully.");
    console.log("User ID:", user._id.toString());
    console.log("Username:", user.username);
    console.log("Role:", role.roleTitle);
    console.log("Status:", user.status);
    console.log("Password stored as a bcrypt hash.");
}

main()
    .catch(error => {
        console.error("\nAdmin initialization failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    });
