const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { listPosts, getPostBySlug } = require("../controllers/blog.controller");

router.get("/", asyncHandler(listPosts));
router.get("/:slug", asyncHandler(getPostBySlug));

module.exports = router;