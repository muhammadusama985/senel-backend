const mongoose = require("mongoose");

const couponRedemptionSchema = new mongoose.Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // how many times this user has consumed this coupon (count only after successful checkout)
    usedCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// one document per (couponId, userId)
couponRedemptionSchema.index({ couponId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("CouponRedemption", couponRedemptionSchema);