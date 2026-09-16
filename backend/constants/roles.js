/**
 * System-level role identifiers used by authorization logic.
 *
 * These constants are only used when application logic needs to
 * recognize a special role. The actual roles remain database
 * records so that the RBAC system can evolve without requiring
 * source-code changes.
 */
export const SYSTEM_ROLES = Object.freeze({
    SUPER_ADMIN: "Super Admin"
});