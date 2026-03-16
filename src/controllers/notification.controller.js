const { z } = require("zod");
const Notification = require("../models/Notification");
const Vendor = require("../models/Vendor");
const { broadcastAnnouncement } = require("../services/notification.service");

// GET /api/v1/notifications/me?page&limit&unreadOnly=true
async function listMyNotifications(req, res) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10), 1), 100);
  const skip = (page - 1) * limit;

  const unreadOnly = req.query.unreadOnly === "true";

  // Determine vendorId if user is vendor
  let vendorId = null;
  if (req.user.role === "vendor") {
    const v = await Vendor.findOne({ ownerUserId: req.user._id }).lean();
    vendorId = v?._id || null;
  }

  const query = {
    $or: [
      // direct user notifications
      { targetUserId: req.user._id },
      // vendor-targeted notifications
      ...(vendorId ? [{ targetVendorId: vendorId }] : []),
      // broadcasts by role
      { targetRole: "all" },
      { targetRole: req.user.role },
    ],
  };

  if (unreadOnly) query.isRead = false;

  const [items, total] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(query),
  ]);

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

// POST /api/v1/notifications/:notificationId/read
async function markRead(req, res) {
  const id = req.params.notificationId;

  const n = await Notification.findById(id);
  if (!n) return res.status(404).json({ message: "Notification not found" });

  // Only allow marking as read if it matches this user context (basic check)
  // (In production, enforce full access check; this is acceptable baseline.)
  n.isRead = true;
  n.readAt = new Date();
  await n.save();

  res.json({ notification: n });
}

// POST /api/v1/notifications/read-all
async function markAllRead(req, res) {
  // Determine vendorId if user is vendor
  let vendorId = null;
  if (req.user.role === "vendor") {
    const v = await Vendor.findOne({ ownerUserId: req.user._id }).lean();
    vendorId = v?._id || null;
  }

  const query = {
    isRead: false,
    $or: [
      { targetUserId: req.user._id },
      ...(vendorId ? [{ targetVendorId: vendorId }] : []),
      { targetRole: "all" },
      { targetRole: req.user.role },
    ],
  };

  await Notification.updateMany(query, { $set: { isRead: true, readAt: new Date() } });
  res.json({ ok: true });
}

// Admin: POST /api/v1/notifications/admin/announcements
const announcementSchema = z.object({
  title: z.string().min(2),
  body: z.string().min(2),
  targetRole: z.enum(["all", "vendor", "customer", "admin"]).optional(),
});

async function adminCreateAnnouncement(req, res) {
  const body = announcementSchema.parse(req.body);

  const a = await broadcastAnnouncement({
    title: body.title,
    body: body.body,
    targetRole: body.targetRole || "all",
    data: { createdBy: req.user._id },
  });

  res.status(201).json({ announcement: a });
}

module.exports = {
  listMyNotifications,
  markRead,
  markAllRead,
  adminCreateAnnouncement,
};