const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const a = require("../controllers/addressBook.controller");

// Customer only
router.use(requireAuth, requireRole("customer"));

router.get("/me", asyncHandler(a.listMyAddresses));
router.get("/me/:id", asyncHandler(a.getMyAddress));
router.post("/me", asyncHandler(a.createAddress));
router.patch("/me/:id", asyncHandler(a.updateAddress));
router.delete("/me/:id", asyncHandler(a.deleteAddress));
router.post("/me/:id/set-default", asyncHandler(a.setDefaultAddress));

module.exports = router;