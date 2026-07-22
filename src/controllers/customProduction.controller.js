const crypto = require("crypto");
const { z } = require("zod");
const CustomProductionRequest = require("../models/CustomProductionRequest");
const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const User = require("../models/User");
const { notifyUser, notifyVendorOwner } = require("../services/notification.service");

// ----------------------- helpers -----------------------

function genToken(prefix = "RFQ") {
  return `${prefix}-${crypto.randomBytes(16).toString("hex")}`;
}

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + (Number(days) || 7));
  return d;
}

function pickProductImage(p) {
  if (p.imageUrls && p.imageUrls.length) return p.imageUrls[0];
  return "";
}

async function notifyRFQ(rfq, action) {
  const titles = {
    new_request: "New custom production request",
    quoted: "Quotation sent",
    accepted: "Request accepted",
    rejected: "Request rejected",
    expired: "Request expired",
    in_production: "Production started",
  };
  const bodies = {
    new_request: `A buyer submitted a custom production request for ${rfq.productSnapshot?.title || "your product"}.`,
    quoted: `A quotation has been sent for your custom production request.`,
    accepted: `Your custom production request has been accepted.`,
    rejected: `Your custom production request has been rejected.`,
    expired: `Your custom production request has expired.`,
    in_production: `Production has started for your custom production request.`,
  };

  await notifyUser({
    userId: rfq.buyerUserId,
    title: titles[action],
    body: bodies[action],
    type: "rfq",
    data: { rfqId: rfq._id, productId: rfq.productId, action },
  });
  await notifyVendorOwner({
    vendorId: rfq.vendorId,
    title: titles[action],
    body: bodies[action],
    type: "rfq",
    data: { rfqId: rfq._id, productId: rfq.productId, action },
  });
}

// ----------------------- buyer endpoints -----------------------

const createRFQSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(1),
  specifications: z.string().min(1, "Specifications are required"),
  deliveryExpectations: z.string().optional().default(""),
  validUntil: z.string().optional(),
  validDays: z.number().int().min(1).max(180).optional(),
  attachments: z
    .array(
      z.object({
        url: z.string(),
        filename: z.string().optional(),
        mimeType: z.string().optional(),
        size: z.number().optional(),
      })
    )
    .optional()
    .default([]),
  shippingAddress: z
    .object({
      companyName: z.string().optional(),
      contactPerson: z.string().optional(),
      mobileNumber: z.string().optional(),
      country: z.string().optional(),
      city: z.string().optional(),
      street: z.string().optional(),
      postalCode: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional()
    .nullable(),
});

async function createRFQ(req, res) {
  const body = createRFQSchema.parse(req.body);

  const product = await Product.findById(body.productId).lean();
  if (!product) return res.status(404).json({ message: "Product not found" });
  if (!product.vendorId)
    return res.status(400).json({ message: "Custom production requests are only available for vendor-listed products" });
  if (product.isPlatformProduct === true || product.source === "admin_platform")
    return res.status(400).json({ message: "Custom production requests are not available for platform products" });

  const vendor = await Vendor.findById(product.vendorId).lean();
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });

  const buyer = await User.findById(req.user._id).lean();
  if (!buyer) return res.status(401).json({ message: "Buyer not found" });

  let validUntil;
  if (body.validUntil) {
    validUntil = new Date(body.validUntil);
    if (Number.isNaN(validUntil.getTime()))
      return res.status(400).json({ message: "Invalid validUntil" });
  } else {
    validUntil = addDays(new Date(), body.validDays || 14);
  }

  // Build the RFQ document and save it (so we can catch validation errors
  // and surface them instead of letting the generic handler return 500).
  const rfqDoc = new CustomProductionRequest({
    productId: product._id,
    vendorId: vendor._id,
    buyerUserId: buyer._id,

    productSnapshot: {
      title: product.title,
      slug: product.slug,
      imageUrl: pickProductImage(product),
      currency: product.currency || "EUR",
    },
    vendorSnapshot: {
      storeName: vendor.storeName,
      storeSlug: vendor.storeSlug,
    },
    buyerSnapshot: {
      email: buyer.email,
      firstName: buyer.firstName,
      lastName: buyer.lastName,
      companyName: buyer.companyName,
    },

    qty: body.qty,
    specifications: body.specifications,
    deliveryExpectations: body.deliveryExpectations || "",
    attachments: body.attachments || [],
    shippingAddress: body.shippingAddress || null,
    validUntil,
    status: "requested",
    messages: [
      {
        senderRole: "buyer",
        senderUserId: buyer._id,
        senderName:
          [buyer.firstName, buyer.lastName].filter(Boolean).join(" ") || buyer.email,
        message: body.specifications,
        attachments: body.attachments || [],
        createdAt: new Date(),
      },
    ],
    // Explicitly clear paymentLink fields so they don't carry over from any defaults.
    // token must be `null` (not `""`) so the unique-sparse index on paymentLink.token
    // correctly skips this row — `""` is a present string and would collide on the second insert.
    paymentLink: { token: null, generatedAt: null, expiresAt: null, usedAt: null, orderId: null },
  });

  try {
    await rfqDoc.save();
  } catch (saveErr) {
    console.error("[customProduction.createRFQ] save failed:", saveErr.message, saveErr.errors || saveErr);
    return res.status(400).json({
      message: saveErr.message || "Failed to create RFQ",
      validationErrors: saveErr.errors
        ? Object.fromEntries(
            Object.entries(saveErr.errors).map(([k, v]) => [k, v.message || String(v)])
          )
        : undefined,
    });
  }

  try {
    await notifyRFQ(rfqDoc, "new_request");
  } catch (notifyErr) {
    // Do not let notification failure break the creation flow
    console.error("[customProduction.createRFQ] notify failed (non-fatal):", notifyErr.message);
  }

  res.status(201).json({ rfq: rfqDoc.toObject() });
}

