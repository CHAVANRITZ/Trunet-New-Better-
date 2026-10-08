import mongoose from "mongoose";

const counterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  financialYear: {
    type: String,
    required: true,
  },
  sequence: {
    type: Number,
    default: 0,
  },
});

// Compound index to ensure unique combination
counterSchema.index(
  { name: 1, financialYear: 1 },
  { unique: true }
);

export default mongoose.model("Counter", counterSchema);