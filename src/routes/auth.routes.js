const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { register, login, requestLoginOtp, verifyLoginOtp, updateMe } = require("../controllers/auth.controller");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

function toSafeUser(user) {
  if (!user) return null;
  return {
    id: user._id || user.id,
    role: user.role,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    companyName: user.companyName || "",
    taxId: user.taxId || "",
    country: user.country || "",
    city: user.city || "",
    addressLine: user.addressLine || "",
    contactPhone: user.contactPhone || "",
    preferredLanguage: user.preferredLanguage || "en",
    createdAt: user.createdAt,
  };
}

// Public
router.post("/register", asyncHandler(register));
router.post("/login", asyncHandler(login));
router.post("/login/request-otp", asyncHandler(requestLoginOtp));
router.post("/login/verify-otp", asyncHandler(verifyLoginOtp));

// Example protected routes (sanity check)
router.get("/me", requireAuth, (req, res) => res.json({ user: toSafeUser(req.user) }));
router.patch("/me", requireAuth, asyncHandler(updateMe));
router.get("/admin-only", requireAuth, requireRole("admin"), (req, res) => res.json({ ok: true }));

module.exports = router;
