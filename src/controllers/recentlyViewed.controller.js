const { z } = require("zod");
const RecentlyViewed = require("../models/RecentlyViewed");
const Product = require("../models/Product");

const addSchema = z.object({ productId: z.string().min(1) });
const MAX_ITEMS = 50;

async function addRecentlyViewed(req, res) {
  const body = addSchema.parse(req.body);

  const product = await Product.findById(body.productId).lean();
  if (!product || product.status !== "approved") return res.status(400).json({ message: "Product not available" });

  let doc = await RecentlyViewed.findOne({ customerUserId: req.user._id });
  if (!doc) doc = await RecentlyViewed.create({ customerUserId: req.user._id, items: [] });

  // remove existing
  doc.items = (doc.items || []).filter((x) => String(x.productId) !== String(product._id));
  // add to front
  doc.items.unshift({
    productId: product._id,
    vendorId: product.vendorId || null,
    viewedAt: new Date(),
  });
  // trim
  doc.items = doc.items.slice(0, MAX_ITEMS);

  await doc.save();
  res.json({ ok: true });
}

async function listRecentlyViewed(req, res) {
  const doc = await RecentlyViewed.findOne({ customerUserId: req.user._id }).lean();
  const items = doc?.items || [];

  const productIds = items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const map = new Map(products.map((p) => [String(p._id), p]));

  res.json({
    items: items
      .map((i) => ({ ...i, product: map.get(String(i.productId)) || null }))
      .filter((x) => x.product), // remove deleted products
  });
}

async function clearRecentlyViewed(req, res) {
  await RecentlyViewed.updateOne({ customerUserId: req.user._id }, { $set: { items: [] } }, { upsert: true });
  res.json({ ok: true });
}

module.exports = { addRecentlyViewed, listRecentlyViewed, clearRecentlyViewed };
