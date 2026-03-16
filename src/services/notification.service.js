const Notification = require("../models/Notification");
const Vendor = require("../models/Vendor");

async function notifyUser({ userId, title, body, type = "system", data = {} }) {
  if (!userId) return null;
  return Notification.create({
    targetRole: "all",
    targetUserId: userId,
    title,
    body,
    type,
    data,
  });
}

async function notifyVendorOwner({ vendorId, title, body, type = "system", data = {} }) {
  if (!vendorId) return null;
  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) return null;

  // Send to vendor owner as a user notification
  return Notification.create({
    targetRole: "vendor",
    targetVendorId: vendorId,
    targetUserId: vendor.ownerUserId,
    title,
    body,
    type,
    data,
  });
}

async function broadcastAnnouncement({ title, body, targetRole = "all", data = {} }) {
  // Simple broadcast entry (clients can fetch by role)
  return Notification.create({
    targetRole,
    title,
    body,
    type: "announcement",
    data,
  });
}

module.exports = { notifyUser, notifyVendorOwner, broadcastAnnouncement };