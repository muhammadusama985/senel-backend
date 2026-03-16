const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const c = require("../controllers/customerOrders.controller");

router.use(requireAuth, requireRole("customer"));

router.get("/me", asyncHandler(c.listMyOrders));
router.get("/me/:orderId", asyncHandler(c.getMyOrderDetail));
router.post("/me/:orderId/cancel", asyncHandler(c.cancelMyOrder));

module.exports = router;
