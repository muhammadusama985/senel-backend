const { z } = require("zod");
const Announcement = require("../models/Announcement");
const AnnouncementRead = require("../models/AnnouncementRead");
const Vendor = require("../models/Vendor");
const { normalizeLang, pickLang } = require("../utils/i18n");

const mlSchema = z.object({
  en: z.string().optional(),
  de: z.string().optional(),
  tr: z.string().optional(),
}).optional();

const targetSchema = z.object({
  scope: z.enum(["all", "customers", "vendors", "admins", "custom"]).optional(),
  vendorIds: z.array(z.string()).optional(),
  userIds: z.array(z.string()).optional(),
}).optional();

const createSchema = z.object({
  titleML: mlSchema,
  bodyML: mlSchema,
  target: targetSchema,
  deepLink: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

// ---------- Admin ----------
async function adminCreate(req, res) {
  const body = createSchema.parse(req.body);

  const doc = await Announcement.create({
    titleML: body.titleML || {},
    bodyML: body.bodyML || {},
    target: {
      scope: body.target?.scope || "all",
      vendorIds: body.target?.vendorIds || [],
      userIds: body.target?.userIds || [],
    },
    deepLink: body.deepLink || "",
    attachments: body.attachments || [],
    status: "draft",
    createdByAdminId: req.user._id,
    updatedByAdminId: req.user._id,
  });

  res.status(201).json({ announcement: doc });
}

async function adminUpdate(req, res) {
  const body = createSchema.partial().parse(req.body);

  const doc = await Announcement.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Announcement not found" });

  if (body.titleML !== undefined) doc.titleML = body.titleML || {};
  if (body.bodyML !== undefined) doc.bodyML = body.bodyML || {};
  if (body.target !== undefined) {
    doc.target = {
      scope: body.target?.scope || doc.target?.scope || "all",
      vendorIds: body.target?.vendorIds ?? doc.target?.vendorIds ?? [],
      userIds: body.target?.userIds ?? doc.target?.userIds ?? [],
    };
  }
  if (body.deepLink !== undefined) doc.deepLink = body.deepLink || "";
  if (body.attachments !== undefined) doc.attachments = body.attachments || [];

  doc.updatedByAdminId = req.user._id;
  await doc.save();

  res.json({ announcement: doc });
}

async function adminList(req, res) {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  const items = await Announcement.find(q).sort({ createdAt: -1 }).lean();
  res.json({ items });
}

async function adminPublish(req, res) {
  const doc = await Announcement.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Announcement not found" });

  doc.status = "published";
  doc.publishedAt = new Date();
  doc.updatedByAdminId = req.user._id;
  await doc.save();

  res.json({ announcement: doc });
}

async function adminArchive(req, res) {
  const doc = await Announcement.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Announcement not found" });

  doc.status = "archived";
  doc.updatedByAdminId = req.user._id;
  await doc.save();

  res.json({ announcement: doc });
}

// ---------- Audience filter ----------
async function userMatchesAnnouncement(user, announcement) {
  const scope = announcement?.target?.scope || "all";
  if (scope === "all") return true;

  if (scope === "customers") return user.role === "customer";
  if (scope === "admins") return user.role === "admin";

  if (scope === "custom") {
    const ids = (announcement.target?.userIds || []).map(String);
    return ids.includes(String(user._id));
  }

  if (scope === "vendors") {
    if (user.role !== "vendor") return false;

    const allowedVendorIds = (announcement.target?.vendorIds || []).map(String);
    // if vendorIds not provided => all vendors
    if (allowedVendorIds.length === 0) return true;

    // Check if user is vendor owner
    const ownerVendor = await Vendor.findOne({ ownerUserId: user._id }).select({ _id: 1 }).lean();
    if (ownerVendor && allowedVendorIds.includes(String(ownerVendor._id))) return true;

    return false;
  }

  return false;
}

// ---------- User feed ----------
async function listForMe(req, res) {
  const lang = normalizeLang(req.query.lang);
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 50);
  const skip = (page - 1) * limit;

  // fetch published announcements newest first
  const raw = await Announcement.find({ status: "published" })
    .sort({ publishedAt: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // filter by audience (async because vendor check can query)
  const filtered = [];
  for (const a of raw) {
    // eslint-disable-next-line no-await-in-loop
    if (await userMatchesAnnouncement(req.user, a)) filtered.push(a);
  }

  // read status
  const ids = filtered.map(a => a._id);
  const reads = await AnnouncementRead.find({ userId: req.user._id, announcementId: { $in: ids } })
    .select({ announcementId: 1 })
    .lean();
  const readSet = new Set(reads.map(r => String(r.announcementId)));

  const items = filtered.map(a => ({
    id: a._id,
    title: pickLang(a.titleML, lang),
    body: pickLang(a.bodyML, lang),
    deepLink: a.deepLink,
    attachments: a.attachments || [],
    publishedAt: a.publishedAt,
    isRead: readSet.has(String(a._id)),
  }));

  res.json({ page, limit, items });
}

async function markRead(req, res) {
  const announcementId = req.params.id;

  await AnnouncementRead.updateOne(
    { announcementId, userId: req.user._id },
    { $set: { readAt: new Date() } },
    { upsert: true }
  );

  res.json({ ok: true });
}

async function unreadCount(req, res) {
  // Simple approach: count announcements visible to user minus reads.
  // For big scale, you'd precompute per-user counters.
  const raw = await Announcement.find({ status: "published" }).select({ _id: 1, target: 1 }).lean();

  let visibleIds = [];
  for (const a of raw) {
    // eslint-disable-next-line no-await-in-loop
    if (await userMatchesAnnouncement(req.user, a)) visibleIds.push(String(a._id));
  }

  const readCount = await AnnouncementRead.countDocuments({ userId: req.user._id, announcementId: { $in: visibleIds } });
  const unread = Math.max(visibleIds.length - readCount, 0);

  res.json({ unread });
}

module.exports = {
  adminCreate,
  adminUpdate,
  adminList,
  adminPublish,
  adminArchive,
  listForMe,
  markRead,
  unreadCount,
};