const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");

const pub = require("../controllers/publicCms.controller");

router.get("/pages/:slug", asyncHandler(pub.getPageBySlug));
router.get("/blog", asyncHandler(pub.listBlog));
router.get("/blog/:slug", asyncHandler(pub.getBlogBySlug));
router.get("/banners", asyncHandler(pub.listBanners));

module.exports = router;