const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuthOptional } = require("../middlewares/authOptional.middleware");
const { getActiveBanners } = require("../controllers/banners.controller");

// Optional auth (for future targeting based on user role)
router.get("/", requireAuthOptional, asyncHandler(getActiveBanners));

module.exports = router;