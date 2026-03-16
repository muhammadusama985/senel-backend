const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { loadVendorContext } = require("../middlewares/vendorContext.middleware");
const {
  requireVendorStaff,
  requireVendorPermission
} = require("../middlewares/vendorStaff.middleware");

const staff = require("../controllers/vendorStaff.controller");
const activity = require("../controllers/vendorActivity.controller");

router.use(requireAuth, requireRole("vendor"), loadVendorContext);

// staff
router.get("/staff", requireVendorStaff, requireVendorPermission("manage_staff"), asyncHandler(staff.listStaff));
router.post("/staff/invite", requireVendorStaff, requireVendorPermission("manage_staff"), asyncHandler(staff.inviteStaff));
router.patch("/staff/:staffId", requireVendorStaff, requireVendorPermission("manage_staff"), asyncHandler(staff.updateStaff));
router.delete("/staff/:staffId", requireVendorStaff, requireVendorPermission("manage_staff"), asyncHandler(staff.removeStaff));

// self
router.get("/staff/me", requireVendorStaff, asyncHandler(staff.getMyStaffProfile));

// invitation accept
router.post("/staff/accept/:token", asyncHandler(staff.acceptInvitation));

// activity
router.get("/activity", requireVendorStaff, requireVendorPermission("view_analytics"), asyncHandler(activity.getActivityLogs));
router.get("/activity/export", requireVendorStaff, requireVendorPermission("export_data"), asyncHandler(activity.exportActivityLogs));
router.get("/activity/summary", requireVendorStaff, requireVendorPermission("view_analytics"), asyncHandler(activity.getActivitySummary));

module.exports = router;