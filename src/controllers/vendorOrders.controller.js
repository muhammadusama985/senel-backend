const Order = require("../models/Order");
const { notifyUser } = require("../services/notification.service");
const { z } = require("zod");
const Vendor = require("../models/Vendor");
const VendorOrder = require("../models/VendorOrder");
const OrderItem = require("../models/OrderItem");
const { notifyAdmins } = require("../services/adminNotify.service");

async function getMyVendor(req) {
  const vendor = await Vendor.findOne({ ownerUserId: req.user._id }).lean();
  if (!vendor) {
    const err = new Error("Vendor profile not found");
    err.statusCode = 404;
    throw err;
  }
  return vendor;
}

// Add to vendorListOrders function
async function vendorListOrders(req, res) {
  const vendor = await getMyVendor(req);

  const { status, handoverStatus, q, from, to, page = 1, limit = 20 } = req.query;
  const query = { vendorId: vendor._id };

  if (status) query.status = status;
  if (handoverStatus) query.handoverStatus = handoverStatus;
  if (q) {
    const term = String(q).trim();
    if (term) {
      query.$or = [
        { vendorOrderNumber: { $regex: term, $options: "i" } },
        { paymentStatus: { $regex: term, $options: "i" } },
      ];
    }
  }
  if (from || to) {
    query.createdAt = {};
    if (from) {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) {
        query.createdAt.$gte = fromDate;
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = toDate;
      }
    }
    if (!Object.keys(query.createdAt).length) delete query.createdAt;
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 20, 1);
  const skip = (pageNum - 1) * limitNum;

  const total = await VendorOrder.countDocuments(query);

  const orders = await VendorOrder.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

  res.json({
    items: orders,
    total,
    page: pageNum,
    limit: limitNum,
    pages: Math.ceil(total / limitNum),
  });
}

// Vendor: order detail with items
async function vendorGetOrder(req, res) {
  const vendor = await getMyVendor(req);

  const vo = await VendorOrder.findOne({
    _id: req.params.vendorOrderId,
    vendorId: vendor._id,
  }).lean();

  if (!vo) return res.status(404).json({ message: "Vendor order not found" });

  const items = await OrderItem.find({ vendorOrderId: vo._id }).lean();

  res.json({
    vendorOrder: {
      ...vo,
      items,
    },
  });
}

// Vendor: accept order
async function vendorAcceptOrder(req, res) {
  const vendor = await getMyVendor(req);

  const vo = await VendorOrder.findOne({ _id: req.params.vendorOrderId, vendorId: vendor._id });
  if (!vo) return res.status(404).json({ message: "Vendor order not found" });
  if (vo.fulfillmentType === "admin") {
    return res.status(400).json({ message: "Admin fulfillment orders cannot be processed from vendor panel" });
  }

  if (vo.status !== "placed") return res.status(400).json({ message: `Cannot accept in status ${vo.status}` });

  vo.status = "accepted";
  await vo.save();

  const master = await Order.findById(vo.orderId).lean();
  if (master) {
    await notifyUser({
      userId: master.customerUserId,
      title: "Order update",
      body: `Vendor order ${vo.vendorOrderNumber} is now ${vo.status}.`,
      type: "order",
      data: {
        orderId: master._id,
        vendorOrderId: vo._id,
        vendorOrderNumber: vo.vendorOrderNumber,
        status: vo.status,
      },
    });
  }

  res.json({ vendorOrder: vo });
}

// Vendor: mark packed
async function vendorMarkPacked(req, res) {
  const vendor = await getMyVendor(req);

  const vo = await VendorOrder.findOne({ _id: req.params.vendorOrderId, vendorId: vendor._id });
  if (!vo) return res.status(404).json({ message: "Vendor order not found" });
  if (vo.fulfillmentType === "admin") {
    return res.status(400).json({ message: "Admin fulfillment orders cannot be processed from vendor panel" });
  }

  if (!["accepted"].includes(vo.status)) {
    return res.status(400).json({ message: `Cannot pack in status ${vo.status}` });
  }

  vo.status = "packed";
  await vo.save();

  const master = await Order.findById(vo.orderId).lean();
  if (master) {
    await notifyUser({
      userId: master.customerUserId,
      title: "Order update",
      body: `Vendor order ${vo.vendorOrderNumber} is now ${vo.status}.`,
      type: "order",
      data: {
        orderId: master._id,
        vendorOrderId: vo._id,
        vendorOrderNumber: vo.vendorOrderNumber,
        status: vo.status,
      },
    });
  }

  res.json({ vendorOrder: vo });
}

