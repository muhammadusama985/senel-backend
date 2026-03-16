const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const a = require("../controllers/adminBankTransfer.controller");

router.use(requireAuth, requireRole("admin"));

router.get("/bank-transfers", asyncHandler(a.adminListBankTransfers));
router.post("/bank-transfers/:orderId/approve", asyncHandler(a.adminApproveBankTransfer));
router.post("/bank-transfers/:orderId/reject", asyncHandler(a.adminRejectBankTransfer));

module.exports = router;