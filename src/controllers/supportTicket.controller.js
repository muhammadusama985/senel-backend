const { z } = require("zod");
const { SupportTicket, TicketMessage } = require("../models/SupportTicket");
const { notifyAdmins } = require("../services/adminNotify.service");
const { notifyVendorOwner } = require("../services/notification.service");
const { logActivity } = require("./vendorActivity.controller");

const ticketSchema = z.object({
  subject: z.string().min(5),
  description: z.string().min(10),
  category: z.enum(["technical", "billing", "product", "order", "shipping", "account", "other"]),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  attachments: z.array(z.object({
    url: z.string().url(),
    filename: z.string(),
    size: z.number()
  })).optional()
});

const messageSchema = z.object({
  message: z.string().min(1),
  attachments: z.array(z.object({
    url: z.string().url(),
    filename: z.string(),
    size: z.number()
  })).optional(),
  isInternal: z.boolean().optional()
});

/**
 * Create support ticket
 */
async function createTicket(req, res) {
  try {
    const vendorId = req.vendorContext.vendorId;
    const body = ticketSchema.parse(req.body);

    const ticket = await SupportTicket.create({
      vendorId,
      createdBy: req.user._id,
      subject: body.subject,
      description: body.description,
      category: body.category,
      priority: body.priority || "medium",
      attachments: body.attachments || []
    });

    res.status(201).json({ ticket });
  } catch (error) {
    console.error("createTicket error:", error);
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message });
  }
}

/**
 * List tickets for vendor
 */
async function listTickets(req, res) {
  try {
    const vendorId = req.vendorContext.vendorId;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const skip = (page - 1) * limit;

    const query = { vendorId };

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.category) {
      query.category = req.query.category;
    }

    if (req.query.priority) {
      query.priority = req.query.priority;
    }

    const [tickets, total] = await Promise.all([
      SupportTicket.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SupportTicket.countDocuments(query)
    ]);

    // Get message counts
    const ticketIds = tickets.map(t => t._id);
    const messageCounts = await TicketMessage.aggregate([
      { $match: { ticketId: { $in: ticketIds } } },
      { $group: { _id: "$ticketId", count: { $sum: 1 } } }
    ]);

    const countMap = new Map(messageCounts.map(m => [m._id.toString(), m.count]));

    const enriched = tickets.map(t => ({
      ...t,
      messageCount: countMap.get(t._id.toString()) || 0
    }));

    res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      tickets: enriched
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Get ticket details
 */
async function getTicketDetails(req, res) {
  try {
    const { ticketId } = req.params;
    const vendorId = req.vendorContext.vendorId;

    const ticket = await SupportTicket.findOne({ _id: ticketId, vendorId }).lean();
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Get messages
    const messages = await TicketMessage.find({ ticketId })
      .populate("userId", "email firstName lastName")
      .sort({ createdAt: 1 })
      .lean();

    // Filter internal messages for non-admins
    const filteredMessages = messages.filter(m => 
      !m.isInternal || req.user.role === "admin"
    ).map(m => ({
      ...m,
      userId: undefined,
      user: m.userId
    }));

    res.json({
      ticket,
      messages: filteredMessages
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Add message to ticket
 */
async function addMessage(req, res) {
  try {
    const { ticketId } = req.params;
    const vendorId = req.vendorContext.vendorId;
    const body = messageSchema.parse(req.body);

    const ticket = await SupportTicket.findOne({ _id: ticketId, vendorId });
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Create message
    const message = await TicketMessage.create({
      ticketId,
      userId: req.user._id,
      userRole: req.user.role === "admin" ? "admin" : "vendor",
      message: body.message,
      attachments: body.attachments || [],
      isInternal: body.isInternal || false
    });

    // Update ticket status if needed
    if (ticket.status === "open") {
      ticket.status = "in_progress";
      await ticket.save();
    }

    // Notify relevant parties
    if (req.user.role === "admin") {
      // Notify vendor
      await notifyVendorOwner({
        vendorId,
        title: "New Reply on Ticket",
        body: `Admin replied to ticket #${ticket.ticketNumber}`,
        type: "support",
        data: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber }
      });
    } else {
      // Notify admins
      await notifyAdmins({
        title: "New Vendor Reply",
        body: `Vendor replied to ticket #${ticket.ticketNumber}`,
        type: "support",
        data: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber }
      });
    }

    // Log activity
    await logActivity({
      vendorId,
      userId: req.user._id,
      action: "TICKET_REPLIED",
      entityType: "support",
      entityId: ticket._id,
      details: { ticketNumber: ticket.ticketNumber }
    });

    res.status(201).json({ message });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message });
  }
}

/**
 * Update ticket status
 */
async function updateTicketStatus(req, res) {
  try {
    const { ticketId } = req.params;
    const { status, note } = req.body;
    const vendorId = req.vendorContext.vendorId;

    const ticket = await SupportTicket.findOne({ _id: ticketId, vendorId });
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const oldStatus = ticket.status;
    ticket.status = status;

    if (status === "resolved") {
      ticket.resolvedAt = new Date();
    } else if (status === "closed") {
      ticket.closedAt = new Date();
      ticket.closedBy = req.user._id;
    }

    await ticket.save();

    // Add system message
    await TicketMessage.create({
      ticketId,
      userId: req.user._id,
      userRole: "system",
      message: `Status changed from ${oldStatus} to ${status}${note ? `: ${note}` : ''}`,
      isInternal: false
    });

    // Log activity
    await logActivity({
      vendorId,
      userId: req.user._id,
      action: "TICKET_UPDATED",
      entityType: "support",
      entityId: ticket._id,
      details: { ticketNumber: ticket.ticketNumber, oldStatus, newStatus: status }
    });

    res.json({ ticket });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  createTicket,
  listTickets,
  getTicketDetails,
  addMessage,
  updateTicketStatus
};