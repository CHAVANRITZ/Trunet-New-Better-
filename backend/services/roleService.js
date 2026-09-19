import Role from "../models/Role.js";

/**
 * Creates a new role.
 *
 * Business rules:
 * - roleTitle must be unique.
 * - Permissions remain embedded in the legacy role structure.
 * - createdBy stores the user who created the role.
 */
export const createRole = async ({
    roleTitle,
    permissions = [],
    createdBy = null
}) => {
    const existingRole = await Role.roleExists(roleTitle);

    if (existingRole) {
        const error = new Error("Role already exists.");
        error.statusCode = 409;
        throw error;
    }

    const role = await Role.create({
        roleTitle,
        permissions,
        createdBy
    });

    return role;
};

/**
 * Returns all roles.
 *
 * Newest roles are returned first to preserve the existing
 * administrative listing behavior.
 */
export const getRoles = async () => {
    return Role.find()
        .sort({ createdAt: -1 })
        .select("-__v");
};

/**
 * Returns a single role by its MongoDB ID.
 */
export const getRoleById = async (roleId) => {
    return Role.findById(roleId).select("-__v");
};

/**
 * Updates an existing role.
 *
 * Only fields belonging to the legacy Role document are updated.
 */
export const updateRole = async (
    roleId,
    { roleTitle, permissions }
) => {
    const role = await Role.findById(roleId);

    if (!role) {
        const error = new Error("Role not found.");
        error.statusCode = 404;
        throw error;
    }

    if (
        roleTitle !== undefined &&
        roleTitle.toLowerCase() !== role.roleTitle
    ) {
        const existingRole = await Role.roleExists(roleTitle);

        if (existingRole) {
            const error = new Error("Role already exists.");
            error.statusCode = 409;
            throw error;
        }

        role.roleTitle = roleTitle;
    }

    if (permissions !== undefined) {
        role.permissions = permissions;
    }

    await role.save();

    return role;
};

/**
 * Deletes a role.
 *
 * A role should not be deleted while it is assigned to users.
 */
export const deleteRole = async (roleId) => {
    const User = (await import("../models/User.js")).default;

    const role = await Role.findById(roleId);

    if (!role) {
        const error = new Error("Role not found.");
        error.statusCode = 404;
        throw error;
    }

    const assignedUsers = await User.countDocuments({
        role: roleId
    });

    if (assignedUsers > 0) {
        const error = new Error(
            "Role cannot be deleted because it is assigned to users."
        );
        error.statusCode = 409;
        throw error;
    }

    await Role.findByIdAndDelete(roleId);

    return role;
};