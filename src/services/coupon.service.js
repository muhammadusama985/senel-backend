const Coupon = require("../models/Coupon");
const { isCouponActive, calcDiscount, clampMoney } = require("../utils/coupons");

async function findCouponByCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return null;
  return Coupon.findOne({ code: normalized }).lean();
}

function computeVendorBuckets(cart) {
  // returns Map(vendorId => subtotal)
  const buckets = new Map();
  for (const item of cart.items || []) {
    const vId = String(item.vendorId);
    const prev = buckets.get(vId) || 0;
    buckets.set(vId, prev + Number(item.lineTotal || 0));
  }
  // normalize to money
  for (const [k, v] of buckets.entries()) buckets.set(k, clampMoney(v));
  return buckets;
}

/**
 * Computes discount based on coupon scope:
 * - global: discount applies to cart.subtotal
 * - vendor: discount applies to subtotal of that vendor bucket only
 */
function computeCartDiscount(cart, coupon) {
  const subtotal = clampMoney(cart.subtotal || 0);
  if (!coupon) return { discountTotal: 0, vendorDiscounts: {} };
  if (!isCouponActive(coupon)) return { discountTotal: 0, vendorDiscounts: {} };

  const buckets = computeVendorBuckets(cart);
  const vendorDiscounts = {}; // vendorId -> discount

  if (coupon.scope === "global") {
    if (subtotal < Number(coupon.minSubtotal || 0)) return { discountTotal: 0, vendorDiscounts: {} };

    const discountTotal = calcDiscount({
      discountType: coupon.discountType,
      value: coupon.value,
      baseAmount: subtotal,
      maxDiscount: coupon.maxDiscount || 0,
    });

    // Allocate global discount proportionally to vendor buckets (for vendorOrders)
    if (discountTotal > 0 && subtotal > 0) {
      for (const [vendorId, vSubtotal] of buckets.entries()) {
        const share = (vSubtotal / subtotal) * discountTotal;
        vendorDiscounts[vendorId] = clampMoney(share);
      }

      // Fix rounding drift by adjusting last vendor
      const sumAlloc = clampMoney(Object.values(vendorDiscounts).reduce((s, x) => s + x, 0));
      const drift = clampMoney(discountTotal - sumAlloc);
      if (drift !== 0) {
        const lastKey = Array.from(buckets.keys()).pop();
        vendorDiscounts[lastKey] = clampMoney((vendorDiscounts[lastKey] || 0) + drift);
      }
    }

    return { discountTotal, vendorDiscounts };
  }

  if (coupon.scope === "vendor") {
    const vendorId = coupon.vendorId ? String(coupon.vendorId) : "";
    if (!vendorId) return { discountTotal: 0, vendorDiscounts: {} };

    const base = buckets.get(vendorId) || 0;
    if (base < Number(coupon.minSubtotal || 0)) return { discountTotal: 0, vendorDiscounts: {} };

    const discountTotal = calcDiscount({
      discountType: coupon.discountType,
      value: coupon.value,
      baseAmount: base,
      maxDiscount: coupon.maxDiscount || 0,
    });

    if (discountTotal > 0) vendorDiscounts[vendorId] = discountTotal;
    return { discountTotal, vendorDiscounts };
  }

  return { discountTotal: 0, vendorDiscounts: {} };
}

module.exports = { findCouponByCode, computeCartDiscount };