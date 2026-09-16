import mongoose from "mongoose";

/**
 * Stores refresh-token sessions for authenticated users.
 *
 * Refresh tokens are intentionally persisted in the database so
 * that individual sessions can be revoked. This gives Trunet
 * server-side control over long-lived authentication sessions.
 *
 * The raw refresh token itself is not stored. Instead, the token
 * is hashed before persistence so a database compromise does
 * not immediately expose usable refresh credentials.
 */
const refreshTokenSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        tokenHash: {
            type: String,
            required: true,
            unique: true
        },

        expiresAt: {
            type: Date,
            required: true
        },

        revokedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

/*
 * MongoDB automatically removes expired refresh-token records.
 *
 * expireAfterSeconds: 0 means MongoDB removes a document once
 * its expiresAt timestamp has been reached.
 *
 * The TTL index is declared here rather than using index: true
 * on the field because TTL behavior requires the index options.
 */
refreshTokenSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
);

const RefreshToken = mongoose.model(
    "RefreshToken",
    refreshTokenSchema
);

export default RefreshToken;