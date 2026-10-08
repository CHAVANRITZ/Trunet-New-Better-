import multer from "multer";

/**
 * Multer middleware for CSV uploads.
 *
 * Memory storage is required because the bulk-upload controller
 * reads `req.file.buffer` directly and never persists the file.
 *
 * No file-type filter and no size limit are applied here, matching
 * the legacy behavior: any file the client uploads is accepted by
 * multer, and validation/parsing failures are surfaced by the
 * bulk-upload controller itself.
 */
const storage = multer.memoryStorage();

const upload = multer({ storage });

export default upload;