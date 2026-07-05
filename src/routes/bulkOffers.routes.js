const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { loadVendorContext } = require("../middlewares/vendorContext.middleware");

const c = require("../controllers/bulkOffers.controller");

// ============== Buyer (customer) ==============
router.use("/buyer", requireAuth, requireRole("customer"));
router.post("/buyer", asyncHandler(c.createBulkOffer));
router.get("/buyer", asyncHandler(c.listMyBuyerOffers));
router.get("/buyer/:offerId", asyncHandler(c.getMyBuyerOffer));
router.post("/buyer/:offerId/counter", asyncHandler(c.buyerCounterOffer));
router.post("/buyer/:offerId/accept", asyncHandler(c.buyerAcceptOffer));
router.post("/buyer/:offerId/reject", asyncHandler(c.buyerRejectOffer));
router.post("/buyer/:offerId/cancel", asyncHandler(c.buyerCancelOffer));

// ============== Shared (payment link / checkout) ==============
router.get("/payment-link/:token", requireAuth, asyncHandler(c.getOfferByPaymentToken));
router.post("/payment-link/:token/checkout", requireAuth, requireRole("customer"), asyncHandler(c.checkoutFromOffer));

// ============== Vendor ==============
router.use("/vendor", requireAuth, requireRole("vendor"), loadVendorContext);
router.get("/vendor", asyncHandler(c.listVendorOffers));
router.get("/vendor/:offerId", asyncHandler(c.getVendorOffer));
router.post("/vendor/:offerId/counter", asyncHandler(c.vendorCounterOffer));
router.post("/vendor/:offerId/accept", asyncHandler(c.vendorAcceptOffer));
router.post("/vendor/:offerId/reject", asyncHandler(c.vendorRejectOffer));
router.delete("/vendor/:offerId", asyncHandler(c.vendorDeleteOffer));

// ============== Admin ==============
router.use("/admin", requireAuth, requireRole("admin"));
router.get("/admin", asyncHandler(c.adminListAllOffers));
router.get("/admin/:offerId", asyncHandler(c.adminGetOffer));

module.exports = router;