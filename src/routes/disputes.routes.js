const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { loadVendorContext } = require("../middlewares/vendorContext.middleware");

const d = require("../controllers/disputes.controller");

function loadVendorContextIfVendor(req, res, next) {
  if (req.user?.role !== "vendor") return next();
  return loadVendorContext(req, res, next);
}

// Customer
router.post("/customer", requireAuth, requireRole("customer"), asyncHandler(d.customerCreateDispute));
router.get("/customer", requireAuth, requireRole("customer"), asyncHandler(d.customerListMyDisputes));

// Vendor
router.get("/vendor", requireAuth, requireRole("vendor"), loadVendorContextIfVendor, asyncHandler(d.vendorListMyDisputes));

// Shared (customer/vendor/admin can open details if authorized in controller)
router.get("/:id", requireAuth, loadVendorContextIfVendor, asyncHandler(d.getDisputeDetails));
router.post("/:id/messages", requireAuth, loadVendorContextIfVendor, asyncHandler(d.postDisputeMessage));
router.post("/:id/status", requireAuth, loadVendorContextIfVendor, asyncHandler(d.updateDisputeStatus));

module.exports = router;
