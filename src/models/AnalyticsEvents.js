const mongoose = require("mongoose");

const EVENT_TYPES = [
  "CART_CREATED",
  "CART_ADD_ITEM",
  "CART_REMOVE_ITEM",
  "CHECKOUT_STARTED",
  "ORDER_PLACED",
  "VENDOR_ORDER_DELIVERED",
];

const analyticsEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: EVENT_TYPES, required: true, index: true },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", index: true },

    cartId: { type: mongoose.Schema.Types.ObjectId, ref: "Cart", index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", index: true },
    vendorOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "VendorOrder", index: true },

    meta: { type: Object, default: {} }, // qty, totals, coupon etc.
  },
  { timestamps: true }
);

analyticsEventSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model("AnalyticsEvent", analyticsEventSchema);