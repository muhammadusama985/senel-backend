const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const {
  getMyCart,
  addItem,
  updateItemQty,
  removeItem,
  clearCart,
} = require("../controllers/cart.controller");

// Customer-only cart endpoints (B2B buyers)
router.get("/me", requireAuth, requireRole("customer"), asyncHandler(getMyCart));
router.post("/me/items", requireAuth, requireRole("customer"), asyncHandler(addItem));
router.patch("/me/items/:cartItemId", requireAuth, requireRole("customer"), asyncHandler(updateItemQty));
router.delete("/me/items/:cartItemId", requireAuth, requireRole("customer"), asyncHandler(removeItem));
router.delete("/me", requireAuth, requireRole("customer"), asyncHandler(clearCart));

module.exports = router;