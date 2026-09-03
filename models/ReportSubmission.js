import mongoose from "mongoose";

const productItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product is required"],
    },
    productQty: {
      type: Number,
      required: [true, "Product quantity is required"],
      min: [0, "Product quantity cannot be negative"],
    },
    damageQty: {
      type: Number,
      required: [true, "Damage quantity is required"],
      min: [0, "Damage quantity cannot be negative"],
      default: 0,
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [200, "Comment cannot exceed 200 characters"],
    },
  },
  { _id: true }
);

const stockClosingSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, "Date is required"],
      default: Date.now,
    },
    stockClosingForOtherCenter: {
      type: Boolean,
      required: [true, "Stock closing for other center flag is required"],
      default: false,
    },
    center: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: function () {
        return this.stockClosingForOtherCenter === true;
      },
    },
    closingCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Center",
      required: [true, "Closing center is required"],
    },
    linkedStockClosing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockClosing",
    },
    products: [productItemSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by user is required"],
    },
    status: {
      type: String,
      enum: ["Draft", "Submitted", "Approved", "Duplicate"],
      default: "Draft",
    },
    totalProductQty: {
      type: Number,
      default: 0,
    },
    totalDamageQty: {
      type: Number,
      default: 0,
    },
    remark: {
      type: String,
      trim: true,
      maxlength: [500, "Remark cannot exceed 500 characters"],
    },
    approvedRemark: {
      type: String,
      trim: true,
      maxlength: [500, "Approved remark cannot exceed 500 characters"],
    },
    // NEW FIELDS: Track which month/year this report belongs to
    reportMonth: {
      type: Number,
      min: 1,
      max: 12,
      required: [true, "Report month is required"],
      default: function() {
        const date = this.date || new Date();
        return date.getMonth() + 1; // 1-12 (January = 1)
      }
    },
    reportYear: {
      type: Number,
      required: [true, "Report year is required"],
      default: function() {
        const date = this.date || new Date();
        return date.getFullYear();
      }
    }
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
stockClosingSchema.index({ date: 1, closingCenter: 1 });
stockClosingSchema.index({ date: 1, center: 1 });
stockClosingSchema.index({ "products.product": 1 });
stockClosingSchema.index({ stockClosingForOtherCenter: 1 });
stockClosingSchema.index({ closingCenter: 1 });
stockClosingSchema.index({ linkedStockClosing: 1 });
// NEW: Indexes for month/year queries
stockClosingSchema.index({ reportMonth: 1, reportYear: 1 });
stockClosingSchema.index({ closingCenter: 1, reportMonth: 1, reportYear: 1 });

// Virtual for total quantity
stockClosingSchema.virtual("totalQty").get(function () {
  return this.totalProductQty + this.totalDamageQty;
});

// Pre-save middleware
stockClosingSchema.pre("save", function (next) {
  if (!this.products || this.products.length === 0) {
    return next(new Error("At least one product is required"));
  }

  for (const product of this.products) {
    if (product.damageQty > product.productQty) {
      return next(
        new Error(
          `Damage quantity cannot exceed product quantity for product ${product.product}`
        )
      );
    }
  }

  this.totalProductQty = this.products.reduce(
    (total, product) => total + product.productQty,
    0
  );
  this.totalDamageQty = this.products.reduce(
    (total, product) => total + product.damageQty,
    0
  );

  // Auto-set reportMonth and reportYear if not provided
  if (!this.reportMonth || !this.reportYear) {
    const date = this.date || new Date();
    this.reportMonth = date.getMonth() + 1;
    this.reportYear = date.getFullYear();
  }

  next();
});

// Set JSON and Object options
stockClosingSchema.set("toJSON", { virtuals: true });
stockClosingSchema.set("toObject", { virtuals: true });

// Static methods
stockClosingSchema.statics.findByDateRange = function (startDate, endDate) {
  return this.find({
    date: {
      $gte: startDate,
      $lte: endDate,
    },
  }).populate("center closingCenter products.product linkedStockClosing");
};

stockClosingSchema.statics.findByClosingCenter = function (
  centerId,
  startDate,
  endDate
) {
  const query = { closingCenter: centerId };

  if (startDate && endDate) {
    query.date = {
      $gte: startDate,
      $lte: endDate,
    };
  }

  return this.find(query).populate(
    "center closingCenter products.product linkedStockClosing"
  );
};

// NEW: Static method to find reports for a specific month
stockClosingSchema.statics.findByMonthAndYear = function (month, year, centerId = null) {
  const query = {
    reportMonth: month,
    reportYear: year,
    status: { $in: ["Submitted", "Approved"] }
  };
  
  if (centerId) {
    query.closingCenter = centerId;
  }
  
  return this.find(query).populate(
    "center closingCenter products.product createdBy linkedStockClosing"
  );
};

// NEW: Static method to check if a center has submitted for a specific month
stockClosingSchema.statics.hasSubmittedForMonth = async function (centerId, month, year) {
  const count = await this.countDocuments({
    closingCenter: centerId,
    reportMonth: month,
    reportYear: year,
    status: { $in: ["Submitted", "Approved"] }
  });
  return count > 0;
};

// Instance methods
stockClosingSchema.methods.isForOtherCenter = function () {
  return this.stockClosingForOtherCenter;
};

stockClosingSchema.methods.getClosingCenter = function () {
  return this.closingCenter;
};

// NEW: Get the month name
stockClosingSchema.methods.getMonthName = function () {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  return monthNames[this.reportMonth - 1];
};

// NEW: Get formatted report period
stockClosingSchema.methods.getReportPeriod = function () {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[this.reportMonth - 1]} ${this.reportYear}`;
};

export default mongoose.model("StockClosing", stockClosingSchema);
