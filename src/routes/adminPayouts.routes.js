const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const {
  adminListPayoutRequests,
  adminApprovePayout,
  adminRejectPayout,
  adminMarkPayoutPaid,
} = require("../controllers/adminPayouts.controller");

router.use(requireAuth, requireRole("admin"));

router.get("/payouts", asyncHandler(adminListPayoutRequests));
router.post("/payouts/:payoutRequestId/approve", asyncHandler(adminApprovePayout));
router.post("/payouts/:payoutRequestId/reject", asyncHandler(adminRejectPayout));
router.post("/payouts/:payoutRequestId/mark-paid", asyncHandler(adminMarkPayoutPaid));

module.exports = router;