const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { loadVendorContext } = require("../middlewares/vendorContext.middleware");
const {
  vendorListCoupons,
  vendorCreateCoupon,
  vendorUpdateCoupon,
} = require("../controllers/vendorCoupons.controller");

router.use(requireAuth, requireRole("vendor"), loadVendorContext);

router.get("/coupons", asyncHandler(vendorListCoupons));
router.post("/coupons", asyncHandler(vendorCreateCoupon));
router.patch("/coupons/:couponId", asyncHandler(vendorUpdateCoupon));

module.exports = router;
