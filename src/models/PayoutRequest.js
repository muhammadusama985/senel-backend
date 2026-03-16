const mongoose = require("mongoose");

const PAYOUT_STATUS = ["requested", "approved", "rejected", "paid", "cancelled"];

const payoutRequestSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true, index: true },

    amount: { type: Number, required: true, min: 1 },

    status: { type: String, enum: PAYOUT_STATUS, default: "requested", index: true },

    // Vendor payout details snapshot (you can expand later)
    payoutMethod: { type: String, enum: ["bank_transfer"], default: "bank_transfer" },
    payoutDetails: { type: Object, default: {} },

    requestedNote: { type: String, default: "" },

    reviewedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    reviewNote: { type: String, default: "" },

    paidAt: { type: Date },
    externalReference: { type: String, default: "" }, // e.g. bank txn id
  },
  { timestamps: true }
);

module.exports = mongoose.model("PayoutRequest", payoutRequestSchema);
