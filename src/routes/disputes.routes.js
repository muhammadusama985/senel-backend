const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const d = require("../controllers/disputes.controller");

// Customer
router.post("/customer", requireAuth, requireRole("customer"), asyncHandler(d.customerCreateDispute));
router.get("/customer", requireAuth, requireRole("customer"), asyncHandler(d.customerListMyDisputes));

// Vendor
router.get("/vendor", requireAuth, requireRole("vendor"), asyncHandler(d.vendorListMyDisputes));

// Shared (customer/vendor/admin can open details if authorized in controller)
router.get("/:id", requireAuth, asyncHandler(d.getDisputeDetails));
router.post("/:id/messages", requireAuth, asyncHandler(d.postDisputeMessage));
router.post("/:id/status", requireAuth, asyncHandler(d.updateDisputeStatus));

module.exports = router;