const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const r = require("../controllers/recentlyViewed.controller");

router.use(requireAuth, requireRole("customer"));

router.post("/me", asyncHandler(r.addRecentlyViewed));
router.get("/me", asyncHandler(r.listRecentlyViewed));
router.post("/me/clear", asyncHandler(r.clearRecentlyViewed));

module.exports = router;