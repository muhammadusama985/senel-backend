const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const t = require("../controllers/adminTax.controller");

router.use(requireAuth, requireRole("admin"));

router.get("/tax", asyncHandler(t.getTaxSettings));
router.patch("/tax", asyncHandler(t.updateTaxSettings));

module.exports = router;