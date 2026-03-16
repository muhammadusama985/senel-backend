const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { loadVendorContext } = require("../middlewares/vendorContext.middleware");

const activity = require("../controllers/vendorActivity.controller");

router.use(requireAuth, requireRole("vendor"), loadVendorContext);

router.get("/activity", asyncHandler(activity.getActivityLogs));
router.get("/activity/export", asyncHandler(activity.exportActivityLogs));
router.get("/activity/summary", asyncHandler(activity.getActivitySummary));

module.exports = router;