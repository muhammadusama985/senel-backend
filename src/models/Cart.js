const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null, index: true },

    // Variant handling
    variantSku: { type: String, default: "", trim: true }, // empty for non-variant products
    variantAttributes: { type: Object, default: {} },

    qty: { type: Number, required: true, min: 1 },

    // Snapshot pricing (truth recalculated server-side on every change)
    unitPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["EUR", "TRY", "USD"], default: "EUR" },
    tierMinQtyApplied: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },

    // Snapshot product info for UX (optional but useful)
    title: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: "" },

      // ✅ ADD THIS: Manual shipping flag
    requiresManualShipping: { type: Boolean, default: false },
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    customerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },

    items: { type: [cartItemSchema], default: [] },

    // Totals
    subtotal: { type: Number, default: 0, min: 0 },
    totalItems: { type: Number, default: 0, min: 0 },
    appliedCoupon: {
  code: { type: String, default: "" },
  couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
  scope: { type: String, default: "" }, // "global" | "vendor"
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
  discountType: { type: String, default: "" }, // "percent" | "fixed"
  value: { type: Number, default: 0 },
  discountTotal: { type: Number, default: 0, min: 0 }, // computed
},
discountTotal: { type: Number, default: 0, min: 0 },
grandTotal: { type: Number, default: 0, min: 0 },

    // Later modules:
    // couponsApplied: []
    // shippingEstimate: {}
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cart", cartSchema);
