const mongoose = require("mongoose");

const disputeMessageSchema = new mongoose.Schema(
  {
    disputeId: { type: mongoose.Schema.Types.ObjectId, ref: "Dispute", required: true, index: true },

    senderRole: { type: String, enum: ["customer", "vendor", "admin"], required: true, index: true },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    message: { type: String, required: true, trim: true },
    attachments: { type: [String], default: [] }, // URLs
  },
  { timestamps: true }
);

disputeMessageSchema.index({ disputeId: 1, createdAt: 1 });

module.exports = mongoose.model("DisputeMessage", disputeMessageSchema);