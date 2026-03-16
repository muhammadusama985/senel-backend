const { z } = require("zod");
const BroadcastCampaign = require("../models/BroadcastCampaign");
const Notification = require("../models/Notification");
const User = require("../models/User"); // ✅ ADD THIS IMPORT
const { resolveRecipients } = require("../services/broadcastRecipients.service");
const { sendPushToUsers } = require("../services/push.service");

const targetSchema = z.object({
  scope: z.enum(["all", "customers", "vendors", "admins", "custom"]).optional(),
  vendorIds: z.array(z.string()).optional(),
  userIds: z.array(z.string()).optional(),
}).optional();

const createSchema = z.object({
  title: z.string().min(2),
  body: z.string().min(2),
  channels: z.array(z.enum(["in_app", "push"])).optional(),
  target: targetSchema,
  deepLink: z.string().optional(),
  scheduledAt: z.string().datetime().optional(), // ISO
});

async function adminCreateCampaign(req, res) {
  const body = createSchema.parse(req.body);

  const campaign = await BroadcastCampaign.create({
    title: body.title,
    body: body.body,
    channels: body.channels?.length ? body.channels : ["in_app"],
    target: {
      scope: body.target?.scope || "all",
      vendorIds: body.target?.vendorIds || [],
      userIds: body.target?.userIds || [],
    },
    deepLink: body.deepLink || "",
    status: body.scheduledAt ? "scheduled" : "draft",
    scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    createdByAdminId: req.user._id,
  });

  res.status(201).json({ campaign });
}

async function adminListCampaigns(req, res) {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  const items = await BroadcastCampaign.find(q).sort({ createdAt: -1 }).lean();
  res.json({ items });
}

async function adminCancelCampaign(req, res) {
  const c = await BroadcastCampaign.findById(req.params.id);
  if (!c) return res.status(404).json({ message: "Campaign not found" });
  if (c.status === "sent") return res.status(400).json({ message: "Cannot cancel a sent campaign" });

  c.status = "cancelled";
  await c.save();
  res.json({ campaign: c });
}

/**
 * Send now endpoint (or used by scheduler/cron)
 */
async function adminSendCampaign(req, res) {
  const c = await BroadcastCampaign.findById(req.params.id);
  if (!c) return res.status(404).json({ message: "Campaign not found" });
  if (c.status === "cancelled") return res.status(400).json({ message: "Campaign cancelled" });
  if (c.status === "sent") return res.status(400).json({ message: "Already sent" });

  // if scheduled and not yet time, block in manual send (optional)
  if (c.status === "scheduled" && c.scheduledAt && c.scheduledAt.getTime() > Date.now()) {
    return res.status(400).json({ message: "Campaign is scheduled for later" });
  }

  const recipientIds = await resolveRecipients(c.target);
  c.stats.plannedRecipients = recipientIds.length;

  // Get user roles for all recipients to set proper targetRole
  const users = await User.find({ _id: { $in: recipientIds } }).select("role").lean();
  const userRoleMap = new Map(users.map(u => [u._id.toString(), u.role]));

  // Create in-app notifications
  let inAppCount = 0;
  if (c.channels.includes("in_app")) {
    const docs = recipientIds.map((uid) => {
      // Determine role - default to "all" if not found
      const role = userRoleMap.get(uid) || "all";
      
      // Map user role to valid targetRole enum values
      let targetRole = "all";
      if (role === "admin") targetRole = "admin";
      else if (role === "vendor") targetRole = "vendor";
      else if (role === "customer") targetRole = "customer";
      
      return {
        targetRole: targetRole, // ✅ Now using valid enum: "admin", "vendor", "customer", or "all"
        targetUserId: uid,
        title: c.title,
        body: c.body,
        type: "broadcast",
        data: { deepLink: c.deepLink, campaignId: c._id },
        isRead: false,
      };
    });

    const batchSize = 1000;
    for (let i = 0; i < docs.length; i += batchSize) {
      await Notification.insertMany(docs.slice(i, i + batchSize));
      inAppCount += docs.slice(i, i + batchSize).length;
    }
  }

  let pushCount = 0;
  if (c.channels.includes("push")) {
    const pushResult = await sendPushToUsers({
      userIds: recipientIds,
      title: c.title,
      body: c.body,
      data: { deepLink: c.deepLink, campaignId: c._id },
    });
    pushCount = pushResult.sent;
  }

  c.status = "sent";
  c.sentAt = new Date();
  c.stats.sentInApp = inAppCount;
  c.stats.sentPush = pushCount;
  await c.save();

  res.json({ campaign: c, sentTo: recipientIds.length, inAppCount, pushCount });
}

module.exports = {
  adminCreateCampaign,
  adminListCampaigns,
  adminCancelCampaign,
  adminSendCampaign,
};
