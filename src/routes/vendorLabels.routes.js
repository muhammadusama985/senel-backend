const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { loadVendorContext } = require("../middlewares/vendorContext.middleware");

const { vendorDownloadPackagingLabel } = require("../controllers/vendorLabels.controller");

// Authentication + vendor role + vendor context
router.use(requireAuth, requireRole("vendor"), loadVendorContext);

// Packaging label PDF - accessible to all authenticated vendors with context
router.get(
  "/vendor-orders/:vendorOrderId/packaging-label.pdf",
  asyncHandler(vendorDownloadPackagingLabel)
);

module.exports = router;