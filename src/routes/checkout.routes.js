const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const { checkout } = require("../controllers/checkout.controller");

router.post("/", requireAuth, requireRole("customer"), asyncHandler(checkout));

module.exports = router;