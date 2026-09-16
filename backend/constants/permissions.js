/**
 * Canonical permission identifiers used by Trunet.
 *
 * Permissions represent capabilities rather than roles.
 * Roles are responsible for grouping these capabilities.
 *
 * New permissions should be added here as the corresponding
 * business domain is implemented.
 */
export const PERMISSIONS = Object.freeze({
    MANAGE_USER: "manage_user",

    MANAGE_INDENT: "manage_indent",

    INDENT_ALL_CENTER: "indent_all_center",

    INDENT_OWN_CENTER: "indent_own_center",

    DELETE_INDENT_OWN_CENTER: "delete_indent_own_center",

    STOCK_TRANSFER_APPROVE_FROM_OUTLET:
        "stock_transfer_approve_from_outlet",

    COMPLETE_INDENT: "complete_indent",

    MANAGE_USAGE_OWN_CENTER:
        "manage_usage_own_center",

    MANAGE_USAGE_ALL_CENTER:
        "manage_usage_all_center",

    VIEW_USAGE_OWN_CENTER:
        "view_usage_own_center",

    VIEW_USAGE_ALL_CENTER:
        "view_usage_all_center",

    ACCEPT_DAMAGE_RETURN:
        "accept_damage_return",

    ALLOW_EDIT_USAGE:
        "allow_edit_usage"
});