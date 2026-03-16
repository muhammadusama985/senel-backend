const mongoose = require("mongoose");

const mlString = {
  en: { type: String, default: "" },
  de: { type: String, default: "" },
  tr: { type: String, default: "" },
};

const announcementSchema = new mongoose.Schema(
  {
    titleML: mlString,
    bodyML: mlString,

    // audience
    target: {
      scope: { type: String, enum: ["all", "customers", "vendors", "admins", "custom"], default: "all", index: true },
      vendorIds: { type: [mongoose.Schema.Types.ObjectId], ref: "Vendor", default: [] },
      userIds: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    },

    deepLink: { type: String, default: "" },
    attachments: { type: [String], default: [] },

    status: { type: String, enum: ["draft", "published", "archived"], default: "draft", index: true },
    publishedAt: { type: Date, default: null },

    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

announcementSchema.index({ status: 1, publishedAt: -1 });

module.exports = mongoose.model("Announcement", announcementSchema);