const { notifyUser, notifyVendorOwner } = require("../services/notification.service");
const { z } = require("zod");
const Order = require("../models/Order");
const VendorOrder = require("../models/VendorOrder");
const OrderItem = require("../models/OrderItem");
const AuditLog = require("../models/AuditLog");
const { applyTransaction } = require("../services/wallet.service");
const { logEvent } = require("../services/analyticsEvents.service");

const ADMIN_FULFILLMENT_TYPE = "admin";
const VENDOR_FULFILLMENT_TYPE = "vendor";

function isAdminFulfillmentOrder(vendorOrder) {
  return vendorOrder?.fulfillmentType === ADMIN_FULFILLMENT_TYPE;
}

function assertAdminFulfillmentOrder(vendorOrder) {
  if (!isAdminFulfillmentOrder(vendorOrder)) {
    const err = new Error("This action is only allowed for admin fulfillment orders");
    err.statusCode = 400;
    throw err;
  }
}

function assertVendorFulfillmentOrder(vendorOrder) {
  if (isAdminFulfillmentOrder(vendorOrder)) {
    const err = new Error("This action is only allowed for vendor fulfillment orders");
    err.statusCode = 400;
    throw err;
  }
}


/**
 * Admin: List master orders
 * GET /api/v1/admin/orders
 * Query:
 * - q (orderNumber)
 * - status (placed/cancelled)
 * - page/limit
 */
async function adminListOrders(req, res) {
  const schema = z.object({
    q: z.string().optional(),
    status: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  });

  const qp = schema.parse(req.query);
  const page = Math.max(parseInt(qp.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(qp.limit || "30", 10), 1), 100);
  const skip = (page - 1) * limit;

  const query = {};
  if (qp.status) query.status = qp.status;

  if (qp.q && qp.q.trim()) {
    query.orderNumber = { $regex: qp.q.trim(), $options: "i" };
  }

  const [items, total] = await Promise.all([
    Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(query),
  ]);

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

/**
 * Admin: Order detail with vendor splits + items
 * GET /api/v1/admin/orders/:orderId
 */
async function adminGetOrderDetail(req, res) {
  const orderId = req.params.orderId;

  const order = await Order.findById(orderId).lean();
  if (!order) return res.status(404).json({ message: "Order not found" });

  const vendorOrders = await VendorOrder.find({ orderId: order._id }).sort({ createdAt: 1 }).lean();

  // Pull items grouped by vendorOrderId
  const items = await OrderItem.find({ orderId: order._id }).lean();

  res.json({ order, vendorOrders, items });
}

/**
 * Admin: List vendor orders (split orders)
 * GET /api/v1/admin/vendor-orders
 * Query:
 * - status (placed/accepted/packed/ready_pickup/shipped/delivered/cancelled)
 * - q (vendorOrderNumber)
 * - vendorId
 * - orderId
 * - page/limit
 */
async function adminListVendorOrders(req, res) {
  const schema = z.object({
    status: z.string().optional(),
    fulfillmentType: z.enum(["vendor", "admin"]).optional(),
    q: z.string().optional(),
    vendorId: z.string().optional(),
    orderId: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  });

  const qp = schema.parse(req.query);
  const page = Math.max(parseInt(qp.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(qp.limit || "50", 10), 1), 100);
  const skip = (page - 1) * limit;

  const query = {};
  if (qp.status) query.status = qp.status;
  if (qp.fulfillmentType === ADMIN_FULFILLMENT_TYPE) {
    query.fulfillmentType = ADMIN_FULFILLMENT_TYPE;
  } else if (qp.fulfillmentType === VENDOR_FULFILLMENT_TYPE) {
    query.$or = [{ fulfillmentType: VENDOR_FULFILLMENT_TYPE }, { fulfillmentType: { $exists: false } }];
  }
  if (qp.vendorId) query.vendorId = qp.vendorId;
  if (qp.orderId) query.orderId = qp.orderId;

  if (qp.q && qp.q.trim()) {
    query.vendorOrderNumber = { $regex: qp.q.trim(), $options: "i" };
  }

  // ✅ FIXED: Added .populate('orderId', 'orderNumber') to make orderId an object with _id and orderNumber
  const [items, total] = await Promise.all([
    VendorOrder.find(query)
      .populate('orderId', 'orderNumber')  // This populates the order with its number
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    VendorOrder.countDocuments(query),
  ]);

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

/**
 * Admin: VendorOrder detail with items
 * GET /api/v1/admin/vendor-orders/:vendorOrderId
 */
async function adminGetVendorOrderDetail(req, res) {
  const vendorOrderId = req.params.vendorOrderId;

  const vendorOrder = await VendorOrder.findById(vendorOrderId).lean();
  if (!vendorOrder) return res.status(404).json({ message: "Vendor order not found" });

  const items = await OrderItem.find({ vendorOrderId }).lean();
  res.json({ vendorOrder, items });
}

/**
 * Admin: Schedule pickup for a ready_pickup vendor order
 * POST /api/v1/admin/vendor-orders/:vendorOrderId/schedule-pickup
 */
const schedulePickupSchema = z.object({
  scheduledAt: z.string().datetime(),
  pickupWindow: z.string().optional(),
  notes: z.string().optional(),
});

const cancelSchema = z.object({
  note: z.string().optional().default("Cancelled by admin"),
});

async function adminSchedulePickup(req, res) {
  const vendorOrderId = req.params.vendorOrderId;
  const body = schedulePickupSchema.parse(req.body);

  const vo = await VendorOrder.findById(vendorOrderId);
  if (!vo) return res.status(404).json({ message: "Vendor order not found" });

  if (!["ready_pickup", "packed", "accepted", "placed"].includes(vo.status)) {
    return res.status(400).json({ message: `Cannot schedule pickup in status ${vo.status}` });
  }

  vo.pickup = {
    scheduledAt: new Date(body.scheduledAt),
    pickupWindow: body.pickupWindow || "",
    notes: body.notes || "",
  };

  await vo.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "PICKUP_SCHEDULED",
    entityType: "VendorOrder",
    entityId: vo._id,
    meta: { scheduledAt: vo.pickup.scheduledAt, pickupWindow: vo.pickup.pickupWindow },
  });

  res.json({ vendorOrder: vo });
}