async function listMyBuyerRFQs(req, res) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const filter = { buyerUserId: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    CustomProductionRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CustomProductionRequest.countDocuments(filter),
  ]);
  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

async function getMyBuyerRFQ(req, res) {
  const rfq = await CustomProductionRequest.findOne({
    _id: req.params.rfqId,
    buyerUserId: req.user._id,
  }).lean();
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });
  res.json({ rfq });
}

const buyerCounterSchema = z.object({
  message: z.string().optional().default(""),
  attachments: z.array(z.object({ url: z.string() })).optional().default([]),
  validDays: z.number().int().min(1).max(180).optional(),
});

async function buyerSendCounterMessage(req, res) {
  const body = buyerCounterSchema.parse(req.body);
  const rfq = await CustomProductionRequest.findOne({
    _id: req.params.rfqId,
    buyerUserId: req.user._id,
  });
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });

  if (["accepted", "rejected", "expired", "cancelled", "completed"].includes(rfq.status))
    return res.status(400).json({ message: `Cannot message ${rfq.status} RFQ` });

  if (body.validDays) rfq.validUntil = addDays(new Date(), body.validDays);

  rfq.messages.push({
    senderRole: "buyer",
    senderUserId: req.user._id,
    senderName:
      [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || req.user.email,
    message: body.message || "",
    attachments: body.attachments || [],
    createdAt: new Date(),
  });
  await rfq.save();
  await notifyRFQ(rfq, "quoted");
  res.json({ rfq });
}

async function buyerAcceptQuotation(req, res) {
  const rfq = await CustomProductionRequest.findOne({
    _id: req.params.rfqId,
    buyerUserId: req.user._id,
  });
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });
  if (rfq.status !== "quoted")
    return res.status(400).json({ message: "No quotation to accept" });
  if (!rfq.quotation)
    return res.status(400).json({ message: "No quotation found" });
  if (new Date(rfq.validUntil).getTime() < Date.now())
    return res.status(400).json({ message: "RFQ has expired" });

  rfq.status = "accepted";
  rfq.paymentLink = {
    token: genToken("RFQ"),
    generatedAt: new Date(),
    expiresAt: addDays(new Date(), 14),
    usedAt: null,
    orderId: null,
  };
  rfq.messages.push({
    senderRole: "buyer",
    senderUserId: req.user._id,
    senderName:
      [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || req.user.email,
    message: "Buyer accepted the quotation.",
    attachments: [],
    createdAt: new Date(),
  });
  await rfq.save();
  await notifyRFQ(rfq, "accepted");
  res.json({ rfq });
}

