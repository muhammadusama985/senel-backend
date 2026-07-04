const crypto = require("crypto");
const { z } = require("zod");
const BulkOffer = require("../models/BulkOffer");
const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const User = require("../models/User");
const { notifyUser, notifyVendorOwner } = require("../services/notification.service");

// ----------------------- helpers -----------------------

function genToken(prefix = "BO") {
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

async function notifyCounterpartyOnOffer(offer, action) {
  // action: "new_offer" | "counter" | "accepted" | "rejected" | "expired"
  const titles = {
    new_offer: "New bulk offer received",
    counter: "Counter offer submitted",
    accepted: "Offer accepted",
    rejected: "Offer rejected",
    expired: "Offer expired",
  };
  const bodies = {
    new_offer: `A buyer has submitted a bulk offer for ${offer.productSnapshot?.title || "your product"}.`,
    counter: `A counter offer has been submitted on the negotiation for ${offer.productSnapshot?.title || "your product"}.`,
    accepted: `The bulk offer for ${offer.productSnapshot?.title || "your product"} has been accepted.`,
    rejected: `The bulk offer for ${offer.productSnapshot?.title || "your product"} has been rejected.`,
    expired: `The bulk offer for ${offer.productSnapshot?.title || "your product"} has expired.`,
  };

  // Notify buyer
  await notifyUser({
    userId: offer.buyerUserId,
    title: titles[action],
    body: bodies[action],
    type: "bulk_offer",
    data: { offerId: offer._id, productId: offer.productId, action },
  });
  // Notify seller
  await notifyVendorOwner({
    vendorId: offer.vendorId,
    title: titles[action],
    body: bodies[action],
    type: "bulk_offer",
    data: { offerId: offer._id, productId: offer.productId, action },
  });
}

// ----------------------- buyer endpoints -----------------------

const createOfferSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(1),
  unitPrice: z.number().min(0),
  currency: z.string().optional(),
  notes: z.string().optional().default(""),
  validUntil: z.string().optional(),
  validDays: z.number().int().min(1).max(90).optional(),
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

async function createBulkOffer(req, res) {
  const body = createOfferSchema.parse(req.body);

  const product = await Product.findById(body.productId).lean();
  if (!product) return res.status(404).json({ message: "Product not found" });
  if (!product.vendorId)
    return res.status(400).json({ message: "Product has no vendor" });

  const vendor = await Vendor.findById(product.vendorId).lean();
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });

  const buyer = await User.findById(req.user._id).lean();
  if (!buyer) return res.status(401).json({ message: "Buyer not found" });

  // validity
  let validUntil;
  if (body.validUntil) {
    validUntil = new Date(body.validUntil);
    if (Number.isNaN(validUntil.getTime()))
      return res.status(400).json({ message: "Invalid validUntil" });
  } else {
    validUntil = addDays(new Date(), body.validDays || 7);
  }

  const currency = body.currency || product.currency || "EUR";

  const offer = await BulkOffer.create({
    productId: product._id,
    vendorId: vendor._id,
    buyerUserId: buyer._id,

    productSnapshot: {
      title: product.title,
      slug: product.slug,
      imageUrl: pickProductImage(product),
      currency,
      moq: product.moq || 1,
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

    currentQty: body.qty,
    currentUnitPrice: Number(body.unitPrice.toFixed(2)),
    currentTotal: Number((body.qty * body.unitPrice).toFixed(2)),
    currency,

    lastActionBy: "buyer",
    validUntil,

    status: "requested",
    messages: [
      {
        senderRole: "buyer",
        senderUserId: buyer._id,
        senderName: [buyer.firstName, buyer.lastName].filter(Boolean).join(" ") || buyer.email,
        qty: body.qty,
        unitPrice: Number(body.unitPrice.toFixed(2)),
        currency,
        notes: body.notes || "",
        attachments: body.attachments || [],
        createdAt: new Date(),
      },
    ],
    shippingAddress: body.shippingAddress || null,
  });

  await notifyCounterpartyOnOffer(offer, "new_offer");

  res.status(201).json({ offer });
}

async function listMyBuyerOffers(req, res) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const filter = { buyerUserId: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    BulkOffer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    BulkOffer.countDocuments(filter),
  ]);

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

