const Coupon = require("../models/Coupon");
const { computeCartDiscount } = require("../services/coupon.service");
const { z } = require("zod");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const { getTierPrice } = require("../utils/pricing");
const { logEvent } = require("../services/analyticsEvents.service"); // Added import

async function getOrCreateCart(customerUserId) {
  let cart = await Cart.findOne({ customerUserId });
  if (!cart) {
    cart = await Cart.create({ customerUserId, items: [] });
    // Log cart creation
    await logEvent({
      type: "CART_CREATED",
      userId: customerUserId,
      cartId: cart._id,
      meta: {
        createdAt: new Date()
      }
    });
  }
  return cart;
}

async function recomputeCouponIfAny(cart) {
  const code = cart.appliedCoupon?.code;
  const couponId = cart.appliedCoupon?.couponId;
  if (!code || !couponId) {
    cart.discountTotal = 0;
    cart.grandTotal = Number(cart.subtotal || 0);
    return;
  }

  const coupon = await Coupon.findById(couponId).lean();
  if (!coupon) {
    // coupon removed from system
    cart.appliedCoupon = { code: "", couponId: null, scope: "", vendorId: null, discountType: "", value: 0, discountTotal: 0 };
    cart.discountTotal = 0;
    cart.grandTotal = Number(cart.subtotal || 0);
    return;
  }

  const { discountTotal } = computeCartDiscount(cart, coupon);
  if (discountTotal <= 0) {
    // no longer applicable (qty/tiers changed etc.) => auto-remove
    cart.appliedCoupon = { code: "", couponId: null, scope: "", vendorId: null, discountType: "", value: 0, discountTotal: 0 };
    cart.discountTotal = 0;
    cart.grandTotal = Number(cart.subtotal || 0);
    return;
  }

  cart.appliedCoupon.discountTotal = discountTotal;
  cart.discountTotal = discountTotal;
  cart.grandTotal = Number(Math.max(0, (cart.subtotal || 0) - discountTotal).toFixed(2));
}

function computeCartTotals(cart) {
  let subtotal = 0;
  let totalItems = 0;

  for (const item of cart.items) {
    subtotal += item.lineTotal;
    totalItems += item.qty;
  }

  cart.subtotal = Number(subtotal.toFixed(2));
  cart.totalItems = totalItems;
}

function pickProductImage(product) {
  if (product.imageUrls && product.imageUrls.length) return product.imageUrls[0];
  return "";
}

function assertQtyMeetsMOQ(product, qty) {
  if (qty < product.moq) {
    const err = new Error(`Quantity must be >= MOQ (${product.moq})`);
    err.statusCode = 400;
    throw err;
  }
}

function getAvailableStock(product, variantSku) {
  if (!product.hasVariants) return product.stockQty;

  if (!variantSku) return 0;
  const variant = (product.variants || []).find((v) => v.sku === variantSku);
  if (!variant) return 0;
  return variant.stockQty ?? 0;
}

function getVariantAttributes(product, variantSku) {
  if (!product.hasVariants) return {};
  const variant = (product.variants || []).find((v) => v.sku === variantSku);
  return variant?.attributes || {};
}

function ensureVendorCanReceiveOrders(vendor) {
  if (!vendor) {
    const err = new Error("Vendor not found");
    err.statusCode = 400;
    throw err;
  }
  if (vendor.status !== "approved") {
    const err = new Error("Vendor is not approved");
    err.statusCode = 400;
    throw err;
  }
  if (vendor.permissions?.canReceiveOrders === false) {
    const err = new Error("Vendor cannot receive orders currently");
    err.statusCode = 400;
    throw err;
  }
}

function isAdminFulfillmentProduct(product) {
  return product?.isPlatformProduct === true || product?.source === "admin_platform";
}

