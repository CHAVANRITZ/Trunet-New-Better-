import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        action: {
            type: String,
            default: null
        },
        entity: {
            type: String,
            default: null
        },
        entityType: {
            type: String,
            default: null
        },
        entityId: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },
        changes: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },
        reason: {
            type: String,
            default: null
        },
        ipAddress: {
            type: String,
            default: null
        },
        userAgent: {
            type: String,
            default: null
        },
        status: {
            type: String,
            default: null
        },
        errorMessage: {
            type: String,
            default: null
        },
        timestamp: {
            type: Date,
            default: null
        }
    },
    {
        collection: "auditlogs",
        timestamps: true,
        strict: false
    }
);

// Preserve compatibility with the collection's existing indexes.
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ user: 1, timestamp: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });

const AuditLog =
    mongoose.models.AuditLog ||
    mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
