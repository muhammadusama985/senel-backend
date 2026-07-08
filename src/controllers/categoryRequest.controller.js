const { z } = require("zod");
const Category = require("../models/Category");
const CategoryRequest = require("../models/CategoryRequest");
const Vendor = require("../models/Vendor");
const AuditLog = require("../models/AuditLog");
const { notifyVendorOwner } = require("../services/notification.service");

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

async function findUniqueSlugForRequest(baseName) {
  const baseSlug = slugify(baseName);
  let slug = baseSlug;
  let counter = 1;
  // Ensure uniqueness against existing categories AND existing pending requests
  // so two vendors asking for the same name don't fight.
  while (
    (await Category.findOne({ slug }).lean()) ||
    (await CategoryRequest.findOne({ slug }).lean())
  ) {
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
  return slug;
}

/* -------------------------------- VENDOR -------------------------------- */

const createRequestSchema = z.object({
  name: z.string().min(2, "Category name must be at least 2 characters").max(80),
  parentId: z.string().nullable().optional(),
  description: z.string().max(500).optional(),
});

async function vendorCreateCategoryRequest(req, res) {
  const body = createRequestSchema.parse(req.body);

  const vendor = await Vendor.findOne({ ownerUserId: req.user._id }).lean();
  if (!vendor) return res.status(404).json({ message: "Vendor profile not found" });

  // If a category with the same name (or slug) already exists, no need to request it.
  const existing = await Category.findOne({
    $or: [{ name: new RegExp(`^${escapeRegex(body.name)}$`, "i") }],
  }).lean();
  if (existing) {
    return res.status(409).json({
      message: "A category with this name already exists",
      existingCategoryId: existing._id,
    });
  }

  // Block creating a duplicate pending request for the same name from the same vendor.
  const duplicate = await CategoryRequest.findOne({
    vendorId: vendor._id,
    name: new RegExp(`^${escapeRegex(body.name)}$`, "i"),
    status: "pending",
  }).lean();
  if (duplicate) {
    return res.status(409).json({
      message: "You already have a pending request for this category",
      requestId: duplicate._id,
    });
  }

  const slug = await findUniqueSlugForRequest(body.name);

  const request = await CategoryRequest.create({
    vendorId: vendor._id,
    name: body.name.trim(),
    slug,
    parentId: body.parentId || null,
    description: (body.description || "").trim(),
    status: "pending",
  });

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "CATEGORY_REQUEST_CREATED",
    entityType: "CategoryRequest",
    entityId: request._id,
    meta: {
      vendorId: vendor._id,
      requestedName: request.name,
    },
  });

  res.status(201).json({ request });
}

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function vendorListMyCategoryRequests(req, res) {
  const vendor = await Vendor.findOne({ ownerUserId: req.user._id }).lean();
  if (!vendor) return res.status(404).json({ message: "Vendor profile not found" });

  const requests = await CategoryRequest.find({ vendorId: vendor._id })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ requests });
}

async function vendorGetMyCategoryRequest(req, res) {
  const vendor = await Vendor.findOne({ ownerUserId: req.user._id }).lean();
  if (!vendor) return res.status(404).json({ message: "Vendor profile not found" });

  const request = await CategoryRequest.findOne({
    _id: req.params.requestId,
    vendorId: vendor._id,
  }).lean();

  if (!request) return res.status(404).json({ message: "Request not found" });
  res.json({ request });
}

/* --------------------------------- ADMIN -------------------------------- */

async function adminListCategoryRequests(req, res) {
  const { status } = req.query;
  const query = {};
  if (status && ["pending", "approved", "rejected"].includes(status)) {
    query.status = status;
  }

  const requests = await CategoryRequest.find(query)
    .populate("vendorId", "storeName ownerUserId")
    .populate("reviewedByAdminId", "email")
    .populate("createdCategoryId", "name slug isActive")
    .sort({ createdAt: -1 })
    .lean();

  res.json({ requests });
}

const decisionSchema = z.object({
  adminNote: z.string().max(500).optional(),
});

async function adminApproveCategoryRequest(req, res) {
  const body = decisionSchema.parse(req.body || {});
  const request = await CategoryRequest.findById(req.params.requestId);
  if (!request) return res.status(404).json({ message: "Request not found" });
  if (request.status !== "pending") {
    return res.status(400).json({ message: `Request is already ${request.status}` });
  }

  // Make sure no category slipped in while pending
  const existing = await Category.findOne({ slug: request.slug }).lean();
  let category;
  if (existing) {
    category = existing;
  } else {
    category = await Category.create({
      name: request.name,
      slug: request.slug,
      parentId: request.parentId || null,
      isActive: true,
      sortOrder: 0,
      imageUrl: "",
    });
  }

  request.status = "approved";
  request.adminNote = (body.adminNote || "").trim();
  request.reviewedByAdminId = req.user._id;
  request.reviewedAt = new Date();
  request.createdCategoryId = category._id;
  await request.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "CATEGORY_REQUEST_APPROVED",
    entityType: "CategoryRequest",
    entityId: request._id,
    meta: { vendorId: request.vendorId, createdCategoryId: category._id, name: request.name },
  });

  // Notify the requesting vendor
  await notifyVendorOwner({
    vendorId: request.vendorId,
    title: "✅ Category request approved",
    body: `Your request for the category "${request.name}" has been approved. You can now use it when creating or editing products.`,
    type: "category_request",
    data: { requestId: request._id, status: "approved", categoryId: category._id },
  });

  res.json({ request, category });
}

async function adminRejectCategoryRequest(req, res) {
  const body = decisionSchema.parse(req.body || {});
  const request = await CategoryRequest.findById(req.params.requestId);
  if (!request) return res.status(404).json({ message: "Request not found" });
  if (request.status !== "pending") {
    return res.status(400).json({ message: `Request is already ${request.status}` });
  }

  request.status = "rejected";
  request.adminNote = (body.adminNote || "").trim();
  request.reviewedByAdminId = req.user._id;
  request.reviewedAt = new Date();
  await request.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "CATEGORY_REQUEST_REJECTED",
    entityType: "CategoryRequest",
    entityId: request._id,
    meta: {
      vendorId: request.vendorId,
      name: request.name,
      adminNote: request.adminNote,
    },
  });

  // Notify the requesting vendor
  await notifyVendorOwner({
    vendorId: request.vendorId,
    title: "❌ Category request rejected",
    body:
      `Your request for the category "${request.name}" was rejected.` +
      (request.adminNote ? ` Reason: ${request.adminNote}` : ""),
    type: "category_request",
    data: { requestId: request._id, status: "rejected" },
  });

  res.json({ request });
}

module.exports = {
  vendorCreateCategoryRequest,
  vendorListMyCategoryRequests,
  vendorGetMyCategoryRequest,
  adminListCategoryRequests,
  adminApproveCategoryRequest,
  adminRejectCategoryRequest,
};
