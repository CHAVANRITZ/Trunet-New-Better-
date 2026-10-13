
import mongoose from "mongoose";

const repairTransferSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      default: Date.now,
      required: true,
    },
    faultyStock: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FaultyStock",
      required: true,
    },
    fromCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
    },
    toCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    pendingUnderRepairQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    underRepairQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    repairedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    irrepairedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    returnedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    pendingTransferQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    isSerialized: {
      type: Boolean,
      default: true,
    },
    serialNumbers: [
      {
        serialNumber: {
          type: String,
          trim: true,
          required: function () {
            return this.parent().isSerialized === true;
          },
        },
        status: {
          type: String,
          enum: [
            "pending_under_repair",
            "under_repair",
            "repaired",
            "irreparable",
            "returned",
            "partially_repaired",
            "transferred",
            "pending_transfer",
          ],
          default: "pending_under_repair",
        },
        quantity: {
          type: Number,
          default: 1,
        },
        repairedQty: {
          type: Number,
          default: 0,
        },
        irrepairedQty: {
          type: Number,
          default: 0,
        },
        underRepairQty: {
          type: Number,
          default: 0,
        },
        repairHistory: [
          {
            date: {
              type: Date,
              default: Date.now,
            },
            status: {
              type: String,
              enum: [
                "pending_under_repair",
                "under_repair",
                "repaired",
                "irreparable",
                "returned",
                "partially_repaired",
                "transferred",
                "pending_transfer",
              ],
            },
            remark: String,
            quantity: {
              type: Number,
              default: 0,
            },
            repairedQty: {
              type: Number,
              default: 0,
            },
            irrepairedQty: {
              type: Number,
              default: 0,
            },
            updatedBy: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
            },
            cost: {
              type: Number,
              default: 0,
            },
            transferStatus: {
              type: String,
              enum: ["pending", "accepted", "rejected"],
              default: "pending",
            },
            destinationOutlet: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Center",
            },
          },
        ],
        repairDate: Date,
        disposalDate: Date,
        repairCost: {
          type: Number,
          default: 0,
        },
        technician: String,
        repairRemark: String,
      },
    ],
    pendingTransferDetails: [
      {
        outletId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Center",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        transferredBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        transferredAt: {
          type: Date,
          default: Date.now,
        },
        remark: String,
        status: {
          type: String,
          enum: ["pending", "accepted", "rejected"],
          default: "pending",
        },
        acceptedAt: Date,
        acceptedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rejectedAt: Date,
        rejectedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        rejectionReason: String,
      },
    ],
    transferRemark: {
      type: String,
      trim: true,
    },
    transferredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    acceptedAt: Date,
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    completedAt: Date,
    status: {
      type: String,
      enum: [
        "pending_under_repair",
        "partially_accepted",
        "under_repair",
        "repaired",
        "irreparable",
        "returned",
        "cancelled",
        "completed",
        "transferred",
        "pending_transfer",
        "partially_repaired",
      ],
      default: "pending_under_repair",
    },
    repairUpdates: [
      {
        date: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: [
            "pending_under_repair",
            "partially_accepted",
            "under_repair",
            "repaired",
            "irreparable",
            "returned",
            "cancelled",
            "completed",
            "transferred",
            "pending_transfer",
            "partially_repaired",
          ],
        },
        remark: String,
        quantity: {
          type: Number,
          default: 0,
        },
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        cost: {
          type: Number,
          default: 0,
        },
        transferStatus: {
          type: String,
          enum: ["pending", "accepted", "rejected"],
          default: "pending",
        },
        destinationOutlet: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Center",
        },
        acceptedAt: Date,
        acceptedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    estimatedCompletionDate: Date,
    actualCompletionDate: Date,
    totalRepairCost: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

repairTransferSchema.virtual("acceptedQty").get(function () {
  return this.underRepairQty || 0;
});

repairTransferSchema.virtual("remainingPendingQty").get(function () {
  return this.pendingUnderRepairQty || 0;
});