/**
 * Admin: Assign shipping partner & (optional) tracking code
 * POST /api/v1/admin/vendor-orders/:vendorOrderId/assign-shipping
 */
const assignShippingSchema = z.object({
  partnerName: z.string().min(2),
  trackingCode: z.string().optional(),
});

async function adminAssignShipping(req, res) {
  const vendorOrderId = req.params.vendorOrderId;
  const body = assignShippingSchema.parse(req.body);

  const vo = await VendorOrder.findById(vendorOrderId);
  if (!vo) return res.status(404).json({ message: "Vendor order not found" });

  // Typically you assign shipping after vendor is ready for pickup, but manual flow can allow earlier
  if (["cancelled", "delivered"].includes(vo.status)) {
    return res.status(400).json({ message: `Cannot assign shipping in status ${vo.status}` });
  }

  vo.shipping = {
    ...vo.shipping,
    partnerName: body.partnerName,
    trackingCode: body.trackingCode || vo.shipping?.trackingCode || "",
  };

  await vo.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "SHIPPING_ASSIGNED",
    entityType: "VendorOrder",
    entityId: vo._id,
    meta: { partnerName: body.partnerName, trackingCode: body.trackingCode || "" },
  });

  res.json({ vendorOrder: vo });
}

/**
 * Admin: Mark shipped (manual status update)
 * POST /api/v1/admin/vendor-orders/:vendorOrderId/mark-shipped
 */
const markShippedSchema = z.object({
  shippedAt: z.string().datetime().optional(),
});

