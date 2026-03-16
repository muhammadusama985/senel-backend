const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { adminSetOrderShippingQuote } = require("../controllers/adminShippingQuotes.controller");

router.use(requireAuth, requireRole("admin"));
router.post("/orders/:orderId/shipping-quote", asyncHandler(adminSetOrderShippingQuote));

module.exports = router;