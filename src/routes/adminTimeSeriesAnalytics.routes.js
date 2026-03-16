const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const { adminOrdersTimeSeries , adminVendorOrdersTimeSeries} = require("../controllers/adminTimeSeriesAnalytics.controller");


router.use(requireAuth, requireRole("admin"));

router.get("/analytics/timeseries/orders", asyncHandler(adminOrdersTimeSeries));
router.get("/analytics/timeseries/vendor-orders", asyncHandler(adminVendorOrdersTimeSeries));

module.exports = router;