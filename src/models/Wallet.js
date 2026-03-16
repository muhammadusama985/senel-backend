const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, unique: true, index: true },

    // Derived from ledger (we also store to read fast)
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "EUR" }, // adjust later
  },
  { timestamps: true }
);

module.exports = mongoose.model("Wallet", walletSchema);