import mongoose from "mongoose";

const outletStockSchema = new mongoose.Schema(
  {
    outlet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
      validate: {
        validator: async function (outletId) {
          const Center = mongoose.model("Center");
          const outlet = await Center.findById(outletId);
          return outlet && outlet.centerType === "Outlet";
        },
        message: "Must be a valid Outlet center",
      },
    },

    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    totalQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    availableQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    pendingTestingQty: {
      type: Number,
      default: 0,
      min: 0,
    },

    inTransitQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    pendingRepairedQty: {
      type: Number,
      default: 0,
      min: 0,
    },

    repairedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    pendingTransferToReseller: {
      type: Number,
      default: 0,
      min: 0,
    },

    pendingTransfers: [
      {
        resellerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Reseller",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        serialNumbers: [
          {
            serialNumber: String,
            status: String,
          },
        ],
        transferDate: {
          type: Date,
          default: Date.now,
        },
        transferredBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        transferRemark: String,
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

    transferredRepairedQty: {
      type: Number,
      default: 0,
      min: 0,
    },

    pendingSerials: [
      {
        serialNumber: {
          type: String,
          required: true,
          trim: true,
        },
        status: {
          type: String,
          enum: [
            "pending_transfer",
            "pending_approval",
            "accepted",
            "rejected",
          ],
          default: "pending_transfer",
        },
        repairTransferId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "RepairTransfer",
          required: true,
        },
        transferredDate: {
          type: Date,
          default: Date.now,
        },
        transferredBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        remark: {
          type: String,
          trim: true,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    serialNumbers: [
      {
        serialNumber: {
          type: String,
          required: true,
          trim: true,
        },

        // Purchase stock requires a purchase reference.
        // Repaired stock does not necessarily originate from a purchase.
        purchaseId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "StockPurchase",
          required: function () {
            return this.sourceType === "purchase";
          },
        },

        status: {
          type: String,
          enum: [
            "available",
            "in_transit",
            "transferred",
            "sold",
            "returned",
            "pending_approval",
            "pending_transfer",
            "pending_testing",
            "under_testing",
          ],
          default: "available",
        },

        sourceType: {
          type: String,
          enum: ["purchase", "repair_return", "transfer"],
          default: "purchase",
        },

        currentLocation: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Center",
        },

        transferHistory: [
          {
            fromCenter: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Center",
            },
            toCenter: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Center",
            },
            toReseller: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "Reseller",
            },
            transferDate: Date,
            transferType: {
              type: String,
              enum: [
                "outlet_to_center",
                "center_to_center",
                "field_usage",
                "outlet_to_reseller",
                "outlet_to_testing",
              ],
            },
          },
        ],
      },
    ],

    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

outletStockSchema.index({ outlet: 1, product: 1 }, { unique: true });

outletStockSchema.index({ "serialNumbers.serialNumber": 1 });

outletStockSchema.statics.updateStock = async function (
  outletId,
  productId,
  quantity,
  serialNumbers = [],
  purchaseId
) {
  const updateData = {
    $inc: {
      totalQuantity: quantity,
      availableQuantity: quantity,
    },
    $set: {
      lastUpdated: new Date(),
    },
  };

  if (serialNumbers.length > 0) {
    const serialsToAdd = serialNumbers.map((serial) => ({
      serialNumber: serial.serialNumber || serial,
      purchaseId,
      status: "available",
      sourceType: "purchase",
      currentLocation: outletId,
      transferHistory: [],
    }));

    updateData.$push = {
      serialNumbers: { $each: serialsToAdd },
    };
  }

  return this.findOneAndUpdate(
    { outlet: outletId, product: productId },
    updateData,
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );
};

outletStockSchema.methods.validateAndGetSerials = function (
  requestedSerials,
  currentLocation
) {
  try {
    const availableSerials = [];

    for (const requestedSerial of requestedSerials) {
      const serial = this.serialNumbers.find(
        (sn) =>
          sn.serialNumber === requestedSerial &&
          sn.status === "available" &&
          sn.currentLocation?.toString() === currentLocation.toString()
      );

      if (serial) {
        availableSerials.push(requestedSerial);
      }
    }

    return availableSerials;
  } catch (error) {
    throw new Error(`Error validating serial numbers: ${error.message}`);
  }
};

outletStockSchema.methods.getAvailableSerials = function (
  requestedSerials,
  currentLocation
) {
  return this.validateAndGetSerials(requestedSerials, currentLocation);
};

outletStockSchema.methods.getFIFOStock = function (quantity) {
  const availableSerials = this.serialNumbers
    .filter((sn) => sn.status === "available")
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, quantity);

  return {
    availableQuantity: this.availableQuantity,
    availableSerials: availableSerials.map((sn) => ({
      serialNumber: sn.serialNumber,
      purchaseId: sn.purchaseId,
    })),
  };
};

outletStockSchema.pre("save", function (next) {
  if (this.inTransitQuantity < 0) {
    console.warn(
      `inTransitQuantity was ${this.inTransitQuantity}, resetting to 0`
    );
    this.inTransitQuantity = 0;
  }

  if (this.availableQuantity < 0) {
    console.warn(
      `availableQuantity was ${this.availableQuantity}, resetting to 0`
    );
    this.availableQuantity = 0;
  }

  this.lastUpdated = new Date();
  next();
});

outletStockSchema.methods.transferStock = async function (
  toCenter,
  quantity,
  serialNumbers = [],
  transferType = "outlet_to_center"
) {
  if (this.availableQuantity < quantity) {
    throw new Error("Insufficient stock available");
  }

  const transferredSerials = [];

  if (serialNumbers.length > 0) {
    for (const serialNumber of serialNumbers) {
      const serial = this.serialNumbers.find(
        (sn) =>
          sn.serialNumber === serialNumber &&
          sn.status === "available"
      );

      if (!serial) {
        throw new Error(`Serial number ${serialNumber} not available`);
      }

      serial.status = "transferred";
      serial.currentLocation = toCenter;

      const transferRecord = {
        fromCenter: this.outlet,
        transferDate: new Date(),
        transferType,
      };

      if (transferType === "outlet_to_reseller") {
        transferRecord.toReseller = toCenter;
      } else {
        transferRecord.toCenter = toCenter;
      }

      serial.transferHistory.push(transferRecord);
      transferredSerials.push(serialNumber);
    }
  } else {
    const availableSerials = this.serialNumbers
      .filter((sn) => sn.status === "available")
      .slice(0, quantity);

    for (const serial of availableSerials) {
      serial.status = "transferred";
      serial.currentLocation = toCenter;

      const transferRecord = {
        fromCenter: this.outlet,
        transferDate: new Date(),
        transferType,
      };

      if (transferType === "outlet_to_reseller") {
        transferRecord.toReseller = toCenter;
      } else {
        transferRecord.toCenter = toCenter;
      }

      serial.transferHistory.push(transferRecord);
      transferredSerials.push(serial.serialNumber);
    }

    if (availableSerials.length === 0) {
      console.log(
        `Non-serialized transfer: ${quantity} units of product ${this.product}`
      );
    }
  }

  this.availableQuantity -= quantity;
  this.totalQuantity -= quantity;

  await this.save();

  return transferredSerials;
};

export default mongoose.model("OutletStock", outletStockSchema);