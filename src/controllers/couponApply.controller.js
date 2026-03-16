const { z } = require("zod");
const Cart = require("../models/Cart");
const CouponRedemption = require("../models/CouponRedemption");
const Coupon = require("../models/Coupon");
const { findCouponByCode, computeCartDiscount } = require("../services/coupon.service");

async function getOrCreateCart(customerUserId) {
  let cart = await Cart.findOne({ customerUserId });
  if (!cart) cart = await Cart.create({ customerUserId, items: [] });
  return cart;
}

function recomputeTotals(cart) {
  // cart.subtotal already maintained by cart module; but ensure discount/grand are correct
  const subtotal = Number(cart.subtotal || 0);
  const discount = Number(cart.discountTotal || 0);
  cart.grandTotal = Number(Math.max(0, subtotal - discount).toFixed(2));
}

const applySchema = z.object({ code: z.string().min(1) });

async function applyCoupon(req, res) {
  const body = applySchema.parse(req.body);
  const cart = await getOrCreateCart(req.user._id);

  if (!cart.items.length) return res.status(400).json({ message: "Cart is empty" });

  const coupon = await findCouponByCode(body.code);
  if (!coupon) return res.status(404).json({ message: "Coupon not found" });

  // Validate vendor coupons have vendorId
  if (coupon.scope === "vendor" && !coupon.vendorId) {
    return res.status(400).json({ message: "Invalid vendor coupon" });
  }

  // (Optional) enforce usage limits here — baseline: only total usage
  if (coupon.usageLimitTotal && coupon.usedCount >= coupon.usageLimitTotal) {
    return res.status(400).json({ message: "Coupon usage limit reached" });
  }

  // Per-user usage check (preview stage)
  if (coupon.usageLimitPerUser && coupon.usageLimitPerUser > 0) {
    const red = await CouponRedemption.findOne({ couponId: coupon._id, userId: req.user._id }).lean();
    const usedByUser = red?.usedCount || 0;

    if (usedByUser >= coupon.usageLimitPerUser) {
      return res.status(400).json({ message: "You have already used this coupon the maximum number of times" });
    }
  }

  // Compute discount
  const { discountTotal } = computeCartDiscount(cart, coupon);
  if (discountTotal <= 0) return res.status(400).json({ message: "Coupon not applicable to your cart" });

  cart.appliedCoupon = {
    code: coupon.code,
    couponId: coupon._id,
    scope: coupon.scope,
    vendorId: coupon.vendorId || null,
    discountType: coupon.discountType,
    value: coupon.value,
    discountTotal,
  };

  cart.discountTotal = discountTotal;
  recomputeTotals(cart);

  await cart.save();
  res.json({ cart });
}

async function removeCoupon(req, res) {
  const cart = await getOrCreateCart(req.user._id);

  cart.appliedCoupon = {
    code: "",
    couponId: null,
    scope: "",
    vendorId: null,
    discountType: "",
    value: 0,
    discountTotal: 0,
  };
  cart.discountTotal = 0;
  cart.grandTotal = Number(cart.subtotal || 0);

  await cart.save();
  res.json({ cart });
}

async function listActiveCoupons(req, res) {
  const now = new Date();
  const items = await Coupon.find({
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.json({
    items: items.map((c) => ({
      code: c.code,
      scope: c.scope,
      vendorId: c.vendorId || null,
      discountType: c.discountType,
      value: c.value,
      minSubtotal: c.minSubtotal || 0,
      maxDiscount: c.maxDiscount || 0,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
    })),
  });
}

module.exports = { applyCoupon, removeCoupon, listActiveCoupons };
