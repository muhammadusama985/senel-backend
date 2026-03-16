const { z } = require("zod");
const WishlistItem = require("../models/WishlistItem");
const Product = require("../models/Product");

const addSchema = z.object({ productId: z.string().min(1) });

async function listWishlist(req, res) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10), 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    WishlistItem.find({ customerUserId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    WishlistItem.countDocuments({ customerUserId: req.user._id }),
  ]);

  // Optionally expand product details for UI (simple approach)
  const productIds = items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const map = new Map(products.map((p) => [String(p._id), p]));

  const enriched = items.map((i) => ({
    ...i,
    product: map.get(String(i.productId)) || null,
  }));

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items: enriched });
}

async function addToWishlist(req, res) {
  const body = addSchema.parse(req.body);

  const product = await Product.findById(body.productId).lean();
  if (!product || product.status !== "approved") {
    return res.status(400).json({ message: "Product not available" });
  }

  try {
    const item = await WishlistItem.create({
      customerUserId: req.user._id,
      productId: product._id,
      vendorId: product.vendorId,
    });
    res.status(201).json({ item });
  } catch (e) {
    if (String(e.code) === "11000") {
      return res.status(200).json({ message: "Already in wishlist" });
    }
    throw e;
  }
}

async function removeFromWishlist(req, res) {
  const productId = req.params.productId;

  await WishlistItem.deleteOne({ customerUserId: req.user._id, productId });
  res.json({ ok: true });
}

async function isInWishlist(req, res) {
  const productId = req.params.productId;
  const exists = await WishlistItem.exists({ customerUserId: req.user._id, productId });
  res.json({ inWishlist: !!exists });
}

module.exports = { listWishlist, addToWishlist, removeFromWishlist, isInWishlist };