function computePricingSnapshot(product, qty) {
  const tier = getTierPrice(product.priceTiers, qty);
  if (!tier) {
    const err = new Error("Product price tiers not configured");
    err.statusCode = 400;
    throw err;
  }
  // MOQ should prevent qty below MOQ; also ensure tier makes sense
  const unitPrice = Number(tier.unitPrice);
  const lineTotal = Number((unitPrice * qty).toFixed(2));

  return {
    unitPrice,
    currency: product.currency || "EUR",
    tierMinQtyApplied: tier.minQty,
    lineTotal,
  };
}

async function serializeCart(cartDoc) {
  const cart = cartDoc?.toObject ? cartDoc.toObject() : JSON.parse(JSON.stringify(cartDoc || {}));
  const items = Array.isArray(cart.items) ? cart.items : [];
  if (!items.length) return cart;

  const productIds = [...new Set(items.map((item) => String(item.productId)).filter(Boolean))];
  const products = await Product.find({ _id: { $in: productIds } })
    .select("_id status stockQty hasVariants variants")
    .lean();
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  cart.items = items.map((item) => {
    const product = productMap.get(String(item.productId));
    const availableStock = product ? getAvailableStock(product, item.variantSku || "") : 0;

    return {
      ...item,
      availableStock,
      isAvailable: Boolean(product && product.status === "approved"),
    };
  });

  return cart;
}

/** -------------------- GET CART -------------------- **/

async function getMyCart(req, res) {
  const cart = await getOrCreateCart(req.user._id);
  const itemsMissingMoq = (cart.items || []).filter((item) => !item.moq || item.moq < 1);

  if (itemsMissingMoq.length) {
    const productIds = [...new Set(itemsMissingMoq.map((item) => String(item.productId)))];
    const products = await Product.find({ _id: { $in: productIds } })
      .select("_id moq title imageUrls vendorId requiresManualShipping")
      .lean();
    const productMap = new Map(products.map((product) => [String(product._id), product]));

    let changed = false;
    for (const item of cart.items) {
      if (item.moq && item.moq >= 1) continue;
      const product = productMap.get(String(item.productId));
      if (!product) continue;
      item.moq = Math.max(1, Number(product.moq || 1));
      item.title = product.title || item.title;
      item.imageUrl = pickProductImage(product) || item.imageUrl;
      item.vendorId = product.vendorId || item.vendorId;
      item.requiresManualShipping = Boolean(product.requiresManualShipping);
      changed = true;
    }

    if (changed) {
      await cart.save();
    }
  }

  res.json({ cart: await serializeCart(cart) });
}

/** -------------------- ADD ITEM -------------------- **/

const addItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().min(1),
  variantSku: z.string().optional(), // required if product.hasVariants
});

