const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const {
  adminCouponsOverview,
  adminCouponDetailAnalytics,
  adminOrdersOverview,
} = require("../controllers/adminAnalytics.controller");

router.use(requireAuth, requireRole("admin"));

// Coupons analytics
router.get("/analytics/coupons/overview", asyncHandler(adminCouponsOverview));
router.get("/analytics/coupons/:couponId", asyncHandler(adminCouponDetailAnalytics));

// Orders analytics
router.get("/analytics/orders/overview", asyncHandler(adminOrdersOverview));

module.exports = router;