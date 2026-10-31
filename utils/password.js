import bcrypt from "bcryptjs";

/*
 * The work factor controls how expensive password hashing is.
 *
 * A higher value makes brute-force attacks more expensive, but
 * also increases the CPU cost of creating/verifying passwords.
 */
const SALT_ROUNDS = 12;

/**
 * Creates a secure one-way hash of a user's password.
 *
 * Plain-text passwords must never be stored in the database.
 *
 * @param {string} password - Plain-text password.
 * @returns {Promise<string>} Hashed password.
 */
export async function hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compares a plain-text password against a stored hash.
 *
 * bcrypt performs the comparison without exposing the original
 * password or requiring us to decrypt the stored hash.
 *
 * @param {string} password - Plain-text password supplied during login.
 * @param {string} passwordHash - Hash stored in the database.
 * @returns {Promise<boolean>} Whether the password matches.
 */
export async function comparePassword(password, passwordHash) {
    return bcrypt.compare(password, passwordHash);
}