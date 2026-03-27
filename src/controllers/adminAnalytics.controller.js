const { z } = require("zod");
const mongoose = require("mongoose");
const Coupon = require("../models/Coupon");
const CouponRedemption = require("../models/CouponRedemption");
const Order = require("../models/Order");
const VendorOrder = require("../models/VendorOrder");
const Vendor = require("../models/Vendor");

function parseRange(query) {
  // supports: days=7 or start/end ISO
  const schema = z.object({
    days: z.string().optional(),
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
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

  return { start, end };
}

/**
 * GET /api/v1/admin/analytics/coupons/overview?days=30
 * High-level coupon overview + top coupons by usage
 */
async function adminCouponsOverview(req, res) {
  const { start, end } = parseRange(req.query);

  const couponQuery = {};
  // (Coupons themselves are not time-scoped; usage is. We'll time-scope usage by Order/Redemption.)
  const [totalCoupons, activeCoupons] = await Promise.all([
    Coupon.countDocuments(couponQuery),
    Coupon.countDocuments({ ...couponQuery, isActive: true }),
  ]);

  // Top coupons by total usedCount (lifetime)
  const topByUsedCount = await Coupon.find({})
    .sort({ usedCount: -1, createdAt: -1 })
    .limit(20)
    .lean();

  // Optional: windowed usage based on redemptions updatedAt (approx)
  const redemptionMatch = {};
  if (start && end) redemptionMatch.updatedAt = { $gte: start, $lte: end };

  const topByUniqueUsers = await CouponRedemption.aggregate([
    { $match: redemptionMatch },
    { $group: { _id: "$couponId", uniqueUsers: { $sum: 1 }, totalUserUses: { $sum: "$usedCount" } } },
    { $sort: { uniqueUsers: -1 } },
    { $limit: 20 },
    {
      $lookup: {
        from: "coupons",
        localField: "_id",
        foreignField: "_id",
        as: "coupon",
      },
    },
    { $unwind: "$coupon" },
    {
      $project: {
        couponId: "$_id",
        code: "$coupon.code",
        scope: "$coupon.scope",
        vendorId: "$coupon.vendorId",
        uniqueUsers: 1,
        totalUserUses: 1,
        isActive: "$coupon.isActive",
      },
    },
  ]);

  res.json({
    range: start && end ? { start, end } : null,
    totals: { totalCoupons, activeCoupons, inactiveCoupons: totalCoupons - activeCoupons },
    topByUsedCount,
    topByUniqueUsers,
  });
}

/**
 * GET /api/v1/admin/analytics/coupons/:couponId
 * Deep coupon analytics: unique users, heavy users, revenue impact
 */
async function adminCouponDetailAnalytics(req, res) {
  const { start, end } = parseRange(req.query);
  const couponId = req.params.couponId;

  if (!mongoose.Types.ObjectId.isValid(couponId)) {
    return res.status(400).json({ message: "Invalid couponId" });
  }

  const coupon = await Coupon.findById(couponId).lean();
  if (!coupon) return res.status(404).json({ message: "Coupon not found" });

  const redemptionMatch = { couponId: coupon._id };
  if (start && end) redemptionMatch.updatedAt = { $gte: start, $lte: end };

  // Unique users + total uses (from per-user ledger)
  const redemptionAgg = await CouponRedemption.aggregate([
    { $match: redemptionMatch },
    {
      $group: {
        _id: "$couponId",
        uniqueUsers: { $sum: 1 },
        totalUserUses: { $sum: "$usedCount" },
      },
    },
  ]);

  const uniqueUsers = redemptionAgg[0]?.uniqueUsers || 0;
  const totalUserUses = redemptionAgg[0]?.totalUserUses || 0;

  // Top redeemers
  const topRedeemers = await CouponRedemption.find(redemptionMatch)
    .sort({ usedCount: -1, updatedAt: -1 })
    .limit(20)
    .lean();

  // Revenue impact based on Orders that used this coupon
  const orderMatch = {
    "coupon.couponId": coupon._id,
  };
  if (start && end) orderMatch.createdAt = { $gte: start, $lte: end };

  const orderImpact = await Order.aggregate([
    { $match: orderMatch },
    {
      $group: {
        _id: null,
        ordersCount: { $sum: 1 },
        subtotalSum: { $sum: "$subtotal" },
        discountSum: { $sum: "$discountTotal" },
        shippingSum: { $sum: "$shippingTotal" },
        grandTotalSum: { $sum: "$grandTotal" },
      },
    },
  ]);

  const impact = orderImpact[0] || {
    ordersCount: 0,
    subtotalSum: 0,
    discountSum: 0,
    shippingSum: 0,
    grandTotalSum: 0,
  };

  // Vendor-level discount allocation impact
  const vendorOrderMatch = {};
  if (start && end) vendorOrderMatch.createdAt = { $gte: start, $lte: end };

  // We don’t store couponId on VendorOrder. We allocate via Order.discountTotal and VendorOrder.discountTotal.
  // So we join by orderIds that used this coupon.
  const orderIds = await Order.find(orderMatch).select({ _id: 1 }).lean();
  const orderIdList = orderIds.map((o) => o._id);

  let vendorImpact = [];
  if (orderIdList.length) {
    vendorImpact = await VendorOrder.aggregate([
      { $match: { orderId: { $in: orderIdList }, ...vendorOrderMatch } },
      {
        $group: {
          _id: "$vendorId",
          vendorOrders: { $sum: 1 },
          vendorSubtotalSum: { $sum: "$subtotal" },
          vendorDiscountSum: { $sum: "$discountTotal" },
          vendorGrandTotalSum: { $sum: "$grandTotal" },
        },
      },
      { $sort: { vendorDiscountSum: -1 } },
    ]);
  }

  res.json({
    range: start && end ? { start, end } : null,
    coupon,
    usage: { uniqueUsers, totalUserUses, lifetimeUsedCount: coupon.usedCount },
    topRedeemers,
    revenueImpact: impact,
    vendorImpact,
  });
}

/**
 * GET /api/v1/admin/analytics/orders/overview?days=30
 * Basic marketplace dashboard: order counts & totals
 */
async function adminOrdersOverview(req, res) {
  const { start, end } = parseRange(req.query);

  const match = {};
  if (start && end) match.createdAt = { $gte: start, $lte: end };

  const orderStats = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$status",
        orders: { $sum: 1 },
        subtotalSum: { $sum: "$subtotal" },
        discountSum: { $sum: "$discountTotal" },
        shippingSum: { $sum: "$shippingTotal" },
        grandTotalSum: { $sum: "$grandTotal" },
      },
    },
  ]);

  const vendorOrderStats = await VendorOrder.aggregate([
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
  ]);

  const summaryMatch = {};
  if (start && end) summaryMatch.createdAt = { $gte: start, $lte: end };

  const deliveredMatch = { status: "delivered" };
  if (start && end) deliveredMatch.deliveredAt = { $gte: start, $lte: end };

  const [totalMarketplaceOrders, deliveredSummaryAgg, deliveredByFulfillment, activeVendors, dailyDelivered] = await Promise.all([
    VendorOrder.countDocuments(summaryMatch),
    VendorOrder.aggregate([
      { $match: deliveredMatch },
      {
        $group: {
          _id: null,
          totalDeliveredOrders: { $sum: 1 },
          totalRevenue: { $sum: "$grandTotal" },
        },
      },
    ]),
    VendorOrder.aggregate([
      { $match: deliveredMatch },
      {
        $group: {
          _id: "$fulfillmentOwner",
          count: { $sum: 1 },
        },
      },
    ]),
    Vendor.countDocuments({ status: "approved" }),
    VendorOrder.aggregate([
      { $match: deliveredMatch },
      {
        $group: {
          _id: {
            year: { $year: "$deliveredAt" },
            month: { $month: "$deliveredAt" },
            day: { $dayOfMonth: "$deliveredAt" },
          },
          revenue: { $sum: "$grandTotal" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]),
  ]);

  const deliveredTotals = deliveredSummaryAgg[0] || {
    totalDeliveredOrders: 0,
    totalRevenue: 0,
  };

  const deliveredSummary = deliveredByFulfillment.reduce(
    (acc, item) => {
      if (item._id === "admin") acc.adminFulfilledDelivered = item.count;
      else acc.vendorFulfilledDelivered = item.count;
      return acc;
    },
    {
      adminFulfilledDelivered: 0,
      vendorFulfilledDelivered: 0,
    }
  );

  const averageOrderValue =
    deliveredTotals.totalDeliveredOrders > 0
      ? deliveredTotals.totalRevenue / deliveredTotals.totalDeliveredOrders
      : 0;

  const daily = dailyDelivered.map((item) => ({
    date: `${item._id.year}-${String(item._id.month).padStart(2, "0")}-${String(item._id.day).padStart(2, "0")}`,
    revenue: item.revenue,
    orders: item.orders,
  }));

  res.json({
    range: start && end ? { start, end } : null,
    summary: {
      totalMarketplaceOrders,
      totalOrders: totalMarketplaceOrders,
      totalDeliveredOrders: deliveredTotals.totalDeliveredOrders,
      totalRevenue: deliveredTotals.totalRevenue,
      averageOrderValue,
      activeVendors,
      ...deliveredSummary,
    },
    daily,
    ordersByStatus: orderStats,
    vendorOrdersByStatus: vendorOrderStats,
  });
}

module.exports = {
  adminCouponsOverview,
  adminCouponDetailAnalytics,
  adminOrdersOverview,
};
