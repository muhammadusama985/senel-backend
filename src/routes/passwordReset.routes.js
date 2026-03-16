const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const p = require("../controllers/passwordReset.controller");

// public endpoints (no auth)
router.post("/password/forgot", asyncHandler(p.forgotPassword));
router.post("/password/resend", asyncHandler(p.resendOtp));
router.post("/password/reset", asyncHandler(p.resetPassword));

module.exports = router;