async function buyerRejectQuotation(req, res) {
  const reason = (req.body && req.body.reason) || "";
  const rfq = await CustomProductionRequest.findOne({
    _id: req.params.rfqId,
    buyerUserId: req.user._id,
  });
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });
  if (["accepted", "rejected", "expired", "cancelled", "completed"].includes(rfq.status))
    return res.status(400).json({ message: `Cannot reject ${rfq.status} RFQ` });

  rfq.status = "rejected";
  rfq.messages.push({
    senderRole: "buyer",
    senderUserId: req.user._id,
    senderName:
      [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || req.user.email,
    message: reason ? `Buyer rejected: ${reason}` : "Buyer rejected the quotation.",
    attachments: [],
    createdAt: new Date(),
  });
  await rfq.save();
  await notifyRFQ(rfq, "rejected");
  res.json({ rfq });
}

async function buyerCancelRFQ(req, res) {
  const rfq = await CustomProductionRequest.findOne({
    _id: req.params.rfqId,
    buyerUserId: req.user._id,
  });
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });
  if (["accepted", "rejected", "expired", "cancelled", "completed"].includes(rfq.status))
    return res.status(400).json({ message: `Cannot cancel ${rfq.status} RFQ` });

  rfq.status = "cancelled";
  await rfq.save();
  await notifyRFQ(rfq, "rejected");
  res.json({ rfq });
}

// ----------------------- vendor endpoints -----------------------

async function listVendorRFQs(req, res) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const filter = { vendorId: req.vendorContext.vendorId };
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    CustomProductionRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CustomProductionRequest.countDocuments(filter),
  ]);
  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

async function getVendorRFQ(req, res) {
  const rfq = await CustomProductionRequest.findOne({
    _id: req.params.rfqId,
    vendorId: req.vendorContext.vendorId,
  }).lean();
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });
  res.json({ rfq });
}

const quotationSchema = z.object({
  unitPrice: z.number().min(0),
  totalPrice: z.number().min(0).optional(),
  currency: z.string().optional(),
  leadTimeDays: z.number().int().min(0).default(0),
  productionNotes: z.string().optional().default(""),
  termsAndConditions: z.string().optional().default(""),
  validDays: z.number().int().min(1).max(180).optional(),
  message: z.string().optional().default(""),
  attachments: z.array(z.object({ url: z.string() })).optional().default([]),
});

async function vendorSendQuotation(req, res) {
  const body = quotationSchema.parse(req.body);

  const rfq = await CustomProductionRequest.findOne({
    _id: req.params.rfqId,
    vendorId: req.vendorContext.vendorId,
  });
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });
  if (["accepted", "rejected", "expired", "cancelled", "completed"].includes(rfq.status))
    return res.status(400).json({ message: `Cannot quote on ${rfq.status} RFQ` });

  const total = Number(
    (body.totalPrice != null
      ? body.totalPrice
      : body.unitPrice * rfq.qty
    ).toFixed(2)
  );

  rfq.quotation = {
    unitPrice: Number(body.unitPrice.toFixed(2)),
    totalPrice: total,
    currency: body.currency || rfq.productSnapshot?.currency || "EUR",
    leadTimeDays: body.leadTimeDays || 0,
    productionNotes: body.productionNotes || "",
    termsAndConditions: body.termsAndConditions || "",
    quotedByUserId: req.user._id,
    quotedAt: new Date(),
  };
  rfq.status = "quoted";
  if (body.validDays) rfq.validUntil = addDays(new Date(), body.validDays);

  rfq.messages.push({
    senderRole: "seller",
    senderVendorId: req.vendorContext.vendorId,
    senderUserId: req.user._id,
    senderName: req.vendorContext.vendor.storeName,
    message:
      body.message ||
      `Quotation: ${rfq.quotation.unitPrice} ${rfq.quotation.currency} per unit (total ${rfq.quotation.totalPrice}).`,
    attachments: body.attachments || [],
    createdAt: new Date(),
  });
  await rfq.save();
  await notifyRFQ(rfq, "quoted");
  res.json({ rfq });
}

const vendorCounterSchema = z.object({
  message: z.string().optional().default(""),
  attachments: z.array(z.object({ url: z.string() })).optional().default([]),
  validDays: z.number().int().min(1).max(180).optional(),
});

