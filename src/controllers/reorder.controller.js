const { z } = require("zod");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const Product = require("../models/Product");
const Cart = require("../models/Cart");
const Vendor = require("../models/Vendor");
const { getTierPrice } = require("../utils/pricing");

const schema = z.object({ orderId: z.string().min(1), mode: z.enum(["merge", "replace"]).optional() });

async function reorder(req, res) {
  const body = schema.parse(req.body);
  const mode = body.mode || "merge";

  const order = await Order.findOne({ _id: body.orderId, customerUserId: req.user._id }).lean();
  if (!order) return res.status(404).json({ message: "Order not found" });

  const items = await OrderItem.find({ orderId: order._id }).lean();
  if (!items.length) return res.status(400).json({ message: "Order has no items" });

  let cart = await Cart.findOne({ customerUserId: req.user._id });
  if (!cart) cart = await Cart.create({ customerUserId: req.user._id, items: [] });

  if (mode === "replace") {
    cart.items = [];
    cart.subtotal = 0;
    cart.discountTotal = 0;
    cart.grandTotal = 0;
    cart.appliedCoupon = { code: "", couponId: null, scope: "", vendorId: null, discountType: "", value: 0, discountTotal: 0 };
  }

  const unavailableItems = [];

  for (const oi of items) {
    const p = await Product.findById(oi.productId).lean();
    if (!p || p.status !== "approved") {
      unavailableItems.push({ productId: oi.productId, reason: "Product not available" });
      continue;
    }

    const vendor = await Vendor.findById(p.vendorId).lean();
    if (vendor && vendor.status !== "approved") {
      unavailableItems.push({ productId: oi.productId, reason: "Vendor not available" });
      continue;
    }

    const variantSku = p.hasVariants ? (oi.variantSku || "") : "";
    if (p.hasVariants && !variantSku) {
      unavailableItems.push({ productId: oi.productId, reason: "Variant selection required" });
      continue;
    }

    const availableStock = p.hasVariants
      ? Number((p.variants || []).find((variant) => variant.sku === variantSku)?.stockQty || 0)
      : Number(p.stockQty || 0);
    if (availableStock <= 0) {
      unavailableItems.push({ productId: oi.productId, reason: "Out of stock" });
      continue;
    }

    const qty = Math.min(Number(oi.qty || 0), availableStock);
    if (qty < Number(p.moq || 1)) {
      unavailableItems.push({ productId: oi.productId, reason: "MOQ cannot be met with current stock" });
      continue;
    }

    const tier = getTierPrice(p.priceTiers, qty);
    if (!tier) {
      unavailableItems.push({ productId: oi.productId, reason: "Pricing is unavailable" });
      continue;
    }

    const existing = cart.items.find(
      (x) => String(x.productId) === String(p._id) && String(x.variantSku || "") === variantSku
    );

    if (existing) {
      existing.qty += qty;
      const updatedTier = getTierPrice(p.priceTiers, existing.qty);
      existing.unitPrice = Number(updatedTier?.unitPrice || tier.unitPrice);
      existing.currency = p.currency || "EUR";
      existing.tierMinQtyApplied = Number(updatedTier?.minQty || tier.minQty);
      existing.moq = Number(p.moq || 1);
      existing.variantSku = variantSku;
      existing.lineTotal = Number((existing.qty * existing.unitPrice).toFixed(2));
    } else {
      cart.items.push({
        productId: p._id,
        vendorId: p.vendorId,
        variantSku,
        variantAttributes: oi.variantAttributes || {},
        title: p.title,
        imageUrl: oi.imageUrl || (p.imageUrls?.[0] || ""),
        moq: Number(p.moq || 1),
        unitPrice: Number(tier.unitPrice),
        currency: p.currency || "EUR",
        tierMinQtyApplied: Number(tier.minQty),
        qty,
        lineTotal: Number((qty * Number(tier.unitPrice)).toFixed(2)),
      });
    }
  }

  // recompute subtotal
  cart.subtotal = Number((cart.items.reduce((s, x) => s + Number(x.lineTotal || 0), 0)).toFixed(2));

  // coupon recalculation is handled by your cart logic (if you already patched it).
  // For safety, clear coupon here (recommended) because prices/quantities changed:
  cart.appliedCoupon = { code: "", couponId: null, scope: "", vendorId: null, discountType: "", value: 0, discountTotal: 0 };
  cart.discountTotal = 0;
  cart.grandTotal = cart.subtotal;

  await cart.save();
  res.json({ cart, unavailableItems });
}

module.exports = { reorder };
