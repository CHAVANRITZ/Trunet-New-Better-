/**
 * Determines whether the user's database-backed role
 * has super-admin privileges.
 *
 * The legacy database stores this information in:
 *
 * role.isSuperAdmin
 *
 * No role name is hardcoded here.
 *
 * @param {Object} user - Authenticated user
 * @returns {boolean} Whether the user is a super admin
 */
export const isSuperAdmin = (user) => {
    return user?.role?.isSuperAdmin === true;
};