const { notifyUser, notifyVendorOwner } = require("../services/notification.service");
const mongoose = require("mongoose");
const { z } = require("zod");
const {logEvent} = require ("../services/analyticsEvents.service");

const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Vendor = require("../models/Vendor");
const Order = require("../models/Order");
const VendorOrder = require("../models/VendorOrder");
const OrderItem = require("../models/OrderItem");
const AuditLog = require("../models/AuditLog");
const Coupon = require("../models/Coupon");
const { computeCartDiscount } = require("../services/coupon.service");
const CouponRedemption = require("../models/CouponRedemption");
const CustomerAddress = require("../models/CustomerAddress");
const { adjustStock } = require("../services/inventory.service");
const { getSettings } = require("../services/platformSettings.service");
const { calculateTax } = require("../services/tax.service");

const { getTierPrice } = require("../utils/pricing");

function nowOrderNumber() {
  // Simple unique-ish order number: SE-YYYYMMDD-HHMMSS-RAND
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ts =
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds());
  const rand = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `SE-${ts}-${rand}`;
}

function computePricingSnapshot(product, qty) {
  const tier = getTierPrice(product.priceTiers, qty);
  if (!tier) {
    const err = new Error("Product price tiers not configured");
    err.statusCode = 400;
    throw err;
  }
  const unitPrice = Number(tier.unitPrice);
  return {
    unitPrice,
    tierMinQtyApplied: tier.minQty,
    lineTotal: Number((unitPrice * qty).toFixed(2)),
  };
}

function getAvailableStock(product, variantSku) {
  if (!product.hasVariants) return product.stockQty;
  const v = (product.variants || []).find((x) => x.sku === variantSku);
  return v ? (v.stockQty ?? 0) : 0;
}

function getVariantAttributes(product, variantSku) {
  if (!product.hasVariants) return {};
  const v = (product.variants || []).find((x) => x.sku === variantSku);
  return v?.attributes || {};
}

function assertMOQ(product, qty) {
  if (qty < product.moq) {
    const err = new Error(`MOQ not met for ${product.title}. Minimum is ${product.moq}`);
    err.statusCode = 400;
    throw err;
  }
}

function ensureVendorReceivesOrders(vendor) {
  if (!vendor) {
    const err = new Error("Vendor not found");
    err.statusCode = 400;
    throw err;
  }
  if (vendor.status !== "approved") {
    const err = new Error("Vendor not approved");
    err.statusCode = 400;
    throw err;
  }
  if (vendor.permissions?.canReceiveOrders === false) {
    const err = new Error("Vendor cannot receive orders");
    err.statusCode = 400;
    throw err;
  }
}

function isAdminFulfillmentProduct(product) {
  return product?.isPlatformProduct === true || product?.source === "admin_platform";
}

// UPDATED: Add addressId as optional field
const checkoutSchema = z.object({
  addressId: z.string().optional(), // NEW: Support addressId
  shippingAddress: z.object({
    companyName: z.string().min(1),
    contactPerson: z.string().min(1),
    mobileNumber: z.string().min(5),
    country: z.string().min(1),
    city: z.string().min(1),
    street: z.string().min(1),
  }).optional(), // UPDATED: Make shippingAddress optional since addressId can be used
  paymentMethod: z.enum(["online", "bank_transfer"]).default("online"),
  shippingTotal: z.number().min(0).default(0),
});

