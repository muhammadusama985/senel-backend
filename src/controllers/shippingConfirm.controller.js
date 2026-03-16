const Order = require("../models/Order");
const VendorOrder = require("../models/VendorOrder");

async function customerConfirmShippingQuote(req, res) {
  const order = await Order.findOne({ _id: req.params.orderId, customerUserId: req.user._id });
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (order.shippingPricingMode !== "manual_discuss" || order.shippingStatus !== "quoted") {
    return res.status(400).json({ message: "No shipping quote to confirm" });
  }

  order.shippingStatus = "confirmed";
  await order.save();

  await VendorOrder.updateMany({ orderId: order._id }, { $set: { shippingStatus: "confirmed" } });

  // If payment already paid, move to placed; else keep pending payment
  if (order.paymentMethod === "bank_transfer" && order.paymentStatus !== "paid") {
    order.status = "pending_payment";
  } else {
    order.status = "placed";
  }
  await order.save();

  res.json({ orderId: order._id, shippingStatus: order.shippingStatus, status: order.status });
}

module.exports = { customerConfirmShippingQuote };