const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const {
  adminListReadyForPickup,
  adminUpdateHandoverStatus,
  adminSchedulePickup, // ✅ ADD THIS IMPORT
} = require("../controllers/adminHandover.controller");

// All routes require admin authentication
router.use(requireAuth, requireRole("admin"));

// List all orders ready for pickup
router.get("/handover/ready-for-pickup", asyncHandler(adminListReadyForPickup));

// Schedule pickup for an order
router.post("/handover/vendor-orders/:vendorOrderId/schedule-pickup", asyncHandler(adminSchedulePickup)); // ✅ ADD THIS ROUTE

// Update handover status (picked_up, in_transit, delivered)
router.post("/handover/vendor-orders/:vendorOrderId/status", asyncHandler(adminUpdateHandoverStatus));

module.exports = router;