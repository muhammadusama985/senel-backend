function isCouponActive(coupon, now = new Date()) {
  if (!coupon?.isActive) return false;
  if (coupon.startsAt && now < new Date(coupon.startsAt)) return false;
  if (coupon.endsAt && now > new Date(coupon.endsAt)) return false;
  return true;
}

function clampMoney(n) {
  const x = Number(n || 0);
  return Number(x.toFixed(2));
}

function calcDiscount({ discountType, value, baseAmount, maxDiscount = 0 }) {
  baseAmount = clampMoney(baseAmount);
  if (baseAmount <= 0) return 0;

  let discount = 0;
  if (discountType === "percent") {
    const pct = Math.max(0, Math.min(100, Number(value)));
    discount = (pct / 100) * baseAmount;
  } else if (discountType === "fixed") {
    discount = Math.max(0, Number(value));
  }

  if (maxDiscount && maxDiscount > 0) discount = Math.min(discount, maxDiscount);
  discount = Math.min(discount, baseAmount); // never exceed subtotal
  return clampMoney(discount);
}

module.exports = { isCouponActive, calcDiscount, clampMoney };