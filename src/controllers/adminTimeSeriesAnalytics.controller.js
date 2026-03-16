const { z } = require("zod");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const VendorOrder = require("../models/VendorOrder");

function parseRange(query) {
  const schema = z.object({
    days: z.string().optional(),
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
    granularity: z.enum(["day", "month"]).optional(),
    vendorId: z.string().optional(),
    status: z.string().optional(),
  });

  const qp = schema.parse(query);
  const now = new Date();

  let start = null;
  let end = null;
  if (qp.start && qp.end) {
    start = new Date(qp.start);
    end = new Date(qp.end);
  } else {
    const days = Math.max(1, parseInt(qp.days || "30", 10));
    end = now;
    start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  const granularity = qp.granularity || "day";
  return { start, end, granularity, vendorId: qp.vendorId, status: qp.status };
}

function groupId(granularity) {
  if (granularity === "month") {
    return {
      y: { $year: "$createdAt" },
      m: { $month: "$createdAt" },
    };
  }
  return {
    y: { $year: "$createdAt" },
    m: { $month: "$createdAt" },
    d: { $dayOfMonth: "$createdAt" },
  };
}

function sortSpec(granularity) {
  return granularity === "month" ? { "_id.y": 1, "_id.m": 1 } : { "_id.y": 1, "_id.m": 1, "_id.d": 1 };
}

// GET /api/v1/admin/analytics/timeseries/orders?days=90&granularity=day
async function adminOrdersTimeSeries(req, res) {
  const { start, end, granularity, status } = parseRange(req.query);

  const match = { createdAt: { $gte: start, $lte: end } };
  if (status) match.status = status;

  const points = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: groupId(granularity),
        orders: { $sum: 1 },
        subtotalSum: { $sum: "$subtotal" },
        discountSum: { $sum: "$discountTotal" },
        shippingSum: { $sum: "$shippingTotal" },
        grandTotalSum: { $sum: "$grandTotal" },
      },
    },
    { $sort: sortSpec(granularity) },
  ]);

  res.json({ range: { start, end }, granularity, points });
}

// GET /api/v1/admin/analytics/timeseries/vendor-orders?days=90&granularity=day&vendorId=...
async function adminVendorOrdersTimeSeries(req, res) {
  const { start, end, granularity, vendorId, status } = parseRange(req.query);

  const match = { createdAt: { $gte: start, $lte: end } };
  if (status) match.status = status;

  if (vendorId) {
    if (!mongoose.Types.ObjectId.isValid(vendorId)) return res.status(400).json({ message: "Invalid vendorId" });
    match.vendorId = new mongoose.Types.ObjectId(vendorId);
  }

  const points = await VendorOrder.aggregate([
    { $match: match },
    {
      $group: {
        _id: groupId(granularity),
        vendorOrders: { $sum: 1 },
        subtotalSum: { $sum: "$subtotal" },
        discountSum: { $sum: "$discountTotal" },
        grandTotalSum: { $sum: "$grandTotal" },
      },
    },
    { $sort: sortSpec(granularity) },
  ]);

  res.json({ range: { start, end }, granularity, vendorId: vendorId || null, points });
}

module.exports = { adminOrdersTimeSeries, adminVendorOrdersTimeSeries };