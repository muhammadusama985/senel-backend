const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { loadVendorContext } = require("../middlewares/vendorContext.middleware");
const { vendorAnalyticsOverview } = require("../controllers/vendorAnalytics.controller");

router.use(requireAuth, requireRole("vendor"), loadVendorContext);

router.get("/analytics/overview", asyncHandler(vendorAnalyticsOverview));

module.exports = router;

