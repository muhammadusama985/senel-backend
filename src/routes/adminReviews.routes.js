const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const { adminListReviews, adminModerateReview } = require("../controllers/adminReviews.controller");

router.use(requireAuth, requireRole("admin"));
router.get("/reviews", asyncHandler(adminListReviews));
router.post("/reviews/:reviewId/moderate", asyncHandler(adminModerateReview));

module.exports = router;