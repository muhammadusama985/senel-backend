const { z } = require("zod");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const Product = require("../models/Product");
const Cart = require("../models/Cart");

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

  // Add each item (skip products no longer approved)
  for (const oi of items) {
    const p = await Product.findById(oi.productId).lean();
    if (!p || p.status !== "approved") continue;

    const existing = cart.items.find((x) => String(x.productId) === String(p._id));
    const qty = oi.qty;

    if (existing) {
      existing.qty += qty;
      existing.unitPrice = p.price;
      existing.lineTotal = Number((existing.qty * existing.unitPrice).toFixed(2));
    } else {
      cart.items.push({
        productId: p._id,
        vendorId: p.vendorId,
        sku: p.sku || "",
        title: p.title,
        unitPrice: p.price,
        qty,
        lineTotal: Number((qty * p.price).toFixed(2)),
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
  res.json({ cart });
}

module.exports = { reorder };