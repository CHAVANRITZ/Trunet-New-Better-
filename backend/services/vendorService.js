import Vendor from "../models/Vendor.js";

/**
 * Creates a new vendor.
 *
 * @param {Object} vendorData - Vendor details.
 * @returns {Promise<Object>} Created vendor document.
 */
export async function createVendor(vendorData) {
    return Vendor.create(vendorData);
}

/**
 * Builds MongoDB filters used by the legacy vendor listing behavior.
 *
 * The filter structure intentionally follows the legacy controller.
 *
 * @param {Object} queryParams - Vendor listing query parameters.
 * @returns {Object} MongoDB filter object.
 */
function buildVendorSearchFilters(queryParams) {
    const {
        search,
        city,
        state,
        status,
        hasGst
    } = queryParams;

    const filters = {};

    if (search) {
        filters.$or = [
            {
                businessName: {
                    $regex: search,
                    $options: "i"
                }
            },
            {
                name: {
                    $regex: search,
                    $options: "i"
                }
            },
            {
                email: {
                    $regex: search,
                    $options: "i"
                }
            },
            {
                contactNumber: {
                    $regex: search,
                    $options: "i"
                }
            },
            {
                mobile: {
                    $regex: search,
                    $options: "i"
                }
            },
            {
                gstNumber: {
                    $regex: search,
                    $options: "i"
                }
            }
        ];
    }

    if (city) {
        filters.city = {
            $regex: city,
            $options: "i"
        };
    }

    if (state) {
        filters.state = {
            $regex: state,
            $options: "i"
        };
    }

    /*
     * Preserved from the legacy controller.
     *
     * The legacy Vendor schema does not define a status field,
     * so this filter is intentionally not converted into a new
     * schema field.
     */
    if (
        status &&
        ["Active", "Inactive"].includes(status)
    ) {
        filters.status = status;
    }

    if (hasGst === "true") {
        filters.gstNumber = {
            $exists: true,
            $ne: ""
        };
    } else if (hasGst === "false") {
        filters.$or = [
            {
                gstNumber: {
                    $exists: false
                }
            },
            {
                gstNumber: ""
            },
            {
                gstNumber: null
            }
        ];
    }

    return filters;
}

/**
 * Retrieves vendors using the legacy filtering, pagination,
 * and sorting behavior.
 *
 * @param {Object} queryParams - Vendor listing query parameters.
 * @returns {Promise<Object>} Vendors with pagination metadata.
 */
export async function getVendors(queryParams = {}) {
    const {
        search,
        city,
        state,
        status,
        hasGst,
        page = 1,
        limit = 100,
        sortBy = "createdAt",
        sortOrder = "desc"
    } = queryParams;

    const filters = buildVendorSearchFilters({
        search,
        city,
        state,
        status,
        hasGst
    });

    const currentPage = Number(page);
    const pageLimit = Number(limit);

    const skip = (currentPage - 1) * pageLimit;

    const sort = {
        [sortBy]: sortOrder === "desc" ? -1 : 1
    };

    const [totalVendors, vendors] = await Promise.all([
        Vendor.countDocuments(filters),

        Vendor.find(filters)
            .sort(sort)
            .skip(skip)
            .limit(pageLimit)
            .select("-__v")
    ]);

    const totalPages = Math.ceil(
        totalVendors / pageLimit
    );

    return {
        vendors,
        pagination: {
            currentPage,
            totalPages,
            totalVendors,
            hasNextPage: currentPage < totalPages,
            hasPrevPage: currentPage > 1
        }
    };
}

/**
 * Retrieves a vendor by its database identifier.
 *
 * @param {string} vendorId - Vendor identifier.
 * @returns {Promise<Object|null>} Vendor document or null.
 */
export async function getVendorById(vendorId) {
    return Vendor.findById(vendorId);
}

/**
 * Updates an existing vendor.
 *
 * @param {string} vendorId - Vendor identifier.
 * @param {Object} vendorData - Updated vendor details.
 * @returns {Promise<Object|null>} Updated vendor document or null.
 */
export async function updateVendor(vendorId, vendorData) {
    return Vendor.findByIdAndUpdate(
        vendorId,
        vendorData,
        {
            new: true,
            runValidators: true
        }
    );
}

/**
 * Deletes a vendor.
 *
 * @param {string} vendorId - Vendor identifier.
 * @returns {Promise<Object|null>} Deleted vendor document or null.
 */
export async function deleteVendor(vendorId) {
    return Vendor.findByIdAndDelete(vendorId);
}