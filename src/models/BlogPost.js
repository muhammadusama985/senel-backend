const mongoose = require("mongoose");

const mlString = {
  en: { type: String, default: "" },
  de: { type: String, default: "" },
  tr: { type: String, default: "" },
};

const blogPostSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },

    coverImageUrl: { type: String, default: "" },
    tags: { type: [String], default: [] },

    titleML: mlString,
    summaryML: mlString,
    contentML: mlString,

    authorName: { type: String, default: "" },

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

module.exports = mongoose.model("BlogPost", blogPostSchema);