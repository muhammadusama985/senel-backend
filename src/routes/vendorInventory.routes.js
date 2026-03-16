const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { loadVendorContext } = require("../middlewares/vendorContext.middleware");

const v = require("../controllers/vendorInventory.controller");

// All routes require auth + vendor role + vendor context
router.use(requireAuth, requireRole("vendor"), loadVendorContext);

// View low stock list
router.get("/low-stock", asyncHandler(v.listLowStock));

// Update one product inventory settings/qty/threshold
router.patch(
  "/products/:productId",
  asyncHandler(v.updateProductInventory)
);

module.exports = router;