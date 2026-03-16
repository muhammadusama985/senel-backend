const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const {
  adminTopVendors,
  adminVendorOverview,
  adminTopProducts,
  adminTopCategories,
  adminCountryDemand,
  adminLowStockProducts,
} = require("../controllers/adminVendorProductAnalytics.controller");

router.use(requireAuth, requireRole("admin"));

// Vendors
router.get("/analytics/vendors/top", asyncHandler(adminTopVendors));
router.get("/analytics/vendors/:vendorId/overview", asyncHandler(adminVendorOverview));

// Products
router.get("/analytics/products/top", asyncHandler(adminTopProducts));
router.get("/analytics/products/low-stock", asyncHandler(adminLowStockProducts));

// Categories
router.get("/analytics/categories/top", asyncHandler(adminTopCategories));
router.get("/analytics/demand/countries", asyncHandler(adminCountryDemand));

module.exports = router;
