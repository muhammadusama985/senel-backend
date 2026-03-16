const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const a = require("../controllers/adminBlog.controller");

router.use(requireAuth, requireRole("admin"));

router.get("/blog-posts", asyncHandler(a.adminListPosts));
router.get("/blog-posts/:id", asyncHandler(a.adminGetPost));
router.post("/blog-posts", asyncHandler(a.adminCreatePost));
router.patch("/blog-posts/:id", asyncHandler(a.adminUpdatePost));
router.delete("/blog-posts/:id", asyncHandler(a.adminDeletePost));
router.post("/blog-posts/:id/publish", asyncHandler(a.adminPublishPost));
router.post("/blog-posts/:id/unpublish", asyncHandler(a.adminUnpublishPost));

module.exports = router;