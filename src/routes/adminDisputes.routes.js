const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const { adminListDisputes } = require("../controllers/adminDisputes.controller");

router.use(requireAuth, requireRole("admin"));
router.get("/disputes", asyncHandler(adminListDisputes));

module.exports = router;