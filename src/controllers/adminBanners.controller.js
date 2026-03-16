const { z } = require("zod");
const Banner = require("../models/Banner");
const AuditLog = require("../models/AuditLog");
const { resolveML } = require("../utils/ml");

const mlSchema = z.object({
  en: z.string().optional(),
  de: z.string().optional(),
  tr: z.string().optional(),
});

const bannerSchema = z.object({
  placement: z.string().min(1),
  priority: z.number().optional(),
  imageUrl: z.string().url(),
  imageUrlMobile: z.string().url().optional(),
  titleML: mlSchema.optional(),
  subtitleML: mlSchema.optional(),
  ctaTextML: mlSchema.optional(),
  ctaUrl: z.string().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

function validateML(obj) {
  return !!(
    obj?.en?.trim() ||
    obj?.de?.trim() ||
    obj?.tr?.trim()
  );
}

async function adminListBanners(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const lang = req.lang || "en";

    const query = {};
    if (req.query.placement) query.placement = req.query.placement;
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === "true";
    }

    const [items, total] = await Promise.all([
      Banner.find(query)
        .sort({ priority: 1, placement: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Banner.countDocuments(query),
    ]);

    // Resolve titles for admin view
    const resolvedItems = items.map(item => ({
      ...item,
      title: resolveML(item.titleML, lang),
      subtitle: resolveML(item.subtitleML, lang),
      ctaText: resolveML(item.ctaTextML, lang),
    }));

    res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      items: resolvedItems,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function adminGetBanner(req, res) {
  try {
    const lang = req.lang || "en";
    const banner = await Banner.findById(req.params.id).lean();
    
    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    const resolvedBanner = {
      ...banner,
      title: resolveML(banner.titleML, lang),
      subtitle: resolveML(banner.subtitleML, lang),
      ctaText: resolveML(banner.ctaTextML, lang),
    };

    res.json({ banner: resolvedBanner });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function adminCreateBanner(req, res) {
  try {
    const body = bannerSchema.parse(req.body);

    // Optional: Validate that at least one language has content
    if (body.titleML && !validateML(body.titleML)) {
      return res.status(400).json({ message: "titleML must contain at least one language" });
    }

    const banner = await Banner.create({
      placement: body.placement,
      priority: body.priority || 0,
      imageUrl: body.imageUrl,
      imageUrlMobile: body.imageUrlMobile || "",
      titleML: body.titleML || { en: "", de: "", tr: "" },
      subtitleML: body.subtitleML || { en: "", de: "", tr: "" },
      ctaTextML: body.ctaTextML || { en: "", de: "", tr: "" },
      ctaUrl: body.ctaUrl || "",
      startAt: body.startAt ? new Date(body.startAt) : null,
      endAt: body.endAt ? new Date(body.endAt) : null,
      isActive: body.isActive ?? true,
      createdByAdminId: req.user._id,
      updatedByAdminId: req.user._id,
    });

    await AuditLog.create({
      actorUserId: req.user._id,
      action: "BANNER_CREATED",
      entityType: "Banner",
      entityId: banner._id,
      meta: { placement: banner.placement },
    });

    res.status(201).json({ banner });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to create banner" });
  }
}

async function adminUpdateBanner(req, res) {
  try {
    const body = bannerSchema.partial().parse(req.body);

    const banner = await Banner.findById(req.params.id);
    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    // Update fields
    if (body.placement !== undefined) banner.placement = body.placement;
    if (body.priority !== undefined) banner.priority = body.priority;
    if (body.imageUrl !== undefined) banner.imageUrl = body.imageUrl;
    if (body.imageUrlMobile !== undefined) banner.imageUrlMobile = body.imageUrlMobile;
    if (body.titleML !== undefined) banner.titleML = body.titleML;
    if (body.subtitleML !== undefined) banner.subtitleML = body.subtitleML;
    if (body.ctaTextML !== undefined) banner.ctaTextML = body.ctaTextML;
    if (body.ctaUrl !== undefined) banner.ctaUrl = body.ctaUrl;
    if (body.startAt !== undefined) banner.startAt = body.startAt ? new Date(body.startAt) : null;
    if (body.endAt !== undefined) banner.endAt = body.endAt ? new Date(body.endAt) : null;
    if (body.isActive !== undefined) banner.isActive = body.isActive;

    banner.updatedByAdminId = req.user._id;
    await banner.save();

    await AuditLog.create({
      actorUserId: req.user._id,
      action: "BANNER_UPDATED",
      entityType: "Banner",
      entityId: banner._id,
      meta: { updates: body },
    });

    res.json({ banner });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to update banner" });
  }
}

async function adminDeleteBanner(req, res) {
  try {
    const banner = await Banner.findByIdAndDelete(req.params.id);
    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    await AuditLog.create({
      actorUserId: req.user._id,
      action: "BANNER_DELETED",
      entityType: "Banner",
      entityId: banner._id,
      meta: { placement: banner.placement },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  adminListBanners,
  adminGetBanner,
  adminCreateBanner,
  adminUpdateBanner,
  adminDeleteBanner,
};