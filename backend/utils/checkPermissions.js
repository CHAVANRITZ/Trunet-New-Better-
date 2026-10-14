/**
 * Determines whether the authenticated user has super-admin privileges.
 *
 * Supports both the new user-level flag and the existing role-level flag.
 *
 * @param {Object} user - Authenticated user
 * @returns {boolean} Whether the user is a super admin
 */
export const isSuperAdmin = (user) => {
    return (
        user?.isSuperAdmin === true ||
        user?.fullUser?.isSuperAdmin === true ||
        user?.role?.isSuperAdmin === true
    );
};