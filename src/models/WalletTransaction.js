const mongoose = require("mongoose");

const TX_KIND = ["EARNING_CREDIT", "PAYOUT_DEBIT", "ADJUSTMENT_CREDIT", "ADJUSTMENT_DEBIT"];

const walletTransactionSchema = new mongoose.Schema(
  {
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },

    kind: { type: String, enum: TX_KIND, required: true, index: true },

    amount: { type: Number, required: true }, // credit = +, debit = -
    balanceAfter: { type: Number, required: true, min: 0 },

    note: { type: String, default: "" },

    referenceType: { type: String, default: "" }, // e.g. "VendorOrder", "PayoutRequest"
    referenceId: { type: mongoose.Schema.Types.ObjectId }, // the linked entity id (if any)

    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // for admin adjustments
  },
  { timestamps: true }
);

// Idempotency constraint for order earnings:
// One EARNING_CREDIT per VendorOrder
walletTransactionSchema.index(
  { vendorId: 1, kind: 1, referenceType: 1, referenceId: 1 },
  { unique: true, partialFilterExpression: { kind: "EARNING_CREDIT", referenceType: "VendorOrder" } }
);

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);