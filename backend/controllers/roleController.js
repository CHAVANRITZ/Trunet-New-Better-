import {
    createRole as createRoleService,
    getRoles as getRolesService,
    getRoleById as getRoleByIdService,
    updateRole as updateRoleService,
    deleteRole as deleteRoleService
} from "../services/roleService.js";

/**
 * Creates a new role.
 */
export const createRole = async (req, res) => {
    const role = await createRoleService({
        roleTitle: req.body.roleTitle,
        permissions: req.body.permissions || [],
        createdBy: req.user?.id || null
    });

    return res.status(201).json({
        success: true,
        message: "Role created successfully.",
        data: role
    });
};

/**
 * Returns all roles.
 */
export const getRoles = async (req, res) => {
    const roles = await getRolesService();

    return res.status(200).json({
        success: true,
        message: "Roles retrieved successfully.",
        data: roles
    });
};

/**
 * Returns a role by its ID.
 */
export const getRoleById = async (req, res) => {
    const role = await getRoleByIdService(req.params.id);

    if (!role) {
        return res.status(404).json({
            success: false,
            message: "Role not found."
        });
    }

    return res.status(200).json({
        success: true,
        message: "Role retrieved successfully.",
        data: role
    });
};

/**
 * Updates an existing role.
 */
export const updateRole = async (req, res) => {
    const role = await updateRoleService(
        req.params.id,
        {
            roleTitle: req.body.roleTitle,
            permissions: req.body.permissions
        }
    );

    return res.status(200).json({
        success: true,
        message: "Role updated successfully.",
        data: role
    });
};

/**
 * Deletes a role that is not currently assigned to any user.
 */
export const deleteRole = async (req, res) => {
    await deleteRoleService(req.params.id);

    return res.status(200).json({
        success: true,
        message: "Role deleted successfully."
    });
};