async function vendorCounterMessage(req, res) {
  const body = vendorCounterSchema.parse(req.body);
  const rfq = await CustomProductionRequest.findOne({
    _id: req.params.rfqId,
    vendorId: req.vendorContext.vendorId,
  });
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });
  if (["accepted", "rejected", "expired", "cancelled", "completed"].includes(rfq.status))
    return res.status(400).json({ message: `Cannot message ${rfq.status} RFQ` });

  if (body.validDays) rfq.validUntil = addDays(new Date(), body.validDays);
  rfq.messages.push({
    senderRole: "seller",
    senderVendorId: req.vendorContext.vendorId,
    senderUserId: req.user._id,
    senderName: req.vendorContext.vendor.storeName,
    message: body.message || "",
    attachments: body.attachments || [],
    createdAt: new Date(),
  });
  await rfq.save();
  await notifyRFQ(rfq, "quoted");
  res.json({ rfq });
}

async function vendorRejectRFQ(req, res) {
  const reason = (req.body && req.body.reason) || "";
  const rfq = await CustomProductionRequest.findOne({
    _id: req.params.rfqId,
    vendorId: req.vendorContext.vendorId,
  });
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });
  if (["accepted", "rejected", "expired", "cancelled", "completed"].includes(rfq.status))
    return res.status(400).json({ message: `Cannot reject ${rfq.status} RFQ` });

  rfq.status = "rejected";
  rfq.messages.push({
    senderRole: "seller",
    senderVendorId: req.vendorContext.vendorId,
    senderUserId: req.user._id,
    senderName: req.vendorContext.vendor.storeName,
    message: reason ? `Seller rejected: ${reason}` : "Seller rejected the RFQ.",
    attachments: [],
    createdAt: new Date(),
  });
  await rfq.save();
  await notifyRFQ(rfq, "rejected");
  res.json({ rfq });
}

async function vendorMarkInProduction(req, res) {
  const rfq = await CustomProductionRequest.findOne({
    _id: req.params.rfqId,
    vendorId: req.vendorContext.vendorId,
  });
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });
  if (rfq.status !== "in_production" && rfq.status !== "accepted")
    return res.status(400).json({ message: "RFQ is not in a state to start production" });

  rfq.status = "in_production";
  rfq.messages.push({
    senderRole: "seller",
    senderVendorId: req.vendorContext.vendorId,
    senderUserId: req.user._id,
    senderName: req.vendorContext.vendor.storeName,
    message: "Production has started.",
    attachments: [],
    createdAt: new Date(),
  });
  await rfq.save();
  await notifyRFQ(rfq, "in_production");
  res.json({ rfq });
}

async function vendorMarkCompleted(req, res) {
  const rfq = await CustomProductionRequest.findOne({
    _id: req.params.rfqId,
    vendorId: req.vendorContext.vendorId,
  });
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });
  if (rfq.status !== "in_production")
    return res.status(400).json({ message: "Production has not started" });

  rfq.status = "completed";
  rfq.messages.push({
    senderRole: "seller",
    senderVendorId: req.vendorContext.vendorId,
    senderUserId: req.user._id,
    senderName: req.vendorContext.vendor.storeName,
    message: "Production completed.",
    attachments: [],
    createdAt: new Date(),
  });
  await rfq.save();
  res.json({ rfq });
}

/**
 * Vendor can delete an RFQ only after it has reached a terminal state:
 * accepted, rejected, expired, cancelled, or completed.
 * Active RFQs (requested/quoted/in_production) cannot be deleted to
 * preserve negotiation and production history.
 */
async function vendorDeleteRFQ(req, res) {
  const rfq = await CustomProductionRequest.findOne({
    _id: req.params.rfqId,
    vendorId: req.vendorContext.vendorId,
  });
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });

  const TERMINAL = ["accepted", "rejected", "expired", "cancelled", "completed"];
  if (!TERMINAL.includes(rfq.status)) {
    return res.status(400).json({
      message: `Cannot delete an active RFQ (status: ${rfq.status}). Reject it or wait for it to reach a terminal state.`,
    });
  }

  await CustomProductionRequest.deleteOne({ _id: rfq._id });
  res.json({ ok: true, message: "RFQ deleted", rfqId: rfq._id });
}

// ----------------------- shared: payment-link checkout -----------------------

