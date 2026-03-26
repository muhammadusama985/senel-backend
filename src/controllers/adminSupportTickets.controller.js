const { SupportTicket, TicketMessage } = require("../models/SupportTicket");
const Vendor = require("../models/Vendor");
const User = require("../models/User");
const { notifyVendorOwner } = require("../services/notification.service");

function formatUserLabel(user) {
  if (!user) return "-";
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || user.email || user.phone || "User";
}

async function adminListSupportTickets(req, res) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10), 1), 100);
  const skip = (page - 1) * limit;

  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.category) query.category = req.query.category;
  if (req.query.priority) query.priority = req.query.priority;
  if (req.query.vendorId) query.vendorId = req.query.vendorId;

  const [tickets, total] = await Promise.all([
    SupportTicket.find(query).sort({ updatedAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    SupportTicket.countDocuments(query),
  ]);

  const vendorIds = [...new Set(tickets.map((ticket) => String(ticket.vendorId || "")).filter(Boolean))];
  const creatorIds = [...new Set(tickets.map((ticket) => String(ticket.createdBy || "")).filter(Boolean))];

  const [vendors, creators, messageCounts] = await Promise.all([
    vendorIds.length ? Vendor.find({ _id: { $in: vendorIds } }).select("_id storeName").lean() : [],
    creatorIds.length ? User.find({ _id: { $in: creatorIds } }).select("_id firstName lastName email phone").lean() : [],
    TicketMessage.aggregate([
      { $match: { ticketId: { $in: tickets.map((ticket) => ticket._id) } } },
      { $group: { _id: "$ticketId", count: { $sum: 1 } } },
    ]),
  ]);

  const vendorMap = new Map(vendors.map((vendor) => [String(vendor._id), vendor.storeName || "Vendor"]));
  const creatorMap = new Map(creators.map((user) => [String(user._id), formatUserLabel(user)]));
  const messageCountMap = new Map(messageCounts.map((entry) => [String(entry._id), entry.count]));

  const items = tickets.map((ticket) => ({
    ...ticket,
    vendorLabel: vendorMap.get(String(ticket.vendorId || "")) || "Vendor",
    createdByLabel: creatorMap.get(String(ticket.createdBy || "")) || "-",
    messageCount: messageCountMap.get(String(ticket._id)) || 0,
  }));

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

async function adminGetSupportTicketDetails(req, res) {
  const ticket = await SupportTicket.findById(req.params.ticketId).lean();
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });

  const [vendor, creator, messages] = await Promise.all([
    ticket.vendorId ? Vendor.findById(ticket.vendorId).select("_id storeName").lean() : null,
    ticket.createdBy ? User.findById(ticket.createdBy).select("_id firstName lastName email phone").lean() : null,
    TicketMessage.find({ ticketId: ticket._id }).populate("userId", "email firstName lastName phone").sort({ createdAt: 1 }).lean(),
  ]);

  const normalizedMessages = messages.map((message) => ({
    ...message,
    user: message.userId ? {
      _id: message.userId._id,
      email: message.userId.email,
      firstName: message.userId.firstName,
      lastName: message.userId.lastName,
      phone: message.userId.phone,
    } : null,
  }));

  res.json({
    ticket: {
      ...ticket,
      vendorLabel: vendor?.storeName || "Vendor",
      createdByLabel: formatUserLabel(creator),
    },
    messages: normalizedMessages,
  });
}

async function adminReplySupportTicket(req, res) {
  const ticket = await SupportTicket.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });

  const message = String(req.body?.message || "").trim();
  if (!message) return res.status(400).json({ message: "Message is required" });

  const created = await TicketMessage.create({
    ticketId: ticket._id,
    userId: req.user._id,
    userRole: "admin",
    message,
    attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : [],
    isInternal: Boolean(req.body?.isInternal),
  });

  if (ticket.status === "open") {
    ticket.status = "in_progress";
    await ticket.save();
  }

  await notifyVendorOwner({
    vendorId: ticket.vendorId,
    title: "New Reply on Ticket",
    body: `Admin replied to ticket #${ticket.ticketNumber}`,
    type: "support",
    data: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber },
  });

  res.status(201).json({ message: created });
}

async function adminUpdateSupportTicketStatus(req, res) {
  const ticket = await SupportTicket.findById(req.params.ticketId);
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });

  const allowedStatuses = ["open", "in_progress", "waiting", "resolved", "closed"];
  const status = String(req.body?.status || "");
  const note = String(req.body?.note || "").trim();

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const oldStatus = ticket.status;
  ticket.status = status;
  if (status === "resolved") {
    ticket.resolvedAt = new Date();
  }
  if (status === "closed") {
    ticket.closedAt = new Date();
    ticket.closedBy = req.user._id;
  }
  await ticket.save();

  await TicketMessage.create({
    ticketId: ticket._id,
    userId: req.user._id,
    userRole: "system",
    message: note || `Status changed from ${oldStatus} to ${status}`,
    isInternal: false,
  });

  await notifyVendorOwner({
    vendorId: ticket.vendorId,
    title: "Support ticket updated",
    body: `Ticket #${ticket.ticketNumber} is now ${status.replaceAll("_", " ")}.`,
    type: "support",
    data: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber, status },
  });

  res.json({ ticket });
}

module.exports = {
  adminListSupportTickets,
  adminGetSupportTicketDetails,
  adminReplySupportTicket,
  adminUpdateSupportTicketStatus,
};
