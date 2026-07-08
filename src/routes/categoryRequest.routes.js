const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { asyncHandler } = require("../utils/asyncHandler");
const c = require("../controllers/categoryRequest.controller");

const router = require("express").Router();

// Vendor routes
router.post(
  "/category-requests",
  requireAuth,
  requireRole("vendor"),
  asyncHandler(c.vendorCreateCategoryRequest)
);
router.get(
  "/category-requests/me",
  requireAuth,
  requireRole("vendor"),
  asyncHandler(c.vendorListMyCategoryRequests)
);
router.get(
  "/category-requests/me/:requestId",
  requireAuth,
  requireRole("vendor"),
  asyncHandler(c.vendorGetMyCategoryRequest)
);

// Admin routes
router.get(
  "/category-requests",
  requireAuth,
  requireRole("admin"),
  asyncHandler(c.adminListCategoryRequests)
);
router.post(
  "/category-requests/:requestId/approve",
  requireAuth,
  requireRole("admin"),
  asyncHandler(c.adminApproveCategoryRequest)
);
router.post(
  "/category-requests/:requestId/reject",
  requireAuth,
  requireRole("admin"),
  asyncHandler(c.adminRejectCategoryRequest)
);

module.exports = router;