// Vendor: shipping prep + ready for pickup
const prepSchema = z.object({
  weightKg: z.number().min(0).optional(),
  lengthCm: z.number().min(0).optional(),
  widthCm: z.number().min(0).optional(),
  heightCm: z.number().min(0).optional(),
  boxCount: z.number().int().min(1).optional(),
  handoverNote: z.string().optional(),
  packages: z.array(
    z.object({
      boxIndex: z.number().int().min(1),
      weightKg: z.number().min(0).optional(),
      lengthCm: z.number().min(0).optional(),
      widthCm: z.number().min(0).optional(),
      heightCm: z.number().min(0).optional(),
    })
  ).optional(),
  tracking: z.object({
    carrier: z.string().optional(),
    trackingNumber: z.string().optional(),
    trackingUrl: z.string().optional(),
  }).optional(),
});

async function vendorReadyForPickup(req, res) {
  const vendor = await getMyVendor(req);
  const body = prepSchema.parse(req.body);

  const vo = await VendorOrder.findOne({ _id: req.params.vendorOrderId, vendorId: vendor._id });
  if (!vo) return res.status(404).json({ message: "Vendor order not found" });
  if (vo.fulfillmentType === "admin") {
    return res.status(400).json({ message: "Admin fulfillment orders cannot be processed from vendor panel" });
  }

  if (!["packed"].includes(vo.status)) {
    return res.status(400).json({ message: `Cannot mark ready in status ${vo.status}` });
  }

  if (body.packages && body.packages.length > 0) {
    const boxCount = body.boxCount || vo.boxCount || 1;
    if (body.packages.length < boxCount) {
      return res.status(400).json({
        message: `Please add package details for all boxes (${body.packages.length}/${boxCount})`,
      });
    }
    vo.packages = body.packages.sort((a, b) => a.boxIndex - b.boxIndex);
  }

  vo.shippingPrep = {
    ...vo.shippingPrep,
    weightKg: body.weightKg ?? vo.shippingPrep?.weightKg ?? 0,
    lengthCm: body.lengthCm ?? vo.shippingPrep?.lengthCm ?? 0,
    widthCm: body.widthCm ?? vo.shippingPrep?.widthCm ?? 0,
    heightCm: body.heightCm ?? vo.shippingPrep?.heightCm ?? 0,
    boxCount: body.boxCount ?? vo.shippingPrep?.boxCount ?? 1,
    readyForPickupAt: new Date(),
  };

  vo.handoverStatus = "ready_for_pickup";
  vo.readyForPickupAt = new Date();
  if (body.handoverNote) vo.handoverNote = body.handoverNote;

  if (body.tracking) {
    vo.tracking = {
      carrier: body.tracking.carrier || vo.tracking?.carrier || "",
      trackingNumber: body.tracking.trackingNumber || vo.tracking?.trackingNumber || "",
      trackingUrl: body.tracking.trackingUrl || vo.tracking?.trackingUrl || "",
    };
  }

  vo.status = "ready_pickup";
  await vo.save();

  await notifyAdmins({
    title: "📦 Ready for Pickup",
    body: `Vendor order ${vo.vendorOrderNumber} is ready for pickup. ${vo.boxCount || 1} box(es) ready.`,
    type: "handover",
    data: { vendorOrderId: vo._id, vendorId: vo.vendorId, orderId: vo.orderId },
  });

  const master = await Order.findById(vo.orderId).lean();
  if (master) {
    await notifyUser({
      userId: master.customerUserId,
      title: "Order update",
      body: `Vendor order ${vo.vendorOrderNumber} is now ${vo.status}.`,
      type: "order",
      data: {
        orderId: master._id,
        vendorOrderId: vo._id,
        vendorOrderNumber: vo.vendorOrderNumber,
        status: vo.status,
      },
    });
  }

  res.json({ vendorOrder: vo });
}

module.exports = {
  vendorListOrders,
  vendorGetOrder,
  vendorAcceptOrder,
  vendorMarkPacked,
  vendorReadyForPickup,
};
