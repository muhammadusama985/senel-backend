const { notifyVendorOwner } = require("../services/notification.service");
const { z } = require("zod");
const PayoutRequest = require("../models/PayoutRequest");
const AuditLog = require("../models/AuditLog");
const Wallet = require("../models/Wallet");
const { applyTransaction, ensureWallet } = require("../services/wallet.service");

// GET /api/v1/admin/payouts?status=requested
async function adminListPayoutRequests(req, res) {
    const status = req.query.status;
    const query = {};
    if (status) query.status = status;

    const items = await PayoutRequest.find(query).sort({ createdAt: -1 }).lean();
    const walletIds = Array.from(new Set(items.map((item) => String(item.walletId || "")).filter(Boolean)));
    const wallets = walletIds.length
        ? await Wallet.find({ _id: { $in: walletIds } }).select("_id balance currency").lean()
        : [];
    const walletMap = new Map(wallets.map((wallet) => [String(wallet._id), wallet]));

    res.json({
        items: items.map((item) => {
            const wallet = walletMap.get(String(item.walletId || ""));
            return {
                ...item,
                walletBalance: Number(wallet?.balance || 0),
                walletCurrency: wallet?.currency || "EUR",
            };
        }),
    });
}

// POST /api/v1/admin/payouts/:payoutRequestId/approve
const reviewSchema = z.object({ note: z.string().optional() });

async function adminApprovePayout(req, res) {
    const payoutRequestId = req.params.payoutRequestId;
    const body = reviewSchema.parse(req.body);

    const pr = await PayoutRequest.findById(payoutRequestId);
    if (!pr) return res.status(404).json({ message: "Payout request not found" });

    if (pr.status !== "requested") return res.status(400).json({ message: `Cannot approve in status ${pr.status}` });

    pr.status = "approved";
    pr.reviewNote = body.note || "";
    pr.reviewedByAdminId = req.user._id;
    pr.reviewedAt = new Date();
    await pr.save();

    await AuditLog.create({
        actorUserId: req.user._id,
        action: "PAYOUT_APPROVED",
        entityType: "PayoutRequest",
        entityId: pr._id,
        meta: { amount: pr.amount, vendorId: pr.vendorId, note: pr.reviewNote },
    });

    await notifyVendorOwner({
        vendorId: pr.vendorId,
        title: "Payout update",
        body: `Your payout request is now "${pr.status}" for amount ${pr.amount}.`,
        type: "payout",
        data: { payoutRequestId: pr._id, status: pr.status, amount: pr.amount },
    });

    res.json({ payoutRequest: pr });
}

// POST /api/v1/admin/payouts/:payoutRequestId/reject
async function adminRejectPayout(req, res) {
    const payoutRequestId = req.params.payoutRequestId;
    const body = reviewSchema.parse(req.body);

    const pr = await PayoutRequest.findById(payoutRequestId);
    if (!pr) return res.status(404).json({ message: "Payout request not found" });

    if (pr.status !== "requested") return res.status(400).json({ message: `Cannot reject in status ${pr.status}` });

    pr.status = "rejected";
    pr.reviewNote = body.note || "";
    pr.reviewedByAdminId = req.user._id;
    pr.reviewedAt = new Date();
    await pr.save();

    await AuditLog.create({
        actorUserId: req.user._id,
        action: "PAYOUT_REJECTED",
        entityType: "PayoutRequest",
        entityId: pr._id,
        meta: { amount: pr.amount, vendorId: pr.vendorId, note: pr.reviewNote },
    });

    await notifyVendorOwner({
        vendorId: pr.vendorId,
        title: "Payout update",
        body: `Your payout request is now "${pr.status}" for amount ${pr.amount}.`,
        type: "payout",
        data: { payoutRequestId: pr._id, status: pr.status, amount: pr.amount },
    });

    res.json({ payoutRequest: pr });
}

// POST /api/v1/admin/payouts/:payoutRequestId/mark-paid
const markPaidSchema = z.object({
    externalReference: z.string().optional(),
    paidAt: z.string().datetime().optional(),
});

async function adminMarkPayoutPaid(req, res) {
    const payoutRequestId = req.params.payoutRequestId;
    const body = markPaidSchema.parse(req.body);

    try {
        const pr = await PayoutRequest.findById(payoutRequestId);
        if (!pr) throw Object.assign(new Error("Payout request not found"), { statusCode: 404 });

        if (pr.status !== "approved") throw Object.assign(new Error(`Cannot mark paid in status ${pr.status}`), { statusCode: 400 });

        // Ensure wallet exists and has balance
        await ensureWallet(pr.vendorId);

        // Debit the wallet (ledger entry)
        await applyTransaction({
            vendorId: pr.vendorId,
            kind: "PAYOUT_DEBIT",
            amount: -Number(pr.amount),
            note: "Payout paid",
            referenceType: "PayoutRequest",
            referenceId: pr._id,
            createdByAdminId: req.user._id,
        });

        pr.status = "paid";
        pr.externalReference = body.externalReference || pr.externalReference || "";
        pr.paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
        pr.reviewedByAdminId = pr.reviewedByAdminId || req.user._id;
        pr.reviewedAt = pr.reviewedAt || new Date();
        await pr.save();

        await AuditLog.create({
            actorUserId: req.user._id,
            action: "PAYOUT_MARKED_PAID",
            entityType: "PayoutRequest",
            entityId: pr._id,
            meta: { amount: pr.amount, vendorId: pr.vendorId, externalReference: pr.externalReference },
        });

        await notifyVendorOwner({
            vendorId: pr.vendorId,
            title: "Payout update",
            body: `Your payout request is now "${pr.status}" for amount ${pr.amount}.`,
            type: "payout",
            data: { payoutRequestId: pr._id, status: pr.status, amount: pr.amount },
        });

        res.json({ payoutRequest: pr });
    } catch (err) {
        res.status(err.statusCode || 500).json({ message: err.message || "Failed to mark payout paid" });
    }
}

module.exports = {
    adminListPayoutRequests,
    adminApprovePayout,
    adminRejectPayout,
    adminMarkPayoutPaid,
};
