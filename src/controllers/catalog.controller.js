const { z } = require("zod");
const Category = require("../models/Category");
const AttributeSet = require("../models/AttributeSet");
const AuditLog = require("../models/AuditLog");

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/** ---------------------- CATEGORIES ---------------------- **/

const createCategorySchema = z.object({
  name: z.string().min(2),
  parentId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  imageUrl: z.string().url().optional(),
});

async function adminCreateCategory(req, res) {
  const body = createCategorySchema.parse(req.body);

  const baseSlug = slugify(body.name);
  let slug = baseSlug;
  let counter = 1;
  while (await Category.findOne({ slug })) {
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }

  const category = await Category.create({
    name: body.name,
    slug,
    parentId: body.parentId || null,
    isActive: body.isActive ?? true,
    sortOrder: body.sortOrder ?? 0,
    imageUrl: body.imageUrl ?? "",
  });

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "CATEGORY_CREATED",
    entityType: "Category",
    entityId: category._id,
    meta: { name: category.name, slug: category.slug, parentId: category.parentId },
  });

  res.status(201).json({ category });
}

async function adminListCategories(req, res) {
  const { activeOnly } = req.query;

  const query = {};
  if (activeOnly === "true") query.isActive = true;

  const categories = await Category.find(query).sort({ parentId: 1, sortOrder: 1, name: 1 }).lean();
  res.json({ categories });
}

const updateCategorySchema = z.object({
  name: z.string().min(2).optional(),
  parentId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  imageUrl: z.string().url().optional(),
});

async function adminUpdateCategory(req, res) {
  const categoryId = req.params.categoryId;
  const body = updateCategorySchema.parse(req.body);

  const category = await Category.findById(categoryId);
  if (!category) return res.status(404).json({ message: "Category not found" });

  if (body.name && body.name !== category.name) {
    category.name = body.name;

    // Update slug safely when name changes
    const baseSlug = slugify(body.name);
    let slug = baseSlug;
    let counter = 1;
    while (await Category.findOne({ slug, _id: { $ne: category._id } })) {
      counter += 1;
      slug = `${baseSlug}-${counter}`;
    }
    category.slug = slug;
  }

  if (body.parentId !== undefined) category.parentId = body.parentId;
  if (body.isActive !== undefined) category.isActive = body.isActive;
  if (body.sortOrder !== undefined) category.sortOrder = body.sortOrder;
  if (body.imageUrl !== undefined) category.imageUrl = body.imageUrl;

  await category.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "CATEGORY_UPDATED",
    entityType: "Category",
    entityId: category._id,
    meta: { updates: body },
  });

  res.json({ category });
}

async function adminDeleteCategory(req, res) {
  const categoryId = req.params.categoryId;

  const childrenCount = await Category.countDocuments({ parentId: categoryId });
  if (childrenCount > 0) {
    return res.status(400).json({ message: "Cannot delete: category has subcategories" });
  }

  const category = await Category.findByIdAndDelete(categoryId);
  if (!category) return res.status(404).json({ message: "Category not found" });

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "CATEGORY_DELETED",
    entityType: "Category",
    entityId: category._id,
    meta: { name: category.name, slug: category.slug },
  });

  res.json({ ok: true });
}

/** ------------------- ATTRIBUTE SETS ------------------- **/

const attributeSchema = z.object({
  code: z.string().min(2).transform((v) => v.toLowerCase()),
  name: z.string().min(2),
  type: z.enum(["select", "multi_select", "text", "number"]).optional(),
  options: z.array(z.string().min(1)).optional(),
  isVariant: z.boolean().optional(),
  isRequired: z.boolean().optional(),
});

const createAttributeSetSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).transform((v) => v.toLowerCase()),
  isActive: z.boolean().optional(),
  attributes: z.array(attributeSchema).optional(),
});

async function adminCreateAttributeSet(req, res) {
  const body = createAttributeSetSchema.parse(req.body);

  const exists = await AttributeSet.findOne({ code: body.code }).lean();
  if (exists) return res.status(409).json({ message: "Attribute set code already exists" });

  const attributeSet = await AttributeSet.create({
    name: body.name,
    code: body.code,
    isActive: body.isActive ?? true,
    attributes: body.attributes ?? [],
  });

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "ATTRIBUTE_SET_CREATED",
    entityType: "AttributeSet",
    entityId: attributeSet._id,
    meta: { name: attributeSet.name, code: attributeSet.code },
  });

  res.status(201).json({ attributeSet });
}

async function adminListAttributeSets(req, res) {
  const { activeOnly } = req.query;

  const query = {};
  if (activeOnly === "true") query.isActive = true;

  const attributeSets = await AttributeSet.find(query).sort({ createdAt: -1 }).lean();
  res.json({ attributeSets });
}

async function getPublicCategories(req, res) {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ parentId: 1, sortOrder: 1, name: 1 })
      .lean();
    
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const updateAttributeSetSchema = z.object({
  name: z.string().min(2).optional(),
  isActive: z.boolean().optional(),
  attributes: z.array(attributeSchema).optional(), // full replace to keep it simple/consistent
});

async function adminUpdateAttributeSet(req, res) {
  const attributeSetId = req.params.attributeSetId;
  const body = updateAttributeSetSchema.parse(req.body);

  const attributeSet = await AttributeSet.findById(attributeSetId);
  if (!attributeSet) return res.status(404).json({ message: "Attribute set not found" });

  if (body.name !== undefined) attributeSet.name = body.name;
  if (body.isActive !== undefined) attributeSet.isActive = body.isActive;
  if (body.attributes !== undefined) attributeSet.attributes = body.attributes;

  await attributeSet.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "ATTRIBUTE_SET_UPDATED",
    entityType: "AttributeSet",
    entityId: attributeSet._id,
    meta: { updates: body },
  });

  res.json({ attributeSet });
}

async function adminDeleteAttributeSet(req, res) {
  const attributeSetId = req.params.attributeSetId;

  const attributeSet = await AttributeSet.findByIdAndDelete(attributeSetId);
  if (!attributeSet) return res.status(404).json({ message: "Attribute set not found" });

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "ATTRIBUTE_SET_DELETED",
    entityType: "AttributeSet",
    entityId: attributeSet._id,
    meta: { name: attributeSet.name, code: attributeSet.code },
  });

  res.json({ ok: true });
}

module.exports = {
  adminCreateCategory,
  adminListCategories,
  adminUpdateCategory,
  adminDeleteCategory,
  getPublicCategories,
  adminCreateAttributeSet,
  adminListAttributeSets,
  adminUpdateAttributeSet,
  adminDeleteAttributeSet,
};