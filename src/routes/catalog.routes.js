const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload.middleware");
const path = require("path");
const fs = require("fs");

const {
  adminCreateCategory,
  adminListCategories,
  adminUpdateCategory,
  adminDeleteCategory,
  adminCreateAttributeSet,
  adminListAttributeSets,
  adminUpdateAttributeSet,
  adminDeleteAttributeSet,
} = require("../controllers/catalog.controller");



// ✅ PUBLIC ROUTE - No authentication required
router.get("/categories/public", asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true })
    .sort({ parentId: 1, sortOrder: 1, name: 1 })
    .lean();
  res.json({ categories });
}));

// Admin-only catalog endpoints
router.post("/admin/categories", requireAuth, requireRole("admin"), asyncHandler(adminCreateCategory));
router.get("/admin/categories", requireAuth, requireRole("admin"), asyncHandler(adminListCategories));
router.patch("/admin/categories/:categoryId", requireAuth, requireRole("admin"), asyncHandler(adminUpdateCategory));
router.delete("/admin/categories/:categoryId", requireAuth, requireRole("admin"), asyncHandler(adminDeleteCategory));

// Upload category image endpoint
router.post(
  "/admin/categories/upload-image",
  requireAuth,
  requireRole("admin"),
  upload.single("categoryImage"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Always use https:// to avoid mixed-content warnings
    // (Cloudflare terminates SSL and forwards to backend as HTTP internally)
    const baseUrl = `https://${req.get('host')}`;
    const imageUrl = `${baseUrl}/uploads/categories/${req.file.filename}`;

    res.status(201).json({
      success: true,
      imageUrl,
      filename: req.file.filename,
    });
  })
);

router.post("/admin/attribute-sets", requireAuth, requireRole("admin"), asyncHandler(adminCreateAttributeSet));
router.get("/admin/attribute-sets", requireAuth, requireRole("admin"), asyncHandler(adminListAttributeSets));
router.patch("/admin/attribute-sets/:attributeSetId", requireAuth, requireRole("admin"), asyncHandler(adminUpdateAttributeSet));
router.delete("/admin/attribute-sets/:attributeSetId", requireAuth, requireRole("admin"), asyncHandler(adminDeleteAttributeSet));

module.exports = router;