async function adminMarkShipped(req, res) {
  const vendorOrderId = req.params.vendorOrderId;
  const body = markShippedSchema.parse(req.body);

  const vo = await VendorOrder.findById(vendorOrderId);
  if (!vo) return res.status(404).json({ message: "Vendor order not found" });

  const allowedStatuses = isAdminFulfillmentOrder(vo)
    ? ["placed", "picking", "packed"]
    : ["ready_pickup", "packed", "accepted"];

  if (!allowedStatuses.includes(vo.status)) {
    return res.status(400).json({ message: `Cannot mark shipped in status ${vo.status}` });
  }

  vo.status = "shipped";
  vo.shipping = {
    ...vo.shipping,
    shippedAt: body.shippedAt ? new Date(body.shippedAt) : new Date(),
  };

  await vo.save();

  const master = await Order.findById(vo.orderId).lean();
  if (master) {
    await notifyUser({
      userId: master.customerUserId,
      title: "Order shipped",
      body: `Vendor order ${vo.vendorOrderNumber} has been shipped.`,
      type: "order",
      data: { orderId: master._id, vendorOrderId: vo._id, vendorOrderNumber: vo.vendorOrderNumber },
    });
  }
  if (!isAdminFulfillmentOrder(vo)) {
    await notifyVendorOwner({
      vendorId: vo.vendorId,
      title: "Order shipped",
      body: `Vendor order ${vo.vendorOrderNumber} has been marked as shipped.`,
      type: "order",
      data: { vendorOrderId: vo._id, vendorOrderNumber: vo.vendorOrderNumber },
    });
  }

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "ORDER_MARKED_SHIPPED",
    entityType: "VendorOrder",
    entityId: vo._id,
    meta: { shippedAt: vo.shipping.shippedAt },
  });

  res.json({ vendorOrder: vo });
}

/**
 * Admin: Mark delivered (manual status update)
 * POST /api/v1/admin/vendor-orders/:vendorOrderId/mark-delivered
 */
const markDeliveredSchema = z.object({
  deliveredAt: z.string().datetime().optional(),
});

async function adminStartPicking(req, res) {
  const vendorOrderId = req.params.vendorOrderId;
  const vo = await VendorOrder.findById(vendorOrderId);
  if (!vo) return res.status(404).json({ message: "Vendor order not found" });
  assertAdminFulfillmentOrder(vo);

  if (!["placed"].includes(vo.status)) {
    return res.status(400).json({ message: `Cannot start picking in status ${vo.status}` });
  }

  vo.status = "picking";
  await vo.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "ADMIN_FULFILLMENT_PICKING_STARTED",
    entityType: "VendorOrder",
    entityId: vo._id,
    meta: { vendorOrderNumber: vo.vendorOrderNumber },
  });

  res.json({ vendorOrder: vo });
}

async function adminPackOrder(req, res) {
  const vendorOrderId = req.params.vendorOrderId;
  const vo = await VendorOrder.findById(vendorOrderId);
  if (!vo) return res.status(404).json({ message: "Vendor order not found" });
  assertAdminFulfillmentOrder(vo);

  if (!["picking", "placed"].includes(vo.status)) {
    return res.status(400).json({ message: `Cannot mark packed in status ${vo.status}` });
  }

  vo.status = "packed";
  await vo.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "ADMIN_FULFILLMENT_PACKED",
    entityType: "VendorOrder",
    entityId: vo._id,
    meta: { vendorOrderNumber: vo.vendorOrderNumber },
  });

  res.json({ vendorOrder: vo });
}

