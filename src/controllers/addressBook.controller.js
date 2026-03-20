const { z } = require("zod");
const CustomerAddress = require("../models/CustomerAddress");

const createSchema = z.object({
  label: z.string().optional(),
  isDefault: z.boolean().optional(),

  companyName: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),

  country: z.string().min(2),
  city: z.string().min(1),
  postalCode: z.string().optional(),

  street1: z.string().min(2),
  street2: z.string().optional(),

  notes: z.string().optional(),
});

async function listMyAddresses(req, res) {
  const items = await CustomerAddress.find({ customerUserId: req.user._id })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
  res.json({ items });
}

async function getMyAddress(req, res) {
  const addr = await CustomerAddress.findOne({ _id: req.params.id, customerUserId: req.user._id }).lean();
  if (!addr) return res.status(404).json({ message: "Address not found" });
  res.json({ address: addr });
}

async function createAddress(req, res) {
  const body = createSchema.parse(req.body);

  try {
    if (body.isDefault === true) {
      await CustomerAddress.updateMany(
        { customerUserId: req.user._id, isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    const count = await CustomerAddress.countDocuments({ customerUserId: req.user._id });
    const isDefault = count === 0 ? true : !!body.isDefault;

    const created = await CustomerAddress.create({
      customerUserId: req.user._id,
      label: body.label || (isDefault ? "Default" : "Address"),
      isDefault,

      companyName: body.companyName || "",
      contactPerson: body.contactPerson || "",
      phone: body.phone || "",

      country: body.country,
      city: body.city,
      postalCode: body.postalCode || "",

      street1: body.street1,
      street2: body.street2 || "",

      notes: body.notes || "",
    });

    res.status(201).json({ address: created });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to create address" });
  }
}

async function updateAddress(req, res) {
  const body = createSchema.partial().parse(req.body);

  try {
    const addr = await CustomerAddress.findOne({ _id: req.params.id, customerUserId: req.user._id });
    if (!addr) {
      return res.status(404).json({ message: "Address not found" });
    }

    if (body.isDefault === true) {
      await CustomerAddress.updateMany(
        { customerUserId: req.user._id, isDefault: true },
        { $set: { isDefault: false } }
      );
      addr.isDefault = true;
    } else if (body.isDefault === false) {
      const count = await CustomerAddress.countDocuments({ customerUserId: req.user._id });
      if (count > 1) addr.isDefault = false;
    }

    const fields = [
      "label",
      "companyName",
      "contactPerson",
      "phone",
      "country",
      "city",
      "postalCode",
      "street1",
      "street2",
      "notes",
    ];

    for (const f of fields) {
      if (body[f] !== undefined) addr[f] = body[f];
    }

    await addr.save();

    const anyDefault = await CustomerAddress.countDocuments({
      customerUserId: req.user._id,
      isDefault: true,
    });

    if (!anyDefault) {
      const newest = await CustomerAddress.findOne({ customerUserId: req.user._id }).sort({ createdAt: -1 });
      if (newest) {
        newest.isDefault = true;
        await newest.save();
      }
    }

    res.json({ address: addr });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to update address" });
  }
}

async function deleteAddress(req, res) {
  try {
    const addr = await CustomerAddress.findOne({ _id: req.params.id, customerUserId: req.user._id });
    if (!addr) {
      return res.status(404).json({ message: "Address not found" });
    }

    const wasDefault = addr.isDefault;
    await CustomerAddress.deleteOne({ _id: addr._id });

    if (wasDefault) {
      const next = await CustomerAddress.findOne({ customerUserId: req.user._id }).sort({ createdAt: -1 });
      if (next) {
        next.isDefault = true;
        await next.save();
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to delete address" });
  }
}

async function setDefaultAddress(req, res) {
  try {
    const addr = await CustomerAddress.findOne({ _id: req.params.id, customerUserId: req.user._id });
    if (!addr) {
      return res.status(404).json({ message: "Address not found" });
    }

    await CustomerAddress.updateMany(
      { customerUserId: req.user._id, isDefault: true },
      { $set: { isDefault: false } }
    );

    addr.isDefault = true;
    await addr.save();

    res.json({ address: addr });
  } catch (err) {
    res.status(500).json({ message: err.message || "Failed to set default address" });
  }
}

module.exports = {
  listMyAddresses,
  getMyAddress,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
};
