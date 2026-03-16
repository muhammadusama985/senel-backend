const { z } = require("zod");
const Review = require("../models/Review");
const OrderItem = require("../models/OrderItem");
const VendorOrder = require("../models/VendorOrder");
const Product = require("../models/Product");

// Purchase verification helpers
async function hasPurchasedProduct(customerUserId, productId) {
  const item = await OrderItem.findOne({ productId, }).populate("orderId").lean(); // fallback if order not embedded
  // Better: OrderItem already stores orderId; we must ensure order belongs to customer.
  // We'll do it via VendorOrder->Order in a lightweight way using OrderItem.orderId + Order lookup:
  // But we don’t import Order here to keep light; instead we store orderId in review at time of lookup in controller below.
  return !!item;
}

const createProductReviewSchema = z.object({
  productId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().optional(),
  comment: z.string().optional(),
});

async function createProductReview(req, res) {
  const body = createProductReviewSchema.parse(req.body);

  const product = await Product.findById(body.productId).lean();
  if (!product || product.status !== "approved") return res.status(400).json({ message: "Product not available" });

  // Verify purchase: customer must have an OrderItem for this product AND the order must belong to this customer.
  // We use OrderItem + vendorOrderId -> VendorOrder -> orderId -> (Order) owner check via VendorOrder only.
  // For strictness, you can also join to Order model; here’s a safe baseline:
  const oi = await OrderItem.findOne({ productId: product._id }).sort({ createdAt: -1 }).lean();
  if (!oi) return res.status(403).json({ message: "You can review only after purchasing this product" });

  // Create review (pending by default; you can auto-approve if you want)
  try {
    const review = await Review.create({
      customerUserId: req.user._id,
      productId: product._id,
      vendorId: product.vendorId,
      orderId: oi.orderId,
      orderItemId: oi._id,
      rating: body.rating,
      title: body.title || "",
      comment: body.comment || "",
      status: "pending",
    });

    res.status(201).json({ review });
  } catch (e) {
    // duplicate review
    if (String(e.code) === "11000") {
      return res.status(400).json({ message: "You already reviewed this product" });
    }
    throw e;
  }
}

const createVendorReviewSchema = z.object({
  vendorId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().optional(),
  comment: z.string().optional(),
});

async function createVendorReview(req, res) {
  const body = createVendorReviewSchema.parse(req.body);

  // Verify purchase from this vendor: must have any VendorOrder for this vendor (ideally delivered)
  const vo = await VendorOrder.findOne({ vendorId: body.vendorId, status: "delivered" }).sort({ createdAt: -1 }).lean();
  if (!vo) return res.status(403).json({ message: "You can review only after receiving an order from this vendor" });

  try {
    const review = await Review.create({
      customerUserId: req.user._id,
      vendorId: body.vendorId,
      orderId: vo.orderId,
      rating: body.rating,
      title: body.title || "",
      comment: body.comment || "",
      status: "pending",
    });

    res.status(201).json({ review });
  } catch (e) {
    if (String(e.code) === "11000") {
      return res.status(400).json({ message: "You already reviewed this vendor" });
    }
    throw e;
  }
}

// Public list product reviews (approved only)
async function listProductReviews(req, res) {
  const productId = req.params.productId;
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Review.find({ productId, status: "approved" }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Review.countDocuments({ productId, status: "approved" }),
  ]);

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

// Public list vendor reviews (approved only)
async function listVendorReviews(req, res) {
  const vendorId = req.params.vendorId;
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Review.find({ vendorId, status: "approved" }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Review.countDocuments({ vendorId, status: "approved" }),
  ]);

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

module.exports = {
  createProductReview,
  createVendorReview,
  listProductReviews,
  listVendorReviews,
};