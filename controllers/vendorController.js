import fs from "fs/promises";
import path from "path";

import {
    createVendor as createVendorService,
    getVendors as getVendorsService,
    getVendorById as getVendorByIdService,
    updateVendor as updateVendorService,
    deleteVendor as deleteVendorService
} from "../services/vendorService.js";

import { ApiError } from "../utils/ApiError.js";

/**
 * Creates a new vendor.
 *
 * The uploaded logo is stored under the vendor upload directory,
 * while MongoDB stores only the relative application path.
 *
 * The logo value is controlled by the server to preserve the
 * legacy Vendor API behavior.
 */
export async function createVendor(req, res) {
    let uploadedLogoPath = null;

    const vendorData = {
        ...req.body,
        logo: ""
    };

    if (req.file) {
        uploadedLogoPath = `uploads/vendors/${req.file.filename}`;
        vendorData.logo = uploadedLogoPath;
    }

    try {
        const vendor = await createVendorService(vendorData);

        return res.status(201).json({
            success: true,
            message: "Vendor created successfully.",
            data: vendor
        });
    } catch (error) {
        /*
         * If database creation fails after the logo has already
         * been written to disk, remove the unused file.
         */
        if (uploadedLogoPath) {
            const absoluteLogoPath = path.join(
                process.cwd(),
                uploadedLogoPath
            );

            await fs.unlink(absoluteLogoPath).catch(() => {});
        }

        /*
         * Preserve the legacy duplicate-email behavior.
         */
        if (error.code === 11000 && error.keyPattern?.email) {
            throw new ApiError(
                409,
                `Email ${vendorData.email} is already registered. Please use a different email.`
            );
        }
    if (error.name === "ValidationError") {
        throw new ApiError(400, "Invalid vendor data provided");
}
        throw error;
    }
}

/**
 * Retrieves vendors using the legacy listing, filtering,
 * pagination, and sorting behavior.
 */
export async function getVendors(req, res) {
    const result = await getVendorsService(req.query);

    return res.status(200).json({
        success: true,
        data: result.vendors,
        pagination: result.pagination
    });
}

/**
 * Retrieves a single vendor by its MongoDB ID.
 */
export async function getVendorById(req, res) {
    try {
        const vendor = await getVendorByIdService(req.params.id);

        if (!vendor) {
            throw new ApiError(404, "Vendor not found.");
        }

        return res.status(200).json({
            success: true,
            data: vendor
        });
    } catch (error) {
        if (error.name === "CastError") {
            throw new ApiError(400, "Invalid data format");
        }

        throw error;
    }
}

/**
 * Updates an existing vendor.
 *
 * When no new logo is uploaded, the existing logo is preserved.
 * When a new logo is uploaded, the old logo is removed only
 * after the database update succeeds.
 */
export async function updateVendor(req, res) {
    let existingVendor;

    try {
        existingVendor = await getVendorByIdService(req.params.id);
    } catch (error) {
        if (error.name === "CastError") {
            throw new ApiError(400, "Invalid data format");
        }

        throw error;
    }

    if (!existingVendor) {
        throw new ApiError(404, "Vendor not found.");
    }

    let uploadedLogoPath = null;

    const vendorData = {
        ...req.body,
        logo: existingVendor.logo || ""
    };

    if (req.file) {
        uploadedLogoPath = `uploads/vendors/${req.file.filename}`;
        vendorData.logo = uploadedLogoPath;
    }

    try {
        const vendor = await updateVendorService(
            req.params.id,
            vendorData
        );

        if (
            req.file &&
            existingVendor.logo &&
            existingVendor.logo !== uploadedLogoPath
        ) {
            const oldLogoPath = path.join(
                process.cwd(),
                existingVendor.logo
            );

            await fs.unlink(oldLogoPath).catch(() => {});
        }

        return res.status(200).json({
            success: true,
            message: "Vendor updated successfully.",
            data: vendor
        });
    } catch (error) {
        if (uploadedLogoPath) {
            const absoluteLogoPath = path.join(
                process.cwd(),
                uploadedLogoPath
            );

            await fs.unlink(absoluteLogoPath).catch(() => {});
        }

        if (error.code === 11000 && error.keyPattern?.email) {
            throw new ApiError(
                409,
                `Email ${vendorData.email} is already registered. Please use a different email.`
            );
        }

        if (error.name === "ValidationError") {
            throw new ApiError(400, "Invalid vendor data provided");
        }

        if (error.name === "CastError") {
            throw new ApiError(400, "Invalid data format");
        }

        throw error;
    }
}

/**
 * Deletes a vendor and its associated logo file.
 */
export async function deleteVendor(req, res) {
    let vendor;

    try {
        vendor = await deleteVendorService(req.params.id);
    } catch (error) {
        if (error.name === "CastError") {
            throw new ApiError(400, "Invalid data format");
        }

        throw error;
    }

    if (!vendor) {
        throw new ApiError(404, "Vendor not found.");
    }

    if (vendor.logo) {
        const logoPath = path.join(
            process.cwd(),
            vendor.logo
        );

        await fs.unlink(logoPath).catch(() => {});
    }

    return res.status(200).json({
        success: true,
        message: "Vendor deleted successfully."
    });
}