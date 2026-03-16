const { z } = require("zod");
const PreferredSupplier = require("../models/PreferredSupplier");
const Vendor = require("../models/Vendor");

const addSchema = z.object({ vendorId: z.string().min(1) });

async function listPreferred(req, res) {
  const items = await PreferredSupplier.find({ customerUserId: req.user._id }).sort({ createdAt: -1 }).lean();
  const vendorIds = items.map((i) => i.vendorId);
  const vendors = await Vendor.find({ _id: { $in: vendorIds } }).lean();
  const map = new Map(vendors.map((v) => [String(v._id), v]));

  res.json({
    items: items.map((i) => ({ ...i, vendor: map.get(String(i.vendorId)) || null })),
  });
}

async function addPreferred(req, res) {
  const body = addSchema.parse(req.body);

  const vendor = await Vendor.findById(body.vendorId).lean();
  if (!vendor || vendor.status !== "approved") return res.status(400).json({ message: "Vendor not available" });

  try {
    const item = await PreferredSupplier.create({ customerUserId: req.user._id, vendorId: vendor._id });
    res.status(201).json({ item });
  } catch (e) {
    if (String(e.code) === "11000") return res.status(200).json({ message: "Already saved" });
    throw e;
  }
}

async function removePreferred(req, res) {
  await PreferredSupplier.deleteOne({ customerUserId: req.user._id, vendorId: req.params.vendorId });
  res.json({ ok: true });
}

async function isPreferred(req, res) {
  const exists = await PreferredSupplier.exists({ customerUserId: req.user._id, vendorId: req.params.vendorId });
  res.json({ isPreferred: !!exists });
}

module.exports = { listPreferred, addPreferred, removePreferred, isPreferred };