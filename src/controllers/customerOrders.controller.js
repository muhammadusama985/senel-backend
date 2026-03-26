const { z } = require("zod");
const Order = require("../models/Order");
const VendorOrder = require("../models/VendorOrder");
const OrderItem = require("../models/OrderItem");
const { adjustStock } = require("../services/inventory.service");
const { notifyUser } = require("../services/notification.service");

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

async function restockCancelledOrder(orderId) {
  const items = await OrderItem.find({ orderId }).lean();
  for (const item of items) {
    await adjustStock({
      productId: item.productId,
      variantSku: item.variantSku || "",
      delta: Number(item.qty || 0),
      reason: "customer_order_cancelled",
    });
  }
}

const refundDetailsSchema = z.object({
  accountHolderName: z.string().min(2),
  bankName: z.string().optional(),
  accountNumber: z.string().min(4),
  iban: z.string().optional(),
  swiftCode: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
});

const cancelOrderSchema = z.object({
  refundDetails: refundDetailsSchema.optional(),
});

async function updatePaymentStateForCancelledOrder(order, refundDetails) {
  if (order.paymentStatus === "paid") {
    order.refundRequest = {
      status: "requested",
      accountHolderName: refundDetails?.accountHolderName || "",
      bankName: refundDetails?.bankName || "",
      accountNumber: refundDetails?.accountNumber || "",
      iban: refundDetails?.iban || "",
      swiftCode: refundDetails?.swiftCode || "",
      country: refundDetails?.country || "",
      notes: refundDetails?.notes || "",
      requestedAt: new Date(),
      processedAt: null,
      processedByAdminId: null,
      adminNote: "",
    };
    return;
  }

  if (["awaiting_transfer", "under_review"].includes(order.paymentStatus)) {
    order.paymentStatus = "rejected";
  }
}

async function cancelMyOrder(req, res) {
  const body = cancelOrderSchema.parse(req.body || {});
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

  if (order.paymentStatus === "paid" && !body.refundDetails) {
    return res.status(400).json({ message: "Refund account details are required for paid orders" });
  }

  await updatePaymentStateForCancelledOrder(order, body.refundDetails);
  await restockCancelledOrder(order._id);

  order.status = "cancelled";
  await order.save();

  await VendorOrder.updateMany(
    { orderId: order._id, status: { $nin: ["delivered", "cancelled"] } },
    { $set: { status: "cancelled", paymentStatus: order.paymentStatus } }
  );

  await notifyUser({
    userId: order.customerUserId,
    title: "Order cancelled",
    body:
      order.refundRequest?.status === "requested"
        ? `Your order ${order.orderNumber} has been cancelled. Your refund request has been received and will be processed within 5 working days.`
        : `Your order ${order.orderNumber} has been cancelled.`,
    type: "order",
    data: { orderId: order._id, status: order.status, paymentStatus: order.paymentStatus },
  });

  res.json({ order });
}

module.exports = {
  listMyOrders,
  getMyOrderDetail,
  cancelMyOrder,
};