repairTransferSchema.methods.markAsPendingTransfer = function (
  quantity,
  outletId,
  transferredBy,
  remark,
  serialNumbers = []
) {
  if (this.isSerialized) {
    if (!Array.isArray(serialNumbers) || serialNumbers.length === 0) {
      throw new Error("Serial numbers are required for serialized products");
    }

    if (serialNumbers.length !== quantity) {
      throw new Error(
        `Quantity (${quantity}) doesn't match serial numbers count (${serialNumbers.length})`
      );
    }

    let updatedCount = 0;

    for (const serialNumber of serialNumbers) {
      const serial = this.serialNumbers.find(
        (sn) =>
          sn.serialNumber === serialNumber && sn.status === "repaired"
      );

      if (serial) {
        serial.status = "pending_transfer";
        serial.repairHistory.push({
          date: new Date(),
          status: "pending_transfer",
          remark: remark || "Transferred to warehouse (pending)",
          quantity: 1,
          repairedQty: 0,
          irrepairedQty: 0,
          updatedBy: transferredBy,
          transferStatus: "pending",
          destinationOutlet: outletId,
        });
        updatedCount++;
      }
    }

    if (updatedCount !== quantity) {
      throw new Error(
        `Could only find ${updatedCount} repaired serials out of ${quantity} requested`
      );
    }
  } else if (quantity > this.repairedQty) {
    throw new Error(
      `Cannot transfer ${quantity} items. Only ${this.repairedQty} repaired items available`
    );
  }

  this.repairedQty = Math.max(0, this.repairedQty - quantity);
  this.pendingTransferQty = (this.pendingTransferQty || 0) + quantity;

  this.pendingTransferDetails.push({
    outletId,
    quantity,
    transferredBy,
    transferredAt: new Date(),
    remark: remark || "Pending transfer to outlet",
    status: "pending",
  });

  this.repairUpdates.push({
    date: new Date(),
    status: "pending_transfer",
    remark:
      remark ||
      `Transferred ${quantity} ${
        this.isSerialized ? "serialized" : "non-serialized"
      } items to warehouse (pending)`,
    quantity,
    updatedBy: transferredBy,
    transferStatus: "pending",
    destinationOutlet: outletId,
  });

  this.updateStatusAndQuantities();

  return {
    success: true,
    quantity,
    pendingTransferQty: this.pendingTransferQty,
    repairedQty: this.repairedQty,
    status: this.status,
    isSerialized: this.isSerialized,
  };
};

repairTransferSchema.methods.acceptPendingTransfer = function (
  outletId,
  quantity,
  acceptedBy,
  remark
) {
  if (this.isSerialized) {
    throw new Error("Use serial-specific methods for serialized products");
  }

  if (quantity > this.pendingTransferQty) {
    throw new Error(
      `Cannot accept ${quantity} items. Only ${this.pendingTransferQty} pending transfer items available`
    );
  }

  let remainingToAccept = quantity;
  let acceptedCount = 0;

  for (const detail of this.pendingTransferDetails || []) {
    if (
      String(detail.outletId) === String(outletId) &&
      detail.status === "pending" &&
      remainingToAccept > 0
    ) {
      const toAccept = Math.min(detail.quantity, remainingToAccept);

      detail.status = "accepted";
      detail.acceptedAt = new Date();
      detail.acceptedBy = acceptedBy;
      if (remark) detail.remark = remark;

      if (toAccept < detail.quantity) {
        this.pendingTransferDetails.push({
          outletId,
          quantity: detail.quantity - toAccept,
          transferredBy: detail.transferredBy,
          transferredAt: detail.transferredAt,
          remark: detail.remark,
          status: "pending",
        });
        detail.quantity = toAccept;
      }

      remainingToAccept -= toAccept;
      acceptedCount += toAccept;
    }
  }

  if (acceptedCount !== quantity) {
    throw new Error(
      `Could only accept ${acceptedCount} out of ${quantity} requested items`
    );
  }

  this.pendingTransferQty = Math.max(0, this.pendingTransferQty - quantity);
  this.returnedQty = (this.returnedQty || 0) + quantity;

  this.repairUpdates.push({
    date: new Date(),
    status: "transferred",
    remark:
      remark ||
      `Accepted ${quantity} repaired non-serialized items at warehouse`,
    quantity,
    updatedBy: acceptedBy,
    transferStatus: "accepted",
    destinationOutlet: outletId,
    acceptedAt: new Date(),
    acceptedBy,
  });

  this.updateStatusAndQuantities();

  return {
    success: true,
    acceptedQuantity: quantity,
    pendingTransferQty: this.pendingTransferQty,
    returnedQty: this.returnedQty,
    status: this.status,
  };
};

repairTransferSchema.methods.rejectPendingTransfer = function (
  outletId,
  quantity,
  rejectedBy,
  reason
) {
  if (this.isSerialized) {
    throw new Error("Use serial-specific methods for serialized products");
  }

  if (quantity > this.pendingTransferQty) {
    throw new Error(
      `Cannot reject ${quantity} items. Only ${this.pendingTransferQty} pending transfer items available`
    );
  }

  let remainingToReject = quantity;
  let rejectedCount = 0;

  for (const detail of this.pendingTransferDetails || []) {
    if (
      String(detail.outletId) === String(outletId) &&
      detail.status === "pending" &&
      remainingToReject > 0
    ) {
      const toReject = Math.min(detail.quantity, remainingToReject);

      detail.status = "rejected";
      detail.rejectedAt = new Date();
      detail.rejectedBy = rejectedBy;
      detail.rejectionReason = reason;

      if (toReject < detail.quantity) {
        this.pendingTransferDetails.push({
          outletId,
          quantity: detail.quantity - toReject,
          transferredBy: detail.transferredBy,
          transferredAt: detail.transferredAt,
          remark: detail.remark,
          status: "pending",
        });
        detail.quantity = toReject;
      }

      remainingToReject -= toReject;
      rejectedCount += toReject;
    }
  }

  if (rejectedCount !== quantity) {
    throw new Error(
      `Could only reject ${rejectedCount} out of ${quantity} requested items`
    );
  }

  this.pendingTransferQty = Math.max(0, this.pendingTransferQty - quantity);
  this.repairedQty = (this.repairedQty || 0) + quantity;

  this.repairUpdates.push({
    date: new Date(),
    status: "repaired",
    remark: `Rejected ${quantity} repaired items: ${reason}`,
    quantity,
    updatedBy: rejectedBy,
    transferStatus: "rejected",
    destinationOutlet: outletId,
  });

  this.updateStatusAndQuantities();

  return {
    success: true,
    rejectedQuantity: quantity,
    pendingTransferQty: this.pendingTransferQty,
    repairedQty: this.repairedQty,
    status: this.status,
  };
};

