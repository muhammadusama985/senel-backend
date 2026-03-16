const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const upload = require("../middlewares/upload.middleware");
const { submitBankTransferProof } = require("../controllers/bankTransfer.controller");

router.post(
  "/submit-proof",
  requireAuth,
  requireRole("customer"),
  upload.single("proofImage"),
  asyncHandler(submitBankTransferProof)
);

module.exports = router;
