const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const a = require("../controllers/adminEmailTemplates.controller");

router.use(requireAuth, requireRole("admin"));

router.get("/email-templates", asyncHandler(a.adminListTemplates));
router.get("/email-templates/:id", asyncHandler(a.adminGetTemplate));
router.get("/email-templates/key/:key", asyncHandler(a.adminGetTemplateByKey));
router.post("/email-templates", asyncHandler(a.adminCreateTemplate));
router.patch("/email-templates/:id", asyncHandler(a.adminUpdateTemplate));
router.delete("/email-templates/:id", asyncHandler(a.adminDeleteTemplate));

module.exports = router;