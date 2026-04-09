const { z } = require("zod");
const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const Category = require("../models/Category");
const AttributeSet = require("../models/AttributeSet");
const AuditLog = require("../models/AuditLog");
const { normalizeTiers } = require("../utils/pricing");
const { normalizeML, resolveML } = require("../utils/ml");
const translationService = require("../services/translation.service");
const searchService = require("../services/search.service");
const FileUtils = require("../utils/fileUtils");


function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

const mlInput = z.object({
  en: z.string().optional(),
  de: z.string().optional(),
  tr: z.string().optional(),
});

const priceTierInput = z.object({
  minQty: z.number().int().min(1),
  unitPrice: z.number().min(0),
});

const variantInput = z.object({
  sku: z.string().min(1),
  attributes: z.record(z.any()).optional(),
  stockQty: z.number().int().min(0).optional(),
  imageUrls: z.array(z.string().url()).optional(),
});

const createProductSchema = z.object({
  title: z.string().min(2),
  titleML: mlInput.optional(),
  description: z.string().optional(),
  descriptionML: mlInput.optional(),
  categoryId: z.string().min(1),
  attributeSetId: z.string().nullable().optional(),
  country: z.string().optional(),
  currency: z.enum(["EUR", "TRY", "USD"]).optional(),
  sku: z.string().optional(),
  moq: z.number().int().min(1),
  priceTiers: z.array(priceTierInput).min(1),
  hasVariants: z.boolean().optional(),
  stockQty: z.number().int().min(0).optional(),
  variants: z.array(variantInput).optional(),
  imageUrls: z.array(z.string().url()).optional(),
  trackInventory: z.boolean().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  requiresManualShipping: z.boolean().optional(),
  lengthCm: z.number().min(0).optional(),
  widthCm: z.number().min(0).optional(),
  heightCm: z.number().min(0).optional(),
});

const updateProductSchema = createProductSchema.partial();

const adminCreateProductSchema = createProductSchema.extend({
  vendorId: z.string().optional(),
  autoApprove: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
});

const adminUpdateSchema = z.object({
  title: z.string().min(2).optional(),
  titleML: mlInput.optional(),
  description: z.string().optional(),
  descriptionML: mlInput.optional(),
  categoryId: z.string().optional(),
  attributeSetId: z.string().nullable().optional(),
  sku: z.string().optional(),
  moq: z.number().int().min(1).optional(),
  priceTiers: z.array(priceTierInput).optional(),
  stockQty: z.number().int().min(0).optional(),
  imageUrls: z.array(z.string().url()).optional(),
  hasVariants: z.boolean().optional(),
  variants: z.array(variantInput).optional(),
  country: z.string().optional(),
  currency: z.enum(["EUR", "TRY", "USD"]).optional(),
  trackInventory: z.boolean().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  requiresManualShipping: z.boolean().optional(),
  lengthCm: z.number().min(0).optional(),
  widthCm: z.number().min(0).optional(),
  heightCm: z.number().min(0).optional(),
  isFeatured: z.boolean().optional(),
  status: z.enum(["draft", "submitted", "approved", "rejected", "archived"]).optional(),
});

const adminReviewSchema = z.object({
  note: z.string().optional().default(""),
});

const featureSchema = z.object({
  isFeatured: z.boolean(),
});

const hotRequestSchema = z.object({
  note: z.string().max(500).optional().default(""),
});

async function getMyVendorOrThrow(userId) {
  const vendor = await Vendor.findOne({ ownerUserId: userId });
  if (!vendor) {
    const err = new Error("Vendor profile not found");
    err.statusCode = 404;
    throw err;
  }
  if (vendor.status !== "approved") {
    const err = new Error("Vendor is not approved yet");
    err.statusCode = 403;
    throw err;
  }
  if (vendor.permissions?.canCreateProducts === false) {
    const err = new Error("Vendor is not allowed to create products");
    err.statusCode = 403;
    throw err;
  }
  return vendor;
}

