const mongoose = require("mongoose");

const recentlyViewedSchema = new mongoose.Schema(
  {
    customerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        // Admin/platform products may not belong to a vendor.
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null },
        viewedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("RecentlyViewed", recentlyViewedSchema);
