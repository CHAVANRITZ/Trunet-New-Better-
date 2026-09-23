import Reseller from "../models/Reseller.js";
import Center from "../models/Center.js";

const generateCenterCode = async (businessName) => {
    const baseCode = businessName
        .replace(/\s+/g, "")
        .substring(0, 4)
        .toUpperCase();

    let counter = 1;
    let centerCode;

    do {
        centerCode = `${baseCode}${String(counter).padStart(3, "0")}`;

        const existingCenter = await Center.findOne({
            centerCode,
        });

        if (!existingCenter) {
            return centerCode;
        }

        counter++;
    } while (true);
};

export const createReseller = async (resellerData) => {
    const reseller = await Reseller.create(resellerData);

    const centerCode = await generateCenterCode(
        reseller.businessName
    );

    const centerData = {
        reseller: reseller._id,
        centerType: "Outlet",
        centerName: reseller.businessName,
        centerCode,
        email: reseller.email || "",
        mobile: reseller.mobile || reseller.contactNumber || "",
        addressLine1: reseller.address1 || "",
        addressLine2: reseller.address2 || "",
        city: reseller.city || "",
        state: reseller.state || "",
        area: null,
        status: "Enable",
    };

    const center = await Center.create(centerData);

    return {
        reseller,
        center,
    };
};

export const getResellers = async ({
    search,
    city,
    state,
    page = 1,
    limit = 100,
    sortBy = "createdAt",
    sortOrder = "desc",
}) => {
    const filters = {};

    if (search) {
        const searchRegex = new RegExp(search, "i");

        filters.$or = [
            { businessName: searchRegex },
            { name: searchRegex },
            { email: searchRegex },
            { mobile: searchRegex },
            { contactNumber: searchRegex },
            { gstNumber: searchRegex },
        ];
    }

    if (city) {
        filters.city = new RegExp(city, "i");
    }

    if (state) {
        filters.state = new RegExp(state, "i");
    }

    const currentPage = Number(page);
    const currentLimit = Number(limit);

    const skip = (currentPage - 1) * currentLimit;

    const sortDirection =
        sortOrder === "asc" ? 1 : -1;

    const [resellers, totalResellers] =
        await Promise.all([
            Reseller.find(filters)
                .sort({
                    [sortBy]: sortDirection,
                })
                .skip(skip)
                .limit(currentLimit),

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

export const getResellerById = async (resellerId) => {
    return Reseller.findById(resellerId);
};

export const updateReseller = async (
    resellerId,
    updateData
) => {
    return Reseller.findByIdAndUpdate(
        resellerId,
        updateData,
        {
            new: true,
            runValidators: true,
        }
    );
};

export const deleteReseller = async (resellerId) => {
    return Reseller.findByIdAndDelete(resellerId);
};