const { z } = require("zod");
const Order = require("../models/Order");
const VendorOrder = require("../models/VendorOrder");
const OrderItem = require("../models/OrderItem");

const listSchema = z.object({
  status: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

async function listMyOrders(req, res) {
  const qp = listSchema.parse(req.query);
  const page = Math.max(parseInt(qp.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(qp.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const query = { customerUserId: req.user._id };
  if (qp.status) query.status = qp.status;

  const [items, total] = await Promise.all([
    Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(query),
  ]);

  const orderIds = items.map((o) => o._id);
  const vendorOrders = await VendorOrder.find({ orderId: { $in: orderIds } }).lean();

  const vendorMap = new Map();
  for (const vo of vendorOrders) {
    const key = String(vo.orderId);
    if (!vendorMap.has(key)) vendorMap.set(key, []);
    vendorMap.get(key).push(vo);
  }

  const enriched = items.map((order) => ({
    ...order,
    vendorOrders: vendorMap.get(String(order._id)) || [],
  }));

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items: enriched });
}

async function getMyOrderDetail(req, res) {
  const order = await Order.findOne({
    _id: req.params.orderId,
    customerUserId: req.user._id,
  }).lean();

  if (!order) return res.status(404).json({ message: "Order not found" });

  const [vendorOrders, items] = await Promise.all([
    VendorOrder.find({ orderId: order._id }).sort({ createdAt: 1 }).lean(),
    OrderItem.find({ orderId: order._id }).sort({ createdAt: 1 }).lean(),
  ]);

  res.json({ order, vendorOrders, items });
}

async function cancelMyOrder(req, res) {
  const order = await Order.findOne({
    _id: req.params.orderId,
    customerUserId: req.user._id,
  });

  if (!order) return res.status(404).json({ message: "Order not found" });
  if (order.status === "cancelled") {
    return res.status(400).json({ message: "Order already cancelled" });
  }

  const vendorOrders = await VendorOrder.find({ orderId: order._id }).lean();
  const hasFulfilled = vendorOrders.some((vo) =>
    ["shipped", "delivered"].includes(vo.status)
  );
  if (hasFulfilled) {
    return res.status(400).json({
      message: "Order cannot be cancelled because shipping has already started",
    });
  }

  order.status = "cancelled";
  await order.save();

  await VendorOrder.updateMany(
    { orderId: order._id, status: { $nin: ["delivered", "cancelled"] } },
    { $set: { status: "cancelled" } }
  );

  res.json({ order });
}

module.exports = {
  listMyOrders,
  getMyOrderDetail,
  cancelMyOrder,
};