function localizeProduct(product, lang = "en") {
  if (!product) return product;
  return {
    ...product,
    title: resolveML(product.titleML, lang, product.title),
    description: resolveML(product.descriptionML, lang, product.description),
  };
}

async function buildProductTranslations({ title, description = "", titleML, descriptionML }) {
  const normalizedTitleML = normalizeML({
    ...(titleML || {}),
    en: titleML?.en || title || "",
  });
  const normalizedDescriptionML = normalizeML({
    ...(descriptionML || {}),
    en: descriptionML?.en ?? description ?? "",
  });

  for (const lang of ["de", "tr"]) {
    if (!normalizedTitleML[lang] && normalizedTitleML.en) {
      normalizedTitleML[lang] = await translationService.translateText(normalizedTitleML.en, lang);
    }
    if (!normalizedDescriptionML[lang] && normalizedDescriptionML.en) {
      normalizedDescriptionML[lang] = await translationService.translateText(normalizedDescriptionML.en, lang);
    }
  }

  return {
    title: normalizedTitleML.en || title || "",
    description: normalizedDescriptionML.en || description || "",
    titleML: normalizedTitleML,
    descriptionML: normalizedDescriptionML,
  };
}

async function ensureValidCategory(categoryId) {
  const category = await Category.findById(categoryId).lean();
  if (!category || category.isActive === false) {
    const err = new Error("Invalid or inactive category");
    err.statusCode = 400;
    throw err;
  }
}

async function ensureValidAttributeSet(attributeSetId) {
  if (!attributeSetId) return;
  const set = await AttributeSet.findById(attributeSetId).lean();
  if (!set || set.isActive === false) {
    const err = new Error("Invalid or inactive attribute set");
    err.statusCode = 400;
    throw err;
  }
}

function normalizeInventoryPayload(body, currentProduct = null) {
  const hasVariants = body.hasVariants !== undefined ? body.hasVariants : currentProduct?.hasVariants === true;

  if (hasVariants) {
    return {
      hasVariants: true,
      stockQty: body.stockQty ?? currentProduct?.stockQty ?? 0,
      variants: body.variants ?? currentProduct?.variants ?? [],
    };
  }

  return {
    hasVariants: false,
    stockQty: body.stockQty ?? currentProduct?.stockQty ?? 0,
    variants: [],
  };
}

function normalizeSkuValue(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .toUpperCase();
}

function buildGeneratedSku(title, suffix = "SKU") {
  const base = slugify(title || "product")
    .replace(/-/g, "")
    .toUpperCase()
    .slice(0, 8) || "PRODUCT";
  const stamp = Date.now().toString(36).toUpperCase().slice(-4);
  return `${base}-${suffix}-${stamp}`;
}

function normalizeVariants(variants = [], title = "") {
  if (!Array.isArray(variants) || variants.length === 0) {
    const err = new Error("At least one variant is required when variants are enabled");
    err.statusCode = 400;
    throw err;
  }

  const seen = new Set();

  return variants.map((variant, index) => {
    const normalizedSku = normalizeSkuValue(variant?.sku) || buildGeneratedSku(title, `VAR${index + 1}`);
    const skuKey = normalizedSku.toUpperCase();

    if (seen.has(skuKey)) {
      const err = new Error(`Duplicate variant SKU found: ${normalizedSku}`);
      err.statusCode = 400;
      throw err;
    }

    seen.add(skuKey);

    return {
      sku: normalizedSku,
      attributes: variant?.attributes || {},
      stockQty: Math.max(0, Number(variant?.stockQty || 0)),
      imageUrls: Array.isArray(variant?.imageUrls) ? variant.imageUrls : [],
    };
  });
}

function resolveProductSku(body, currentProduct = null, title = "") {
  return (
    normalizeSkuValue(body?.sku) ||
    normalizeSkuValue(currentProduct?.sku) ||
    buildGeneratedSku(title, "SKU")
  );
}