async function getMyBuyerOffer(req, res) {
  const offer = await BulkOffer.findOne({
    _id: req.params.offerId,
    buyerUserId: req.user._id,
  }).lean();
  if (!offer) return res.status(404).json({ message: "Offer not found" });
  res.json({ offer });
}

// Buyer counter / accept / reject
const counterSchema = z.object({
  qty: z.number().int().min(1),
  unitPrice: z.number().min(0),
  notes: z.string().optional().default(""),
  validDays: z.number().int().min(1).max(90).optional(),
  validUntil: z.string().optional(),
  attachments: z.array(z.object({ url: z.string() })).optional().default([]),
});

async function buyerCounterOffer(req, res) {
  const body = counterSchema.parse(req.body);
  const offer = await BulkOffer.findOne({
    _id: req.params.offerId,
    buyerUserId: req.user._id,
  });
  if (!offer) return res.status(404).json({ message: "Offer not found" });

  if (["accepted", "rejected", "expired", "cancelled"].includes(offer.status))
    return res.status(400).json({ message: `Cannot counter ${offer.status} offer` });

  if (offer.lastActionBy === "buyer")
    return res.status(400).json({ message: "Waiting for seller's response" });

  if (new Date(offer.validUntil).getTime() < Date.now())
    return res.status(400).json({ message: "Offer has expired" });

  // Extend validity
  if (body.validUntil) {
    offer.validUntil = new Date(body.validUntil);
  } else {
    offer.validUntil = addDays(new Date(), body.validDays || 7);
  }

  offer.currentQty = body.qty;
  offer.currentUnitPrice = Number(body.unitPrice.toFixed(2));
  offer.currentTotal = Number((body.qty * body.unitPrice).toFixed(2));
  offer.lastActionBy = "buyer";
  offer.status = "countered";

  offer.messages.push({
    senderRole: "buyer",
    senderUserId: req.user._id,
    senderName: [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || req.user.email,
    qty: body.qty,
    unitPrice: Number(body.unitPrice.toFixed(2)),
    currency: offer.currency,
    notes: body.notes || "",
    attachments: body.attachments || [],
    createdAt: new Date(),
  });

  await offer.save();
  await notifyCounterpartyOnOffer(offer, "counter");

  res.json({ offer });
}

async function buyerAcceptOffer(req, res) {
  const offer = await BulkOffer.findOne({
    _id: req.params.offerId,
    buyerUserId: req.user._id,
  });
  if (!offer) return res.status(404).json({ message: "Offer not found" });

  if (["accepted", "rejected", "expired", "cancelled"].includes(offer.status))
    return res.status(400).json({ message: `Cannot accept ${offer.status} offer` });

  if (offer.lastActionBy === "buyer")
    return res.status(400).json({ message: "Waiting for seller's response" });

  if (new Date(offer.validUntil).getTime() < Date.now())
    return res.status(400).json({ message: "Offer has expired" });

  offer.status = "accepted";
  offer.paymentLink = {
    token: genToken("BO"),
    generatedAt: new Date(),
    expiresAt: addDays(new Date(), 14),
    usedAt: null,
    orderId: null,
  };

  offer.messages.push({
    senderRole: "buyer",
    senderUserId: req.user._id,
    senderName: [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || req.user.email,
    qty: offer.currentQty,
    unitPrice: offer.currentUnitPrice,
    currency: offer.currency,
    notes: "Buyer accepted the offer.",
    attachments: [],
    createdAt: new Date(),
  });

  await offer.save();
  await notifyCounterpartyOnOffer(offer, "accepted");

  res.json({ offer });
}

async function buyerRejectOffer(req, res) {
  const reason = (req.body && req.body.reason) || "";
  const offer = await BulkOffer.findOne({
    _id: req.params.offerId,
    buyerUserId: req.user._id,
  });
  if (!offer) return res.status(404).json({ message: "Offer not found" });

  if (["accepted", "rejected", "expired", "cancelled"].includes(offer.status))
    return res.status(400).json({ message: `Cannot reject ${offer.status} offer` });

  offer.status = "rejected";
  offer.messages.push({
    senderRole: "buyer",
    senderUserId: req.user._id,
    senderName: [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || req.user.email,
    qty: offer.currentQty,
    unitPrice: offer.currentUnitPrice,
    currency: offer.currency,
    notes: reason ? `Buyer rejected: ${reason}` : "Buyer rejected the offer.",
    attachments: [],
    createdAt: new Date(),
  });
  await offer.save();
  await notifyCounterpartyOnOffer(offer, "rejected");
  res.json({ offer });
}

async function buyerCancelOffer(req, res) {
  const offer = await BulkOffer.findOne({
    _id: req.params.offerId,
    buyerUserId: req.user._id,
  });
  if (!offer) return res.status(404).json({ message: "Offer not found" });
  if (["accepted", "rejected", "expired", "cancelled"].includes(offer.status))
    return res.status(400).json({ message: `Cannot cancel ${offer.status} offer` });
  offer.status = "cancelled";
  await offer.save();
  await notifyCounterpartyOnOffer(offer, "rejected");
  res.json({ offer });
}

// ----------------------- vendor endpoints -----------------------

async function listVendorOffers(req, res) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const filter = { vendorId: req.vendorContext.vendorId };
  if (req.query.status) filter.status = req.query.status;

  const [items, total] = await Promise.all([
    BulkOffer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    BulkOffer.countDocuments(filter),
  ]);
  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

async function getVendorOffer(req, res) {
  const offer = await BulkOffer.findOne({
    _id: req.params.offerId,
    vendorId: req.vendorContext.vendorId,
  }).lean();
  if (!offer) return res.status(404).json({ message: "Offer not found" });
  res.json({ offer });
}

async function vendorCounterOffer(req, res) {
  const body = counterSchema.parse(req.body);
  const offer = await BulkOffer.findOne({
    _id: req.params.offerId,
    vendorId: req.vendorContext.vendorId,
  });
  if (!offer) return res.status(404).json({ message: "Offer not found" });
  if (["accepted", "rejected", "expired", "cancelled"].includes(offer.status))
    return res.status(400).json({ message: `Cannot counter ${offer.status} offer` });

  if (offer.lastActionBy === "seller")
    return res.status(400).json({ message: "Waiting for buyer's response" });

  if (new Date(offer.validUntil).getTime() < Date.now())
    return res.status(400).json({ message: "Offer has expired" });

  if (body.validUntil) {
    offer.validUntil = new Date(body.validUntil);
  } else {
    offer.validUntil = addDays(new Date(), body.validDays || 7);
  }

  offer.currentQty = body.qty;
  offer.currentUnitPrice = Number(body.unitPrice.toFixed(2));
  offer.currentTotal = Number((body.qty * body.unitPrice).toFixed(2));
  offer.lastActionBy = "seller";
  offer.status = "countered";

  offer.messages.push({
    senderRole: "seller",
    senderVendorId: req.vendorContext.vendorId,
    senderUserId: req.user._id,
    senderName: req.vendorContext.vendor.storeName,
    qty: body.qty,
    unitPrice: Number(body.unitPrice.toFixed(2)),
    currency: offer.currency,
    notes: body.notes || "",
    attachments: body.attachments || [],
    createdAt: new Date(),
  });
  await offer.save();
  await notifyCounterpartyOnOffer(offer, "counter");
  res.json({ offer });
}

async function vendorAcceptOffer(req, res) {
  const offer = await BulkOffer.findOne({
    _id: req.params.offerId,
    vendorId: req.vendorContext.vendorId,
  });
  if (!offer) return res.status(404).json({ message: "Offer not found" });
  if (["accepted", "rejected", "expired", "cancelled"].includes(offer.status))
    return res.status(400).json({ message: `Cannot accept ${offer.status} offer` });

  if (offer.lastActionBy === "seller")
    return res.status(400).json({ message: "Waiting for buyer's response" });

  if (new Date(offer.validUntil).getTime() < Date.now())
    return res.status(400).json({ message: "Offer has expired" });

  offer.status = "accepted";
  offer.paymentLink = {
    token: genToken("BO"),
    generatedAt: new Date(),
    expiresAt: addDays(new Date(), 14),
    usedAt: null,
    orderId: null,
  };
  offer.messages.push({
    senderRole: "seller",
    senderVendorId: req.vendorContext.vendorId,
    senderUserId: req.user._id,
    senderName: req.vendorContext.vendor.storeName,
    qty: offer.currentQty,
    unitPrice: offer.currentUnitPrice,
    currency: offer.currency,
    notes: "Seller accepted the offer.",
    attachments: [],
    createdAt: new Date(),
  });
  await offer.save();
  await notifyCounterpartyOnOffer(offer, "accepted");
  res.json({ offer });
}

async function vendorRejectOffer(req, res) {
  const reason = (req.body && req.body.reason) || "";
  const offer = await BulkOffer.findOne({
    _id: req.params.offerId,
    vendorId: req.vendorContext.vendorId,
  });
  if (!offer) return res.status(404).json({ message: "Offer not found" });
  if (["accepted", "rejected", "expired", "cancelled"].includes(offer.status))
    return res.status(400).json({ message: `Cannot reject ${offer.status} offer` });

  offer.status = "rejected";
  offer.messages.push({
    senderRole: "seller",
    senderVendorId: req.vendorContext.vendorId,
    senderUserId: req.user._id,
    senderName: req.vendorContext.vendor.storeName,
    qty: offer.currentQty,
    unitPrice: offer.currentUnitPrice,
    currency: offer.currency,
    notes: reason ? `Seller rejected: ${reason}` : "Seller rejected the offer.",
    attachments: [],
    createdAt: new Date(),
  });
  await offer.save();
  await notifyCounterpartyOnOffer(offer, "rejected");
  res.json({ offer });
}

// ----------------------- shared: payment-link checkout -----------------------

const paymentLinkSchema = z.object({
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

async function checkoutFromOffer(req, res) {
  const body = paymentLinkSchema.parse(req.body);

  const offer = await BulkOffer.findOne({
    "paymentLink.token": req.params.token,
  });
  if (!offer) return res.status(404).json({ message: "Invalid payment link" });
  if (offer.buyerUserId.toString() !== req.user._id.toString())
    return res.status(403).json({ message: "Not your offer" });
  if (offer.status !== "accepted")
    return res.status(400).json({ message: "Offer is not in accepted state" });
  if (offer.paymentLink.usedAt)
    return res.status(400).json({ message: "Payment link already used" });
  if (
    offer.paymentLink.expiresAt &&
    new Date(offer.paymentLink.expiresAt).getTime() < Date.now()
  )
    return res.status(400).json({ message: "Payment link expired" });

  // Build order payload using the offer terms (single line item)
  // Reuse the checkout logic shape by creating Order + VendorOrder + OrderItem
  const Order = require("../models/Order");
  const VendorOrder = require("../models/VendorOrder");
  const OrderItem = require("../models/OrderItem");
  const Product = require("../models/Product");
  const CustomerAddress = require("../models/CustomerAddress");
  const AuditLog = require("../models/AuditLog");
  const { adjustStock } = require("../services/inventory.service");
  const { calculateTax } = require("../services/tax.service");

  const product = await Product.findById(offer.productId);
  if (!product) return res.status(404).json({ message: "Product no longer exists" });

  // Resolve shipping address
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
  if (!shippingAddress && offer.shippingAddress) shippingAddress = offer.shippingAddress;
  if (!shippingAddress)
    return res.status(400).json({ message: "Shipping address required" });

  const qty = offer.currentQty;
  const unitPrice = offer.currentUnitPrice;
  const lineTotal = Number((qty * unitPrice).toFixed(2));
  const subtotal = lineTotal;
  const paymentMethod = body.paymentMethod || "online";
  const paymentStatus = paymentMethod === "bank_transfer" ? "awaiting_transfer" : "unpaid";

  const taxResult = await calculateTax({
    subtotal,
    shippingTotal: 0,
    country: shippingAddress.country,
  });
  const grandTotal = Number(
    (subtotal + taxResult.taxAmount).toFixed(2)
  );

  const orderNumber = `SE-OFR-${Date.now().toString(36).toUpperCase()}`;

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
    currency: offer.currency,
    bankTransfer: { reference: "", proofUrl: "", submittedAt: null },
    status: "placed",
    orderNumber,
    coupon: { code: "", couponId: null, scope: "", vendorId: null, discountType: "", value: 0 },
  });

  // Decrement stock
  await adjustStock({
    productId: product._id,
    variantSku: product.hasVariants ? "" : undefined,
    delta: -Math.abs(qty),
    reason: "OFFER_ACCEPTED",
  });

  const vendorOrder = await VendorOrder.create({
    orderId: order._id,
    vendorId: offer.vendorId,
    vendorStoreName: offer.vendorSnapshot?.storeName || "Vendor",
    vendorStoreSlug: offer.vendorSnapshot?.storeSlug || "",
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
    currency: offer.currency,
    vendorOrderNumber: `${order.orderNumber}-${String(offer.vendorId).slice(-4).toUpperCase()}`,
  });

  await OrderItem.create({
    orderId: order._id,
    vendorOrderId: vendorOrder._id,
    productId: product._id,
    vendorId: offer.vendorId,
    title: product.title,
    imageUrl: (product.imageUrls && product.imageUrls[0]) || "",
    variantSku: "",
    variantAttributes: {},
    qty,
    unitPrice,
    currency: offer.currency,
    tierMinQtyApplied: 0,
    lineTotal,
  });

  // Link back to offer + mark payment link used
  offer.orderId = order._id;
  offer.paymentLink.usedAt = new Date();
  offer.paymentLink.orderId = order._id;
  await offer.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "OFFER_CHECKOUT",
    entityType: "Order",
    entityId: order._id,
    meta: { offerId: offer._id, orderNumber: order.orderNumber },
  });

  // Notify both sides
  await notifyUser({
    userId: offer.buyerUserId,
    title: "Order placed from accepted offer",
    body: `Order ${order.orderNumber} has been created from your bulk offer.`,
    type: "order",
    data: { orderId: order._id, orderNumber: order.orderNumber, offerId: offer._id },
  });
  await notifyVendorOwner({
    vendorId: offer.vendorId,
    title: "Order from accepted offer",
    body: `New order ${order.orderNumber} from bulk offer`,
    type: "order",
    data: {
      orderId: order._id,
      orderNumber: order.orderNumber,
      vendorOrderId: vendorOrder._id,
      offerId: offer._id,
    },
  });

  res.status(201).json({ order, vendorOrder, offer });
}

async function getOfferByPaymentToken(req, res) {
  const offer = await BulkOffer.findOne({
    "paymentLink.token": req.params.token,
  }).lean();
  if (!offer) return res.status(404).json({ message: "Invalid payment link" });
  if (offer.buyerUserId.toString() !== req.user._id.toString())
    return res.status(403).json({ message: "Not your offer" });

  res.json({
    offer,
    isExpired:
      offer.paymentLink.expiresAt &&
      new Date(offer.paymentLink.expiresAt).getTime() < Date.now(),
    isUsed: Boolean(offer.paymentLink.usedAt),
  });
}

// ----------------------- admin endpoints -----------------------

async function adminListAllOffers(req, res) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.vendorId) filter.vendorId = req.query.vendorId;
  if (req.query.buyerUserId) filter.buyerUserId = req.query.buyerUserId;
  if (req.query.productId) filter.productId = req.query.productId;

  const [items, total] = await Promise.all([
    BulkOffer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    BulkOffer.countDocuments(filter),
  ]);
  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

async function adminGetOffer(req, res) {
  const offer = await BulkOffer.findById(req.params.offerId).lean();
  if (!offer) return res.status(404).json({ message: "Offer not found" });
  res.json({ offer });
}

module.exports = {
  // buyer
  createBulkOffer,
  listMyBuyerOffers,
  getMyBuyerOffer,
  buyerCounterOffer,
  buyerAcceptOffer,
  buyerRejectOffer,
  buyerCancelOffer,
  // vendor
  listVendorOffers,
  getVendorOffer,
  vendorCounterOffer,
  vendorAcceptOffer,
  vendorRejectOffer,
  // checkout / payment link
  getOfferByPaymentToken,
  checkoutFromOffer,
  // admin
  adminListAllOffers,
  adminGetOffer,
  // helpers (used by expiration service)
  notifyCounterpartyOnOffer,
};