const mongoose = require("mongoose");

const STATUS = ["pending", "approved", "rejected"];

const categoryRequestSchema = new mongoose.Schema(
  {
    // Vendor who is requesting the new category
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },

    // The category details the vendor is asking for
    name: { type: String, required: true, trim: true, minlength: 2 },
    slug: { type: String, required: true, trim: true, lowercase: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    description: { type: String, default: "" },

    // Admin-side
    status: { type: String, enum: STATUS, default: "pending", index: true },
    adminNote: { type: String, default: "" },
    reviewedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },

    // If approved, this links to the resulting Category doc
    createdCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
  },
  { timestamps: true }
);

categoryRequestSchema.index({ vendorId: 1, createdAt: -1 });
categoryRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("CategoryRequest", categoryRequestSchema);
