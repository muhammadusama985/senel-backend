const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const b = require("../controllers/broadcast.controller");

router.use(requireAuth, requireRole("admin"));

router.post("/broadcasts", asyncHandler(b.adminCreateCampaign));
router.get("/broadcasts", asyncHandler(b.adminListCampaigns));
router.post("/broadcasts/:id/send", asyncHandler(b.adminSendCampaign));
router.post("/broadcasts/:id/cancel", asyncHandler(b.adminCancelCampaign));

module.exports = router;