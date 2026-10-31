import mongoose from "mongoose";

import { env } from "../config/env.js";
import { connectDatabase } from "../config/db.js";

import Role from "../models/Role.js";
import User from "../models/User.js";

import { USER_STATUS } from "../constants/status.js";
import { hashPassword } from "../utils/password.js";

/**
 * Finds the administrator role from the existing database.
 *
 * Roles are part of the legacy database and are therefore never
 * created, seeded, renamed, or modified by this script.
 *
 * The required role title is supplied through environment
 * configuration rather than being hardcoded in source code.
 */
async function findAdminRole() {
    if (!env.ADMIN_ROLE_TITLE) {
        throw new Error(
            "ADMIN_ROLE_TITLE must be configured with an existing role title."
        );
    }

    const roleTitle = env.ADMIN_ROLE_TITLE.trim().toLowerCase();

    const role = await Role.findOne({
        roleTitle
    });

    if (!role) {
        throw new Error(
            `Configured admin role "${env.ADMIN_ROLE_TITLE}" was not found in the database.`
        );
    }

    return role;
}

/**
 * Creates or updates the configured administrator account.
 *
 * The user's role is always linked to an existing database role.
 * This function never creates or modifies the role itself.
 */
async function seedAdminUser(role) {
    if (
        !env.ADMIN_NAME ||
        !env.ADMIN_USERNAME ||
        !env.ADMIN_EMAIL ||
        !env.ADMIN_PASSWORD
    ) {
        throw new Error(
            "ADMIN_NAME, ADMIN_USERNAME, ADMIN_EMAIL and ADMIN_PASSWORD must be configured."
        );
    }

    const username = env.ADMIN_USERNAME.trim().toLowerCase();
    const email = env.ADMIN_EMAIL.trim().toLowerCase();

    const existingUser = await User.findOne({
        $or: [
            { username },
            { email }
        ]
    });

    if (existingUser) {
        existingUser.fullName = env.ADMIN_NAME;
        existingUser.role = role._id;
        existingUser.status = USER_STATUS.ENABLED;

        await existingUser.save();

        return existingUser;
    }

    const passwordHash = await hashPassword(env.ADMIN_PASSWORD);

    return User.create({
        fullName: env.ADMIN_NAME,
        username,
        email,
        password: passwordHash,
        role: role._id,
        status: USER_STATUS.ENABLED
    });
}

/**
 * Executes the authentication setup.
 *
 * Important:
 * - Existing roles are read from MongoDB.
 * - Existing permissions are read through those roles.
 * - No role is created.
 * - No permission is created.
 * - No Super Admin role is hardcoded.
 */
async function seedAuthentication() {
    try {
        await connectDatabase();

        console.log("Checking authentication data...");

        const adminRole = await findAdminRole();

        console.log(
            `Existing role found: ${adminRole.roleTitle}`
        );

        const adminUser = await seedAdminUser(adminRole);

        console.log(
            `Admin user ready: ${adminUser.username}`
        );

        console.log(
            "Authentication setup completed successfully."
        );
    } catch (error) {
        console.error(
            "Authentication setup failed:",
            error.message
        );

        process.exitCode = 1;
    } finally {
        await mongoose.connection.close();
    }
}

seedAuthentication();