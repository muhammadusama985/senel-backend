const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const a = require("../controllers/analytics.controller");

// All analytics routes require admin authentication
router.use(requireAuth, requireRole("admin"));

// Export endpoints
router.get("/export/orders", asyncHandler(a.exportOrdersReport));
router.get("/export/products", asyncHandler(a.exportProductsReport));
router.get("/export/analytics", asyncHandler(a.exportAnalyticsReport));

// Customer behavior analytics
router.get("/customer/:customerId/behavior", asyncHandler(a.getCustomerBehavior));
router.get("/product/:productId/affinity", asyncHandler(a.getProductAffinity));
router.get("/abandoned-carts", asyncHandler(a.getAbandonedCartStats));
router.get("/customer-segments", asyncHandler(a.getCustomerSegments));

module.exports = router;