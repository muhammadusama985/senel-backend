const User = require("../models/User");
const Vendor = require("../models/Vendor");

async function resolveRecipients(target) {
  const scope = target?.scope || "all";

  // Custom: explicit users
  if (scope === "custom") {
    const ids = (target.userIds || []).map(String);
    return Array.from(new Set(ids));
  }

  // Vendors: include vendor owner + team members
  if (scope === "vendors") {
    const vendorIds = (target.vendorIds || []).length
      ? target.vendorIds
      : (await Vendor.find({}).select({ _id: 1 }).lean()).map(v => v._id);

    const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select({ ownerUserId: 1 }).lean();

    const set = new Set();
    vendors.forEach(v => v.ownerUserId && set.add(String(v.ownerUserId)));
    return Array.from(set);
  }

  // Customers/Admins/All from Users collection
  const q = {};
  if (scope === "customers") q.role = "customer";
  if (scope === "admins") q.role = "admin";
  // all => no filter

  const users = await User.find(q).select({ _id: 1 }).lean();
  return users.map(u => String(u._id));
}

module.exports = { resolveRecipients };