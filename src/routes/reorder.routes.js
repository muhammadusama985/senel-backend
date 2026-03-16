const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { reorder } = require("../controllers/reorder.controller");

router.post("/me", requireAuth, requireRole("customer"), asyncHandler(reorder));

module.exports = router;