const checkoutRFQSchema = z.object({
  shippingAddress: z
    .object({
      companyName: z.string().min(1),
      contactPerson: z.string().min(1),
      mobileNumber: z.string().min(5),
      country: z.string().min(1),
      city: z.string().min(1),
      street: z.string().min(1),
      postalCode: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  addressId: z.string().optional(),
  paymentMethod: z.enum(["online", "bank_transfer"]).default("online"),
});

async function checkoutFromRFQ(req, res) {
  const body = checkoutRFQSchema.parse(req.body);

  const rfq = await CustomProductionRequest.findOne({
    "paymentLink.token": req.params.token,
  });
  if (!rfq) return res.status(404).json({ message: "Invalid payment link" });
  if (rfq.buyerUserId.toString() !== req.user._id.toString())
    return res.status(403).json({ message: "Not your RFQ" });
  if (rfq.status !== "accepted")
    return res.status(400).json({ message: "RFQ is not in accepted state" });
  if (rfq.paymentLink.usedAt)
    return res.status(400).json({ message: "Payment link already used" });
  if (
    rfq.paymentLink.expiresAt &&
    new Date(rfq.paymentLink.expiresAt).getTime() < Date.now()
  )
    return res.status(400).json({ message: "Payment link expired" });
  if (!rfq.quotation)
    return res.status(400).json({ message: "Quotation missing" });

  const Order = require("../models/Order");
  const VendorOrder = require("../models/VendorOrder");
  const OrderItem = require("../models/OrderItem");
  const Product = require("../models/Product");
  const CustomerAddress = require("../models/CustomerAddress");
  const AuditLog = require("../models/AuditLog");
  const { calculateTax } = require("../services/tax.service");

  const product = await Product.findById(rfq.productId);
  if (!product) return res.status(404).json({ message: "Product no longer exists" });

  let shippingAddress = body.shippingAddress;
  if (!shippingAddress && body.addressId) {
    const addr = await CustomerAddress.findOne({
      _id: body.addressId,
      customerUserId: req.user._id,
    }).lean();
    if (!addr) return res.status(400).json({ message: "Invalid addressId" });
    shippingAddress = {
      label: addr.label,
      companyName: addr.companyName,
      contactPerson: addr.contactPerson,
      mobileNumber: addr.phone,
      country: addr.country,
      city: addr.city,
      street: addr.street1,
      postalCode: addr.postalCode,
      notes: addr.notes,
    };
  }
  if (!shippingAddress && rfq.shippingAddress) shippingAddress = rfq.shippingAddress;
  if (!shippingAddress)
    return res.status(400).json({ message: "Shipping address required" });

  const qty = rfq.qty;
  const unitPrice = rfq.quotation.unitPrice;
  const lineTotal = rfq.quotation.totalPrice || Number((qty * unitPrice).toFixed(2));
  const subtotal = lineTotal;
  const paymentMethod = body.paymentMethod || "online";
  const paymentStatus = paymentMethod === "bank_transfer" ? "awaiting_transfer" : "unpaid";

  const taxResult = await calculateTax({
    subtotal,
    shippingTotal: 0,
    country: shippingAddress.country,
  });
  const grandTotal = Number((subtotal + taxResult.taxAmount).toFixed(2));

  const orderNumber = `SE-RFQ-${Date.now().toString(36).toUpperCase()}`;

  const order = await Order.create({
    customerUserId: req.user._id,
    shippingAddress,
    paymentMethod,
    paymentStatus,
    shippingPricingMode: "auto",
    shippingStatus: "not_required",
    shippingTotal: 0,
    subtotal,
    discountTotal: 0,
    taxRate: taxResult.taxRate,
    taxAmount: taxResult.taxAmount,
    taxableAmount: taxResult.taxableAmount,
    grandTotal,
    currency: rfq.quotation.currency,
    bankTransfer: { reference: "", proofUrl: "", submittedAt: null },
    status: "placed",
    orderNumber,
    coupon: { code: "", couponId: null, scope: "", vendorId: null, discountType: "", value: 0 },
  });

  const vendorOrder = await VendorOrder.create({
    orderId: order._id,
    vendorId: rfq.vendorId,
    vendorStoreName: rfq.vendorSnapshot?.storeName || "Vendor",
    vendorStoreSlug: rfq.vendorSnapshot?.storeSlug || "",
    fulfillmentType: "vendor",
    fulfillmentOwner: "vendor",
    status: "placed",
    paymentStatus,
    shippingPricingMode: "auto",
    shippingStatus: "not_required",
    shippingQuote: { amount: 0, note: "", quotedAt: null, quotedByAdminId: null },
    subtotal,
    shippingTotal: 0,
    discountTotal: 0,
    grandTotal,
    currency: rfq.quotation.currency,
    vendorOrderNumber: `${order.orderNumber}-${String(rfq.vendorId).slice(-4).toUpperCase()}`,
  });

  await OrderItem.create({
    orderId: order._id,
    vendorOrderId: vendorOrder._id,
    productId: product._id,
    vendorId: rfq.vendorId,
    title: `${product.title} (Custom Production)`,
    imageUrl: (product.imageUrls && product.imageUrls[0]) || "",
    variantSku: "",
    variantAttributes: {},
    qty,
    unitPrice,
    currency: rfq.quotation.currency,
    tierMinQtyApplied: 0,
    lineTotal,
  });

  // Mark RFQ in_production + payment link used
  rfq.orderId = order._id;
  rfq.paymentLink.usedAt = new Date();
  rfq.paymentLink.orderId = order._id;
  rfq.status = "in_production";
  rfq.messages.push({
    senderRole: "system",
    message: "Payment received. Production process started.",
    attachments: [],
    createdAt: new Date(),
  });
  await rfq.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "RFQ_CHECKOUT",
    entityType: "Order",
    entityId: order._id,
    meta: { rfqId: rfq._id, orderNumber: order.orderNumber },
  });

  await notifyUser({
    userId: rfq.buyerUserId,
    title: "Order placed from custom production",
    body: `Order ${order.orderNumber} created from your custom production request. Production has started.`,
    type: "order",
    data: { orderId: order._id, orderNumber: order.orderNumber, rfqId: rfq._id },
  });
  await notifyVendorOwner({
    vendorId: rfq.vendorId,
    title: "Order from custom production",
    body: `New order ${order.orderNumber} from custom production. Production has started.`,
    type: "order",
    data: {
      orderId: order._id,
      orderNumber: order.orderNumber,
      vendorOrderId: vendorOrder._id,
      rfqId: rfq._id,
    },
  });

  res.status(201).json({ order, vendorOrder, rfq });
}