async function addItem(req, res) {
  const body = addItemSchema.parse(req.body);

  const product = await Product.findById(body.productId).lean();
  if (!product || product.status !== "approved") {
    return res.status(400).json({ message: "Product not available" });
  }

  // Vendor checks (skip for admin-platform products)
  if (!isAdminFulfillmentProduct(product)) {
    const vendor = await Vendor.findById(product.vendorId).lean();
    try {
      ensureVendorCanReceiveOrders(vendor);
    } catch (e) {
      return res.status(e.statusCode || 400).json({ message: e.message });
    }
  }

  const variantSku = product.hasVariants ? (body.variantSku || "") : "";
  if (product.hasVariants && !variantSku) {
    return res.status(400).json({ message: "variantSku is required for variant products" });
  }

  // MOQ validation
  try {
    assertQtyMeetsMOQ(product, body.qty);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ message: e.message });
  }

  // Stock validation
  const availableStock = getAvailableStock(product, variantSku);
  if (availableStock <= 0) return res.status(400).json({ message: "Out of stock" });
  if (body.qty > availableStock) return res.status(400).json({ message: `Only ${availableStock} available` });

  // Price snapshot
  let pricing;
  try {
    pricing = computePricingSnapshot(product, body.qty);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ message: e.message });
  }

  const cart = await getOrCreateCart(req.user._id);

  // If item already exists (same product + same variantSku), increase qty and recompute pricing
  const existing = cart.items.find((i) => {
    return String(i.productId) === String(product._id) && (i.variantSku || "") === variantSku;
  });

  if (existing) {
    const newQty = existing.qty + body.qty;

    // Re-check MOQ & stock
    try {
      assertQtyMeetsMOQ(product, newQty);
    } catch (e) {
      return res.status(e.statusCode || 400).json({ message: e.message });
    }
    if (newQty > availableStock) return res.status(400).json({ message: `Only ${availableStock} available` });

    const newPricing = computePricingSnapshot(product, newQty);

    existing.qty = newQty;
    existing.unitPrice = newPricing.unitPrice;
    existing.currency = newPricing.currency;
    existing.tierMinQtyApplied = newPricing.tierMinQtyApplied;
    existing.lineTotal = newPricing.lineTotal;
    existing.title = product.title;
    existing.imageUrl = pickProductImage(product);
    existing.moq = product.moq;
    existing.variantAttributes = getVariantAttributes(product, variantSku);
    existing.requiresManualShipping = product.requiresManualShipping || false;
  } else {
    cart.items.push({
      productId: product._id,
      vendorId: product.vendorId,
      variantSku,
      variantAttributes: getVariantAttributes(product, variantSku),
      qty: body.qty,
      moq: product.moq,
      unitPrice: pricing.unitPrice,
      currency: pricing.currency,
      tierMinQtyApplied: pricing.tierMinQtyApplied,
      lineTotal: pricing.lineTotal,
      title: product.title,
      imageUrl: pickProductImage(product),
      requiresManualShipping: product.requiresManualShipping || false,
    });
  }

  computeCartTotals(cart);
  await recomputeCouponIfAny(cart);
  await cart.save();

  // Log add item event
  await logEvent({
    type: "CART_ADD_ITEM",
    userId: req.user._id,
    productId: product._id,
    vendorId: product.vendorId,
    cartId: cart._id,
    meta: {
      quantity: body.qty,
      variantSku: variantSku || undefined,
      unitPrice: existing ? existing.unitPrice : pricing.unitPrice,
      currency: existing ? existing.currency : pricing.currency,
      lineTotal: existing ? existing.lineTotal : pricing.lineTotal,
      cartSubtotal: cart.subtotal,
      cartItemCount: cart.totalItems,
      action: existing ? "incremented" : "added"
    }
  });

  res.json({ cart: await serializeCart(cart) });
}

/** -------------------- UPDATE QTY -------------------- **/

const updateQtySchema = z.object({
  qty: z.number().int().min(1),
});

