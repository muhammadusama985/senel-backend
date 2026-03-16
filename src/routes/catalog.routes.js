const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

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

router.post("/admin/attribute-sets", requireAuth, requireRole("admin"), asyncHandler(adminCreateAttributeSet));
router.get("/admin/attribute-sets", requireAuth, requireRole("admin"), asyncHandler(adminListAttributeSets));
router.patch("/admin/attribute-sets/:attributeSetId", requireAuth, requireRole("admin"), asyncHandler(adminUpdateAttributeSet));
router.delete("/admin/attribute-sets/:attributeSetId", requireAuth, requireRole("admin"), asyncHandler(adminDeleteAttributeSet));

module.exports = router;