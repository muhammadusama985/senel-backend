const { z } = require("zod");
const StaticPage = require("../models/StaticPage");
const AuditLog = require("../models/AuditLog");

const pageSchema = z.object({
  slug: z.string().min(2),
  title: z.string().min(1),
  content: z.string().min(1),
  status: z.enum(["draft", "published"]).optional(),
});

async function adminListPages(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status) query.status = req.query.status;

    const [items, total] = await Promise.all([
      StaticPage.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StaticPage.countDocuments(query),
    ]);

    res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      items,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function adminGetPage(req, res) {
  try {
    const page = await StaticPage.findById(req.params.id).lean();
    if (!page) {
      return res.status(404).json({ message: "Page not found" });
    }
    res.json({ page });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function adminCreatePage(req, res) {
  try {
    const body = pageSchema.parse(req.body);

    // Check if slug already exists
    const existing = await StaticPage.findOne({ slug: body.slug });
    if (existing) {
      return res.status(400).json({ message: "Slug already exists" });
    }

    const page = await StaticPage.create({
      ...body,
      status: body.status || "draft",
      publishedAt: body.status === "published" ? new Date() : null,
      createdByAdminId: req.user._id,
      updatedByAdminId: req.user._id,
    });

    await AuditLog.create({
      actorUserId: req.user._id,
      action: "STATIC_PAGE_CREATED",
      entityType: "StaticPage",
      entityId: page._id,
      meta: { slug: page.slug, title: page.title },
    });

    res.status(201).json({ page });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to create page" });
  }
}

async function adminUpdatePage(req, res) {
  try {
    const body = pageSchema.partial().parse(req.body);

    const page = await StaticPage.findById(req.params.id);
    if (!page) {
      return res.status(404).json({ message: "Page not found" });
    }

    // Check slug uniqueness if changing
    if (body.slug && body.slug !== page.slug) {
      const existing = await StaticPage.findOne({ slug: body.slug });
      if (existing) {
        return res.status(400).json({ message: "Slug already exists" });
      }
    }

    // Update fields
    if (body.slug !== undefined) page.slug = body.slug;
    if (body.title !== undefined) page.title = body.title;
    if (body.content !== undefined) page.content = body.content;
    if (body.status !== undefined) {
      page.status = body.status;
      page.publishedAt = body.status === "published" ? new Date() : null;
    }

    page.updatedByAdminId = req.user._id;
    await page.save();

    await AuditLog.create({
      actorUserId: req.user._id,
      action: "STATIC_PAGE_UPDATED",
      entityType: "StaticPage",
      entityId: page._id,
      meta: { updates: body },
    });

    res.json({ page });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to update page" });
  }
}

async function adminDeletePage(req, res) {
  try {
    const page = await StaticPage.findByIdAndDelete(req.params.id);
    if (!page) {
      return res.status(404).json({ message: "Page not found" });
    }

    await AuditLog.create({
      actorUserId: req.user._id,
      action: "STATIC_PAGE_DELETED",
      entityType: "StaticPage",
      entityId: page._id,
      meta: { slug: page.slug, title: page.title },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function adminPublishPage(req, res) {
  try {
    const page = await StaticPage.findById(req.params.id);
    if (!page) {
      return res.status(404).json({ message: "Page not found" });
    }

    page.status = "published";
    page.publishedAt = new Date();
    page.updatedByAdminId = req.user._id;
    await page.save();

    res.json({ page });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function adminUnpublishPage(req, res) {
  try {
    const page = await StaticPage.findById(req.params.id);
    if (!page) {
      return res.status(404).json({ message: "Page not found" });
    }

    page.status = "draft";
    page.publishedAt = null;
    page.updatedByAdminId = req.user._id;
    await page.save();

    res.json({ page });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  adminListPages,
  adminGetPage,
  adminCreatePage,
  adminUpdatePage,
  adminDeletePage,
  adminPublishPage,
  adminUnpublishPage,
};