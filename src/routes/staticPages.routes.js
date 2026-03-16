const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { getPageBySlug } = require("../controllers/staticPages.controller");

router.get("/:slug", asyncHandler(getPageBySlug));

module.exports = router;