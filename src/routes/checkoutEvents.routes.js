const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const { checkoutStarted } = require("../controllers/checkoutEvents.controller");

router.post("/started", requireAuth, requireRole("customer"), asyncHandler(checkoutStarted));

module.exports = router;