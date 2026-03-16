const { z } = require("zod");
const Vendor = require("../models/Vendor");
const AuditLog = require("../models/AuditLog");
const User = require("../models/User");
const FileUtils = require('../utils/fileUtils');

// Utility: basic slug
function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

// Vendor create/update profile
const vendorUpsertSchema = z.object({
  storeName: z.string().min(2),
  description: z.string().optional(),
  logoUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  settings: z
    .object({
      timezone: z.string().optional(),
      currency: z.string().optional(),
      language: z.enum(["en", "de", "tr"]).optional(),
    })
    .optional(),

  business: z
    .object({
      companyName: z.string().optional(),
      taxId: z.string().optional(),
      country: z.string().optional(),
      city: z.string().optional(),
      addressLine: z.string().optional(),
      contactName: z.string().optional(),
      contactPhone: z.string().optional(),
    })
    .optional(),
});

const notificationSettingsSchema = z.object({
  emailOrders: z.boolean().optional(),
  emailPayouts: z.boolean().optional(),
  emailMarketing: z.boolean().optional(),
  pushOrders: z.boolean().optional(),
  pushPayouts: z.boolean().optional(),
  pushLowStock: z.boolean().optional(),
});

const securitySettingsSchema = z.object({
  twoFactorAuth: z.boolean().optional(),
  sessionTimeout: z.string().optional(),
});

// ========== FILE UPLOAD FUNCTIONS ==========

