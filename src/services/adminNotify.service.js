const User = require("../models/User");
const Notification = require("../models/Notification");

async function notifyAdmins({ title, body, type = "ops", data = {} }) {
  try {
    const admins = await User.find({ role: "admin" }).select({ _id: 1 }).lean();
    if (!admins.length) return { sent: 0 };

    const docs = admins.map((a) => ({
      targetRole: "admin",
      targetUserId: a._id,
      title,
      body,
      type,
      data,
      isRead: false,
    }));

    await Notification.insertMany(docs);
    return { sent: docs.length };
  } catch (error) {
    console.error("Error notifying admins:", error);
    return { sent: 0 };
  }
}

module.exports = { notifyAdmins };