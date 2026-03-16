const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const { adminCreateCoupon, adminListCoupons, adminUpdateCoupon } = require("../controllers/couponAdmin.controller");

router.use(requireAuth, requireRole("admin"));

router.post("/coupons", asyncHandler(adminCreateCoupon));
router.get("/coupons", asyncHandler(adminListCoupons));
router.patch("/coupons/:couponId", asyncHandler(adminUpdateCoupon));

module.exports = router;