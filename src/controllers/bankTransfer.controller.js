const { z } = require("zod");
const Order = require("../models/Order");
const VendorOrder = require("../models/VendorOrder");
const { notifyUser } = require("../services/notification.service");
const FileUtils = require("../utils/fileUtils");

const submitSchema = z.object({
  orderId: z.string().min(1),
  reference: z.string().optional(),
});

async function submitBankTransferProof(req, res) {
  const body = submitSchema.parse(req.body);

  const order = await Order.findOne({ _id: body.orderId, customerUserId: req.user._id });
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (order.paymentMethod !== "bank_transfer") {
    return res.status(400).json({ message: "Order is not bank transfer" });
  }

  if (!["awaiting_transfer", "rejected"].includes(order.paymentStatus)) {
    return res.status(400).json({ message: `Cannot submit proof when status=${order.paymentStatus}` });
  }

  const uploadedProofUrl = req.file
    ? FileUtils.getFileUrl(req, req.file.filename, "customer/payment-proofs")
    : "";

  if (!uploadedProofUrl) {
    return res.status(400).json({ message: "Proof image is required" });
  }

  order.paymentStatus = "under_review";
  order.bankTransfer = order.bankTransfer || {};
  order.bankTransfer.proofUrl = uploadedProofUrl;
  order.bankTransfer.reference = body.reference || "";
  order.bankTransfer.submittedAt = new Date();
  order.bankTransfer.rejectionReason = "";
  await order.save();

  // Mirror to vendor orders
  await VendorOrder.updateMany(
    { orderId: order._id },
    { $set: { paymentStatus: "under_review" } }
  );

  // Optionally notify admin users via your admin dashboard (or notifications)
  // If you have admin notify helper, call it here.

  res.json({ orderId: order._id, paymentStatus: order.paymentStatus });
}

module.exports = { submitBankTransferProof };