function validateMOQAndTiers(moq, priceTiers) {
  const originalTierCount = Array.isArray(priceTiers) ? priceTiers.length : 0;
  const normalized = normalizeTiers(priceTiers);
  if (!normalized.length) {
    const err = new Error("At least one price tier is required");
    err.statusCode = 400;
    throw err;
  }

  if (normalized.length !== originalTierCount) {
    const err = new Error("Price tier quantities must be valid and unique");
    err.statusCode = 400;
    throw err;
  }

  const smallestTier = normalized[0].minQty;
  if (moq > smallestTier) {
    const err = new Error(`MOQ cannot be greater than smallest tier minQty (${smallestTier})`);
    err.statusCode = 400;
    throw err;
  }

  return normalized;
}

function ensureProductImageUploadAllowed(req) {
  if (!req.user || !["vendor", "admin"].includes(req.user.role)) {
    const err = new Error("Only vendor or admin users can upload product images");
    err.statusCode = 403;
    throw err;
  }
}

async function ensureUniqueSlug({ vendorId, title, excludeProductId = null }) {
  const baseSlug = slugify(title);
  let slug = baseSlug;
  let counter = 1;

  while (
    await Product.findOne({
      vendorId,
      slug,
      ...(excludeProductId ? { _id: { $ne: excludeProductId } } : {}),
    })
  ) {
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }

  return slug;
}

async function resolveAdminTargetVendor(vendorId) {
  if (!vendorId) {
    return null;
  }

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    const err = new Error("Vendor not found");
    err.statusCode = 404;
    throw err;
  }

  return vendor;
}

async function adminArchiveProduct(req, res) {
  const productId = req.params.productId;
  const body = adminReviewSchema.parse(req.body);

  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ message: "Product not found" });

  product.status = "archived";
  product.reviewNote = body.note || "";
  product.reviewedByAdminId = req.user._id;
  product.reviewedAt = new Date();
  await product.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "PRODUCT_ARCHIVED",
    entityType: "Product",
    entityId: product._id,
    meta: { note: product.reviewNote },
  });

  res.json({ product: localizeProduct(product.toObject(), req.lang) });
}

async function vendorCreateProduct(req, res) {
  const body = createProductSchema.parse(req.body);
  const vendor = await getMyVendorOrThrow(req.user._id);

  await ensureValidCategory(body.categoryId);
  await ensureValidAttributeSet(body.attributeSetId || null);

  const localizedFields = await buildProductTranslations(body);
  const slug = await ensureUniqueSlug({ vendorId: vendor._id, title: localizedFields.title });
  const normalizedTiers = validateMOQAndTiers(body.moq, body.priceTiers);
  const inventory = normalizeInventoryPayload(body);
  const normalizedVariants = inventory.hasVariants ? normalizeVariants(inventory.variants, localizedFields.title) : [];
  const sku = resolveProductSku(body, null, localizedFields.title);

  const product = await Product.create({
    vendorId: vendor._id,
    title: localizedFields.title,
    titleML: localizedFields.titleML,
    sku,
    slug,
    description: localizedFields.description,
    descriptionML: localizedFields.descriptionML,
    categoryId: body.categoryId,
    attributeSetId: body.attributeSetId || null,
    country: body.country || "",
    currency: body.currency || vendor?.settings?.currency || "EUR",
    moq: body.moq,
    priceTiers: normalizedTiers,
    hasVariants: inventory.hasVariants,
    stockQty: inventory.stockQty,
    variants: normalizedVariants.map((variant) => ({
      ...variant,
      stockQty: inventory.stockQty,
    })),
    imageUrls: body.imageUrls ?? [],
    trackInventory: body.trackInventory ?? true,
    lowStockThreshold: body.lowStockThreshold ?? 5,
    requiresManualShipping: body.requiresManualShipping ?? false,
    lengthCm: body.lengthCm ?? 0,
    widthCm: body.widthCm ?? 0,
    heightCm: body.heightCm ?? 0,
    source: "vendor",
    isPlatformProduct: false,
    status: "draft",
  });

  await searchService.indexProduct(product);

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "PRODUCT_CREATED",
    entityType: "Product",
    entityId: product._id,
    meta: { vendorId: vendor._id, title: product.title, status: product.status },
  });

  res.status(201).json({ product: localizeProduct(product.toObject(), req.lang) });
}

