const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const {
  vendorGetWallet,
  vendorListTransactions,
  vendorRequestPayout,
  vendorListPayoutRequests,
  vendorGetPayoutRequest,
  vendorCancelPayoutRequest,
} = require("../controllers/vendorWallet.controller");

router.get("/me", requireAuth, requireRole("vendor"), asyncHandler(vendorGetWallet));
router.get("/me/transactions", requireAuth, requireRole("vendor"), asyncHandler(vendorListTransactions));

router.post("/me/payout-requests", requireAuth, requireRole("vendor"), asyncHandler(vendorRequestPayout));
router.get("/me/payout-requests", requireAuth, requireRole("vendor"), asyncHandler(vendorListPayoutRequests));
router.get("/me/payout-requests/:payoutRequestId", requireAuth, requireRole("vendor"), asyncHandler(vendorGetPayoutRequest));
router.post("/me/payout-requests/:payoutRequestId/cancel", requireAuth, requireRole("vendor"), asyncHandler(vendorCancelPayoutRequest));

module.exports = router;
