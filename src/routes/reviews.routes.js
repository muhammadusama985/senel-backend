const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const {
  createProductReview,
  createVendorReview,
  listProductReviews,
  listVendorReviews,
} = require("../controllers/reviews.controller");

// Customer creates
router.post("/product", requireAuth, requireRole("customer"), asyncHandler(createProductReview));
router.post("/vendor", requireAuth, requireRole("customer"), asyncHandler(createVendorReview));

// Public fetch approved reviews
router.get("/product/:productId", asyncHandler(listProductReviews));
router.get("/vendor/:vendorId", asyncHandler(listVendorReviews));

module.exports = router;