async function vendorListMyProducts(req, res) {
  const vendor = await Vendor.findOne({ ownerUserId: req.user._id }).lean();
  if (!vendor) return res.status(404).json({ message: "Vendor profile not found" });

  const { status } = req.query;
  const query = { vendorId: vendor._id };
  if (status) query.status = status;

  const products = await Product.find(query).sort({ createdAt: -1 }).lean();
  res.json({ products: products.map((p) => localizeProduct(p, req.lang)) });
}

async function vendorGetMyProduct(req, res) {
  const vendor = await Vendor.findOne({ ownerUserId: req.user._id }).lean();
  if (!vendor) return res.status(404).json({ message: "Vendor profile not found" });

  const product = await Product.findOne({ _id: req.params.productId, vendorId: vendor._id }).lean();
  if (!product) return res.status(404).json({ message: "Product not found" });

  res.json({ product: localizeProduct(product, req.lang) });
}

async function vendorUpdateMyProduct(req, res) {
  const body = updateProductSchema.parse(req.body);

  const vendor = await Vendor.findOne({ ownerUserId: req.user._id });
  if (!vendor) return res.status(404).json({ message: "Vendor profile not found" });

  const product = await Product.findOne({ _id: req.params.productId, vendorId: vendor._id });
  if (!product) return res.status(404).json({ message: "Product not found" });

  if (["approved", "blocked"].includes(product.status)) {
    return res.status(400).json({ message: `Cannot edit product while status is ${product.status}` });
  }

  if (body.categoryId !== undefined) await ensureValidCategory(body.categoryId);
  if (body.attributeSetId !== undefined) await ensureValidAttributeSet(body.attributeSetId);

  if (
    body.title !== undefined ||
    body.description !== undefined ||
    body.titleML !== undefined ||
    body.descriptionML !== undefined
  ) {
    const localizedFields = await buildProductTranslations({
      title: body.title ?? product.title,
      description: body.description ?? product.description,
      titleML: { ...(product.titleML || {}), ...(body.titleML || {}) },
      descriptionML: { ...(product.descriptionML || {}), ...(body.descriptionML || {}) },
    });

    if (localizedFields.title !== product.title) {
      product.slug = await ensureUniqueSlug({
        vendorId: vendor._id,
        title: localizedFields.title,
        excludeProductId: product._id,
      });
    }

    product.title = localizedFields.title;
    product.titleML = localizedFields.titleML;
    product.description = localizedFields.description;
    product.descriptionML = localizedFields.descriptionML;
    product.sku = resolveProductSku(body, product, localizedFields.title);
  }

  if (body.sku !== undefined && body.title === undefined && body.titleML === undefined) {
    product.sku = resolveProductSku(body, product, product.title);
  }

  if (body.categoryId !== undefined) product.categoryId = body.categoryId;
  if (body.attributeSetId !== undefined) product.attributeSetId = body.attributeSetId;
  if (body.country !== undefined) product.country = body.country;
  if (body.currency !== undefined) product.currency = body.currency;

  if (body.moq !== undefined || body.priceTiers !== undefined) {
    const moq = body.moq ?? product.moq;
    const priceTiers = body.priceTiers ?? product.priceTiers;
    product.moq = moq;
    product.priceTiers = validateMOQAndTiers(moq, priceTiers);
  }

  if (
    body.hasVariants !== undefined ||
    body.variants !== undefined ||
    body.stockQty !== undefined
  ) {
    const inventory = normalizeInventoryPayload(body, product);
    product.hasVariants = inventory.hasVariants;
    product.stockQty = inventory.stockQty;
    product.variants = inventory.hasVariants
      ? normalizeVariants(inventory.variants, product.title).map((variant) => ({
          ...variant,
          stockQty: inventory.stockQty,
        }))
      : [];
  }

  if (body.imageUrls !== undefined) product.imageUrls = body.imageUrls;
  if (body.trackInventory !== undefined) product.trackInventory = body.trackInventory;
  if (body.lowStockThreshold !== undefined) product.lowStockThreshold = body.lowStockThreshold;
  if (body.requiresManualShipping !== undefined) product.requiresManualShipping = body.requiresManualShipping;
  if (body.lengthCm !== undefined) product.lengthCm = body.lengthCm;
  if (body.widthCm !== undefined) product.widthCm = body.widthCm;
  if (body.heightCm !== undefined) product.heightCm = body.heightCm;

  await product.save();
  await searchService.indexProduct(product);

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "PRODUCT_UPDATED",
    entityType: "Product",
    entityId: product._id,
    meta: { updates: body, status: product.status },
  });

  res.json({ product: localizeProduct(product.toObject(), req.lang) });
}

