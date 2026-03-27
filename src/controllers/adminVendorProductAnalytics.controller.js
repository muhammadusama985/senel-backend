const { z } = require("zod");
const mongoose = require("mongoose");

const Order = require("../models/Order");
const VendorOrder = require("../models/VendorOrder");
const OrderItem = require("../models/OrderItem");
const Vendor = require("../models/Vendor");
const Product = require("../models/Product");
const PayoutRequest = require("../models/PayoutRequest");
const WalletTransaction = require("../models/WalletTransaction");

function parseRange(query) {
  const schema = z.object({
    days: z.string().optional(),
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
    limit: z.string().optional(),
  });

  const qp = schema.parse(query);

  const now = new Date();
  let start = null;
  let end = null;

  if (qp.start && qp.end) {
    start = new Date(qp.start);
    end = new Date(qp.end);
  } else if (qp.days) {
    const days = Math.max(1, parseInt(qp.days, 10));
    end = now;
    start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  const limit = Math.min(Math.max(parseInt(qp.limit || "20", 10), 1), 100);
  return { start, end, limit };
}

function buildDeliveredVendorOrderMatch(start, end) {
  const match = { status: "delivered" };
  if (start && end) {
    match.deliveredAt = { $gte: start, $lte: end };
  }
  return match;
}

/**
 * GET /api/v1/admin/analytics/vendors/top?days=30&metric=gmv
 * metric = gmv | delivered | orders
 */
async function adminTopVendors(req, res) {
  const { start, end, limit } = parseRange(req.query);
  const metric = String(req.query.metric || "gmv");

  const match = {};
  if (start && end) match.createdAt = { $gte: start, $lte: end };

  // Use VendorOrder as base since it’s already split per vendor
  let statusMatch = {};
  if (metric === "delivered") statusMatch = { status: "delivered" };

  const agg = await VendorOrder.aggregate([
    { $match: { ...match, ...statusMatch } },
    {
      $group: {
        _id: "$vendorId",
        vendorOrders: { $sum: 1 },
        subtotalSum: { $sum: "$subtotal" },
        discountSum: { $sum: "$discountTotal" },
        grandTotalSum: { $sum: "$grandTotal" },
      },
    },
    {
      $addFields: {
        gmv: "$grandTotalSum",
      },
    },
    {
      $sort:
        metric === "orders"
          ? { vendorOrders: -1 }
          : metric === "delivered"
          ? { grandTotalSum: -1 }
          : { gmv: -1 },
    },
    { $limit: limit },
    {
      $lookup: {
        from: "vendors",
        localField: "_id",
        foreignField: "_id",
        as: "vendor",
      },
    },
    { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        vendorId: "$_id",
        vendorOrders: 1,
        subtotalSum: 1,
        discountSum: 1,
        grandTotalSum: 1,
        vendor: {
          storeName: "$vendor.storeName",
          storeSlug: "$vendor.storeSlug",
          status: "$vendor.status",
          isVerifiedBadge: "$vendor.isVerifiedBadge",
        },
      },
    },
  ]);

  res.json({
    range: start && end ? { start, end } : null,
    metric,
    items: agg,
  });
}

/**
 * GET /api/v1/admin/analytics/vendors/:vendorId/overview?days=90
 * Vendor dashboard: order status breakdown + totals + payout summary
 */
async function adminVendorOverview(req, res) {
  const { start, end } = parseRange(req.query);
  const vendorId = req.params.vendorId;

  if (!mongoose.Types.ObjectId.isValid(vendorId)) {
    return res.status(400).json({ message: "Invalid vendorId" });
  }

  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });

  const match = { vendorId: vendor._id };
  if (start && end) match.createdAt = { $gte: start, $lte: end };

  const [byStatus, totals] = await Promise.all([
    VendorOrder.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$status",
          vendorOrders: { $sum: 1 },
          subtotalSum: { $sum: "$subtotal" },
          discountSum: { $sum: "$discountTotal" },
          grandTotalSum: { $sum: "$grandTotal" },
        },
      },
      { $sort: { vendorOrders: -1 } },
    ]),
    VendorOrder.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          vendorOrders: { $sum: 1 },
          subtotalSum: { $sum: "$subtotal" },
          discountSum: { $sum: "$discountTotal" },
          grandTotalSum: { $sum: "$grandTotal" },
        },
      },
    ]),
  ]);

  // Payout summary
  const payoutMatch = { vendorId: vendor._id };
  if (start && end) payoutMatch.createdAt = { $gte: start, $lte: end };

  const payoutStats = await PayoutRequest.aggregate([
    { $match: payoutMatch },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        amountSum: { $sum: "$amount" },
      },
    },
  ]);

  // Wallet debits (paid payouts) from ledger (optional cross-check)
  const ledgerPaid = await WalletTransaction.aggregate([
    {
      $match: {
        vendorId: vendor._id,
        kind: "PAYOUT_DEBIT",
        ...(start && end ? { createdAt: { $gte: start, $lte: end } } : {}),
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        amountSum: { $sum: "$amount" }, // negative
      },
    },
  ]);

  res.json({
    range: start && end ? { start, end } : null,
    vendor: {
      id: vendor._id,
      storeName: vendor.storeName,
      storeSlug: vendor.storeSlug,
      status: vendor.status,
      isVerifiedBadge: vendor.isVerifiedBadge,
    },
    ordersByStatus: byStatus,
    totals: totals[0] || { vendorOrders: 0, subtotalSum: 0, discountSum: 0, grandTotalSum: 0 },
    payoutStats,
    payoutLedger: {
      paidCount: ledgerPaid[0]?.count || 0,
      paidAmountSum: ledgerPaid[0]?.amountSum || 0, // negative
    },
  });
}

