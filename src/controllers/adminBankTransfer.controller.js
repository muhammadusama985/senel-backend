const { z } = require("zod");
const Order = require("../models/Order");
const VendorOrder = require("../models/VendorOrder");
const { notifyUser } = require("../services/notification.service");

async function adminListBankTransfers(req, res) {
  const q = { paymentMethod: "bank_transfer" };
  q.paymentStatus = req.query.status || "under_review";

  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10), 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Order.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(q),
  ]);

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

const approveSchema = z.object({ note: z.string().optional() });

async function adminApproveBankTransfer(req, res) {
  const body = approveSchema.parse(req.body || {});

  const order = await Order.findById(req.params.orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (order.paymentMethod !== "bank_transfer") return res.status(400).json({ message: "Not bank transfer" });
  if (order.paymentStatus !== "under_review") {
    return res.status(400).json({
      message: `Cannot approve when paymentStatus=${order.paymentStatus}. Expected under_review.`,
    });
  }

  order.paymentStatus = "paid";
  order.bankTransfer = order.bankTransfer || {};
  order.bankTransfer.reviewedAt = new Date();
  order.bankTransfer.reviewedByAdminId = req.user._id;
  order.bankTransfer.rejectionReason = "";
  await order.save();

  await VendorOrder.updateMany({ orderId: order._id }, { $set: { paymentStatus: "paid" } });

  // Master order status enum only supports "placed" / "cancelled".
  // Keep shipping progress in shippingStatus.
  order.status = "placed";
  await order.save();

  await notifyUser({
    userId: order.customerUserId,
    title: "Payment approved",
    body: `Bank transfer approved for order ${order.orderNumber || order._id}.`,
    type: "payment",
    data: { orderId: order._id, paymentStatus: order.paymentStatus },
  });

  res.json({ orderId: order._id, paymentStatus: order.paymentStatus });
}

const rejectSchema = z.object({ reason: z.string().min(3) });

async function adminRejectBankTransfer(req, res) {
  const body = rejectSchema.parse(req.body || {});

  const order = await Order.findById(req.params.orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (order.paymentMethod !== "bank_transfer") return res.status(400).json({ message: "Not bank transfer" });
  if (order.paymentStatus !== "under_review") {
    return res.status(400).json({
      message: `Cannot reject when paymentStatus=${order.paymentStatus}. Expected under_review.`,
    });
  }

  order.paymentStatus = "rejected";
  order.bankTransfer = order.bankTransfer || {};
  order.bankTransfer.reviewedAt = new Date();
  order.bankTransfer.reviewedByAdminId = req.user._id;
  order.bankTransfer.rejectionReason = body.reason;
  await order.save();

  await VendorOrder.updateMany({ orderId: order._id }, { $set: { paymentStatus: "rejected" } });

  await notifyUser({
    userId: order.customerUserId,
    title: "Payment rejected",
    body: `Bank transfer rejected for order ${order.orderNumber || order._id}: ${body.reason}`,
    type: "payment",
    data: { orderId: order._id, paymentStatus: order.paymentStatus },
  });

  res.json({ orderId: order._id, paymentStatus: order.paymentStatus });
}

module.exports = {
  adminListBankTransfers,
  adminApproveBankTransfer,
  adminRejectBankTransfer,
};
