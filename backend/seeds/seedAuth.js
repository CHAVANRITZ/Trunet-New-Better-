import mongoose from "mongoose";

import { env } from "../config/env.js";
import { connectDatabase } from "../config/db.js";

import Permission from "../models/Permission.js";
import Role from "../models/Role.js";
import User from "../models/User.js";

import { PERMISSIONS } from "../constants/permissions.js";
import { SYSTEM_ROLES } from "../constants/roles.js";
import { USER_STATUS } from "../constants/status.js";
import { hashPassword } from "../utils/password.js";

/**
 * Seeds the permissions required by the current Trunet
 * authentication and authorization foundation.
 *
 * The operation is intentionally idempotent:
 * running the seed multiple times updates existing records
 * instead of creating duplicates.
 */
async function seedPermissions() {
    const permissionDefinitions = [
        {
            module: "User",
            action: PERMISSIONS.MANAGE_USER,
            description: "Manage Trunet users."
        },
        {
            module: "Indent",
            action: PERMISSIONS.MANAGE_INDENT,
            description: "Manage stock indents."
        },
        {
            module: "Indent",
            action: PERMISSIONS.INDENT_ALL_CENTER,
            description: "Create and manage indents across all centers."
        },
        {
            module: "Indent",
            action: PERMISSIONS.INDENT_OWN_CENTER,
            description: "Create and manage indents for the user's center."
        },
        {
            module: "Indent",
            action: PERMISSIONS.DELETE_INDENT_OWN_CENTER,
            description: "Delete indents belonging to the user's center."
        },
        {
            module: "StockTransfer",
            action: PERMISSIONS.STOCK_TRANSFER_APPROVE_FROM_OUTLET,
            description: "Approve stock transfers originating from outlets."
        },
        {
            module: "Indent",
            action: PERMISSIONS.COMPLETE_INDENT,
            description: "Complete stock indents."
        },
        {
            module: "Usage",
            action: PERMISSIONS.MANAGE_USAGE_OWN_CENTER,
            description: "Manage stock usage for the user's center."
        },
        {
            module: "Usage",
            action: PERMISSIONS.MANAGE_USAGE_ALL_CENTER,
            description: "Manage stock usage across all centers."
        },
        {
            module: "Usage",
            action: PERMISSIONS.VIEW_USAGE_OWN_CENTER,
            description: "View stock usage for the user's center."
        },
        {
            module: "Usage",
            action: PERMISSIONS.VIEW_USAGE_ALL_CENTER,
            description: "View stock usage across all centers."
        },
        {
            module: "Damage",
            action: PERMISSIONS.ACCEPT_DAMAGE_RETURN,
            description: "Accept returned damaged stock."
        },
        {
            module: "Usage",
            action: PERMISSIONS.ALLOW_EDIT_USAGE,
            description: "Allow editing of stock usage records."
        }
    ];

    const permissions = [];

    for (const definition of permissionDefinitions) {
        const permission = await Permission.findOneAndUpdate(
            {
                module: definition.module,
                action: definition.action
            },
            {
                $set: {
                    description: definition.description,
                    status: USER_STATUS.ENABLED
                }
            },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true
            }
        );

        permissions.push(permission);
    }

    return permissions;
}

/**
 * Seeds the Super Admin role.
 *
 * Super Admin receives every currently defined permission.
 * This gives the system one controlled administrative role
 * while more restrictive operational roles can be introduced
 * later as their business requirements are implemented.
 */
async function seedSuperAdminRole(permissions) {
    const role = await Role.findOneAndUpdate(
        {
            name: SYSTEM_ROLES.SUPER_ADMIN
        },
        {
            $set: {
                description:
                    "Full administrative access to the Trunet system.",
                permissions: permissions.map(
                    (permission) => permission._id
                ),
                status: USER_STATUS.ENABLED
            }
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        }
    );

    return role;
}

/**
 * Seeds the initial administrator account.
 *
 * The administrator credentials come from environment variables
 * rather than being stored in source code.
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

    const existingUser = await User.findOne({
        $or: [
            { username: env.ADMIN_USERNAME.toLowerCase() },
            { email: env.ADMIN_EMAIL.toLowerCase() }
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

    const user = await User.create({
        fullName: env.ADMIN_NAME,
        username: env.ADMIN_USERNAME.toLowerCase(),
        email: env.ADMIN_EMAIL.toLowerCase(),
        password: passwordHash,
        role: role._id,
        status: USER_STATUS.ENABLED
    });

    return user;
}

/**
 * Executes the complete authentication seed process.
 */
async function seedAuthentication() {
    try {
        await connectDatabase();

        console.log("Seeding authentication data...");

        const permissions = await seedPermissions();

        console.log(
            `Permissions ready: ${permissions.length}`
        );

        const superAdminRole =
            await seedSuperAdminRole(permissions);

        console.log(
            `Role ready: ${superAdminRole.name}`
        );

        const adminUser =
            await seedAdminUser(superAdminRole);

        console.log(
            `Admin user ready: ${adminUser.username}`
        );

        console.log(
            "Authentication seed completed successfully."
        );
    } catch (error) {
        console.error(
            "Authentication seed failed:",
            error.message
        );

        process.exitCode = 1;
    } finally {
        await mongoose.connection.close();
    }
}

seedAuthentication();