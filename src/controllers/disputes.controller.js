const { z } = require("zod");
const mongoose = require("mongoose");
const Dispute = require("../models/Dispute");
const DisputeMessage = require("../models/DisputeMessage");
const Vendor = require("../models/Vendor");
const VendorOrder = require("../models/VendorOrder");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const User = require("../models/User");
const { generateDisputeNumber } = require("../utils/disputeNumber");
const { notifyUser, notifyVendorOwner } = require("../services/notification.service");

async function getVendorIdForUserIfVendor(userId) {
  const v = await Vendor.findOne({ ownerUserId: userId }).lean();
  return v?._id || null;
}

function formatCustomerLabel(user) {
  if (!user) return "-";
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || user.email || user.phone || "Customer";
}

const createSchema = z.object({
  vendorOrderId: z.string().optional(),
  orderId: z.string().optional(),
  orderItemId: z.string().optional(),

  reason: z.enum(["missing_items","damaged_items","wrong_items","late_delivery","quality_issue","payment_issue","other"]).optional(),
  subject: z.string().min(3),
  description: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

async function customerCreateDispute(req, res) {
  const body = createSchema.parse(req.body);

  // Must reference at least one entity
  if (!body.vendorOrderId && !body.orderId && !body.orderItemId) {
    return res.status(400).json({ message: "Provide vendorOrderId or orderId or orderItemId" });
  }

  // Resolve vendorId + ownership checks
  let vendorOrder = null;
  let order = null;
  let orderItem = null;

  if (body.vendorOrderId) {
    vendorOrder = await VendorOrder.findById(body.vendorOrderId).lean();
    if (!vendorOrder) return res.status(404).json({ message: "VendorOrder not found" });

    // Check customer ownership via Order
    order = await Order.findById(vendorOrder.orderId).lean();
    if (!order || String(order.customerUserId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not allowed" });
    }
  }

  if (body.orderId && !order) {
    order = await Order.findById(body.orderId).lean();
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (String(order.customerUserId) !== String(req.user._id)) return res.status(403).json({ message: "Not allowed" });
  }

  if (body.orderItemId) {
    orderItem = await OrderItem.findById(body.orderItemId).lean();
    if (!orderItem) return res.status(404).json({ message: "OrderItem not found" });

    const o = await Order.findById(orderItem.orderId).lean();
    if (!o || String(o.customerUserId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not allowed" });
    }
    if (!order) order = o;

    // If vendorOrder wasn’t provided, we still can infer vendorId from orderItem
    if (!vendorOrder && orderItem.vendorId) {
      vendorOrder = await VendorOrder.findOne({ orderId: orderItem.orderId, vendorId: orderItem.vendorId }).lean();
    }
  }

  const vendorId = vendorOrder?.vendorId || orderItem?.vendorId || null;
  const isAdminFulfillmentDispute =
    vendorOrder?.fulfillmentType === "admin" ||
    (!vendorId && (vendorOrder?._id || orderItem?._id || order?._id));

  if (!vendorId && !isAdminFulfillmentDispute) {
    return res.status(400).json({ message: "Could not infer vendorId; provide vendorOrderId or orderItemId with vendor" });
  }

  const dispute = await Dispute.create({
    disputeNumber: generateDisputeNumber(),
    customerUserId: req.user._id,
    vendorId: vendorId || null,
    vendorOrderId: vendorOrder?._id || null,
    orderId: order?._id || null,
    orderItemId: orderItem?._id || null,
    reason: body.reason || "other",
    subject: body.subject,
    description: body.description || "",
    attachments: body.attachments || [],
    status: "open",
    lastMessageAt: new Date(),
    lastMessageByRole: "customer",
  });

  await DisputeMessage.create({
    disputeId: dispute._id,
    senderRole: "customer",
    senderUserId: req.user._id,
    message: body.description || body.subject,
    attachments: body.attachments || [],
  });

  // Notify vendor owner
  if (vendorId) {
    await notifyVendorOwner({
      vendorId,
      title: "New dispute opened",
      body: `Dispute ${dispute.disputeNumber}: ${dispute.subject}`,
      type: "dispute",
      data: { disputeId: dispute._id, disputeNumber: dispute.disputeNumber },
    });
  }

  res.status(201).json({ dispute });
}

async function customerListMyDisputes(req, res) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const q = { customerUserId: req.user._id };
  if (req.query.status) q.status = req.query.status;

  const [items, total] = await Promise.all([
    Dispute.find(q).sort({ lastMessageAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Dispute.countDocuments(q),
  ]);

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

async function vendorListMyDisputes(req, res) {
  const vendorId = await getVendorIdForUserIfVendor(req.user._id);
  if (!vendorId) return res.status(403).json({ message: "Vendor profile not found" });

  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const q = { vendorId };
  if (req.query.status) q.status = req.query.status;
  if (req.query.reason) q.reason = req.query.reason;
  if (req.query.q) {
    const term = String(req.query.q).trim();
    if (term) {
      q.$or = [
        { disputeNumber: { $regex: term, $options: "i" } },
        { subject: { $regex: term, $options: "i" } },
        { description: { $regex: term, $options: "i" } },
      ];
    }
  }

  const [items, total] = await Promise.all([
    Dispute.find(q).sort({ lastMessageAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Dispute.countDocuments(q),
  ]);

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

async function getDisputeDetails(req, res) {
  const dispute = await Dispute.findById(req.params.id).lean();
  if (!dispute) return res.status(404).json({ message: "Dispute not found" });

  // Access control
  if (req.user.role === "customer") {
    if (String(dispute.customerUserId) !== String(req.user._id)) return res.status(403).json({ message: "Not allowed" });
  }
  if (req.user.role === "vendor") {
    const vendorId = await getVendorIdForUserIfVendor(req.user._id);
    if (!vendorId || String(dispute.vendorId) !== String(vendorId)) return res.status(403).json({ message: "Not allowed" });
  }
  // admin can view all

  const [customer, vendor] = await Promise.all([
    dispute.customerUserId
      ? User.findById(dispute.customerUserId).select("_id firstName lastName email phone").lean()
      : null,
    dispute.vendorId
      ? Vendor.findById(dispute.vendorId).select("_id storeName").lean()
      : null,
  ]);

  const messages = await DisputeMessage.find({ disputeId: dispute._id }).sort({ createdAt: 1 }).lean();
  res.json({
    dispute: {
      ...dispute,
      customerLabel: formatCustomerLabel(customer),
      vendorLabel: vendor?.storeName || "Senel Admin",
    },
    messages,
  });
}

const messageSchema = z.object({
  message: z.string().min(1),
  attachments: z.array(z.string()).optional(),
});

async function postDisputeMessage(req, res) {
  const body = messageSchema.parse(req.body);

  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) return res.status(404).json({ message: "Dispute not found" });

  // Access control & senderRole
  let senderRole = "customer";
  if (req.user.role === "customer") {
    if (String(dispute.customerUserId) !== String(req.user._id)) return res.status(403).json({ message: "Not allowed" });
    senderRole = "customer";
  } else if (req.user.role === "vendor") {
    const vendorId = await getVendorIdForUserIfVendor(req.user._id);
    if (!vendorId || !dispute.vendorId || String(dispute.vendorId) !== String(vendorId)) {
      return res.status(403).json({ message: "Not allowed" });
    }
    senderRole = "vendor";
  } else if (req.user.role === "admin") {
    senderRole = "admin";
  } else {
    return res.status(403).json({ message: "Not allowed" });
  }

  // Don’t allow messaging after closed
  if (dispute.status === "closed") return res.status(400).json({ message: "Dispute is closed" });

  const msg = await DisputeMessage.create({
    disputeId: dispute._id,
    senderRole,
    senderUserId: req.user._id,
    message: body.message,
    attachments: body.attachments || [],
  });

  dispute.lastMessageAt = new Date();
  dispute.lastMessageByRole = senderRole;
  if (dispute.status === "open") dispute.status = "in_progress";
  await dispute.save();

  // Notifications
  if (senderRole === "vendor" || senderRole === "admin") {
    await notifyUser({
      userId: dispute.customerUserId,
      title: "Dispute update",
      body: `New reply on dispute ${dispute.disputeNumber}`,
      type: "dispute",
      data: { disputeId: dispute._id, disputeNumber: dispute.disputeNumber },
    });
  }
  if ((senderRole === "customer" || senderRole === "admin") && dispute.vendorId) {
    await notifyVendorOwner({
      vendorId: dispute.vendorId,
      title: "Dispute update",
      body: `New message on dispute ${dispute.disputeNumber}`,
      type: "dispute",
      data: { disputeId: dispute._id, disputeNumber: dispute.disputeNumber },
    });
  }

  res.status(201).json({ message: msg });
}

const statusSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
  note: z.string().optional(),
});

async function updateDisputeStatus(req, res) {
  const body = statusSchema.parse(req.body);

  const dispute = await Dispute.findById(req.params.id);
  if (!dispute) return res.status(404).json({ message: "Dispute not found" });

  // Who can change status:
  // - admin: any
  // - vendor: can set to in_progress/resolved (not closed)
  // - customer: can set to in_progress (reopen discussion) (not resolved/closed)
  if (req.user.role === "vendor") {
    const vendorId = await getVendorIdForUserIfVendor(req.user._id);
    if (!vendorId || String(dispute.vendorId) !== String(vendorId)) return res.status(403).json({ message: "Not allowed" });
    if (body.status === "closed") return res.status(403).json({ message: "Vendor cannot close disputes" });
    if (body.status === "open") return res.status(403).json({ message: "Vendor cannot set open" });
  }

  if (req.user.role === "customer") {
    if (String(dispute.customerUserId) !== String(req.user._id)) return res.status(403).json({ message: "Not allowed" });
    if (body.status === "resolved" || body.status === "closed") {
      return res.status(403).json({ message: "Customer cannot resolve/close disputes" });
    }
  }

  // admin allowed
  dispute.status = body.status;
  if (body.status === "resolved") dispute.resolvedAt = new Date();
  if (body.status === "closed") dispute.closedAt = new Date();

  await dispute.save();

  // Optional: drop a system message
  if (body.note || req.user.role === "admin") {
    await DisputeMessage.create({
      disputeId: dispute._id,
      senderRole: req.user.role === "admin" ? "admin" : (req.user.role === "vendor" ? "vendor" : "customer"),
      senderUserId: req.user._id,
      message: body.note || `Status changed to ${body.status}`,
      attachments: [],
    });
  }

  // Notify both sides
  await notifyUser({
    userId: dispute.customerUserId,
    title: "Dispute status updated",
    body: `Dispute ${dispute.disputeNumber} is now "${dispute.status}"`,
    type: "dispute",
    data: { disputeId: dispute._id, disputeNumber: dispute.disputeNumber, status: dispute.status },
  });
  if (dispute.vendorId) {
    await notifyVendorOwner({
      vendorId: dispute.vendorId,
      title: "Dispute status updated",
      body: `Dispute ${dispute.disputeNumber} is now "${dispute.status}"`,
      type: "dispute",
      data: { disputeId: dispute._id, disputeNumber: dispute.disputeNumber, status: dispute.status },
    });
  }

  res.json({ dispute });
}

module.exports = {
  customerCreateDispute,
  customerListMyDisputes,
  vendorListMyDisputes,
  getDisputeDetails,
  postDisputeMessage,
  updateDisputeStatus,
};