/**
 * GET /api/v1/admin/analytics/products/top?days=30&metric=qty
 * metric = qty | revenue
 */
async function adminTopProducts(req, res) {
  const { start, end, limit } = parseRange(req.query);
  const metric = String(req.query.metric || "qty");

  const deliveredMatch = buildDeliveredVendorOrderMatch(start, end);

  const agg = await OrderItem.aggregate([
    {
      $lookup: {
        from: "vendororders",
        localField: "vendorOrderId",
        foreignField: "_id",
        as: "vendorOrder",
      },
    },
    { $unwind: "$vendorOrder" },
    { $match: { "vendorOrder.status": "delivered", ...(start && end ? { "vendorOrder.deliveredAt": { $gte: start, $lte: end } } : {}) } },
    {
      $group: {
        _id: "$productId",
        qtySum: { $sum: "$qty" },
        revenueSum: { $sum: "$lineTotal" },
        ordersCount: { $addToSet: "$orderId" },
        vendorId: { $first: "$vendorId" },
      },
    },
    {
      $addFields: {
        distinctOrders: { $size: "$ordersCount" },
      },
    },
    {
      $sort: metric === "revenue" ? { revenueSum: -1 } : { qtySum: -1 },
    },
    { $limit: limit },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "vendors",
        localField: "vendorId",
        foreignField: "_id",
        as: "vendor",
      },
    },
    { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        productId: "$_id",
        qtySum: 1,
        revenueSum: 1,
        distinctOrders: 1,
        product: {
          title: "$product.title",
          slug: "$product.slug",
          status: "$product.status",
          categoryId: "$product.categoryId",
          imageUrl: { $arrayElemAt: ["$product.imageUrls", 0] },
        },
        vendor: {
          storeName: "$vendor.storeName",
          storeSlug: "$vendor.storeSlug",
        },
      },
    },
  ]);

  res.json({
    range: start && end ? { start, end } : null,
    metric,
    items: agg,
  });
}

/**
 * GET /api/v1/admin/analytics/categories/top?days=30
 * Category performance via product.categoryId (simple baseline)
 */
async function adminTopCategories(req, res) {
  const { start, end, limit } = parseRange(req.query);

  const agg = await OrderItem.aggregate([
    {
      $lookup: {
        from: "vendororders",
        localField: "vendorOrderId",
        foreignField: "_id",
        as: "vendorOrder",
      },
    },
    { $unwind: "$vendorOrder" },
    { $match: { "vendorOrder.status": "delivered", ...(start && end ? { "vendorOrder.deliveredAt": { $gte: start, $lte: end } } : {}) } },
    {
      $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    {
      $group: {
        _id: "$product.categoryId",
        qtySum: { $sum: "$qty" },
        revenueSum: { $sum: "$lineTotal" },
        items: { $sum: 1 },
      },
    },
    { $sort: { revenueSum: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "categories",
        localField: "_id",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        categoryId: "$_id",
        qtySum: 1,
        revenueSum: 1,
        items: 1,
        category: {
          name: "$category.name",
          slug: "$category.slug",
          parentId: "$category.parentId",
        },
      },
    },
  ]);

  res.json({
    range: start && end ? { start, end } : null,
    items: agg,
  });
}

async function adminCountryDemand(req, res) {
  const { start, end, limit } = parseRange(req.query);

  const items = await VendorOrder.aggregate([
    { $match: buildDeliveredVendorOrderMatch(start, end) },
    {
      $lookup: {
        from: "orders",
        localField: "orderId",
        foreignField: "_id",
        as: "order",
      },
    },
    { $unwind: { path: "$order", preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ["$order.shippingAddress.country", "Unknown"] },
        orders: { $sum: 1 },
        revenue: { $sum: "$grandTotal" },
        subtotal: { $sum: "$subtotal" },
      },
    },
    { $sort: { revenue: -1, orders: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        country: "$_id",
        orders: 1,
        revenue: 1,
        subtotal: 1,
      },
    },
  ]);

  res.json({
    range: start && end ? { start, end } : null,
    items,
  });
}

async function adminLowStockProducts(req, res) {
  const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);

  const query = {
    trackInventory: true,
    lowStockActive: true,
  };

  const [items, total] = await Promise.all([
    Product.find(query)
      .populate("vendorId", "storeName storeSlug")
      .populate("categoryId", "name")
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean(),
    Product.countDocuments(query),
  ]);

  res.json({ items, total });
}

module.exports = {
  adminTopVendors,
  adminVendorOverview,
  adminTopProducts,
  adminTopCategories,
  adminCountryDemand,
  adminLowStockProducts,
};
