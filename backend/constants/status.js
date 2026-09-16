/**
 * Centralized status values used across Trunet.
 *
 * Keeping these values in one place prevents spelling differences
 * such as "Enable", "enabled", and "Enabled" from appearing across
 * different parts of the application.
 */

export const USER_STATUS = Object.freeze({
    ENABLED: "Enable",
    DISABLED: "Disable"
});