const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { loadVendorContext } = require("../middlewares/vendorContext.middleware");

const tickets = require("../controllers/supportTicket.controller");

router.use(requireAuth, requireRole("vendor"), loadVendorContext);

router.post("/tickets", asyncHandler(tickets.createTicket));
router.get("/tickets", asyncHandler(tickets.listTickets));
router.get("/tickets/:ticketId", asyncHandler(tickets.getTicketDetails));
router.post("/tickets/:ticketId/messages", asyncHandler(tickets.addMessage));
router.patch("/tickets/:ticketId/status", asyncHandler(tickets.updateTicketStatus));

module.exports = router;