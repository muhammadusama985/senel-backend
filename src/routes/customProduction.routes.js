const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { loadVendorContext } = require("../middlewares/vendorContext.middleware");

const c = require("../controllers/customProduction.controller");

// ============== Buyer (customer) ==============
router.use("/buyer", requireAuth, requireRole("customer"));
router.post("/buyer", asyncHandler(c.createRFQ));
router.get("/buyer", asyncHandler(c.listMyBuyerRFQs));
router.get("/buyer/:rfqId", asyncHandler(c.getMyBuyerRFQ));
router.post("/buyer/:rfqId/messages", asyncHandler(c.buyerSendCounterMessage));
router.post("/buyer/:rfqId/accept", asyncHandler(c.buyerAcceptQuotation));
router.post("/buyer/:rfqId/reject", asyncHandler(c.buyerRejectQuotation));
router.post("/buyer/:rfqId/cancel", asyncHandler(c.buyerCancelRFQ));

// ============== Shared (payment link / checkout) ==============
router.get("/payment-link/:token", requireAuth, asyncHandler(c.getRFQByPaymentToken));
router.post("/payment-link/:token/checkout", requireAuth, requireRole("customer"), asyncHandler(c.checkoutFromRFQ));

// ============== Vendor ==============
router.use("/vendor", requireAuth, requireRole("vendor"), loadVendorContext);
router.get("/vendor", asyncHandler(c.listVendorRFQs));
router.get("/vendor/:rfqId", asyncHandler(c.getVendorRFQ));
router.post("/vendor/:rfqId/quotation", asyncHandler(c.vendorSendQuotation));
router.post("/vendor/:rfqId/messages", asyncHandler(c.vendorCounterMessage));
router.post("/vendor/:rfqId/reject", asyncHandler(c.vendorRejectRFQ));
router.post("/vendor/:rfqId/start-production", asyncHandler(c.vendorMarkInProduction));
router.post("/vendor/:rfqId/complete", asyncHandler(c.vendorMarkCompleted));
router.delete("/vendor/:rfqId", asyncHandler(c.vendorDeleteRFQ));

// ============== Admin ==============
router.use("/admin", requireAuth, requireRole("admin"));
router.get("/admin", asyncHandler(c.adminListAllRFQs));
router.get("/admin/:rfqId", asyncHandler(c.adminGetRFQ));
router.delete("/admin/:rfqId", asyncHandler(c.adminDeleteRFQ));

module.exports = router;