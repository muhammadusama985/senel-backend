const mongoose = require("mongoose");

const REVIEW_STATUS = ["pending", "approved", "rejected", "hidden"];

const reviewSchema = new mongoose.Schema(
  {
    // author
    customerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // what is being reviewed (one of these required)
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", index: true, default: null },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", index: true, default: null },

    // proof of purchase link (optional but good for auditing)
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", index: true, default: null },
    orderItemId: { type: mongoose.Schema.Types.ObjectId, ref: "OrderItem", index: true, default: null },

    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: "", trim: true },
    comment: { type: String, default: "", trim: true },

    status: { type: String, enum: REVIEW_STATUS, default: "pending", index: true },

    moderatedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    moderatedAt: { type: Date, default: null },
    moderationNote: { type: String, default: "" },
  },
  { timestamps: true }
);

// One review per customer per product (baseline). If you want per-order reviews, change this.
reviewSchema.index(
  { customerUserId: 1, productId: 1 },
  { unique: true, partialFilterExpression: { productId: { $type: "objectId" } } }
);
reviewSchema.index(
  { customerUserId: 1, vendorId: 1 },
  { unique: true, partialFilterExpression: { vendorId: { $type: "objectId" } } }
);

module.exports = mongoose.model("Review", reviewSchema);