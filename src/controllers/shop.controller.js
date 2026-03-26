const { z } = require("zod");
const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const Category = require("../models/Category");
const Review = require("../models/Review");
const searchService = require("../services/search.service");
const { resolveML } = require("../utils/ml");
const { 
  getRelatedProducts, 
  getPersonalizedRecommendations,
  getTrendingProducts 
} = require("../services/recommendations.service");

function localizeProduct(product, lang = "en") {
  if (!product) return product;
  return {
    ...product,
    title: resolveML(product.titleML, lang, product.title),
    description: resolveML(product.descriptionML, lang, product.description),
  };
}

function escapeRegex(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * GET /api/v1/shop/products
 * Public endpoint: lists only APPROVED products with filters + pagination.
 *
 * Query params:
 * - q: text search
 * - categoryId
 * - vendorId
 * - country
 * - featured=true|false
 * - minMoq
 * - maxMoq
 * - minPrice (unit price)
 * - maxPrice (unit price)
 * - minRating (avg rating, 1-5)
 * - sort: newest | price_asc | price_desc
 * - page, limit
 */
async function listProducts(req, res) {
  const schema = z.object({
    q: z.string().optional(),
    categoryId: z.string().optional(),
    vendorId: z.string().optional(),
    country: z.string().optional(),
    featured: z.enum(["true", "false"]).optional(),
    source: z.enum(["vendor", "admin_platform", "admin_vendor"]).optional(),
    isPlatformProduct: z.enum(["true", "false"]).optional(),
    createdByAdmin: z.enum(["true", "false"]).optional(),
    minMoq: z.string().optional(),
    maxMoq: z.string().optional(),
    minPrice: z.string().optional(),
    maxPrice: z.string().optional(),
    minRating: z.string().optional(),
    sort: z.enum(["newest", "price_asc", "price_desc"]).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  });

  const qp = schema.parse(req.query);

  const page = Math.max(parseInt(qp.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(qp.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  // Base query: approved only
  const query = { status: "approved" };

  if (qp.vendorId) query.vendorId = qp.vendorId;
  if (qp.country) query.country = qp.country;

  if (qp.featured) query.isFeatured = qp.featured === "true";
  if (qp.source) query.source = qp.source;
  if (qp.isPlatformProduct) query.isPlatformProduct = qp.isPlatformProduct === "true";
  if (qp.createdByAdmin) {
    if (qp.createdByAdmin === "true") {
      query.createdByAdminId = { $exists: true, $ne: null };
      query.source = { $in: ["admin_platform", "admin_vendor"] };
    } else {
      query.$or = [
        { createdByAdminId: null },
        { createdByAdminId: { $exists: false } },
      ];
      if (!qp.source) query.source = "vendor";
    }
  }

  if (qp.categoryId) {
    // Include products in that category; if you want to include subcategories,
    // you can expand this to fetch descendants. For now: exact categoryId.
    query.categoryId = qp.categoryId;
  }

  if (qp.minMoq || qp.maxMoq) {
    query.moq = {};
    if (qp.minMoq) query.moq.$gte = Number(qp.minMoq);
    if (qp.maxMoq) query.moq.$lte = Number(qp.maxMoq);
  }

  if (qp.minRating) {
    const minRating = Number(qp.minRating);
    if (!Number.isNaN(minRating) && minRating > 0) {
      const ratings = await Review.aggregate([
        { $match: { status: "approved" } },
        { $group: { _id: "$productId", avgRating: { $avg: "$rating" } } },
        { $match: { avgRating: { $gte: minRating } } },
      ]);
      const ratedProductIds = ratings.map((item) => item._id);

      if (query._id && query._id.$in) {
        query._id.$in = query._id.$in.filter((id) =>
          ratedProductIds.some((ratedId) => String(ratedId) === String(id))
        );
      } else {
        query._id = { $in: ratedProductIds };
      }
    }
  }

  // Price filter: This is "best effort" because tier pricing is an array.
  // We filter by ANY tier unitPrice matching the range.
  if (qp.minPrice || qp.maxPrice) {
    query.priceTiers = { $elemMatch: {} };
    if (qp.minPrice) query.priceTiers.$elemMatch.unitPrice = { ...(query.priceTiers.$elemMatch.unitPrice || {}), $gte: Number(qp.minPrice) };
    if (qp.maxPrice) query.priceTiers.$elemMatch.unitPrice = { ...(query.priceTiers.$elemMatch.unitPrice || {}), $lte: Number(qp.maxPrice) };
  }

  // Search
  let projection = null;
  let sort = { createdAt: -1 };

  if (qp.q && qp.q.trim()) {
    const rx = new RegExp(escapeRegex(qp.q.trim()), "i");
    const searchOr = [
      { title: rx },
      { slug: rx },
      { "titleML.en": rx },
      { "titleML.de": rx },
      { "titleML.tr": rx },
      { description: rx },
      { "descriptionML.en": rx },
      { "descriptionML.de": rx },
      { "descriptionML.tr": rx },
      { sku: rx },
    ];

    if (query.$or) {
      query.$and = [{ $or: query.$or }, { $or: searchOr }];
      delete query.$or;
    } else {
      query.$or = searchOr;
    }

    sort = { isFeatured: -1, createdAt: -1 };
  }

  // Sorting options (if no search sort override)
  if (!qp.q && qp.sort) {
    if (qp.sort === "newest") sort = { createdAt: -1 };
    if (qp.sort === "price_asc") sort = { "priceTiers.unitPrice": 1 };
    if (qp.sort === "price_desc") sort = { "priceTiers.unitPrice": -1 };
  }

  const [items, total] = await Promise.all([
    Product.find(query, projection).sort(sort).skip(skip).limit(limit).lean(),
    Product.countDocuments(query),
  ]);

  // Fetch and merge rating statistics for all products
  const ids = items.map((p) => p._id);
  const statsArr = await Review.aggregate([
    { $match: { productId: { $in: ids }, status: "approved" } },
    { $group: { _id: "$productId", avgRating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
  ]);

  const statsMap = new Map(statsArr.map((s) => [String(s._id), s]));
  const merged = items.map((p) => {
    const s = statsMap.get(String(p._id));
    return {
      ...localizeProduct(p, req.lang),
      avgRating: Number(((s?.avgRating) || 0).toFixed(2)),
      reviewCount: s?.reviewCount || 0,
    };
  });

  res.json({
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    items: merged,
  });
}

/**
 * GET /api/v1/shop/search
 * Advanced search using Meilisearch with language-aware results
 */
async function advancedSearch(req, res) {
  try {
    const {
      q,
      categoryId,
      vendorId,
      country,
      featured,
      minMoq,
      maxMoq,
      minPrice,
      maxPrice,
      sort,
      page = 1,
      limit = 20,
    } = req.query;

    const lang = req.lang || "en";

    const filters = {
      categoryId,
      vendorId,
      country,
      featured: featured === "true",
      minMoq: minMoq ? parseInt(minMoq) : null,
      maxMoq: maxMoq ? parseInt(maxMoq) : null,
      minPrice: minPrice ? parseFloat(minPrice) : null,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
      sort,
    };

    const results = await searchService.searchProducts(
      q || "",
      lang,
      filters,
      parseInt(page),
      parseInt(limit)
    );

    // If search service returns raw results, enrich with review data
    if (results.hits && results.hits.length > 0) {
      const productIds = results.hits.map(h => h.id);
      const statsArr = await Review.aggregate([
        { $match: { productId: { $in: productIds }, status: "approved" } },
        { $group: { _id: "$productId", avgRating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
      ]);

      const statsMap = new Map(statsArr.map((s) => [String(s._id), s]));

      results.hits = results.hits.map(hit => ({
        ...localizeProduct(hit, lang),
        avgRating: Number(((statsMap.get(hit.id)?.avgRating) || 0).toFixed(2)),
        reviewCount: statsMap.get(hit.id)?.reviewCount || 0,
      }));
    }

    res.json({
      ...results,
      lang,
    });
  } catch (error) {
    console.error("Advanced search error:", error);
    res.status(500).json({ message: error.message });
  }
}

/**
 * POST /api/v1/shop/search/reindex
 * Admin only: Reindex all products in search engine
 */
async function reindexSearch(req, res) {
  try {
    // Admin only - protect this endpoint
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }

    const result = await searchService.reindexAll();
    res.json({ 
      message: "Reindexing complete", 
      indexed: result.count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Reindex error:", error);
    res.status(500).json({ message: error.message });
  }
}

/**
 * GET /api/v1/shop/recommendations/:productId
 * Get related products based on a specific product
 */
async function getProductRecommendations(req, res) {
  try {
    const { productId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    const recommendations = await getRelatedProducts(productId, limit);
    
    res.json({ recommendations: recommendations.map((item) => localizeProduct(item, req.lang)) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * GET /api/v1/shop/recommendations/personalized
 * Get personalized recommendations for logged-in user
 */
async function getPersonalizedRecs(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 20;
    
    let recommendations;
    if (req.user) {
      recommendations = await getPersonalizedRecommendations(req.user._id, limit);
    } else {
      recommendations = await getTrendingProducts(limit);
    }
    
    res.json({ recommendations: recommendations.map((item) => localizeProduct(item, req.lang)) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * GET /api/v1/shop/trending
 * Get trending products across the platform
 */
async function getTrending(req, res) {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const trending = await getTrendingProducts(limit);
    res.json({ trending: trending.map((item) => localizeProduct(item, req.lang)) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * GET /api/v1/shop/products/:slug
 * Public product details by slug (approved only)
 */
async function getProductBySlug(req, res) {
  const slug = (req.params.slug || "").toLowerCase().trim();
  if (!slug) return res.status(400).json({ message: "Missing slug" });

  const product = await Product.findOne({ slug, status: "approved" }).lean();
  if (!product) return res.status(404).json({ message: "Product not found" });

  // Fetch rating statistics for this product
  const agg = await Review.aggregate([
    { $match: { productId: product._id, status: "approved" } },
    { $group: { _id: "$productId", avgRating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
  ]);
  const stats = agg[0] || { avgRating: 0, reviewCount: 0 };

  res.json({ 
    product: { 
      ...localizeProduct(product, req.lang),
      avgRating: Number((stats.avgRating || 0).toFixed(2)), 
      reviewCount: stats.reviewCount || 0 
    } 
  });
}

/**
 * GET /api/v1/shop/vendors/:storeSlug
 * Public vendor store details (approved vendors only)
 */
async function getVendorStore(req, res) {
  const storeSlug = (req.params.storeSlug || "").toLowerCase().trim();
  if (!storeSlug) return res.status(400).json({ message: "Missing storeSlug" });

  const vendor = await Vendor.findOne({ storeSlug, status: "approved" }).lean();
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });

  res.json({
    vendor: {
      id: vendor._id,
      storeName: vendor.storeName,
      storeSlug: vendor.storeSlug,
      description: vendor.description,
      logoUrl: vendor.logoUrl,
      bannerUrl: vendor.bannerUrl,
      isVerifiedBadge: vendor.isVerifiedBadge,
      business: {
        country: vendor.business?.country || "",
        city: vendor.business?.city || "",
      },
    },
  });
}

/**
 * GET /api/v1/shop/vendors/:storeSlug/products
 * Public vendor products listing (approved only)
 */
async function listVendorProducts(req, res) {
  const storeSlug = (req.params.storeSlug || "").toLowerCase().trim();
  if (!storeSlug) return res.status(400).json({ message: "Missing storeSlug" });

  const vendor = await Vendor.findOne({ storeSlug, status: "approved" }).lean();
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });

  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const query = { vendorId: vendor._id, status: "approved" };

  const [items, total] = await Promise.all([
    Product.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(query),
  ]);

  res.json({
    vendor: { 
      id: vendor._id, 
      storeName: vendor.storeName, 
      storeSlug: vendor.storeSlug, 
      isVerifiedBadge: vendor.isVerifiedBadge 
    },
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    items: items.map((item) => localizeProduct(item, req.lang)),
  });
}

/**
 * GET /api/v1/shop/vendors
 * Public vendor listing (approved only)
 */
async function listVendors(req, res) {
  const schema = z.object({
    q: z.string().optional(),
    country: z.string().optional(),
    verified: z.enum(["true", "false"]).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  });

  const qp = schema.parse(req.query);
  const page = Math.max(parseInt(qp.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(qp.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const query = { status: "approved" };
  if (qp.country) query["business.country"] = qp.country;
  if (qp.verified) query.isVerifiedBadge = qp.verified === "true";

  if (qp.q && qp.q.trim()) {
    const rx = new RegExp(qp.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [
      { storeName: rx },
      { description: rx },
      { "business.country": rx },
      { "business.city": rx },
    ];
  }

  if (qp.minRating) {
    const minRating = Number(qp.minRating);
    if (!Number.isNaN(minRating) && minRating > 0) {
      const ratings = await Review.aggregate([
        { $match: { status: "approved" } },
        { $group: { _id: "$productId", avgRating: { $avg: "$rating" } } },
        { $match: { avgRating: { $gte: minRating } } },
      ]);
      const productIds = ratings.map((item) => item._id);
      query._id = { $in: productIds };
    }
  }

  const [items, total] = await Promise.all([
    Vendor.find(query)
      .sort({ isVerifiedBadge: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Vendor.countDocuments(query),
  ]);

  res.json({
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    items: items.map((vendor) => ({
      id: vendor._id,
      storeName: vendor.storeName,
      storeSlug: vendor.storeSlug,
      description: vendor.description,
      logoUrl: vendor.logoUrl,
      bannerUrl: vendor.bannerUrl,
      isVerifiedBadge: vendor.isVerifiedBadge,
      business: {
        country: vendor.business?.country || "",
        city: vendor.business?.city || "",
      },
    })),
  });
}

/**
 * GET /api/v1/shop/categories
 * Public categories for browsing/navigation (active only)
 */
async function listCategoriesPublic(req, res) {
  const categories = await Category.find({ isActive: true })
    .sort({ parentId: 1, sortOrder: 1, name: 1 })
    .lean();
  res.json({ categories });
}

module.exports = {
  listProducts,
  advancedSearch,
  reindexSearch,
  getProductBySlug,
  getVendorStore,
  listVendors,
  listVendorProducts,
  listCategoriesPublic,
  getProductRecommendations,
  getPersonalizedRecs,
  getTrending
};
