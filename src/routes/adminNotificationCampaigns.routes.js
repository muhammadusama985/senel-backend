const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const c = require("../controllers/adminNotificationCampaigns.controller");

router.use(requireAuth, requireRole("admin"));

router.post("/notification-campaigns", asyncHandler(c.adminCreateCampaign));
router.get("/notification-campaigns", asyncHandler(c.adminListCampaigns));
router.post("/notification-campaigns/:id/send", asyncHandler(c.adminSendCampaign));

module.exports = router;