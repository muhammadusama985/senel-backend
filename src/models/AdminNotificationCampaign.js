const mongoose = require("mongoose");

const TARGET = ["all", "customer", "vendor", "admin"];

const campaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },

    targetRole: { type: String, enum: TARGET, default: "all", index: true },

    status: { type: String, enum: ["draft", "sent"], default: "draft", index: true },
    sentAt: { type: Date, default: null },

    deepLink: { type: String, default: "" },

    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminNotificationCampaign", campaignSchema);