const mongoose = require("mongoose");

const DISPUTE_STATUS = ["open", "in_progress", "resolved", "closed"];
const DISPUTE_REASON = [
  "missing_items",
  "damaged_items",
  "wrong_items",
  "late_delivery",
  "quality_issue",
  "payment_issue",
  "other",
];

const disputeSchema = new mongoose.Schema(
  {
    disputeNumber: { type: String, required: true, unique: true, index: true },

    customerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    vendorOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "VendorOrder", default: null, index: true },

    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null, index: true },
    orderItemId: { type: mongoose.Schema.Types.ObjectId, ref: "OrderItem", default: null, index: true },

    reason: { type: String, enum: DISPUTE_REASON, default: "other", index: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },

    attachments: { type: [String], default: [] }, // URLs

    status: { type: String, enum: DISPUTE_STATUS, default: "open", index: true },

    lastMessageAt: { type: Date, default: null, index: true },
    lastMessageByRole: { type: String, enum: ["customer", "vendor", "admin"], default: "customer" },

    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },

    adminAssignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  },
  { timestamps: true }
);

disputeSchema.index({ vendorId: 1, createdAt: -1 });
disputeSchema.index({ customerUserId: 1, createdAt: -1 });

module.exports = mongoose.model("Dispute", disputeSchema);