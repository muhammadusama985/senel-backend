const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");

const d = require("../controllers/deviceTokens.controller");

router.use(requireAuth);

router.post("/me/device-tokens/register", asyncHandler(d.registerDeviceToken));
router.post("/me/device-tokens/unregister", asyncHandler(d.unregisterDeviceToken));
router.get("/me/device-tokens", asyncHandler(d.listMyTokens));

module.exports = router;