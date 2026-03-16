const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const {
  listMyNotifications,
  markRead,
  markAllRead,
  adminCreateAnnouncement,
} = require("../controllers/notification.controller");

router.get("/me", requireAuth, asyncHandler(listMyNotifications));
router.post("/:notificationId/read", requireAuth, asyncHandler(markRead));
router.post("/read-all", requireAuth, asyncHandler(markAllRead));

// Admin announcements
router.post("/admin/announcements", requireAuth, requireRole("admin"), asyncHandler(adminCreateAnnouncement));

module.exports = router;