async function vendorDeleteMyProduct(req, res) {
  const vendor = await Vendor.findOne({ ownerUserId: req.user._id }).lean();
  if (!vendor) return res.status(404).json({ message: "Vendor profile not found" });

  const product = await Product.findOne({ _id: req.params.productId, vendorId: vendor._id });
  if (!product) return res.status(404).json({ message: "Product not found" });

  if (product.status === "approved") {
    return res.status(400).json({ message: "Cannot delete approved product. Archive it instead." });
  }

  await Product.deleteOne({ _id: product._id });

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "PRODUCT_DELETED",
    entityType: "Product",
    entityId: product._id,
    meta: { vendorId: vendor._id, title: product.title },
  });

  res.json({ ok: true });
}

async function vendorSubmitProduct(req, res) {
  const vendor = await getMyVendorOrThrow(req.user._id);

  const product = await Product.findOne({ _id: req.params.productId, vendorId: vendor._id });
  if (!product) return res.status(404).json({ message: "Product not found" });

  if (product.status === "approved") {
    return res.json({ product: localizeProduct(product.toObject(), req.lang) });
  }

  if (!product.title || !product.categoryId || !product.moq) {
    return res.status(400).json({ message: "Missing required fields" });
  }
  if (!product.priceTiers?.length) {
    return res.status(400).json({ message: "Price tiers are required" });
  }
  if (!product.sku) {
    product.sku = resolveProductSku({}, product, product.title);
  }
  if (product.hasVariants) {
    try {
      product.variants = normalizeVariants(product.variants, product.title).map((variant) => ({
        ...variant,
        stockQty: product.stockQty,
      }));
    } catch (error) {
      return res.status(error.statusCode || 400).json({ message: error.message });
    }
  }

  product.status = "submitted";
  await product.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "PRODUCT_SUBMITTED",
    entityType: "Product",
    entityId: product._id,
    meta: { vendorId: vendor._id, title: product.title },
  });

  res.json({ product: localizeProduct(product.toObject(), req.lang) });
}

async function vendorRequestHotProduct(req, res) {
  const vendor = await getMyVendorOrThrow(req.user._id);
  const body = hotRequestSchema.parse(req.body || {});

  const product = await Product.findOne({ _id: req.params.productId, vendorId: vendor._id });
  if (!product) return res.status(404).json({ message: "Product not found" });

  if (product.status !== "approved") {
    return res.status(400).json({ message: "Only approved products can be requested for hot products" });
  }

  if (product.isFeatured) {
    return res.status(400).json({ message: "This product is already in hot products" });
  }

  product.hotRequestStatus = "pending";
  product.hotRequestNote = body.note || "";
  product.hotRequestedAt = new Date();
  product.hotReviewedAt = null;
  product.hotReviewedByAdminId = null;
  await product.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "PRODUCT_HOT_REQUESTED",
    entityType: "Product",
    entityId: product._id,
    meta: { vendorId: vendor._id, note: product.hotRequestNote },
  });

  res.json({ product: localizeProduct(product.toObject(), req.lang) });
}

