const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { createStripePaymentIntent, confirmStripePayment, stripeWebhook } = require("../controllers/stripePayments.controller");

const router = express.Router();

// Stripe requires raw body for signature verification.
router.post("/webhook", express.raw({ type: "application/json" }), stripeWebhook);

// Use JSON parser for authenticated customer endpoints.
router.use(express.json({ limit: "1mb" }));
router.post("/create-intent", requireAuth, requireRole("customer"), asyncHandler(createStripePaymentIntent));
router.post("/confirm", requireAuth, requireRole("customer"), asyncHandler(confirmStripePayment));

module.exports = router;
