const mongoose = require("mongoose");

const mlString = {
  en: { type: String, default: "" },
  de: { type: String, default: "" },
  tr: { type: String, default: "" },
};

const pageSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },

    titleML: mlString,
    contentML: mlString,

    seo: {
      metaTitleML: mlString,
      metaDescriptionML: mlString,
      keywords: { type: [String], default: [] },
    },

    isPublished: { type: Boolean, default: false, index: true },
    publishedAt: { type: Date, default: null },

    createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Page", pageSchema);