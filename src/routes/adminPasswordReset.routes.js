const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const c = require("../controllers/adminPasswordReset.controller");

router.use(requireAuth, requireRole("admin"));

router.get("/password-reset/tokens", asyncHandler(c.adminListPasswordResetTokens));
router.patch("/password-reset/tokens/:tokenId", asyncHandler(c.adminUpdatePasswordResetToken));
router.post("/change-password", asyncHandler(c.adminChangePassword));

module.exports = router;