async function updateItemQty(req, res) {
  const body = updateQtySchema.parse(req.body);
  const cartItemId = req.params.cartItemId;

  const cart = await getOrCreateCart(req.user._id);

  const item = cart.items.id(cartItemId);
  if (!item) return res.status(404).json({ message: "Cart item not found" });

  const product = await Product.findById(item.productId).lean();
  if (!product || product.status !== "approved") {
    return res.status(400).json({ message: "Product not available" });
  }

  // Vendor checks (skip for admin-platform products)
  if (!isAdminFulfillmentProduct(product)) {
    const vendor = await Vendor.findById(product.vendorId).lean();
    try {
      ensureVendorCanReceiveOrders(vendor);
    } catch (e) {
      return res.status(e.statusCode || 400).json({ message: e.message });
    }
  }

  const variantSku = product.hasVariants ? (item.variantSku || "") : "";
  if (product.hasVariants && !variantSku) {
    return res.status(400).json({ message: "Missing variantSku for this item" });
  }

  // MOQ validation
  try {
    assertQtyMeetsMOQ(product, body.qty);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ message: e.message });
  }

  // Stock validation
  const availableStock = getAvailableStock(product, variantSku);
  if (availableStock <= 0) return res.status(400).json({ message: "Out of stock" });
  if (body.qty > availableStock) return res.status(400).json({ message: `Only ${availableStock} available` });

  // Store old qty for logging
  const oldQty = item.qty;

  // Pricing
  let pricing;
  try {
    pricing = computePricingSnapshot(product, body.qty);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ message: e.message });
  }

  item.qty = body.qty;
  item.moq = product.moq;
  item.unitPrice = pricing.unitPrice;
  item.currency = pricing.currency;
  item.tierMinQtyApplied = pricing.tierMinQtyApplied;
  item.lineTotal = pricing.lineTotal;
  item.title = product.title;
  item.imageUrl = pickProductImage(product);
  item.vendorId = product.vendorId;
  item.variantAttributes = getVariantAttributes(product, variantSku);

  computeCartTotals(cart);
  await recomputeCouponIfAny(cart);
  await cart.save();

  // Log update as add item event (since it's modifying cart items)
  await logEvent({
    type: "CART_ADD_ITEM",
    userId: req.user._id,
    productId: product._id,
    vendorId: product.vendorId,
    cartId: cart._id,
    meta: {
      quantity: body.qty,
      oldQuantity: oldQty,
      variantSku: variantSku || undefined,
      unitPrice: pricing.unitPrice,
      currency: pricing.currency,
      lineTotal: item.lineTotal,
      cartSubtotal: cart.subtotal,
      cartItemCount: cart.totalItems,
      action: "updated"
    }
  });

  res.json({ cart: await serializeCart(cart) });
}

/** -------------------- REMOVE ITEM -------------------- **/

async function removeItem(req, res) {
  const cartItemId = req.params.cartItemId;
  const cart = await getOrCreateCart(req.user._id);

  const item = cart.items.id(cartItemId);
  if (!item) return res.status(404).json({ message: "Cart item not found" });

  // Store item data before removal
  const removedItem = {
    productId: item.productId,
    vendorId: item.vendorId,
    quantity: item.qty,
    variantSku: item.variantSku,
    lineTotal: item.lineTotal
  };

  item.deleteOne(); // removes subdoc
  computeCartTotals(cart);
  await recomputeCouponIfAny(cart);
  await cart.save();

  // Log remove item event
  await logEvent({
    type: "CART_REMOVE_ITEM",
    userId: req.user._id,
    productId: removedItem.productId,
    vendorId: removedItem.vendorId,
    cartId: cart._id,
    meta: {
      quantity: removedItem.quantity,
      variantSku: removedItem.variantSku || undefined,
      lineTotal: removedItem.lineTotal,
      cartSubtotal: cart.subtotal,
      cartItemCount: cart.totalItems
    }
  });

  res.json({ cart: await serializeCart(cart) });
}

/** -------------------- CLEAR CART -------------------- **/

async function clearCart(req, res) {
  const cart = await getOrCreateCart(req.user._id);
  
  // Store items for logging before clearing
  const itemsToRemove = cart.items.map(item => ({
    productId: item.productId,
    vendorId: item.vendorId,
    quantity: item.qty,
    variantSku: item.variantSku,
    lineTotal: item.lineTotal
  }));

  await recomputeCouponIfAny(cart);
  cart.items = [];
  cart.subtotal = 0;
  cart.totalItems = 0;
  await recomputeCouponIfAny(cart);
  await cart.save();

  // Log remove item events for each item cleared
  for (const item of itemsToRemove) {
    await logEvent({
      type: "CART_REMOVE_ITEM",
      userId: req.user._id,
      productId: item.productId,
      vendorId: item.vendorId,
      cartId: cart._id,
      meta: {
        quantity: item.quantity,
        variantSku: item.variantSku || undefined,
        lineTotal: item.lineTotal,
        cartSubtotal: 0,
        cartItemCount: 0,
        cleared: true
      }
    });
  }

  res.json({ cart: await serializeCart(cart) });
}

module.exports = {
  getMyCart,
  addItem,
  updateItemQty,
  removeItem,
  clearCart,
};