// Single source of truth for serialized and non-serialized quantity totals.
repairTransferSchema.methods.updateStatusAndQuantities = function () {
  if (this.isSerialized && this.serialNumbers?.length > 0) {
    const count = (status) =>
      this.serialNumbers.filter((sn) => sn.status === status).length;

    this.pendingUnderRepairQty = count("pending_under_repair");
    this.underRepairQty = count("under_repair");
    this.repairedQty = count("repaired");
    this.irrepairedQty = count("irreparable");
    this.returnedQty = count("returned");
    this.pendingTransferQty = count("pending_transfer");

    const transferredCount = count("transferred");
    const calculatedTotal =
      this.pendingUnderRepairQty +
      this.underRepairQty +
      this.repairedQty +
      this.irrepairedQty +
      this.returnedQty +
      this.pendingTransferQty +
      transferredCount;

    if (calculatedTotal !== this.quantity) {
      console.warn(
        `Quantity mismatch in transfer ${this._id}: Calculated ${calculatedTotal}, Expected ${this.quantity}`
      );
    }
  }

  if (this.quantity === this.returnedQty) {
    this.status = "returned";
  } else if (this.quantity === this.repairedQty) {
    this.status = "repaired";
    this.completedAt = this.completedAt || new Date();
  } else if (this.quantity === this.irrepairedQty) {
    this.status = "irreparable";
    this.completedAt = this.completedAt || new Date();
  } else if (this.quantity === this.underRepairQty) {
    this.status = "under_repair";
  } else if (this.pendingUnderRepairQty === this.quantity) {
    this.status = "pending_under_repair";
  } else if (this.pendingUnderRepairQty > 0 && this.underRepairQty > 0) {
    this.status = "partially_accepted";
  } else if (this.repairedQty > 0 || this.irrepairedQty > 0) {
    this.status = "partially_repaired";
  } else if (this.pendingTransferQty > 0) {
    this.status = "pending_transfer";
  } else {
    this.status = "pending_under_repair";
  }
};

repairTransferSchema.methods.getQuantitySummary = function () {
  return {
    total: this.quantity,
    pendingUnderRepair: this.pendingUnderRepairQty || 0,
    underRepair: this.underRepairQty || 0,
    repaired: this.repairedQty || 0,
    irrepaired: this.irrepairedQty || 0,
    returned: this.returnedQty || 0,
    pendingTransfer: this.pendingTransferQty || 0,
    remaining:
      this.quantity -
      ((this.pendingUnderRepairQty || 0) +
        (this.underRepairQty || 0) +
        (this.repairedQty || 0) +
        (this.irrepairedQty || 0) +
        (this.returnedQty || 0) +
        (this.pendingTransferQty || 0)),
  };
};

repairTransferSchema.pre("save", function (next) {
  if (this.pendingUnderRepairQty === undefined) this.pendingUnderRepairQty = 0;
  if (this.underRepairQty === undefined) this.underRepairQty = 0;
  if (this.repairedQty === undefined) this.repairedQty = 0;
  if (this.irrepairedQty === undefined) this.irrepairedQty = 0;
  if (this.returnedQty === undefined) this.returnedQty = 0;
  if (this.pendingTransferQty === undefined) this.pendingTransferQty = 0;
  if (this.totalRepairCost === undefined) this.totalRepairCost = 0;

  if (
    !this.isSerialized &&
    this.serialNumbers &&
    this.serialNumbers.length > 0
  ) {
    console.warn(
      `Clearing serialNumbers for non-serialized transfer ${this._id}`
    );
    this.serialNumbers = [];
  }

  if (
    this.isNew &&
    this.pendingUnderRepairQty === 0 &&
    this.status === "pending_under_repair"
  ) {
    this.pendingUnderRepairQty = this.quantity;
  }

  this.updateStatusAndQuantities();
  next();
});

export default mongoose.model("RepairTransfer", repairTransferSchema);
