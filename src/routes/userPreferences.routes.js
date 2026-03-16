const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");

const p = require("../controllers/userPreferences.controller");

router.use(requireAuth);

router.get("/me/preferences", asyncHandler(p.getMyPreferences));
router.patch("/me/preferences", asyncHandler(p.updateMyPreferences));

module.exports = router;