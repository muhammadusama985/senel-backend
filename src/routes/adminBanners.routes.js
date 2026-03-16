const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const a = require("../controllers/adminBanners.controller");

router.use(requireAuth, requireRole("admin"));

router.get("/banners", asyncHandler(a.adminListBanners));
router.get("/banners/:id", asyncHandler(a.adminGetBanner));
router.post("/banners", asyncHandler(a.adminCreateBanner));
router.patch("/banners/:id", asyncHandler(a.adminUpdateBanner));
router.delete("/banners/:id", asyncHandler(a.adminDeleteBanner));

module.exports = router;