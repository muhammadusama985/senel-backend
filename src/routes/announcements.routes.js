const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const a = require("../controllers/announcements.controller");

// Admin
router.post("/admin/announcements", requireAuth, requireRole("admin"), asyncHandler(a.adminCreate));
router.patch("/admin/announcements/:id", requireAuth, requireRole("admin"), asyncHandler(a.adminUpdate));
router.get("/admin/announcements", requireAuth, requireRole("admin"), asyncHandler(a.adminList));
router.post("/admin/announcements/:id/publish", requireAuth, requireRole("admin"), asyncHandler(a.adminPublish));
router.post("/admin/announcements/:id/archive", requireAuth, requireRole("admin"), asyncHandler(a.adminArchive));

// User feed
router.get("/announcements/me", requireAuth, asyncHandler(a.listForMe));
router.post("/announcements/:id/read", requireAuth, asyncHandler(a.markRead));
router.get("/announcements/me/unread-count", requireAuth, asyncHandler(a.unreadCount));

module.exports = router;