const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuthOptional } = require("../middlewares/authOptional.middleware");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const {
  listProducts,
  advancedSearch,
  reindexSearch,
  getProductBySlug,
  getVendorStore,
  listVendors,
  listVendorProducts,
  listCategoriesPublic,
  getProductRecommendations,
  getPersonalizedRecs,
  getTrending,
} = require("../controllers/shop.controller");

// Public browsing
router.get("/products", asyncHandler(listProducts));
router.get("/products/:slug", asyncHandler(getProductBySlug));

// Advanced search
router.get("/search", asyncHandler(advancedSearch));
router.post("/search/reindex", requireAuth, requireRole("admin"), asyncHandler(reindexSearch));

// Recommendations
router.get("/recommendations/:productId", asyncHandler(getProductRecommendations));
router.get("/recommendations/personalized", requireAuthOptional, asyncHandler(getPersonalizedRecs));
router.get("/trending", asyncHandler(getTrending));

// Categories
router.get("/categories", asyncHandler(listCategoriesPublic));

// Vendors
router.get("/vendors", asyncHandler(listVendors));
router.get("/vendors/:storeSlug", asyncHandler(getVendorStore));
router.get("/vendors/:storeSlug/products", asyncHandler(listVendorProducts));

module.exports = router;
