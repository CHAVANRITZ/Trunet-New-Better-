import mongoose from "mongoose";
import Reseller from "../models/Reseller.js";
import Center from "../models/Center.js";
import Warehouse from "../models/Warehouse.js";

// Generate a unique center code.
const generateCenterCode = async (businessName) => {
    const baseCode = (businessName || "CENT")
        .replace(/\s+/g, "")
        .substring(0, 4)
        .toUpperCase();

    let counter = 1;

    while (true) {
        const centerCode =
            `${baseCode}${String(counter).padStart(3, "0")}`;

        const existingCenter = await Center.findOne({
            centerCode,
        }).lean();

        if (!existingCenter) {
            return centerCode;
        }

        counter++;
    }
};

// Create a reseller and its associated Outlet.

export const createReseller = async (resellerData) => {
    const session = await mongoose.startSession();

    try {
        let createdReseller;
        let createdCenter;

        await session.withTransaction(async () => {
            // 1. Create the Reseller.
            const [reseller] = await Reseller.create(
                [resellerData],
                { session }
            );

            // 2. Use the existing enabled Warehouse.
            // This intentionally allows sharing across Resellers.
            const warehouse = await Warehouse.findOne({
                status: "Enable",
            })
                .sort({ createdAt: 1, _id: 1 })
                .session(session);

            if (!warehouse) {
                const error = new Error(
                    "No enabled warehouse found. Create or enable a warehouse first."
                );
                error.statusCode = 400;
                throw error;
            }

            // 3. Generate a unique Outlet code.
            const centerCode = await generateCenterCode(
                reseller.businessName
            );

            // 4. Create the Outlet linked to the new Reseller
            // and the existing shared Warehouse.
            const centerData = {
                reseller: reseller._id,
                warehouse: warehouse._id,
                centerType: "Outlet",
                centerName: reseller.businessName,
                centerCode,
                email: reseller.email || "",
                mobile:
                    reseller.mobile ||
                    reseller.contactNumber ||
                    "",
                addressLine1: reseller.address1 || "",
                addressLine2: reseller.address2 || "",
                city: reseller.city || "",
                state: reseller.state || "",
                area: warehouse.area || undefined,
                status: "Enable",
            };

            const [center] = await Center.create(
                [centerData],
                { session }
            );

            createdReseller = reseller;
            createdCenter = center;
        });

        return {
            reseller: createdReseller,
            center: createdCenter,
        };
    } finally {
        await session.endSession();
    }
};


// Get resellers with search, filtering, sorting and pagination.
export const getResellers = async ({
    search,
    city,
    state,
    page = 1,
    limit = 100,
    sortBy = "createdAt",
    sortOrder = "desc",
} = {}) => {
    const filters = {};

    if (search?.trim()) {
        const escapedSearch = search.trim().replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

        const searchRegex = new RegExp(escapedSearch, "i");

        filters.$or = [
            { businessName: searchRegex },
            { name: searchRegex },
            { email: searchRegex },
            { mobile: searchRegex },
            { contactNumber: searchRegex },
            { gstNumber: searchRegex },
        ];
    }

    if (city?.trim()) {
        filters.city = new RegExp(
            city.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "i"
        );
    }

    if (state?.trim()) {
        filters.state = new RegExp(
            state.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "i"
        );
    }

    const currentPage = Math.max(1, Number(page) || 1);
    const currentLimit = Math.min(
        100,
        Math.max(1, Number(limit) || 100)
    );

    const skip = (currentPage - 1) * currentLimit;

    // Whitelist sortable fields to prevent arbitrary sort keys.
    const allowedSortFields = [
        "createdAt",
        "businessName",
        "name",
        "city",
        "state",
    ];

    const safeSortBy = allowedSortFields.includes(sortBy)
        ? sortBy
        : "createdAt";

    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const [resellers, totalResellers] = await Promise.all([
        Reseller.find(filters)
            .sort({ [safeSortBy]: sortDirection })
            .skip(skip)
            .limit(currentLimit)
            .lean(),

        Reseller.countDocuments(filters),
    ]);

    const totalPages = Math.ceil(
        totalResellers / currentLimit
    );

    return {
        resellers,
        pagination: {
            currentPage,
            totalPages,
            totalResellers,
            limit: currentLimit,
            hasNextPage: currentPage < totalPages,
            hasPrevPage: currentPage > 1,
        },
    };
};

// Get a reseller by ID.
export const getResellerById = async (resellerId) => {
    if (!mongoose.Types.ObjectId.isValid(resellerId)) {
        throw new Error("Invalid reseller ID.");
    }

    return Reseller.findById(resellerId);
};

// Update a reseller.
export const updateReseller = async (
    resellerId,
    updateData
) => {
    if (!mongoose.Types.ObjectId.isValid(resellerId)) {
        throw new Error("Invalid reseller ID.");
    }

    return Reseller.findByIdAndUpdate(
        resellerId,
        updateData,
        {
            new: true,
            runValidators: true,
        }
    );
};

// Delete a reseller.
export const deleteReseller = async (resellerId) => {
    if (!mongoose.Types.ObjectId.isValid(resellerId)) {
        throw new Error("Invalid reseller ID.");
    }

    return Reseller.findByIdAndDelete(resellerId);
};