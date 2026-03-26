const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const {
  adminListOrders,
  adminGetOrderDetail,
  adminListVendorOrders,
  adminGetVendorOrderDetail,
  adminSchedulePickup,
  adminAssignShipping,
  adminStartPicking,
  adminPackOrder,
  adminMarkShipped,
  adminMarkDelivered,
  adminReadyPickupQueue,
  adminFulfillmentQueue,
  adminCancelVendorOrder,
  adminCancelOrder,
  adminMarkOrderRefunded,
} = require("../controllers/adminOrders.controller");

// Import shop controller for search reindex
const { reindexSearch } = require("../controllers/shop.controller");

// Admin-only guard for everything here
router.use(requireAuth, requireRole("admin"));

// Master orders
router.get("/orders", asyncHandler(adminListOrders));
router.get("/orders/:orderId", asyncHandler(adminGetOrderDetail));
router.post("/orders/:orderId/cancel", asyncHandler(adminCancelOrder));
router.post("/orders/:orderId/mark-refunded", asyncHandler(adminMarkOrderRefunded));

// Search reindex endpoint
router.post("/search/reindex", asyncHandler(reindexSearch));

// Vendor split orders
router.get("/vendor-orders", asyncHandler(adminListVendorOrders));
router.get("/vendor-orders/:vendorOrderId", asyncHandler(adminGetVendorOrderDetail));
router.post("/vendor-orders/:vendorOrderId/cancel", asyncHandler(adminCancelVendorOrder));

// Queues
router.get("/vendor-orders/queue/ready-pickup", asyncHandler(adminReadyPickupQueue));
router.get("/vendor-orders/queue/admin-fulfillment", asyncHandler(adminFulfillmentQueue));

// Pickup scheduling
router.post("/vendor-orders/:vendorOrderId/schedule-pickup", asyncHandler(adminSchedulePickup));

// Shipping
router.post("/vendor-orders/:vendorOrderId/assign-shipping", asyncHandler(adminAssignShipping));
router.post("/vendor-orders/:vendorOrderId/start-picking", asyncHandler(adminStartPicking));
router.post("/vendor-orders/:vendorOrderId/pack", asyncHandler(adminPackOrder));
router.post("/vendor-orders/:vendorOrderId/mark-shipped", asyncHandler(adminMarkShipped));
router.post("/vendor-orders/:vendorOrderId/mark-delivered", asyncHandler(adminMarkDelivered));

module.exports = router;
