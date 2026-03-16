const { z } = require("zod");
const AdminNotificationCampaign = require("../models/AdminNotificationCampaign");
const Notification = require("../models/Notification");
const User = require("../models/User"); // must exist in your project

const createSchema = z.object({
  title: z.string().min(2),
  body: z.string().min(2),
  targetRole: z.enum(["all", "customer", "vendor", "admin"]).optional(),
  deepLink: z.string().optional(),
  status: z.enum(["draft", "sent"]).optional(), // allow direct send
});

async function adminCreateCampaign(req, res) {
  const body = createSchema.parse(req.body);

  const campaign = await AdminNotificationCampaign.create({
    title: body.title,
    body: body.body,
    targetRole: body.targetRole || "all",
    deepLink: body.deepLink || "",
    status: "draft",
    createdByAdminId: req.user._id,
  });

  // Optional: send immediately
  if (body.status === "sent") {
    req.params.id = campaign._id.toString();
    return adminSendCampaign(req, res);
  }

  res.status(201).json({ campaign });
}

async function adminListCampaigns(req, res) {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  if (req.query.targetRole) q.targetRole = req.query.targetRole;

  const items = await AdminNotificationCampaign.find(q).sort({ createdAt: -1 }).lean();
  res.json({ items });
}

async function adminSendCampaign(req, res) {
  const campaign = await AdminNotificationCampaign.findById(req.params.id);
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  if (campaign.status === "sent") return res.status(400).json({ message: "Already sent" });

  // Select recipients
  const userQuery = {};
  if (campaign.targetRole !== "all") userQuery.role = campaign.targetRole;

  const users = await User.find(userQuery).select({ _id: 1 }).lean();

  // Insert notifications in batches
  const docs = users.map((u) => ({
    targetRole: campaign.targetRole,
    targetUserId: u._id,
    title: campaign.title,
    body: campaign.body,
    type: "announcement",
    data: { deepLink: campaign.deepLink, campaignId: campaign._id },
    isRead: false,
  }));

  // Avoid huge single insert
  const batchSize = 1000;
  for (let i = 0; i < docs.length; i += batchSize) {
    await Notification.insertMany(docs.slice(i, i + batchSize));
  }

  campaign.status = "sent";
  campaign.sentAt = new Date();
  await campaign.save();

  res.json({ campaign, sentTo: users.length });
}

module.exports = { adminCreateCampaign, adminListCampaigns, adminSendCampaign };