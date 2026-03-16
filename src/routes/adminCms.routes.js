const express = require("express");
const router = express.Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload.middleware");
const path = require('path');

const cms = require("../controllers/adminCms.controller");

// Authentication middleware for all routes
router.use(requireAuth, requireRole("admin"));

// Serve uploaded files statically - FIXED: Now using express.static correctly

// Pages routes
router.post("/pages", asyncHandler(cms.adminCreatePage));
router.get("/pages", asyncHandler(cms.adminListPages));
router.get("/pages/:id", asyncHandler(cms.adminGetPage));
router.patch("/pages/:id", asyncHandler(cms.adminUpdatePage));
router.delete("/pages/:id", asyncHandler(cms.adminDeletePage));
router.post("/pages/:id/publish", asyncHandler(cms.adminPublishPage));
router.post("/pages/:id/unpublish", asyncHandler(cms.adminUnpublishPage));

// Blog routes with image upload
router.post(
  "/blog", 
  upload.single('coverImage'), 
  asyncHandler(cms.adminCreateBlog)
);
router.get("/blog", asyncHandler(cms.adminListBlog));
router.patch(
  "/blog/:id", 
  upload.single('coverImage'), 
  asyncHandler(cms.adminUpdateBlog)
);
router.delete("/blog/:id", asyncHandler(cms.adminDeleteBlog));
router.post("/blog/:id/publish", asyncHandler(cms.adminPublishBlog));
router.post("/blog/:id/unpublish", asyncHandler(cms.adminUnpublishBlog));

// Banners routes with image upload
router.post(
  "/banners", 
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'imageMobile', maxCount: 1 }
  ]), 
  asyncHandler(cms.adminCreateBanner)
);
router.get("/banners", asyncHandler(cms.adminListBanners));
router.patch(
  "/banners/:id", 
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'imageMobile', maxCount: 1 }
  ]), 
  asyncHandler(cms.adminUpdateBanner)
);
router.delete("/banners/:id", asyncHandler(cms.adminDeleteBanner));
router.post("/banners/:id/activate", asyncHandler(cms.adminActivateBanner));
router.post("/banners/:id/deactivate", asyncHandler(cms.adminDeactivateBanner));

module.exports = router;