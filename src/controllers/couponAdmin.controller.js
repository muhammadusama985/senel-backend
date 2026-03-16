const { z } = require("zod");
const Coupon = require("../models/Coupon");
const Vendor = require("../models/Vendor");
const AuditLog = require("../models/AuditLog");

const createSchema = z.object({
  code: z.string().min(3).transform((v) => v.trim().toUpperCase()),
  scope: z.enum(["global", "vendor"]),
  vendorId: z.string().nullable().optional(),
  discountType: z.enum(["percent", "fixed"]),
  value: z.number().min(0),
  minSubtotal: z.number().min(0).optional(),
  maxDiscount: z.number().min(0).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimitTotal: z.number().int().min(0).optional(),
  usageLimitPerUser: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

async function adminCreateCoupon(req, res) {
  const body = createSchema.parse(req.body);

  if (body.scope === "vendor") {
    if (!body.vendorId) return res.status(400).json({ message: "vendorId required for vendor coupon" });
    const v = await Vendor.findById(body.vendorId).lean();
    if (!v) return res.status(400).json({ message: "Invalid vendorId" });
  }

  if (body.discountType === "percent" && body.value > 100) {
    return res.status(400).json({ message: "Percent value cannot exceed 100" });
  }

  const coupon = await Coupon.create({
    code: body.code,
    scope: body.scope,
    vendorId: body.scope === "vendor" ? body.vendorId : null,
    discountType: body.discountType,
    value: body.value,
    minSubtotal: body.minSubtotal ?? 0,
    maxDiscount: body.maxDiscount ?? 0,
    startsAt: body.startsAt ? new Date(body.startsAt) : null,
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
    usageLimitTotal: body.usageLimitTotal ?? 0,
    usageLimitPerUser: body.usageLimitPerUser ?? 0,
    isActive: body.isActive ?? true,
  });

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "COUPON_CREATED",
    entityType: "Coupon",
    entityId: coupon._id,
    meta: { code: coupon.code, scope: coupon.scope, vendorId: coupon.vendorId || null },
  });

  res.status(201).json({ coupon });
}

async function adminListCoupons(req, res) {
  const { scope, vendorId, active } = req.query;

  const q = {};
  if (scope) q.scope = scope;
  if (vendorId) q.vendorId = vendorId;
  if (active === "true") q.isActive = true;
  if (active === "false") q.isActive = false;

  const items = await Coupon.find(q).sort({ createdAt: -1 }).lean();
  res.json({ items });
}

const updateSchema = createSchema.partial();

async function adminUpdateCoupon(req, res) {
  const body = updateSchema.parse(req.body);
  const id = req.params.couponId;

  const coupon = await Coupon.findById(id);
  if (!coupon) return res.status(404).json({ message: "Coupon not found" });

  if (body.code !== undefined) coupon.code = body.code;

  if (body.scope !== undefined) coupon.scope = body.scope;
  if (body.vendorId !== undefined) coupon.vendorId = body.vendorId;

  if (coupon.scope === "vendor" && !coupon.vendorId) {
    return res.status(400).json({ message: "vendorId required for vendor coupon" });
  }

  if (body.discountType !== undefined) coupon.discountType = body.discountType;
  if (body.value !== undefined) coupon.value = body.value;

  if (coupon.discountType === "percent" && coupon.value > 100) {
    return res.status(400).json({ message: "Percent value cannot exceed 100" });
  }

  if (body.minSubtotal !== undefined) coupon.minSubtotal = body.minSubtotal;
  if (body.maxDiscount !== undefined) coupon.maxDiscount = body.maxDiscount;

  if (body.startsAt !== undefined) coupon.startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (body.endsAt !== undefined) coupon.endsAt = body.endsAt ? new Date(body.endsAt) : null;

  if (body.usageLimitTotal !== undefined) coupon.usageLimitTotal = body.usageLimitTotal;
  if (body.usageLimitPerUser !== undefined) coupon.usageLimitPerUser = body.usageLimitPerUser;

  if (body.isActive !== undefined) coupon.isActive = body.isActive;

  await coupon.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "COUPON_UPDATED",
    entityType: "Coupon",
    entityId: coupon._id,
    meta: { updates: body },
  });

  res.json({ coupon });
}

module.exports = { adminCreateCoupon, adminListCoupons, adminUpdateCoupon };