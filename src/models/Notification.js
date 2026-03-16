const mongoose = require("mongoose");

const TARGET_ROLE = ["admin", "vendor", "customer", "all"];

const notificationSchema = new mongoose.Schema(
  {
    targetRole: { type: String, enum: TARGET_ROLE, default: "all", index: true },

    // One of these will be set:
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    targetVendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", index: true },

    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },

    type: { type: String, default: "system", index: true }, // "order", "payout", "announcement"
    data: { type: Object, default: {} }, // e.g. { orderId, vendorOrderId }

    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  { timestamps: true }
);

notificationSchema.index({ targetUserId: 1, createdAt: -1 });
notificationSchema.index({ targetVendorId: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);