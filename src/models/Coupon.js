const mongoose = require("mongoose");

const DISCOUNT_TYPE = ["percent", "fixed"];
const COUPON_SCOPE = ["global", "vendor"]; // global: applies to whole cart, vendor: applies to one vendor bucket

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true, index: true },

    scope: { type: String, enum: COUPON_SCOPE, required: true, index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null, index: true }, // required if scope=vendor

    discountType: { type: String, enum: DISCOUNT_TYPE, required: true },
    value: { type: Number, required: true, min: 0 }, // percent 0-100 or fixed amount

    minSubtotal: { type: Number, default: 0, min: 0 }, // minimum subtotal required (scope-based)
    maxDiscount: { type: Number, default: 0, min: 0 }, // 0 = no cap (percent only recommended)

    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },

    isActive: { type: Boolean, default: true, index: true },

    usageLimitTotal: { type: Number, default: 0, min: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0, min: 0 },

    usageLimitPerUser: { type: Number, default: 0, min: 0 }, // 0 = unlimited
  },
  { timestamps: true }
);

module.exports = mongoose.model("Coupon", couponSchema);