const { logEvent } = require("../services/analyticsEvents.service");
const Cart = require("../models/Cart");

async function checkoutStarted(req, res) {
  const cart = await Cart.findOne({ customerUserId: req.user._id }).lean();
  await logEvent({
    type: "CHECKOUT_STARTED",
    userId: req.user._id,
    cartId: cart?._id,
    meta: { subtotal: cart?.subtotal || 0, items: cart?.items?.length || 0 },
  });
  res.json({ ok: true });
}

module.exports = { checkoutStarted };