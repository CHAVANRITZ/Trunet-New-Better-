import {
    createCustomer as createCustomerService,
    getCustomers as getCustomersService,
    getCustomersWithoutPagination as getCustomersWithoutPaginationService,
    getCustomerById as getCustomerByIdService,
    updateCustomer as updateCustomerService,
    deleteCustomer as deleteCustomerService,
    importCustomers as importCustomersService,
} from "../services/customerService.js";

/**
 * Create Customer
 */
export const createCustomer = async (
    req,
    res
) => {
    try {
        const customer =
            await createCustomerService(
                req.body,
                req.user
            );

        return res.status(201).json({
            success: true,
            data: customer,
        });
    } catch (error) {
        console.error(
            "Error creating customer:",
            error
        );

        if (error.statusCode) {
            const response = {
                success: false,
                message: error.message,
            };

            if (error.field) {
                response.field =
                    error.field;
            }

            if (
                error.value !== undefined
            ) {
                response.value =
                    error.value;
            }

            if (error.errors) {
                response.errors =
                    error.errors;
            }

            return res
                .status(error.statusCode)
                .json(response);
        }

        return res.status(500).json({
            success: false,
            message: "Error creating customer",
            error:
                process.env.NODE_ENV ===
                "development"
                    ? error.message
                    : "Internal server error",
        });
    }
};

/**
 * Get Customers with pagination
 */
export const getCustomers = async (
    req,
    res
) => {
    try {
        const result =
            await getCustomersService(
                req.query,
                req.user
            );

        return res.status(200).json({
            success: true,
            data: result.customers,
            pagination:
                result.pagination,
        });
    } catch (error) {
        console.error(
            "Error fetching customers:",
            error
        );

        if (error.statusCode) {
            return res
                .status(error.statusCode)
                .json({
                    success: false,
                    message:
                        error.message,
                });
        }

        return res.status(500).json({
            success: false,
            message:
                "Error fetching customers",
            error:
                process.env.NODE_ENV ===
                "development"
                    ? error.message
                    : "Internal server error",
        });
    }
};

/**
 * Get Customers without pagination
 */
export const getCustomersWithoutPagination =
    async (req, res) => {
        try {
            const result =
                await getCustomersWithoutPaginationService(
                    req.query,
                    req.user
                );

            return res.status(200).json({
                success: true,
                data: result.customers,
                totalCustomers:
                    result.totalCustomers,
            });
        } catch (error) {
            console.error(
                "Error fetching customers without pagination:",
                error
            );

            if (error.statusCode) {
                return res
                    .status(error.statusCode)
                    .json({
                        success: false,
                        message:
                            error.message,
                    });
            }

            return res.status(500).json({
                success: false,
                message:
                    "Error fetching customers",
                error:
                    process.env.NODE_ENV ===
                    "development"
                        ? error.message
                        : "Internal server error",
            });
        }
    };

/**
 * Get Customer by ID
 */
export const getCustomerById = async (
    req,
    res
) => {
    try {
        const customer =
            await getCustomerByIdService(
                req.params.id,
                req.user
            );

        return res.status(200).json({
            success: true,
            data: customer,
        });
    } catch (error) {
        console.error(
            "Error fetching customer:",
            error
        );

        /*
         * Legacy get-by-id exposes the raw
         * error message for unexpected errors.
         */
        if (error.statusCode) {
            return res
                .status(error.statusCode)
                .json({
                    success: false,
                    message:
                        error.message,
                });
        }

        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

/**
 * Update Customer
 */
export const updateCustomer = async (
    req,
    res
) => {
    try {
        const customer =
            await updateCustomerService(
                req.params.id,
                req.body,
                req.user
            );

        return res.status(200).json({
            success: true,
            data: customer,
        });
    } catch (error) {
        console.error(
            "Error updating customer:",
            error
        );

        if (error.statusCode) {
            const response = {
                success: false,
                message: error.message,
            };

            if (error.field) {
                response.field =
                    error.field;
            }

            if (
                error.value !== undefined
            ) {
                response.value =
                    error.value;
            }

            if (error.errors) {
                response.errors =
                    error.errors;
            }

            return res
                .status(error.statusCode)
                .json(response);
        }

        return res.status(500).json({
            success: false,
            message:
                "Error updating customer",
            error:
                process.env.NODE_ENV ===
                "development"
                    ? error.message
                    : "Internal server error",
        });
    }
};

/**
 * Delete Customer
 */
export const deleteCustomer = async (
    req,
    res
) => {
    try {
        await deleteCustomerService(
            req.params.id,
            req.user
        );

        return res.status(200).json({
            success: true,
            message:
                "Customer deleted successfully",
        });
    } catch (error) {
        console.error(
            "Error deleting customer:",
            error
        );

        if (error.statusCode) {
            return res
                .status(error.statusCode)
                .json({
                    success: false,
                    message:
                        error.message,
                });
        }

        /*
         * Preserve legacy delete behavior:
         * unexpected errors expose error.message.
         */
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// import customers controller
/**
 * Import Customers from CSV
 *
 * Legacy endpoint is intentionally
 * unauthenticated.
 */
export const importCustomers = async (
    req,
    res
) => {
    try {
        const result =
            await importCustomersService(
                req.file
            );

        return res.status(200).json(
            result
        );
    } catch (error) {
        console.error(
            "Error importing customers:",
            error
        );

        if (error.statusCode) {
            const response = {
                success: false,
                message: error.message,
            };

            if (error.details) {
                response.error =
                    error.details;
            }

            if (error.requiredFormat) {
                response.requiredFormat =
                    error.requiredFormat;
            }

            if (error.note) {
                response.note =
                    error.note;
            }

            return res
                .status(error.statusCode)
                .json(response);
        }

        return res.status(500).json({
            success: false,
            message:
                "Error importing customers",
            error:
                process.env.NODE_ENV ===
                "development"
                    ? error.message
                    : "Internal server error",
        });
    }
};