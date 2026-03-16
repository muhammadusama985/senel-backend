const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload.middleware"); // Your existing upload middleware

const {
    upsertMyVendor,
    addVerificationDoc,
    removeVerificationDoc,
    submitForReview,
    getMyVendor,
    updateVendorNotifications,
    updateVendorSecurity,
    uploadLogo,
    uploadBanner,
    adminListVendors,
    adminGetVendor,
    adminGetVendorAudit,
    adminUpdateVendorPermissions,
    adminSetUnderReview,
    adminApproveVendor,
    adminRejectVendor,
    adminBlockVendor,
} = require("../controllers/vendor.controller");

// ========== VENDOR ROUTES (Self-service) ==========
router.get("/me", requireAuth, requireRole("vendor"), asyncHandler(getMyVendor));
router.post("/me", requireAuth, requireRole("vendor"), asyncHandler(upsertMyVendor));
router.patch("/me", requireAuth, requireRole("vendor"), asyncHandler(upsertMyVendor));
router.patch("/me/notifications", requireAuth, requireRole("vendor"), asyncHandler(updateVendorNotifications));
router.patch("/me/security", requireAuth, requireRole("vendor"), asyncHandler(updateVendorSecurity));

// File upload routes - these use your existing upload middleware
router.post(
    "/me/logo",
    requireAuth,
    requireRole("vendor"),
    upload.single('logo'),
    asyncHandler(uploadLogo)
);

router.post(
    "/me/banner",
    requireAuth,
    requireRole("vendor"),
    upload.single('banner'),
    asyncHandler(uploadBanner)
);

router.post(
    "/me/docs",
    requireAuth,
    requireRole("vendor"),
    upload.single('document'), // field name should be 'document'
    asyncHandler(addVerificationDoc)
);

router.delete(
    "/me/docs/:docId",
    requireAuth,
    requireRole("vendor"),
    asyncHandler(removeVerificationDoc)
);

router.post(
    "/me/submit",
    requireAuth,
    requireRole("vendor"),
    asyncHandler(submitForReview)
);

// ========== ADMIN ROUTES ==========
router.get("/admin/vendors", requireAuth, requireRole("admin"), asyncHandler(adminListVendors));
router.get("/admin/vendors/:vendorId", requireAuth, requireRole("admin"), asyncHandler(adminGetVendor));
router.get("/admin/vendors/:vendorId/audit", requireAuth, requireRole("admin"), asyncHandler(adminGetVendorAudit));
router.patch("/admin/vendors/:vendorId/permissions", requireAuth, requireRole("admin"), asyncHandler(adminUpdateVendorPermissions));
router.post("/admin/vendors/:vendorId/under-review", requireAuth, requireRole("admin"), asyncHandler(adminSetUnderReview));
router.post("/admin/vendors/:vendorId/approve", requireAuth, requireRole("admin"), asyncHandler(adminApproveVendor));
router.post("/admin/vendors/:vendorId/reject", requireAuth, requireRole("admin"), asyncHandler(adminRejectVendor));
router.post("/admin/vendors/:vendorId/block", requireAuth, requireRole("admin"), asyncHandler(adminBlockVendor));

module.exports = router;
