import multer from "multer";
import path from "path";
import fs from "fs";

/**
 * Directory used for product image uploads.
 *
 * The directory is created automatically when the application
 * starts so image uploads do not fail because the folder is missing.
 */
const productUploadDirectory = path.join(
    process.cwd(),
    "uploads",
    "products"
);

if (!fs.existsSync(productUploadDirectory)) {
    fs.mkdirSync(productUploadDirectory, {
        recursive: true
    });
}

/**
 * Stores product images directly on disk.
 *
 * Keeping image files outside MongoDB prevents the database from
 * becoming unnecessarily large while allowing products to store
 * only the relative file path.
 */
const productStorage = multer.diskStorage({
    destination: (_req, _file, callback) => {
        callback(null, productUploadDirectory);
    },

    filename: (_req, file, callback) => {
        const extension = path
            .extname(file.originalname)
            .toLowerCase();

        const uniqueName = `product-${Date.now()}-${Math.round(
            Math.random() * 1e9
        )}${extension}`;

        callback(null, uniqueName);
    }
});

/**
 * Accepts only common image formats for product images.
 *
 * The MIME type check is combined with the file extension check
 * to reject obviously invalid uploads.
 *
 * Invalid file types are marked as client errors so the centralized
 * error middleware returns HTTP 400 instead of HTTP 500.
 */
const imageFileFilter = (_req, file, callback) => {
    const allowedMimeTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif"
    ];

    const allowedExtensions = [
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif"
    ];

    const extension = path
        .extname(file.originalname)
        .toLowerCase();

    if (
        allowedMimeTypes.includes(file.mimetype) &&
        allowedExtensions.includes(extension)
    ) {
        return callback(null, true);
    }

    const error = new Error(
        "Only JPG, JPEG, PNG, WEBP and GIF images are allowed."
    );

    error.statusCode = 400;

    return callback(error);
};

/**
 * Multer configuration for product image uploads.
 *
 * A 5 MB limit keeps unexpectedly large files from consuming
 * excessive server storage.
 */
const upload = multer({
    storage: productStorage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024
    }
});

/**
 * Validates uploaded CSV files before they reach the service layer.
 *
 * CSV MIME types can vary between clients such as Postman,
 * browsers and operating systems. Therefore, the file extension
 * is treated as the primary check while common CSV MIME types
 * are accepted for compatibility.
 */
const csvFileFilter = (_req, file, callback) => {
    const allowedMimeTypes = [
        "text/csv",
        "text/plain",
        "application/csv",
        "application/vnd.ms-excel",
        "application/octet-stream"
    ];

    const extension = path
        .extname(file.originalname)
        .toLowerCase();

    /**
     * The .csv extension is required.
     *
     * The MIME type is checked against known CSV-compatible
     * values because clients are not consistent in how they
     * identify CSV files.
     */
    if (
        extension === ".csv" &&
        allowedMimeTypes.includes(file.mimetype)
    ) {
        return callback(null, true);
    }

    const error = new Error(
        "Only CSV files are allowed."
    );

    error.statusCode = 400;

    return callback(error);
};

/**
 * Multer configuration for CSV bulk imports.
 *
 * CSV files are stored in memory because the service processes
 * the uploaded buffer immediately and does not need to retain
 * the file on disk.
 *
 * A 10 MB limit prevents excessively large CSV uploads from
 * consuming too much server memory.
 */
export const memoryUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter: csvFileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});
export default upload;