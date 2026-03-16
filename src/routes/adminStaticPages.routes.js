const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const a = require("../controllers/adminStaticPages.controller");

router.use(requireAuth, requireRole("admin"));

router.get("/static-pages", asyncHandler(a.adminListPages));
router.get("/static-pages/:id", asyncHandler(a.adminGetPage));
router.post("/static-pages", asyncHandler(a.adminCreatePage));
router.patch("/static-pages/:id", asyncHandler(a.adminUpdatePage));
router.delete("/static-pages/:id", asyncHandler(a.adminDeletePage));
router.post("/static-pages/:id/publish", asyncHandler(a.adminPublishPage));
router.post("/static-pages/:id/unpublish", asyncHandler(a.adminUnpublishPage));

module.exports = router;