const mongoose = require("mongoose");

const broadcastCampaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },

    // in-app now; later can also push
    channels: { type: [String], enum: ["in_app", "push"], default: ["in_app"] },

    target: {
      scope: { type: String, enum: ["all", "customers", "vendors", "admins", "custom"], default: "all", index: true },
      vendorIds: { type: [mongoose.Schema.Types.ObjectId], ref: "Vendor", default: [] },
      userIds: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    },

    deepLink: { type: String, default: "" },

    status: { type: String, enum: ["draft", "scheduled", "sent", "cancelled"], default: "draft", index: true },
    scheduledAt: { type: Date, default: null, index: true },
    sentAt: { type: Date, default: null },

    stats: {
      plannedRecipients: { type: Number, default: 0 },
      sentInApp: { type: Number, default: 0 },
      sentPush: { type: Number, default: 0 },
    },

    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

broadcastCampaignSchema.index({ status: 1, scheduledAt: 1 });

module.exports = mongoose.model("BroadcastCampaign", broadcastCampaignSchema);