async function getRFQByPaymentToken(req, res) {
  const rfq = await CustomProductionRequest.findOne({
    "paymentLink.token": req.params.token,
  }).lean();
  if (!rfq) return res.status(404).json({ message: "Invalid payment link" });
  if (rfq.buyerUserId.toString() !== req.user._id.toString())
    return res.status(403).json({ message: "Not your RFQ" });

  res.json({
    rfq,
    isExpired:
      rfq.paymentLink.expiresAt &&
      new Date(rfq.paymentLink.expiresAt).getTime() < Date.now(),
    isUsed: Boolean(rfq.paymentLink.usedAt),
  });
}

// ----------------------- admin endpoints -----------------------

async function adminListAllRFQs(req, res) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.vendorId) filter.vendorId = req.query.vendorId;
  if (req.query.buyerUserId) filter.buyerUserId = req.query.buyerUserId;
  if (req.query.productId) filter.productId = req.query.productId;

  const [items, total] = await Promise.all([
    CustomProductionRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CustomProductionRequest.countDocuments(filter),
  ]);
  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

async function adminGetRFQ(req, res) {
  const rfq = await CustomProductionRequest.findById(req.params.rfqId).lean();
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });
  res.json({ rfq });
}

/**
 * Admin hard-delete: removes the RFQ from the database regardless of its
 * current status (admin has full power, unlike the vendor who can only
 * delete terminal-state RFQs). After deletion the RFQ disappears from the
 * vendor's and the buyer's lists too, because both sides query the same
 * CustomProductionRequest collection.
 */
async function adminDeleteRFQ(req, res) {
  const rfq = await CustomProductionRequest.findById(req.params.rfqId);
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });

  await CustomProductionRequest.deleteOne({ _id: rfq._id });
  res.json({ ok: true, message: "RFQ deleted", rfqId: rfq._id });
}

module.exports = {
  // buyer
  createRFQ,
  listMyBuyerRFQs,
  getMyBuyerRFQ,
  buyerSendCounterMessage,
  buyerAcceptQuotation,
  buyerRejectQuotation,
  buyerCancelRFQ,
  // vendor
  listVendorRFQs,
  getVendorRFQ,
  vendorSendQuotation,
  vendorCounterMessage,
  vendorRejectRFQ,
  vendorMarkInProduction,
  vendorMarkCompleted,
  vendorDeleteRFQ,
  // payment link
  getRFQByPaymentToken,
  checkoutFromRFQ,
  // admin
  adminListAllRFQs,
  adminGetRFQ,
  adminDeleteRFQ,
  // helpers
  notifyRFQ,
};