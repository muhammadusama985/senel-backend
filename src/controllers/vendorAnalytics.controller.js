const VendorOrder = require("../models/VendorOrder");
const Product = require("../models/Product");
const OrderItem = require("../models/OrderItem");

const CARDINAL_STATUSES = ["placed", "accepted", "packed", "ready_pickup", "shipped", "delivered"];

function getDateRangeFromQuery(query) {
  const now = new Date();
  const endDate = query.endDate ? new Date(query.endDate) : new Date(now);
  let startDate = new Date(now);

  switch (query.period) {
    case "today":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "yesterday": {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      endDate.setTime(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime());
      break;
    }
    case "week":
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "month":
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
      break;
    case "quarter":
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 3);
      break;
    case "year":
      startDate = new Date(now);
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    case "custom":
      startDate = query.startDate ? new Date(query.startDate) : new Date(now);
      break;
    default:
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
  }

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    const err = new Error("Invalid date range");
    err.statusCode = 400;
    throw err;
  }

  return { startDate, endDate };
}

function calculateTrend(current, previous) {
  if (previous === 0 && current > 0) return { trend: "up", change: 100 };
  if (previous === 0) return { trend: "stable", change: 0 };

  const change = ((current - previous) / previous) * 100;
  if (change > 0) return { trend: "up", change };
  if (change < 0) return { trend: "down", change };
  return { trend: "stable", change: 0 };
}

async function aggregateTopProducts(vendorId, startDate, endDate) {
  return OrderItem.aggregate([
    {
      $match: {
        vendorId,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: "$productId",
        title: { $first: "$title" },
        sku: { $first: "$variantSku" },
        imageUrl: { $first: "$imageUrl" },
        quantity: { $sum: "$qty" },
        revenue: { $sum: "$lineTotal" },
        ordersSet: { $addToSet: "$orderId" },
      },
    },
    {
      $project: {
        _id: 1,
        title: 1,
        sku: 1,
        imageUrl: 1,
        quantity: 1,
        revenue: 1,
        orders: { $size: "$ordersSet" },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 100 },
  ]);
}

async function aggregateDaily(vendorId, startDate, endDate) {
  return VendorOrder.aggregate([
    {
      $match: {
        vendorId,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
        revenue: { $sum: "$grandTotal" },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        date: "$_id",
        revenue: 1,
        orders: 1,
      },
    },
  ]);
}

async function vendorAnalyticsOverview(req, res) {
  const vendorId = req.vendorContext.vendorId;
  const { startDate, endDate } = getDateRangeFromQuery(req.query);

  const previousRangeMs = endDate.getTime() - startDate.getTime();
  const previousEnd = new Date(startDate.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - previousRangeMs);

  const [orders, previousOrders, totalProducts, dailyPerformance, topProducts, previousTopProducts] = await Promise.all([
    VendorOrder.find(
      { vendorId, createdAt: { $gte: startDate, $lte: endDate } },
      { createdAt: 1, grandTotal: 1, status: 1 }
    ).lean(),
    VendorOrder.find(
      { vendorId, createdAt: { $gte: previousStart, $lte: previousEnd } },
      { createdAt: 1, grandTotal: 1, status: 1 }
    ).lean(),
    Product.countDocuments({ vendorId, status: { $ne: "archived" } }),
    aggregateDaily(vendorId, startDate, endDate),
    aggregateTopProducts(vendorId, startDate, endDate),
    aggregateTopProducts(vendorId, previousStart, previousEnd),
  ]);

  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.grandTotal || 0), 0);
  const totalOrders = orders.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const previousRevenue = previousOrders.reduce((sum, order) => sum + Number(order.grandTotal || 0), 0);
  const previousOrderCount = previousOrders.length;
  const previousAov = previousOrderCount > 0 ? previousRevenue / previousOrderCount : 0;

  const previousRevenueByProduct = new Map(
    previousTopProducts.map((p) => [String(p._id), Number(p.revenue || 0)])
  );

  const topProductsWithTrend = topProducts.map((product) => {
    const previousRevenueForProduct = previousRevenueByProduct.get(String(product._id)) || 0;
    return {
      ...product,
      trend: calculateTrend(Number(product.revenue || 0), previousRevenueForProduct).trend,
    };
  });

  const revenueTrend = calculateTrend(totalRevenue, previousRevenue);
  const ordersTrend = calculateTrend(totalOrders, previousOrderCount);
  const aovTrend = calculateTrend(averageOrderValue, previousAov);

  const validOrderStatusesCount = orders.filter((order) => CARDINAL_STATUSES.includes(order.status)).length;
  const previousValidOrderStatusesCount = previousOrders.filter((order) =>
    CARDINAL_STATUSES.includes(order.status)
  ).length;

  res.json({
    summary: {
      totalRevenue,
      totalOrders,
      averageOrderValue,
      totalProducts,
      periodComparison: {
        revenue: previousRevenue,
        orders: previousOrderCount,
        aov: previousAov,
      },
    },
    dailyPerformance,
    topProducts: topProductsWithTrend,
    metrics: [
      {
        label: "Revenue",
        value: totalRevenue,
        previousValue: previousRevenue,
        change: Math.abs(revenueTrend.change),
        format: "currency",
        trend: revenueTrend.trend,
      },
      {
        label: "Orders",
        value: totalOrders,
        previousValue: previousOrderCount,
        change: Math.abs(ordersTrend.change),
        format: "number",
        trend: ordersTrend.trend,
      },
      {
        label: "Average Order Value",
        value: averageOrderValue,
        previousValue: previousAov,
        change: Math.abs(aovTrend.change),
        format: "currency",
        trend: aovTrend.trend,
      },
      {
        label: "Valid Order Statuses",
        value: validOrderStatusesCount,
        previousValue: previousValidOrderStatusesCount,
        change: 0,
        format: "number",
        trend: "stable",
      },
    ],
    range: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      previousStart: previousStart.toISOString(),
      previousEnd: previousEnd.toISOString(),
    },
  });
}

module.exports = { vendorAnalyticsOverview };

