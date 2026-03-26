const { z } = require("zod");
const Review = require("../models/Review");
const Order = require("../models/Order");
const OrderItem = require("../models/OrderItem");
const VendorOrder = require("../models/VendorOrder");
const Product = require("../models/Product");

const createProductReviewSchema = z.object({
  productId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().optional(),
  comment: z.string().optional(),
});

async function createProductReview(req, res) {
  const body = createProductReviewSchema.parse(req.body);

  const product = await Product.findById(body.productId).lean();
  if (!product || product.status !== "approved") {
    return res.status(400).json({ message: "Product not available" });
  }

  const candidateItems = await OrderItem.find({ productId: product._id }).sort({ createdAt: -1 }).lean();
  if (!candidateItems.length) {
    return res.status(403).json({ message: "You can review only after purchasing this product" });
  }

  const orderIds = [...new Set(candidateItems.map((item) => String(item.orderId)).filter(Boolean))];
  const vendorOrderIds = [...new Set(candidateItems.map((item) => String(item.vendorOrderId)).filter(Boolean))];

  const [orders, deliveredVendorOrders] = await Promise.all([
    Order.find({
      _id: { $in: orderIds },
      customerUserId: req.user._id,
    })
      .select("_id")
      .lean(),
    VendorOrder.find({
      _id: { $in: vendorOrderIds },
      status: "delivered",
    })
      .select("_id")
      .lean(),
  ]);

  const allowedOrderIds = new Set(orders.map((order) => String(order._id)));
  const deliveredVendorOrderIds = new Set(deliveredVendorOrders.map((item) => String(item._id)));

  const orderItem = candidateItems.find(
    (item) =>
      allowedOrderIds.has(String(item.orderId)) &&
      deliveredVendorOrderIds.has(String(item.vendorOrderId))
  );

  if (!orderItem) {
    return res.status(403).json({ message: "You can review only after receiving this product" });
  }

  try {
    const review = await Review.create({
      customerUserId: req.user._id,
      productId: product._id,
      vendorId: product.vendorId,
      orderId: orderItem.orderId,
      orderItemId: orderItem._id,
      rating: body.rating,
      title: body.title || "",
      comment: body.comment || "",
      status: "approved",
    });

    res.status(201).json({ review });
  } catch (e) {
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

  const candidateVendorOrders = await VendorOrder.find({
    vendorId: body.vendorId,
    status: "delivered",
  })
    .sort({ createdAt: -1 })
    .lean();

  const deliveredOrderIds = candidateVendorOrders.map((item) => item.orderId).filter(Boolean);
  const ownedOrders = await Order.find({
    _id: { $in: deliveredOrderIds },
    customerUserId: req.user._id,
  })
    .select("_id")
    .lean();
  const ownedOrderIds = new Set(ownedOrders.map((item) => String(item._id)));

  const vendorOrder = candidateVendorOrders.find((item) => ownedOrderIds.has(String(item.orderId)));
  if (!vendorOrder) {
    return res.status(403).json({ message: "You can review only after receiving an order from this vendor" });
  }

  try {
    const review = await Review.create({
      customerUserId: req.user._id,
      vendorId: body.vendorId,
      orderId: vendorOrder.orderId,
      rating: body.rating,
      title: body.title || "",
      comment: body.comment || "",
      status: "approved",
    });

    res.status(201).json({ review });
  } catch (e) {
    if (String(e.code) === "11000") {
      return res.status(400).json({ message: "You already reviewed this vendor" });
    }
    throw e;
  }
}

function enrichCustomerName(item) {
  const firstName = String(item?.customerUserId?.firstName || "").trim();
  const lastName = String(item?.customerUserId?.lastName || "").trim();
  const customerName = [firstName, lastName].filter(Boolean).join(" ").trim() || "Verified buyer";
  return {
    ...item,
    customerName,
  };
}

async function listProductReviews(req, res) {
  const productId = req.params.productId;
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Review.find({ productId, status: "approved" })
      .populate("customerUserId", "firstName lastName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments({ productId, status: "approved" }),
  ]);

  res.json({
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    items: items.map(enrichCustomerName),
  });
}

async function listVendorReviews(req, res) {
  const vendorId = req.params.vendorId;
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Review.find({ vendorId, status: "approved" })
      .populate("customerUserId", "firstName lastName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments({ vendorId, status: "approved" }),
  ]);

  res.json({
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    items: items.map(enrichCustomerName),
  });
}

module.exports = {
  createProductReview,
  createVendorReview,
  listProductReviews,
  listVendorReviews,
};
