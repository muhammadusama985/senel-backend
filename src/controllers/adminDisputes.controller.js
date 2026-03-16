const Dispute = require("../models/Dispute");

async function adminListDisputes(req, res) {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  if (req.query.vendorId) q.vendorId = req.query.vendorId;
  if (req.query.customerUserId) q.customerUserId = req.query.customerUserId;

  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "30", 10), 1), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Dispute.find(q).sort({ lastMessageAt: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Dispute.countDocuments(q),
  ]);

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
}

module.exports = { adminListDisputes };