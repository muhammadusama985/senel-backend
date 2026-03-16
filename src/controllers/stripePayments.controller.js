const Stripe = require("stripe");
const Order = require("../models/Order");
const VendorOrder = require("../models/VendorOrder");
const { notifyUser } = require("../services/notification.service");

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    const err = new Error("Stripe is not configured: STRIPE_SECRET_KEY is missing");
    err.statusCode = 500;
    throw err;
  }
  return new Stripe(secretKey);
}

function toMinorUnits(amount) {
  return Math.round(Number(amount || 0) * 100);
}

function getCurrency() {
  return (process.env.STRIPE_CURRENCY || "usd").toLowerCase();
}

function resolveCurrencyFromOrder(order) {
  const orderCurrency = String(order?.currency || "").trim().toLowerCase();
  if (["eur", "try", "usd"].includes(orderCurrency)) return orderCurrency;

  const countryRaw = String(order?.shippingAddress?.country || "").trim().toLowerCase();
  if (!countryRaw) return getCurrency();

  if (countryRaw.includes("turkey") || countryRaw.includes("türkiye") || countryRaw.includes("turkiye")) {
    return "try";
  }
  if (countryRaw.includes("germany") || countryRaw.includes("deutschland")) {
    return "eur";
  }
  if (countryRaw.includes("usa") || countryRaw.includes("united states") || countryRaw.includes("america")) {
    return "usd";
  }

  return getCurrency();
}

async function createStripePaymentIntent(req, res) {
  const { orderId } = req.body || {};
  if (!orderId) return res.status(400).json({ message: "orderId is required" });

  const order = await Order.findOne({ _id: orderId, customerUserId: req.user._id });
  if (!order) return res.status(404).json({ message: "Order not found" });

  if (order.paymentMethod !== "online") {
    return res.status(400).json({ message: "Order payment method is not online" });
  }
  if (order.paymentStatus === "paid") {
    return res.status(400).json({ message: "Order is already paid" });
  }

  const stripe = getStripeClient();
  const amount = toMinorUnits(order.grandTotal);
  const currency = resolveCurrencyFromOrder(order);
  if (amount <= 0) {
    return res.status(400).json({ message: "Invalid payable amount" });
  }

  const existingIntentId = order?.paymentGateway?.paymentIntentId;
  if (existingIntentId) {
    try {
      const existingIntent = await stripe.paymentIntents.retrieve(existingIntentId);
      if (existingIntent && existingIntent.status !== "succeeded" && existingIntent.client_secret) {
        return res.json({
          orderId: order._id,
          paymentStatus: order.paymentStatus,
          paymentIntentId: existingIntent.id,
          clientSecret: existingIntent.client_secret,
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
          currency,
          amount,
        });
      }
    } catch (_) {
      // Ignore retrieve errors and create a fresh intent.
    }
  }

  const intent = await stripe.paymentIntents.create({
    amount,
    currency,
    automatic_payment_methods: { enabled: true },
    metadata: {
      orderId: String(order._id),
      orderNumber: String(order.orderNumber || ""),
      customerUserId: String(order.customerUserId || ""),
    },
  });

  order.paymentGateway = {
    provider: "stripe",
    paymentIntentId: intent.id,
    latestStatus: intent.status,
    lastEventAt: new Date(),
  };
  await order.save();

  res.json({
    orderId: order._id,
    paymentStatus: order.paymentStatus,
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    currency,
    amount,
  });
}

async function confirmStripePayment(req, res) {
  const { orderId, paymentIntentId } = req.body || {};
  if (!orderId) return res.status(400).json({ message: "orderId is required" });

  const order = await Order.findOne({ _id: orderId, customerUserId: req.user._id });
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (order.paymentMethod !== "online") {
    return res.status(400).json({ message: "Order payment method is not online" });
  }

  const intentId = paymentIntentId || order?.paymentGateway?.paymentIntentId;
  if (!intentId) {
    return res.status(400).json({ message: "No payment intent found for this order" });
  }

  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.retrieve(intentId);
  if (!intent) return res.status(404).json({ message: "Payment intent not found" });

  const metaOrderId = String(intent.metadata?.orderId || "");
  if (metaOrderId && String(order._id) !== metaOrderId) {
    return res.status(400).json({ message: "Payment intent does not belong to this order" });
  }

  if (intent.status === "succeeded") {
    await markOrderPaidFromStripe(order, intent);
  } else if (intent.status === "payment_failed" || intent.status === "canceled") {
    await markOrderFailedFromStripe(order, intent);
  } else {
    order.paymentGateway = {
      ...(order.paymentGateway || {}),
      provider: "stripe",
      paymentIntentId: intent.id,
      latestStatus: intent.status || "",
      lastEventAt: new Date(),
    };
    await order.save();
  }

  return res.json({
    orderId: order._id,
    paymentIntentId: intent.id,
    stripeStatus: intent.status,
    paymentStatus: order.paymentStatus,
  });
}

async function markOrderPaidFromStripe(order, paymentIntent) {
  if (order.paymentStatus === "paid") return;

  order.paymentStatus = "paid";
  order.paymentGateway = {
    ...(order.paymentGateway || {}),
    provider: "stripe",
    paymentIntentId: paymentIntent.id,
    latestStatus: paymentIntent.status || "succeeded",
    lastEventAt: new Date(),
    chargeId: paymentIntent.latest_charge || "",
  };
  await order.save();

  await VendorOrder.updateMany({ orderId: order._id }, { $set: { paymentStatus: "paid" } });

  await notifyUser({
    userId: order.customerUserId,
    title: "Payment successful",
    body: `Payment received for order ${order.orderNumber || order._id}.`,
    type: "payment",
    data: { orderId: order._id, paymentStatus: "paid" },
  });
}

async function markOrderFailedFromStripe(order, paymentIntent) {
  order.paymentStatus = "unpaid";
  order.paymentGateway = {
    ...(order.paymentGateway || {}),
    provider: "stripe",
    paymentIntentId: paymentIntent.id,
    latestStatus: paymentIntent.status || "payment_failed",
    lastEventAt: new Date(),
    failureMessage: paymentIntent.last_payment_error?.message || "",
  };
  await order.save();
}

async function stripeWebhook(req, res) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return res.status(500).send("Missing STRIPE_WEBHOOK_SECRET");
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) return res.status(400).send("Missing stripe-signature");

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      const orderId = pi.metadata?.orderId;
      if (orderId) {
        const order = await Order.findById(orderId);
        if (order && order.paymentMethod === "online") {
          await markOrderPaidFromStripe(order, pi);
        }
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object;
      const orderId = pi.metadata?.orderId;
      if (orderId) {
        const order = await Order.findById(orderId);
        if (order && order.paymentMethod === "online" && order.paymentStatus !== "paid") {
          await markOrderFailedFromStripe(order, pi);
        }
      }
    }
  } catch (err) {
    return res.status(err.statusCode || 500).send(err.message || "Webhook processing failed");
  }

  return res.json({ received: true });
}

module.exports = {
  createStripePaymentIntent,
  confirmStripePayment,
  stripeWebhook,
};