async function adminCreateProduct(req, res) {
  const body = adminCreateProductSchema.parse(req.body);
  const vendor = await resolveAdminTargetVendor(body.vendorId);

  await ensureValidCategory(body.categoryId);
  await ensureValidAttributeSet(body.attributeSetId || null);

  const localizedFields = await buildProductTranslations(body);
  const slug = await ensureUniqueSlug({ vendorId: vendor?._id || null, title: localizedFields.title });
  const normalizedTiers = validateMOQAndTiers(body.moq, body.priceTiers);
  const inventory = normalizeInventoryPayload(body);
  const normalizedVariants = inventory.hasVariants ? normalizeVariants(inventory.variants, localizedFields.title) : [];
  const status = body.autoApprove ? "approved" : "draft";
  const isPlatformProduct = !body.vendorId;
  const source = isPlatformProduct ? "admin_platform" : "admin_vendor";
  const sku = resolveProductSku(body, null, localizedFields.title);

  const product = await Product.create({
    vendorId: vendor?._id || null,
    title: localizedFields.title,
    titleML: localizedFields.titleML,
    sku,
    slug,
    description: localizedFields.description,
    descriptionML: localizedFields.descriptionML,
    categoryId: body.categoryId,
    attributeSetId: body.attributeSetId || null,
    country: body.country || "",
    currency: body.currency || "EUR",
    moq: body.moq,
    priceTiers: normalizedTiers,
    hasVariants: inventory.hasVariants,
    stockQty: inventory.stockQty,
    variants: normalizedVariants.map((variant) => ({
      ...variant,
      stockQty: inventory.stockQty,
    })),
    imageUrls: body.imageUrls ?? [],
    trackInventory: body.trackInventory ?? true,
    lowStockThreshold: body.lowStockThreshold ?? 5,
    requiresManualShipping: body.requiresManualShipping ?? false,
    lengthCm: body.lengthCm ?? 0,
    widthCm: body.widthCm ?? 0,
    heightCm: body.heightCm ?? 0,
    createdByAdminId: req.user._id,
    source,
    isPlatformProduct,
    isFeatured: body.isFeatured ?? false,
    status,
    ...(body.autoApprove
      ? { reviewedByAdminId: req.user._id, reviewedAt: new Date(), reviewNote: "Created by admin" }
      : {}),
  });

  await searchService.indexProduct(product);

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "PRODUCT_CREATED_BY_ADMIN",
    entityType: "Product",
    entityId: product._id,
    meta: {
      vendorId: vendor?._id || null,
      vendorSlug: vendor?.storeSlug || "admin",
      title: product.title,
      status: product.status,
    },
  });

  res.status(201).json({
    product: localizeProduct(product.toObject(), req.lang),
    vendor: vendor
      ? {
          id: vendor._id,
          storeName: vendor.storeName,
          storeSlug: vendor.storeSlug,
        }
      : null,
  });
}

async function adminListProducts(req, res) {
  const { status, vendorId, featured, q, page = 1, limit = 20 } = req.query;

  const query = {};
  if (status) query.status = status;
  if (vendorId) query.vendorId = vendorId;
  if (featured === "true") query.isFeatured = true;
  if (q) {
    const term = String(q).trim();
    if (term) {
      query.$or = [
        { title: { $regex: term, $options: "i" } },
        { slug: { $regex: term, $options: "i" } },
        { description: { $regex: term, $options: "i" } },
      ];
    }
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);
  const skip = (pageNum - 1) * limitNum;
  const total = await Product.countDocuments(query);

  const products = await Product.find(query)
    .populate("vendorId", "storeName")
    .populate("categoryId", "name")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

  res.json({
    products: products.map((p) =>
      localizeProduct(
        {
          ...p,
          vendorName: p.vendorId?.storeName || "",
          categoryName: p.categoryId?.name || "",
        },
        req.lang
      )
    ),
    total,
    page: pageNum,
    limit: limitNum,
    pages: Math.ceil(total / limitNum),
  });
}

