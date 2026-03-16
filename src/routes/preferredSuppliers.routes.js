const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const p = require("../controllers/preferredSuppliers.controller");

router.use(requireAuth, requireRole("customer"));

router.get("/me", asyncHandler(p.listPreferred));
router.post("/me", asyncHandler(p.addPreferred));
router.delete("/me/:vendorId", asyncHandler(p.removePreferred));
router.get("/me/:vendorId/exists", asyncHandler(p.isPreferred));

module.exports = router;