const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { loadVendorContext } = require("../middlewares/vendorContext.middleware");
const { requireVendorOrderReadyForFulfillment } = require("../middlewares/vendorOrderGaurds.middleware");

const {
  vendorListOrders,
  vendorGetOrder,
  vendorAcceptOrder,
  vendorMarkPacked,
  vendorReadyForPickup,
} = require("../controllers/vendorOrders.controller");

// All vendor order routes require auth + vendor role + context
router.use(requireAuth, requireRole("vendor"), loadVendorContext);

// List and view routes (no guard needed)
router.get("/me", asyncHandler(vendorListOrders));
router.get("/me/:vendorOrderId", asyncHandler(vendorGetOrder));

// Status change routes (with payment/shipping guard)
router.post("/me/:vendorOrderId/accept", asyncHandler(vendorAcceptOrder));

// These routes require payment/shipping confirmation
router.post("/me/:vendorOrderId/packed", 
  requireVendorOrderReadyForFulfillment, 
  asyncHandler(vendorMarkPacked)
);

router.post("/me/:vendorOrderId/ready-pickup", 
  requireVendorOrderReadyForFulfillment, 
  asyncHandler(vendorReadyForPickup)
);

module.exports = router;