async function adminUpdateProduct(req, res) {
  const productId = req.params.productId;
  const body = adminUpdateSchema.parse(req.body);

  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ message: "Product not found" });

  if (body.categoryId !== undefined) await ensureValidCategory(body.categoryId);
  if (body.attributeSetId !== undefined) await ensureValidAttributeSet(body.attributeSetId);

  if (
    body.title !== undefined ||
    body.description !== undefined ||
    body.titleML !== undefined ||
    body.descriptionML !== undefined
  ) {
    const localizedFields = await buildProductTranslations({
      title: body.title ?? product.title,
      description: body.description ?? product.description,
      titleML: { ...(product.titleML || {}), ...(body.titleML || {}) },
      descriptionML: { ...(product.descriptionML || {}), ...(body.descriptionML || {}) },
    });

    if (localizedFields.title !== product.title) {
      product.slug = await ensureUniqueSlug({
        vendorId: product.vendorId,
        title: localizedFields.title,
        excludeProductId: product._id,
      });
    }

    product.title = localizedFields.title;
    product.titleML = localizedFields.titleML;
    product.description = localizedFields.description;
    product.descriptionML = localizedFields.descriptionML;
    product.sku = resolveProductSku(body, product, localizedFields.title);
  }

  if (body.sku !== undefined && body.title === undefined && body.titleML === undefined) {
    product.sku = resolveProductSku(body, product, product.title);
  }

  if (body.categoryId !== undefined) product.categoryId = body.categoryId;
  if (body.attributeSetId !== undefined) product.attributeSetId = body.attributeSetId;
  if (body.country !== undefined) product.country = body.country;
  if (body.currency !== undefined) product.currency = body.currency;

  if (body.moq !== undefined || body.priceTiers !== undefined) {
    const moq = body.moq ?? product.moq;
    const priceTiers = body.priceTiers ?? product.priceTiers;
    product.moq = moq;
    product.priceTiers = validateMOQAndTiers(moq, priceTiers);
  }

  if (
    body.hasVariants !== undefined ||
    body.variants !== undefined ||
    body.stockQty !== undefined
  ) {
    const inventory = normalizeInventoryPayload(body, product);
    product.hasVariants = inventory.hasVariants;
    product.stockQty = inventory.stockQty;
    product.variants = inventory.hasVariants
      ? normalizeVariants(inventory.variants, product.title).map((variant) => ({
          ...variant,
          stockQty: inventory.stockQty,
        }))
      : [];
  }

  if (body.imageUrls !== undefined) product.imageUrls = body.imageUrls;
  if (body.trackInventory !== undefined) product.trackInventory = body.trackInventory;
  if (body.lowStockThreshold !== undefined) product.lowStockThreshold = body.lowStockThreshold;
  if (body.requiresManualShipping !== undefined) product.requiresManualShipping = body.requiresManualShipping;
  if (body.lengthCm !== undefined) product.lengthCm = body.lengthCm;
  if (body.widthCm !== undefined) product.widthCm = body.widthCm;
  if (body.heightCm !== undefined) product.heightCm = body.heightCm;
  if (body.isFeatured !== undefined) product.isFeatured = body.isFeatured;
  if (body.status !== undefined) product.status = body.status;

  product.updatedAt = new Date();
  await product.save();

  try {
    await searchService.indexProduct(product);
  } catch (searchError) {
    console.error("Search indexing failed:", searchError.message);
  }

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "PRODUCT_UPDATED",
    entityType: "Product",
    entityId: product._id,
    meta: { updates: body },
  });

  res.json({ product: localizeProduct(product.toObject(), req.lang) });
}

async function adminGetProduct(req, res) {
  const productId = req.params.productId;
  const product = await Product.findById(productId).lean();
  if (!product) return res.status(404).json({ message: "Product not found" });

  res.json({ product: localizeProduct(product, req.lang) });
}

async function uploadProductImage(req, res) {
  try {
    ensureProductImageUploadAllowed(req);

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    if (req.user.role === "vendor") {
      const vendor = await Vendor.findOne({ ownerUserId: req.user._id });
      if (!vendor) {
        return res.status(404).json({ message: "Vendor profile not found" });
      }

      if (vendor.status !== "approved") {
        return res.status(403).json({ message: "Vendor not approved" });
      }
    }

    const fileUrl = FileUtils.getFileUrl(req, req.file.filename, "vendor/products");

    res.status(201).json({
      success: true,
      imageUrl: fileUrl,
      filename: req.file.filename,
    });
  } catch (error) {
    console.error("Error uploading product image:", error);
    res.status(500).json({ message: error.message });
  }
}

