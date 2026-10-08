import mongoose from "mongoose";
import Counter from "./Counter.js";

const raisePOSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },

    voucherNo: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },

    outlet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: true,
    },

    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },

        price: {
          type: Number,
          required: true,
          min: 0,
        },

        availableQuantity: {
          type: Number,
          required: true,
          min: 0,
          default: 0,
        },

        purchasedQuantity: {
          type: Number,
          required: true,
          min: 1,
        },
      },
    ],

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    approvedAt: {
      type: Date,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

function getFinancialYear(date) {
  const year = date.getFullYear();
  const month = date.getMonth();

  if (month >= 3) {
    return `${year.toString().slice(-2)}-${(year + 1)
      .toString()
      .slice(-2)}`;
  }

  return `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
}

raisePOSchema.pre("save", async function (next) {
  if (!this.voucherNo) {
    try {
      const currentDate = this.date || new Date();
      const financialYear = getFinancialYear(currentDate);

      const counter = await Counter.findOneAndUpdate(
        {
          name: "raisePO",
          financialYear,
        },
        {
          $inc: { sequence: 1 },
        },
        {
          upsert: true,
          new: true,
        }
      );

      const sequenceStr = counter.sequence.toString().padStart(2, "0");

      this.voucherNo = `STELE/${sequenceStr}/${financialYear}`;

      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

export default mongoose.model("RaisePO", raisePOSchema);