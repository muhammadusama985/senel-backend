const mongoose = require("mongoose");

const preferredSupplierSchema = new mongoose.Schema(
  {
    customerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
  },
  { timestamps: true }
);

preferredSupplierSchema.index({ customerUserId: 1, vendorId: 1 }, { unique: true });

module.exports = mongoose.model("PreferredSupplier", preferredSupplierSchema);