async function checkout(req, res) {
  const body = checkoutSchema.parse(req.body);

  const cart = await Cart.findOne({ customerUserId: req.user._id });
  if (!cart || !cart.items.length) return res.status(400).json({ message: "Cart is empty" });

  // NEW: Resolve shipping address from addressId or fallback
  let shippingAddress = body.shippingAddress;

  // If addressId provided, use that
  if (body.addressId) {
    const addr = await CustomerAddress.findOne({ 
      _id: body.addressId, 
      customerUserId: req.user._id 
    }).lean();
    
    if (!addr) {
      return res.status(400).json({ message: "Invalid addressId" });
    }

    shippingAddress = {
      label: addr.label,
      companyName: addr.companyName,
      contactPerson: addr.contactPerson,
      mobileNumber: addr.phone, // Map phone to mobileNumber
      country: addr.country,
      city: addr.city,
      street: addr.street1, // Map street1 to street
      // Include additional fields if your Order model supports them
      postalCode: addr.postalCode,
      street2: addr.street2,
      notes: addr.notes,
    };
  }

  // If still no shippingAddress, try to get default address
  if (!shippingAddress) {
    const def = await CustomerAddress.findOne({ 
      customerUserId: req.user._id, 
      isDefault: true 
    }).lean();
    
    if (!def) {
      return res.status(400).json({ 
        message: "No shipping address found. Please provide addressId or shippingAddress, or set a default address." 
      });
    }

    shippingAddress = {
      label: def.label,
      companyName: def.companyName,
      contactPerson: def.contactPerson,
      mobileNumber: def.phone,
      country: def.country,
      city: def.city,
      street: def.street1,
      postalCode: def.postalCode,
      street2: def.street2,
      notes: def.notes,
    };
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Re-validate and rebuild vendor grouping with fresh product data
    const validatedItems = [];
    const vendorBuckets = new Map(); // vendorId => { vendor, items: [], fulfillmentType, fulfillmentOwner }

    for (const item of cart.items) {
      const product = await Product.findById(item.productId).session(session);
      if (!product || product.status !== "approved") {
        throw Object.assign(new Error("Some products are not available anymore"), { statusCode: 400 });
      }

      const vendor = product.vendorId ? await Vendor.findById(product.vendorId).session(session) : null;
      if (!isAdminFulfillmentProduct(product)) {
        ensureVendorReceivesOrders(vendor);
      } else if (product.vendorId && !vendor) {
        throw Object.assign(new Error("Platform vendor not found"), { statusCode: 400 });
      }

      const variantSku = product.hasVariants ? (item.variantSku || "") : "";
      if (product.hasVariants && !variantSku) {
        throw Object.assign(new Error(`Missing variant for ${product.title}`), { statusCode: 400 });
      }

      // MOQ
      assertMOQ(product, item.qty);

      // Stock
      const availableStock = getAvailableStock(product, variantSku);
      if (availableStock <= 0) {
        throw Object.assign(new Error(`Out of stock: ${product.title}`), { statusCode: 400 });
      }
      if (item.qty > availableStock) {
        throw Object.assign(new Error(`Not enough stock for ${product.title}. Available: ${availableStock}`), { statusCode: 400 });
      }

      // Price snapshot (truth)
      const pricing = computePricingSnapshot(product, item.qty);

      validatedItems.push({
        product,
        vendor,
        variantSku,
        qty: item.qty,
        pricing,
      });

      const key = product.vendorId == null ? "null" : String(product.vendorId);
      if (!vendorBuckets.has(key)) {
        const fulfillmentType = isAdminFulfillmentProduct(product) ? "admin" : "vendor";
        vendorBuckets.set(key, {
          vendor,
          items: [],
          fulfillmentType,
          fulfillmentOwner: fulfillmentType === "admin" ? "admin" : "vendor",
        });
      }
      vendorBuckets.get(key).items.push({
        product,
        variantSku,
        qty: item.qty,
        pricing,
      });
    }

   
     // Decrement stock using inventory service
    for (const v of validatedItems) {
      const { product, variantSku, qty } = v;
      
      // Use the adjustStock service instead of direct Product update
      await adjustStock({
        productId: product._id,
        variantSku: product.hasVariants ? variantSku : undefined,
        delta: -Math.abs(qty),
        reason: "ORDER_PLACED",
        session,
      });
    }

    let couponSnapshot = null;
    let discountTotal = 0;
    let vendorDiscounts = {};

    if (cart.appliedCoupon?.couponId) {
      const coupon = await Coupon.findById(cart.appliedCoupon.couponId).session(session).lean();
      if (coupon) {
        // Enforce total usage limit at checkout (stronger)
        if (coupon.usageLimitTotal && coupon.usageLimitTotal > 0 && coupon.usedCount >= coupon.usageLimitTotal) {
          throw Object.assign(new Error("Coupon usage limit reached"), { statusCode: 400 });
        }

        // Enforce per-user limit at checkout (source of truth)
        if (coupon.usageLimitPerUser && coupon.usageLimitPerUser > 0) {
          const red = await CouponRedemption.findOne({ couponId: coupon._id, userId: req.user._id }).session(session);
          const usedByUser = red?.usedCount || 0;

          if (usedByUser >= coupon.usageLimitPerUser) {
            throw Object.assign(new Error("Coupon per-user usage limit reached"), { statusCode: 400 });
          }
        }

        const computed = computeCartDiscount(cart, coupon);
        discountTotal = computed.discountTotal;
        vendorDiscounts = computed.vendorDiscounts || {};
        if (discountTotal > 0) {
          couponSnapshot = {
            code: coupon.code,
            couponId: coupon._id,
            scope: coupon.scope,
            vendorId: coupon.vendorId || null,
            discountType: coupon.discountType,
            value: coupon.value,
          };
        }
      }
    }

    // NEW: Load platform settings (for manual shipping message)
    const settings = await getSettings();

    // NEW: Determine manual shipping
    const manualShipping = (cart.items || []).some((item) => item.requiresManualShipping === true);

    // NEW: Build order shipping fields
    const shippingPricingMode = manualShipping ? "manual_discuss" : "auto";
    const shippingStatus = manualShipping ? "pending_quote" : "confirmed";

    // NEW: Handle bank transfer + status rules - FIXED HERE
    const paymentMethod = body.paymentMethod;

    let paymentStatus = "unpaid";
    if (paymentMethod === "bank_transfer") paymentStatus = "awaiting_transfer";

    const currencySet = new Set(validatedItems.map((x) => String(x.product.currency || "EUR")));
    if (currencySet.size > 1) {
      return res.status(400).json({
        message: "Cart contains products with multiple currencies. Please checkout products of one currency at a time.",
      });
    }
    const orderCurrency = Array.from(currencySet)[0] || "EUR";

    // Main order status ALWAYS "placed" (valid enum value)
    let orderStatus = "placed";

    // Create master order
    const orderNumber = nowOrderNumber();
    const masterSubtotal = Number(validatedItems.reduce((s, x) => s + x.pricing.lineTotal, 0).toFixed(2));

    // NEW: shippingTotal starts at 0 if manual shipping
    let shippingTotal = manualShipping ? 0 : Number(body.shippingTotal.toFixed(2));

    // ✅ NEW: Tax integration (after subtotal/discount/shipping resolved)
    const subtotal = masterSubtotal;
    const netSubtotal = subtotal - discountTotal;

    const country = shippingAddress?.country;

    const taxResult = await calculateTax({
      subtotal: netSubtotal,
      shippingTotal,
      country,
    });

    const grandTotal = Number(
      (
        netSubtotal +
        shippingTotal +
        taxResult.taxAmount
      ).toFixed(2)
    );
    
    const order = await Order.create(
      [{
        customerUserId: req.user._id,
        shippingAddress: shippingAddress, // UPDATED: Use resolved shippingAddress

        paymentMethod,
        paymentStatus,              // ✅ Separate field for payment

        shippingPricingMode,
        shippingStatus,              // ✅ Separate field for shipping

        shippingTotal,
        subtotal: masterSubtotal,
        discountTotal: Number(discountTotal.toFixed(2)),

        // ✅ NEW: Tax fields
        taxRate: taxResult.taxRate,
        taxAmount: taxResult.taxAmount,
        taxableAmount: taxResult.taxableAmount,

        grandTotal,
        currency: orderCurrency,

        shippingQuoteNote: manualShipping ? (settings.manualShipping?.message || "") : "",
        bankTransfer: { reference: "", proofUrl: "", submittedAt: null },

        status: orderStatus,         // ✅ Always "placed"
        orderNumber,
        coupon: couponSnapshot || { code: "", couponId: null, scope: "", vendorId: null, discountType: "", value: 0 },
      }],
      { session }
    );

    const createdOrder = order[0];

    // Log ORDER_PLACED event - AS PER INSTRUCTION C
    await logEvent(
      {
        type: "ORDER_PLACED",
        userId: req.user._id,
        orderId: createdOrder._id,
        meta: {
          subtotal: createdOrder.subtotal,
          discountTotal: createdOrder.discountTotal,
          grandTotal: createdOrder.grandTotal,
          coupon: createdOrder.coupon?.code || "",
        },
      },
      session
    );

    // Split into vendor orders
    const vendorOrders = [];
    const vendorOrderIdByVendor = new Map();

    for (const [vendorId, bucket] of vendorBuckets.entries()) {
      const vendorSubtotal = Number(bucket.items.reduce((s, x) => s + x.pricing.lineTotal, 0).toFixed(2));

      // Get vendor-specific discount
      const vDiscount = Number((vendorDiscounts[String(vendorId)] || 0).toFixed(2));

      // For now, split shipping equally or keep 0 per vendor; choose one:
      // We'll keep vendor shipping = 0 and master shipping on Order. You can later allocate.
      const vendorShipping = 0;
      const vendorGrand = Number((Math.max(0, vendorSubtotal - vDiscount) + vendorShipping).toFixed(2));

      const suffix = bucket.fulfillmentType === "admin" ? "ADMN" : vendorId.slice(-4).toUpperCase();
      const vendorOrderNumber = `${createdOrder.orderNumber}-${suffix}`;

      const vo = await VendorOrder.create(
        [
          {
            orderId: createdOrder._id,
            vendorId: bucket.vendor?._id || null,
            vendorStoreName: bucket.vendor?.storeName || "Senel Admin",
            vendorStoreSlug: bucket.vendor?.storeSlug || "senel-admin",
            fulfillmentType: bucket.fulfillmentType,
            fulfillmentOwner: bucket.fulfillmentOwner,

            status: "placed",        // ✅ VendorOrder uses its own status
            paymentStatus,
            shippingPricingMode,
            shippingStatus: manualShipping ? "pending_quote" : "confirmed",
            shippingQuote: { amount: 0, note: "", quotedAt: null, quotedByAdminId: null },

            subtotal: vendorSubtotal,
            shippingTotal: vendorShipping,
            discountTotal: vDiscount,
            grandTotal: vendorGrand,
            currency: orderCurrency,
            vendorOrderNumber,
          },
        ],
        { session }
      );

      vendorOrders.push(vo[0]);
      vendorOrderIdByVendor.set(vendorId, vo[0]._id);
    }

    // Create order items
    const itemsToInsert = [];
    for (const [vendorId, bucket] of vendorBuckets.entries()) {
      const vendorOrderId = vendorOrderIdByVendor.get(vendorId);

      for (const it of bucket.items) {
        itemsToInsert.push({
          orderId: createdOrder._id,
          vendorOrderId,
          productId: it.product._id,
          vendorId: it.product.vendorId || null,
          title: it.product.title,
          imageUrl: (it.product.imageUrls && it.product.imageUrls[0]) || "",
          variantSku: it.variantSku || "",
          variantAttributes: getVariantAttributes(it.product, it.variantSku || ""),
          qty: it.qty,
          unitPrice: it.pricing.unitPrice,
          currency: it.product.currency || orderCurrency,
          tierMinQtyApplied: it.pricing.tierMinQtyApplied,
          lineTotal: it.pricing.lineTotal,
        });
      }
    }

    await OrderItem.insertMany(itemsToInsert, { session });

    // Increment coupon usage counts (both total and per-user)
    if (couponSnapshot?.couponId) {
      // total usage increment
      await Coupon.updateOne(
        { _id: couponSnapshot.couponId },
        { $inc: { usedCount: 1 } },
        { session }
      );

      // per-user usage increment (upsert)
      await CouponRedemption.updateOne(
        { couponId: couponSnapshot.couponId, userId: req.user._id },
        { $inc: { usedCount: 1 } },
        { upsert: true, session }
      );
    }

    // Clear cart - including coupon fields
    cart.items = [];
    cart.subtotal = 0;
    cart.totalItems = 0;
    cart.appliedCoupon = { code: "", couponId: null, scope: "", vendorId: null, discountType: "", value: 0 };
    cart.discountTotal = 0;
    cart.grandTotal = 0;
    await cart.save({ session });

    // Audit
    await AuditLog.create(
      [
        {
          actorUserId: req.user._id,
          action: "CHECKOUT_COMPLETED",
          entityType: "Order",
          entityId: createdOrder._id,
          meta: { orderNumber: createdOrder.orderNumber, vendorOrders: vendorOrders.map((x) => x.vendorOrderNumber) },
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // Customer notification
    await notifyUser({
      userId: req.user._id,
      title: "Order placed",
      body: `Your order ${createdOrder.orderNumber} has been placed successfully.`,
      type: "order",
      data: { orderId: createdOrder._id, orderNumber: createdOrder.orderNumber },
    });

    // Vendor notifications (one per vendor order)
    for (const vo of vendorOrders) {
      if (vo.fulfillmentType !== "admin") {
        await notifyVendorOwner({
          vendorId: vo.vendorId,
          title: "New order received",
          body: `You have a new order: ${vo.vendorOrderNumber}`,
          type: "order",
          data: { vendorOrderId: vo._id, vendorOrderNumber: vo.vendorOrderNumber, orderId: createdOrder._id },
        });
      }
    }

    res.status(201).json({
      order: createdOrder,
      vendorOrders,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    const status = err.statusCode || 500;
    res.status(status).json({ message: err.message || "Checkout failed" });
  }
}

module.exports = { checkout };