async function uploadLogo(req, res) {
    try {
        if (req.user.role !== "vendor") {
            return res.status(403).json({ message: "Only vendor users can upload logo" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const vendor = await Vendor.findOne({ ownerUserId: req.user._id });
        if (!vendor) {
            return res.status(404).json({ message: "Vendor profile not found" });
        }

        // Delete old logo if exists
        if (vendor.logoUrl) {
            FileUtils.deleteFile(vendor.logoUrl);
        }

        // Generate URL for the uploaded file
        const fileUrl = FileUtils.getFileUrl(req, req.file.filename, 'vendor/logos');
        
        vendor.logoUrl = fileUrl;
        await vendor.save();

        await AuditLog.create({
            actorUserId: req.user._id,
            action: "VENDOR_LOGO_UPLOADED",
            entityType: "Vendor",
            entityId: vendor._id,
        });

        res.json({ 
            vendor,
            logoUrl: fileUrl 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function uploadBanner(req, res) {
    try {
        if (req.user.role !== "vendor") {
            return res.status(403).json({ message: "Only vendor users can upload banner" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const vendor = await Vendor.findOne({ ownerUserId: req.user._id });
        if (!vendor) {
            return res.status(404).json({ message: "Vendor profile not found" });
        }

        // Delete old banner if exists
        if (vendor.bannerUrl) {
            FileUtils.deleteFile(vendor.bannerUrl);
        }

        // Generate URL for the uploaded file
        const fileUrl = FileUtils.getFileUrl(req, req.file.filename, 'vendor/banners');
        
        vendor.bannerUrl = fileUrl;
        await vendor.save();

        await AuditLog.create({
            actorUserId: req.user._id,
            action: "VENDOR_BANNER_UPLOADED",
            entityType: "Vendor",
            entityId: vendor._id,
        });

        res.json({ 
            vendor,
            bannerUrl: fileUrl 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// ✅ SINGLE VERSION - File upload with document type
async function addVerificationDoc(req, res) {
    if (req.user.role !== "vendor") {
        return res.status(403).json({ message: "Only vendor users can upload verification docs" });
    }

    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const { type } = req.body;
        if (!type) {
            return res.status(400).json({ message: "Document type is required" });
        }

        const vendor = await Vendor.findOne({ ownerUserId: req.user._id });
        if (!vendor) return res.status(404).json({ message: "Vendor profile not found" });

        if (vendor.status === "blocked") {
            return res.status(403).json({ message: "Vendor is blocked" });
        }

        // Generate URL for the uploaded file
        const fileUrl = FileUtils.getFileUrl(req, req.file.filename, 'vendor/documents');

        vendor.verificationDocs.push({ 
            type, 
            fileUrl,
            uploadedAt: new Date() 
        });
        
        await vendor.save();

        await AuditLog.create({
            actorUserId: req.user._id,
            action: "VENDOR_DOCUMENT_UPLOADED",
            entityType: "Vendor",
            entityId: vendor._id,
            meta: { docType: type }
        });

        return res.status(201).json({ vendor });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

async function removeVerificationDoc(req, res) {
    if (req.user.role !== "vendor") {
        return res.status(403).json({ message: "Only vendor users can remove documents" });
    }

    try {
        const vendor = await Vendor.findOne({ ownerUserId: req.user._id });
        if (!vendor) return res.status(404).json({ message: "Vendor profile not found" });

        const { docId } = req.params;
        
        const doc = vendor.verificationDocs.id(docId);
        if (!doc) {
            return res.status(404).json({ message: "Document not found" });
        }

        // Delete physical file
        FileUtils.deleteFile(doc.fileUrl);

        // Remove from array
        doc.deleteOne();
        await vendor.save();

        await AuditLog.create({
            actorUserId: req.user._id,
            action: "VENDOR_DOCUMENT_REMOVED",
            entityType: "Vendor",
            entityId: vendor._id,
            meta: { docType: doc.type }
        });

        return res.json({ vendor });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
}

// ========== VENDOR PROFILE FUNCTIONS ==========

async function upsertMyVendor(req, res) {
  const body = vendorUpsertSchema.parse(req.body);

  // Only vendors can create/update vendor profile
  if (req.user.role !== "vendor") {
    return res.status(403).json({ message: "Only vendor users can manage vendor profile" });
  }

  let vendor = await Vendor.findOne({ ownerUserId: req.user._id });

  if (!vendor) {
    const baseSlug = slugify(body.storeName);
    // Ensure unique slug
    let slug = baseSlug;
    let counter = 1;
    while (await Vendor.findOne({ storeSlug: slug })) {
      counter += 1;
      slug = `${baseSlug}-${counter}`;
    }

    vendor = await Vendor.create({
      ownerUserId: req.user._id,
      storeName: body.storeName,
      storeSlug: slug,
      description: body.description || "",
      logoUrl: body.logoUrl || "",
      bannerUrl: body.bannerUrl || "",
      business: { ...(body.business || {}) },
      settings: {
        timezone: body.settings?.timezone || "Europe/Berlin",
        currency: body.settings?.currency || "EUR",
        language: body.settings?.language || "en",
      },
      status: "draft",
    });

    if (body.email || body.phone || body.settings?.language) {
      await User.updateOne(
        { _id: req.user._id },
        {
          $set: {
            ...(body.email ? { email: body.email } : {}),
            ...(body.phone ? { phone: body.phone } : {}),
            ...(body.settings?.language ? { preferredLanguage: body.settings.language } : {}),
          },
        }
      );
    }

    const owner = await User.findById(req.user._id).lean();
    return res.status(201).json({ vendor: { ...vendor.toObject(), email: owner?.email || "", phone: owner?.phone || "" } });
  }

  if (["blocked"].includes(vendor.status)) {
    return res.status(400).json({ message: `Cannot edit vendor profile while status is ${vendor.status}` });
  }

  vendor.storeName = body.storeName;
  vendor.description = body.description ?? vendor.description;
  vendor.logoUrl = body.logoUrl ?? vendor.logoUrl;
  vendor.bannerUrl = body.bannerUrl ?? vendor.bannerUrl;
  vendor.business = { ...vendor.business, ...(body.business || {}) };
  const currentSettings =
    typeof vendor.settings?.toObject === "function" ? vendor.settings.toObject() : (vendor.settings || {});
  vendor.settings = {
    timezone: body.settings?.timezone ?? currentSettings.timezone ?? "Europe/Berlin",
    currency: body.settings?.currency ?? currentSettings.currency ?? "EUR",
    language: body.settings?.language ?? currentSettings.language ?? "en",
    notifications: currentSettings.notifications || {},
    security: currentSettings.security || {},
  };

  await vendor.save();

  if (body.email || body.phone || body.settings?.language) {
    await User.updateOne(
      { _id: req.user._id },
      {
        $set: {
          ...(body.email ? { email: body.email } : {}),
          ...(body.phone ? { phone: body.phone } : {}),
          ...(body.settings?.language ? { preferredLanguage: body.settings.language } : {}),
        },
      }
    );
  }

  const owner = await User.findById(req.user._id).lean();
  return res.json({ vendor: { ...vendor.toObject(), email: owner?.email || "", phone: owner?.phone || "" } });
}

// Submit for review
async function submitForReview(req, res) {
  if (req.user.role !== "vendor") {
    return res.status(403).json({ message: "Only vendor users can submit for review" });
  }

  const vendor = await Vendor.findOne({ ownerUserId: req.user._id });
  if (!vendor) return res.status(404).json({ message: "Vendor profile not found" });

  // Minimal validation (expand later)
  if (!vendor.storeName || !vendor.business.companyName) {
    return res.status(400).json({ message: "Missing required business/store fields" });
  }
  if (!vendor.verificationDocs.length) {
    return res.status(400).json({ message: "At least one verification document is required" });
  }

  if (vendor.status === "approved") return res.json({ vendor });

  vendor.status = "submitted";
  await vendor.save();

  return res.json({ vendor });
}

// Get my vendor
async function getMyVendor(req, res) {
  if (req.user.role !== "vendor") {
    return res.status(403).json({ message: "Only vendor users can view vendor profile" });
  }

  const vendor = await Vendor.findOne({ ownerUserId: req.user._id }).lean();
  if (!vendor) return res.status(404).json({ message: "Vendor profile not found" });
  const owner = await User.findById(req.user._id).lean();

  return res.json({
    vendor: {
      ...vendor,
      email: owner?.email || "",
      phone: owner?.phone || "",
    },
  });
}

async function updateVendorNotifications(req, res) {
  if (req.user.role !== "vendor") {
    return res.status(403).json({ message: "Only vendor users can update notification settings" });
  }

  const body = notificationSettingsSchema.parse(req.body);
  const vendor = await Vendor.findOne({ ownerUserId: req.user._id });
  if (!vendor) return res.status(404).json({ message: "Vendor profile not found" });

  vendor.settings = vendor.settings || {};
  vendor.settings.notifications = {
    ...(vendor.settings.notifications || {}),
    ...body,
  };

  await vendor.save();
  return res.json({ settings: vendor.settings.notifications });
}

async function updateVendorSecurity(req, res) {
  if (req.user.role !== "vendor") {
    return res.status(403).json({ message: "Only vendor users can update security settings" });
  }

  const body = securitySettingsSchema.parse(req.body);
  const vendor = await Vendor.findOne({ ownerUserId: req.user._id });
  if (!vendor) return res.status(404).json({ message: "Vendor profile not found" });

  vendor.settings = vendor.settings || {};
  vendor.settings.security = {
    ...(vendor.settings.security || {}),
    ...body,
  };

  await vendor.save();
  return res.json({ settings: vendor.settings.security });
}

// ========== ADMIN FUNCTIONS ==========

const adminReviewSchema = z.object({
  note: z.string().optional(),
});

const permissionsSchema = z.object({
  canCreateProducts: z.boolean().optional(),
  canReceiveOrders: z.boolean().optional(),
  canRequestPayouts: z.boolean().optional(),
});

async function adminListVendors(req, res) {
  const { status } = req.query;

  const query = {};
  if (status) query.status = status;

  const vendors = await Vendor.find(query).sort({ createdAt: -1 }).lean();
  return res.json({ vendors });
}

async function adminGetVendor(req, res) {
  const vendorId = req.params.vendorId;
  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });
  return res.json({ vendor });
}

async function adminGetVendorAudit(req, res) {
  const vendorId = req.params.vendorId;
  const items = await AuditLog.find({
    entityType: "Vendor",
    entityId: vendorId,
  })
    .populate("actorUserId", "email firstName lastName")
    .sort({ createdAt: -1 })
    .lean();

  return res.json({
    items: items.map((item) => ({
      ...item,
      note: item.meta?.note || item.reviewNote || item.action,
    })),
  });
}

async function adminUpdateVendorPermissions(req, res) {
  const vendorId = req.params.vendorId;
  const body = permissionsSchema.parse(req.body);

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });

  vendor.permissions = {
    ...vendor.permissions,
    ...body,
  };

  await vendor.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "VENDOR_PERMISSIONS_UPDATED",
    entityType: "Vendor",
    entityId: vendor._id,
    meta: { permissions: vendor.permissions },
  });

  return res.json({ vendor });
}

async function adminSetUnderReview(req, res) {
  const vendorId = req.params.vendorId;
  const body = adminReviewSchema.parse(req.body);

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });

  if (vendor.status === "blocked") return res.status(400).json({ message: "Vendor is blocked" });

  vendor.status = "under_review";
  vendor.reviewNote = body.note || "";
  vendor.reviewedByAdminId = req.user._id;
  vendor.reviewedAt = new Date();
  await vendor.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "VENDOR_SET_UNDER_REVIEW",
    entityType: "Vendor",
    entityId: vendor._id,
    meta: { note: vendor.reviewNote },
  });

  return res.json({ vendor });
}

async function adminApproveVendor(req, res) {
  const vendorId = req.params.vendorId;
  const body = adminReviewSchema.parse(req.body);

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });

  vendor.status = "approved";
  vendor.isVerifiedBadge = true;
  vendor.reviewNote = body.note || "";
  vendor.reviewedByAdminId = req.user._id;
  vendor.reviewedAt = new Date();
  await vendor.save();

  await User.updateOne({ _id: vendor.ownerUserId }, { $set: { isVerifiedBusiness: true } });

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "VENDOR_APPROVED",
    entityType: "Vendor",
    entityId: vendor._id,
    meta: { note: vendor.reviewNote },
  });

  return res.json({ vendor });
}

async function adminRejectVendor(req, res) {
  const vendorId = req.params.vendorId;
  const body = adminReviewSchema.parse(req.body);

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });

  vendor.status = "rejected";
  vendor.isVerifiedBadge = false;
  vendor.reviewNote = body.note || "";
  vendor.reviewedByAdminId = req.user._id;
  vendor.reviewedAt = new Date();
  await vendor.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "VENDOR_REJECTED",
    entityType: "Vendor",
    entityId: vendor._id,
    meta: { note: vendor.reviewNote },
  });

  return res.json({ vendor });
}

async function adminBlockVendor(req, res) {
  const vendorId = req.params.vendorId;
  const body = adminReviewSchema.parse(req.body);

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });

  vendor.status = "blocked";
  vendor.isVerifiedBadge = false;
  vendor.reviewNote = body.note || "";
  vendor.reviewedByAdminId = req.user._id;
  vendor.reviewedAt = new Date();
  await vendor.save();

  await User.updateOne({ _id: vendor.ownerUserId }, { $set: { status: "blocked" } });

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "VENDOR_BLOCKED",
    entityType: "Vendor",
    entityId: vendor._id,
    meta: { note: vendor.reviewNote },
  });

  return res.json({ vendor });
}

// ========== EXPORTS ==========
module.exports = {
  upsertMyVendor,
  addVerificationDoc,      // ✅ Single file upload version
  removeVerificationDoc,
  submitForReview,
  getMyVendor,
  updateVendorNotifications,
  updateVendorSecurity,
  uploadLogo,
  uploadBanner,
  adminListVendors,
  adminGetVendor,
  adminGetVendorAudit,
  adminUpdateVendorPermissions,
  adminSetUnderReview,
  adminApproveVendor,
  adminRejectVendor,
  adminBlockVendor,
};
