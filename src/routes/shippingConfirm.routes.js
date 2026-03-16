const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { customerConfirmShippingQuote } = require("../controllers/shippingConfirm.controller");

router.post("/orders/:orderId/confirm-shipping", requireAuth, requireRole("customer"), asyncHandler(customerConfirmShippingQuote));

module.exports = router;