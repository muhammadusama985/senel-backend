const { z } = require("zod");
const Order = require("../models/Order");
const VendorOrder = require("../models/VendorOrder");
const { notifyUser } = require("../services/notification.service");
const { calculateTax } = require("../services/tax.service");

const quoteSchema = z.object({
  shippingTotal: z.number().min(0),
  note: z.string().optional(),
});

async function adminSetOrderShippingQuote(req, res) {
  const body = quoteSchema.parse(req.body);

  const order = await Order.findById(req.params.orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (order.shippingPricingMode !== "manual_discuss") {
    return res.status(400).json({ message: "Order is not manual shipping" });
  }

  order.shippingTotal = body.shippingTotal;
  order.shippingStatus = "quoted";
  order.shippingQuoteNote = body.note || order.shippingQuoteNote || "";

  const netSubtotal = Number(order.subtotal || 0) - Number(order.discountTotal || 0);
  const taxResult = await calculateTax({
    subtotal: netSubtotal,
    shippingTotal: order.shippingTotal,
    country: order.shippingAddress?.country || "",
  });

  order.taxRate = taxResult.taxRate;
  order.taxAmount = taxResult.taxAmount;
  order.taxableAmount = taxResult.taxableAmount;
  order.grandTotal = Number((netSubtotal + order.shippingTotal + taxResult.taxAmount).toFixed(2));
  await order.save();

  // (Optional) allocate shipping per vendor order. Simple approach: split equally by vendor orders count.
  const vendorOrders = await VendorOrder.find({ orderId: order._id });
  if (vendorOrders.length) {
    const per = Number((body.shippingTotal / vendorOrders.length).toFixed(2));
    for (const vo of vendorOrders) {
      vo.shippingPricingMode = "manual_discuss";
      vo.shippingStatus = "quoted";
      vo.shippingQuote = vo.shippingQuote || {};
      vo.shippingQuote.amount = per;
      vo.shippingQuote.note = body.note || "";
      vo.shippingQuote.quotedAt = new Date();
      vo.shippingQuote.quotedByAdminId = req.user._id;
      await vo.save();
    }
  }

  await notifyUser({
    userId: order.customerUserId,
    title: "Shipping quote ready",
    body: `Shipping has been quoted for order ${order.orderNumber || order._id}.`,
    type: "shipping",
    data: { orderId: order._id, shippingTotal: order.shippingTotal },
  });

  res.json({ orderId: order._id, shippingStatus: order.shippingStatus, shippingTotal: order.shippingTotal, grandTotal: order.grandTotal });
}

module.exports = { adminSetOrderShippingQuote };
