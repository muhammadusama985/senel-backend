const mongoose = require("mongoose");

const mlString = {
  en: { type: String, default: "" },
  de: { type: String, default: "" },
  tr: { type: String, default: "" },
};

const bannerSchema = new mongoose.Schema(
  {
    placement: { type: String, required: true, default: "HOME_TOP", index: true }, // e.g. HOME_TOP
    priority: { type: Number, default: 0, index: true },

    imageUrl: { type: String, required: true },
    imageUrlMobile: { type: String, default: "" },

    titleML: mlString,
    subtitleML: mlString,
    ctaTextML: mlString,
    ctaUrl: { type: String, default: "" },

    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },

    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Banner", bannerSchema);
