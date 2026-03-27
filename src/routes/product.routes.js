const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload.middleware");


const {
  vendorCreateProduct,
  vendorListMyProducts,
  vendorGetMyProduct,
  vendorUpdateMyProduct,
  vendorDeleteMyProduct,
  vendorSubmitProduct,
  vendorRequestHotProduct,
  adminCreateProduct,
  adminListProducts,
  adminUpdateProduct,
  adminArchiveProduct,
  adminGetProduct,
  uploadMultipleProductImages,
  uploadProductImage,
  adminApproveProduct,
  adminRejectProduct,
  adminSetFeatured,
  adminRejectHotRequest,
} = require("../controllers/product.controller");

// Vendor routes
router.post("/me", requireAuth, requireRole("vendor"), asyncHandler(vendorCreateProduct));
router.get("/me", requireAuth, requireRole("vendor"), asyncHandler(vendorListMyProducts));
router.get("/me/:productId", requireAuth, requireRole("vendor"), asyncHandler(vendorGetMyProduct));
router.patch("/me/:productId", requireAuth, requireRole("vendor"), asyncHandler(vendorUpdateMyProduct));
router.delete("/me/:productId", requireAuth, requireRole("vendor"), asyncHandler(vendorDeleteMyProduct));
router.post("/me/:productId/submit", requireAuth, requireRole("vendor"), asyncHandler(vendorSubmitProduct));
router.post("/me/:productId/hot-request", requireAuth, requireRole("vendor"), asyncHandler(vendorRequestHotProduct));


router.post(
  "/me/images",
  requireAuth,
  requireRole("vendor"),
  upload.single('productImage'),
  asyncHandler(uploadProductImage)
);

router.post(
  "/me/images/multiple",
  requireAuth,
  requireRole("vendor"),
  upload.array('productImages', 10), // Max 10 images
  asyncHandler(uploadMultipleProductImages)
);

// Admin routes
router.post(
  "/admin/images",
  requireAuth,
  requireRole("admin"),
  upload.single("productImage"),
  asyncHandler(uploadProductImage)
);
router.post(
  "/admin/images/multiple",
  requireAuth,
  requireRole("admin"),
  upload.array("productImages", 10),
  asyncHandler(uploadMultipleProductImages)
);
router.post("/admin/products", requireAuth, requireRole("admin"), asyncHandler(adminCreateProduct));
router.get("/admin/products", requireAuth, requireRole("admin"), asyncHandler(adminListProducts));
router.get("/admin/products/:productId", requireAuth, requireRole("admin"), asyncHandler(adminGetProduct));
router.patch("/admin/products/:productId", requireAuth, requireRole("admin"), asyncHandler(adminUpdateProduct)); // ✅ Add this
router.post("/admin/products/:productId/approve", requireAuth, requireRole("admin"), asyncHandler(adminApproveProduct));
router.post("/admin/products/:productId/reject", requireAuth, requireRole("admin"), asyncHandler(adminRejectProduct));
router.post("/admin/products/:productId/archive", requireAuth, requireRole("admin"), asyncHandler(adminArchiveProduct));
router.post("/admin/products/:productId/feature", requireAuth, requireRole("admin"), asyncHandler(adminSetFeatured));
router.post("/admin/products/:productId/hot-request/reject", requireAuth, requireRole("admin"), asyncHandler(adminRejectHotRequest));

module.exports = router;
