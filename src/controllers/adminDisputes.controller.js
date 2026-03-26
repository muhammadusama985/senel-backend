const Dispute = require("../models/Dispute");
const User = require("../models/User");
const Vendor = require("../models/Vendor");

function formatCustomerLabel(user) {
  if (!user) return "-";
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || user.email || user.phone || "Customer";
}

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

  const customerIds = [...new Set(items.map((item) => String(item.customerUserId || "")).filter(Boolean))];
  const vendorIds = [...new Set(items.map((item) => String(item.vendorId || "")).filter(Boolean))];

  const [customers, vendors] = await Promise.all([
    customerIds.length
      ? User.find({ _id: { $in: customerIds } }).select("_id firstName lastName email phone").lean()
      : [],
    vendorIds.length
      ? Vendor.find({ _id: { $in: vendorIds } }).select("_id storeName").lean()
      : [],
  ]);

  const customerMap = new Map(customers.map((user) => [String(user._id), formatCustomerLabel(user)]));
  const vendorMap = new Map(vendors.map((vendor) => [String(vendor._id), vendor.storeName || "Vendor"]));

  const enrichedItems = items.map((item) => ({
    ...item,
    customerLabel: customerMap.get(String(item.customerUserId || "")) || "-",
    vendorLabel: item.vendorId
      ? (vendorMap.get(String(item.vendorId)) || "Vendor")
      : "Senel Admin",
  }));

  res.json({ page, limit, total, pages: Math.ceil(total / limit), items: enrichedItems });
}

module.exports = { adminListDisputes };
