const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const w = require("../controllers/wishlist.controller");

router.use(requireAuth, requireRole("customer"));

router.get("/me", asyncHandler(w.listWishlist));
router.post("/me", asyncHandler(w.addToWishlist));
router.delete("/me/:productId", asyncHandler(w.removeFromWishlist));
router.get("/me/:productId/exists", asyncHandler(w.isInWishlist));

module.exports = router;