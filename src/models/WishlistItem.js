const mongoose = require("mongoose");

const wishlistItemSchema = new mongoose.Schema(
  {
    customerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true }, // denormalized for filtering
  },
  { timestamps: true }
);

wishlistItemSchema.index({ customerUserId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model("WishlistItem", wishlistItemSchema);