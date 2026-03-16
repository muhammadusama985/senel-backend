const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { applyCoupon, removeCoupon, listActiveCoupons } = require("../controllers/couponApply.controller");

// Customer-only
router.get("/active", asyncHandler(listActiveCoupons));
router.post("/me/apply", requireAuth, requireRole("customer"), asyncHandler(applyCoupon));
router.post("/me/remove", requireAuth, requireRole("customer"), asyncHandler(removeCoupon));

module.exports = router;
