const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const support = require("../controllers/adminSupportTickets.controller");

router.use(requireAuth, requireRole("admin"));

router.get("/support/tickets", asyncHandler(support.adminListSupportTickets));
router.get("/support/tickets/:ticketId", asyncHandler(support.adminGetSupportTicketDetails));
router.post("/support/tickets/:ticketId/messages", asyncHandler(support.adminReplySupportTicket));
router.patch("/support/tickets/:ticketId/status", asyncHandler(support.adminUpdateSupportTicketStatus));

module.exports = router;