async function uploadMultipleProductImages(req, res) {
  try {
    ensureProductImageUploadAllowed(req);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    if (req.user.role === "vendor") {
      const vendor = await Vendor.findOne({ ownerUserId: req.user._id });
      if (!vendor) {
        return res.status(404).json({ message: "Vendor profile not found" });
      }

      if (vendor.status !== "approved") {
        return res.status(403).json({ message: "Vendor not approved" });
      }
    }

    const imageUrls = req.files.map((file) =>
      FileUtils.getFileUrl(req, file.filename, "vendor/products")
    );

    res.status(201).json({
      success: true,
      imageUrls,
      count: imageUrls.length,
    });
  } catch (error) {
    console.error("Error uploading product images:", error);
    res.status(500).json({ message: error.message });
  }
}

async function adminApproveProduct(req, res) {
  const productId = req.params.productId;
  const body = adminReviewSchema.parse(req.body || {});
  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ message: "Product not found" });

  product.status = "approved";
  product.reviewNote = body.note || "";
  product.reviewedByAdminId = req.user._id;
  product.reviewedAt = new Date();
  await product.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "PRODUCT_APPROVED",
    entityType: "Product",
    entityId: product._id,
    meta: { note: product.reviewNote, vendorId: product.vendorId },
  });

  res.json({ product: localizeProduct(product.toObject(), req.lang) });
}

async function adminRejectProduct(req, res) {
  const productId = req.params.productId;
  const body = adminReviewSchema.parse(req.body || {});
  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ message: "Product not found" });

  product.status = "rejected";
  product.reviewNote = body.note || "";
  product.reviewedByAdminId = req.user._id;
  product.reviewedAt = new Date();
  await product.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "PRODUCT_REJECTED",
    entityType: "Product",
    entityId: product._id,
    meta: { note: product.reviewNote, vendorId: product.vendorId },
  });

  res.json({ product: localizeProduct(product.toObject(), req.lang) });
}

async function adminSetFeatured(req, res) {
  const productId = req.params.productId;
  const body = featureSchema.parse(req.body);

  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ message: "Product not found" });

  product.isFeatured = body.isFeatured;
  product.hotRequestStatus = body.isFeatured ? "approved" : "none";
  product.hotReviewedAt = new Date();
  product.hotReviewedByAdminId = req.user._id;
  if (!body.isFeatured) {
    product.hotRequestNote = "";
    product.hotRequestedAt = null;
  }
  await product.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "PRODUCT_FEATURE_TOGGLED",
    entityType: "Product",
    entityId: product._id,
    meta: { isFeatured: body.isFeatured },
  });

  res.json({ product: localizeProduct(product.toObject(), req.lang) });
}

async function adminRejectHotRequest(req, res) {
  const productId = req.params.productId;
  const body = hotRequestSchema.parse(req.body || {});

  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ message: "Product not found" });

  product.isFeatured = false;
  product.hotRequestStatus = "rejected";
  product.hotRequestNote = body.note || "";
  product.hotReviewedAt = new Date();
  product.hotReviewedByAdminId = req.user._id;
  await product.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "PRODUCT_HOT_REQUEST_REJECTED",
    entityType: "Product",
    entityId: product._id,
    meta: { note: product.hotRequestNote },
  });

  res.json({ product: localizeProduct(product.toObject(), req.lang) });
}

module.exports = {
  vendorCreateProduct,
  vendorListMyProducts,
  vendorGetMyProduct,
  vendorUpdateMyProduct,
  vendorDeleteMyProduct,
  vendorSubmitProduct,
  vendorRequestHotProduct,
  adminCreateProduct,
  adminListProducts,
  adminArchiveProduct,
  uploadMultipleProductImages,
  uploadProductImage,
  adminGetProduct,
  adminUpdateProduct,
  adminApproveProduct,
  adminRejectProduct,
  adminSetFeatured,
  adminRejectHotRequest,
};
