const { z } = require("zod");
const Vendor = require("../models/Vendor");
const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const PayoutRequest = require("../models/PayoutRequest");
const { ensureWallet } = require("../services/wallet.service");

async function getMyVendor(req) {
  const vendor = await Vendor.findOne({ ownerUserId: req.user._id }).lean();
  if (!vendor) {
    const err = new Error("Vendor profile not found");
    err.statusCode = 404;
    throw err;
  }
  if (vendor.status !== "approved") {
    const err = new Error("Vendor not approved");
    err.statusCode = 403;
    throw err;
  }
  return vendor;
}

// GET /api/v1/wallet/me
async function vendorGetWallet(req, res) {
  const vendor = await getMyVendor(req);
  const wallet = await ensureWallet(vendor._id);
  res.json({ wallet });
}

// GET /api/v1/wallet/me/transactions?page&limit
async function vendorListTransactions(req, res) {
  const vendor = await getMyVendor(req);
  const wallet = await ensureWallet(vendor._id);

  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10), 1), 100);
  const skip = (page - 1) * limit;
  const query = { walletId: wallet._id };

  if (req.query.kind) {
    query.kind = String(req.query.kind);
  }

  if (req.query.from || req.query.to) {
    query.createdAt = {};
    if (req.query.from) query.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) query.createdAt.$lte = new Date(req.query.to);
  }

  if (req.query.q) {
    const q = String(req.query.q).trim();
    if (q) {
      query.note = { $regex: q, $options: "i" };
    }
  }

  const [items, total] = await Promise.all([
    WalletTransaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    WalletTransaction.countDocuments(query),
  ]);

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

// POST /api/v1/wallet/me/payout-requests
const payoutRequestSchema = z.object({
  amount: z.number().min(1),
  payoutMethod: z.enum(["bank_transfer"]).optional(),
  payoutDetails: z.record(z.any()).optional(),
  requestedNote: z.string().optional(),
});

async function vendorRequestPayout(req, res) {
  const vendor = await getMyVendor(req);
  const body = payoutRequestSchema.parse(req.body);

  const wallet = await ensureWallet(vendor._id);

  // Keep simple rule: can request payout up to current wallet balance
  if (body.amount > wallet.balance) {
    return res.status(400).json({ message: "Requested amount exceeds wallet balance" });
  }

  const pr = await PayoutRequest.create({
    vendorId: vendor._id,
    walletId: wallet._id,
    amount: Number(body.amount.toFixed(2)),
    status: "requested",
    payoutMethod: body.payoutMethod || "bank_transfer",
    payoutDetails: body.payoutDetails || {},
    requestedNote: body.requestedNote || "",
  });

  res.status(201).json({ payoutRequest: pr });
}

// GET /api/v1/wallet/me/payout-requests
async function vendorListPayoutRequests(req, res) {
  const vendor = await getMyVendor(req);
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;

  const query = { vendorId: vendor._id };

  if (req.query.status) {
    query.status = String(req.query.status);
  }

  if (req.query.from || req.query.to) {
    query.createdAt = {};
    if (req.query.from) query.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) query.createdAt.$lte = new Date(req.query.to);
  }

  const [items, total] = await Promise.all([
    PayoutRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PayoutRequest.countDocuments(query),
  ]);

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

// GET /api/v1/wallet/me/payout-requests/:payoutRequestId
async function vendorGetPayoutRequest(req, res) {
  const vendor = await getMyVendor(req);
  const payoutRequest = await PayoutRequest.findOne({
    _id: req.params.payoutRequestId,
    vendorId: vendor._id,
  }).lean();

  if (!payoutRequest) {
    return res.status(404).json({ message: "Payout request not found" });
  }

  res.json({ payoutRequest });
}

// POST /api/v1/wallet/me/payout-requests/:payoutRequestId/cancel
async function vendorCancelPayoutRequest(req, res) {
  const vendor = await getMyVendor(req);
  const payoutRequest = await PayoutRequest.findOne({
    _id: req.params.payoutRequestId,
    vendorId: vendor._id,
  });

  if (!payoutRequest) {
    return res.status(404).json({ message: "Payout request not found" });
  }

  if (payoutRequest.status !== "requested") {
    return res.status(400).json({ message: `Cannot cancel payout request in status ${payoutRequest.status}` });
  }

  payoutRequest.status = "cancelled";
  payoutRequest.reviewNote = payoutRequest.reviewNote || "Cancelled by vendor";
  await payoutRequest.save();

  res.json({ payoutRequest });
}

module.exports = {
  vendorGetWallet,
  vendorListTransactions,
  vendorRequestPayout,
  vendorListPayoutRequests,
  vendorGetPayoutRequest,
  vendorCancelPayoutRequest,
};