async function adminMarkDelivered(req, res) {
  const vendorOrderId = req.params.vendorOrderId;
  const body = markDeliveredSchema.parse(req.body);

  const vo = await VendorOrder.findById(vendorOrderId);
  if (!vo) return res.status(404).json({ message: "Vendor order not found" });

  if (vo.status !== "shipped") {
    return res.status(400).json({ message: `Cannot mark delivered in status ${vo.status}` });
  }

  vo.status = "delivered";
  vo.shipping = {
    ...vo.shipping,
    deliveredAt: body.deliveredAt ? new Date(body.deliveredAt) : new Date(),
  };

  await vo.save();

  if (!isAdminFulfillmentOrder(vo)) {
    // CREDIT VENDOR EARNING (idempotent)
    // If this runs twice, unique index will prevent duplicate EARNING_CREDIT for same VendorOrder.
    try {
      await applyTransaction({
        vendorId: vo.vendorId,
        kind: "EARNING_CREDIT",
        amount: Number(vo.subtotal), // decide later if commission/taxes affect this
        note: `Earning from delivered vendor order ${vo.vendorOrderNumber}`,
        referenceType: "VendorOrder",
        referenceId: vo._id,
        createdByAdminId: req.user._id,
      });
    } catch (e) {
      // If already credited, ignore duplicate key error
      if (String(e.code) !== "11000") throw e;
    }
  }

  const master = await Order.findById(vo.orderId).lean();
  if (master) {
    await notifyUser({
      userId: master.customerUserId,
      title: "Order delivered",
      body: `Vendor order ${vo.vendorOrderNumber} has been delivered.`,
      type: "order",
      data: { orderId: master._id, vendorOrderId: vo._id, vendorOrderNumber: vo.vendorOrderNumber },
    });
  }
  if (!isAdminFulfillmentOrder(vo)) {
    await notifyVendorOwner({
      vendorId: vo.vendorId,
      title: "Order delivered",
      body: `Vendor order ${vo.vendorOrderNumber} has been delivered. Earnings credited to wallet.`,
      type: "order",
      data: { vendorOrderId: vo._id, vendorOrderNumber: vo.vendorOrderNumber },
    });
  }

  // Log delivered event
  await logEvent({
    type: "VENDOR_ORDER_DELIVERED",
    vendorId: vo.vendorId,
    vendorOrderId: vo._id,
    orderId: vo.orderId,
    meta: {
      subtotal: vo.subtotal,
      discountTotal: vo.discountTotal,
      grandTotal: vo.grandTotal,
      fulfillmentType: vo.fulfillmentType || VENDOR_FULFILLMENT_TYPE,
    },
  });


  await AuditLog.create({
    actorUserId: req.user._id,
    action: "ORDER_MARKED_DELIVERED",
    entityType: "VendorOrder",
    entityId: vo._id,
    meta: { deliveredAt: vo.shipping.deliveredAt },
  });

  res.json({ vendorOrder: vo });
}

/**
 * Admin: Quick queue endpoints
 * GET /api/v1/admin/vendor-orders/queue/ready-pickup
 * Shows vendor orders waiting pickup/shipping
 */
async function adminReadyPickupQueue(req, res) {
  const items = await VendorOrder.find({
    status: "ready_pickup",
    $or: [{ fulfillmentType: VENDOR_FULFILLMENT_TYPE }, { fulfillmentType: { $exists: false } }],
  }).sort({ updatedAt: 1 }).lean();
  res.json({ items });
}

async function adminFulfillmentQueue(req, res) {
  const items = await VendorOrder.find({
    fulfillmentType: ADMIN_FULFILLMENT_TYPE,
    status: { $in: ["placed", "picking", "packed"] },
  }).sort({ updatedAt: 1 }).lean();
  res.json({ items });
}

async function adminCancelVendorOrder(req, res) {
  const vendorOrderId = req.params.vendorOrderId;
  const body = cancelSchema.parse(req.body || {});

  const vo = await VendorOrder.findById(vendorOrderId);
  if (!vo) return res.status(404).json({ message: "Vendor order not found" });

  if (["delivered", "cancelled"].includes(vo.status)) {
    return res.status(400).json({ message: `Cannot cancel vendor order in status ${vo.status}` });
  }

  vo.status = "cancelled";
  await vo.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "VENDOR_ORDER_CANCELLED",
    entityType: "VendorOrder",
    entityId: vo._id,
    meta: { note: body.note || "Cancelled by admin", orderId: vo.orderId, vendorId: vo.vendorId },
  });

  res.json({ vendorOrder: vo });
}

async function adminCancelOrder(req, res) {
  const orderId = req.params.orderId;
  const body = cancelSchema.parse(req.body || {});

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (order.status === "cancelled") {
    return res.status(400).json({ message: "Order already cancelled" });
  }

  order.status = "cancelled";
  await order.save();

  await VendorOrder.updateMany(
    { orderId: order._id, status: { $nin: ["delivered", "cancelled"] } },
    { $set: { status: "cancelled" } }
  );

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "ORDER_CANCELLED",
    entityType: "Order",
    entityId: order._id,
    meta: { note: body.note || "Cancelled by admin" },
  });

  res.json({ order });
}

module.exports = {
  adminListOrders,
  adminGetOrderDetail,
  adminListVendorOrders,
  adminGetVendorOrderDetail,
  adminSchedulePickup,
  adminAssignShipping,
  adminStartPicking,
  adminPackOrder,
  adminMarkShipped,
  adminMarkDelivered,
  adminReadyPickupQueue,
  adminFulfillmentQueue,
  adminCancelVendorOrder,
  adminCancelOrder,
};
