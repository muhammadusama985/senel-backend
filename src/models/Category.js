const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },

    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null, index: true },

    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },

    // optional marketing fields for later
    imageUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categorySchema);