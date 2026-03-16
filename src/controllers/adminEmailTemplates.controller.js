const { z } = require("zod");
const EmailTemplate = require("../models/EmailTemplate");
const AuditLog = require("../models/AuditLog");

const templateSchema = z.object({
  key: z.string().min(2),
  subject: z.string().min(1),
  htmlBody: z.string().min(1),
  textBody: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

async function adminListTemplates(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.isActive !== undefined) {
      query.isActive = req.query.isActive === "true";
    }

    const [items, total] = await Promise.all([
      EmailTemplate.find(query)
        .sort({ key: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EmailTemplate.countDocuments(query),
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

async function adminGetTemplate(req, res) {
  try {
    const template = await EmailTemplate.findById(req.params.id).lean();
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json({ template });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function adminGetTemplateByKey(req, res) {
  try {
    const template = await EmailTemplate.findOne({ key: req.params.key }).lean();
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json({ template });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function adminCreateTemplate(req, res) {
  try {
    const body = templateSchema.parse(req.body);

    // Check if key exists
    const existing = await EmailTemplate.findOne({ key: body.key });
    if (existing) {
      return res.status(400).json({ message: "Template key already exists" });
    }

    const template = await EmailTemplate.create({
      ...body,
      textBody: body.textBody || "",
      isActive: body.isActive ?? true,
      createdByAdminId: req.user._id,
      updatedByAdminId: req.user._id,
    });

    await AuditLog.create({
      actorUserId: req.user._id,
      action: "EMAIL_TEMPLATE_CREATED",
      entityType: "EmailTemplate",
      entityId: template._id,
      meta: { key: template.key },
    });

    res.status(201).json({ template });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to create template" });
  }
}

async function adminUpdateTemplate(req, res) {
  try {
    const body = templateSchema.partial().parse(req.body);

    const template = await EmailTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }

    // Check key uniqueness if changing
    if (body.key && body.key !== template.key) {
      const existing = await EmailTemplate.findOne({ key: body.key });
      if (existing) {
        return res.status(400).json({ message: "Template key already exists" });
      }
    }

    // Update fields
    Object.keys(body).forEach(key => {
      if (body[key] !== undefined) {
        template[key] = body[key];
      }
    });

    template.updatedByAdminId = req.user._id;
    await template.save();

    await AuditLog.create({
      actorUserId: req.user._id,
      action: "EMAIL_TEMPLATE_UPDATED",
      entityType: "EmailTemplate",
      entityId: template._id,
      meta: { updates: body },
    });

    res.json({ template });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to update template" });
  }
}

async function adminDeleteTemplate(req, res) {
  try {
    const template = await EmailTemplate.findByIdAndDelete(req.params.id);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }

    await AuditLog.create({
      actorUserId: req.user._id,
      action: "EMAIL_TEMPLATE_DELETED",
      entityType: "EmailTemplate",
      entityId: template._id,
      meta: { key: template.key },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  adminListTemplates,
  adminGetTemplate,
  adminGetTemplateByKey,
  adminCreateTemplate,
  adminUpdateTemplate,
  adminDeleteTemplate,
};