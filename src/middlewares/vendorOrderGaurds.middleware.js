const VendorOrder = require("../models/VendorOrder");

async function requireVendorOrderReadyForFulfillment(req, res, next) {
  const vendorId = req.vendorContext.vendorId;
  const vo = await VendorOrder.findOne({ _id: req.params.vendorOrderId, vendorId }).lean();
  if (!vo) return res.status(404).json({ message: "Vendor order not found" });

  // Block if bank transfer not paid
  if (vo.paymentStatus && vo.paymentStatus !== "paid") {
    return res.status(400).json({ message: "Cannot fulfill: payment not confirmed" });
  }

  // Block if manual shipping not confirmed (optional)
  if (vo.shippingPricingMode === "manual_discuss" && vo.shippingStatus !== "confirmed") {
    return res.status(400).json({ message: "Cannot fulfill: shipping not confirmed" });
  }

  req.vendorOrder = vo;
  next();
}

module.exports = { requireVendorOrderReadyForFulfillment };