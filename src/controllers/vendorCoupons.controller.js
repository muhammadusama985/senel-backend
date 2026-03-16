const { z } = require("zod");
const Coupon = require("../models/Coupon");
const AuditLog = require("../models/AuditLog");

const couponSchema = z.object({
  code: z.string().min(3).max(32),
  discountType: z.enum(["percent", "fixed"]),
  value: z.number().positive(),
  minSubtotal: z.number().min(0).optional(),
  maxDiscount: z.number().min(0).optional(),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  usageLimitTotal: z.number().min(0).optional(),
  usageLimitPerUser: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

async function vendorListCoupons(req, res) {
  const items = await Coupon.find({
    scope: "vendor",
    vendorId: req.vendorContext.vendorId,
  })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ items });
}

async function vendorCreateCoupon(req, res) {
  const body = couponSchema.parse(req.body);

  if (body.discountType === "percent" && body.value > 100) {
    return res.status(400).json({ message: "Percent discount cannot exceed 100" });
  }

  const coupon = await Coupon.create({
    code: body.code.trim().toUpperCase(),
    scope: "vendor",
    vendorId: req.vendorContext.vendorId,
    discountType: body.discountType,
    value: body.value,
    minSubtotal: body.minSubtotal || 0,
    maxDiscount: body.maxDiscount || 0,
    startsAt: body.startsAt ? new Date(body.startsAt) : null,
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
    usageLimitTotal: body.usageLimitTotal || 0,
    usageLimitPerUser: body.usageLimitPerUser || 0,
    isActive: body.isActive ?? true,
  });

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "VENDOR_COUPON_CREATED",
    entityType: "Coupon",
    entityId: coupon._id,
    meta: { code: coupon.code, vendorId: req.vendorContext.vendorId },
  });

  res.status(201).json({ coupon });
}

async function vendorUpdateCoupon(req, res) {
  const body = couponSchema.partial().parse(req.body);
  const coupon = await Coupon.findOne({
    _id: req.params.couponId,
    scope: "vendor",
    vendorId: req.vendorContext.vendorId,
  });

  if (!coupon) return res.status(404).json({ message: "Coupon not found" });

  if (body.code !== undefined) coupon.code = body.code.trim().toUpperCase();
  if (body.discountType !== undefined) coupon.discountType = body.discountType;
  if (body.value !== undefined) coupon.value = body.value;
  if (body.minSubtotal !== undefined) coupon.minSubtotal = body.minSubtotal;
  if (body.maxDiscount !== undefined) coupon.maxDiscount = body.maxDiscount;
  if (body.startsAt !== undefined) coupon.startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (body.endsAt !== undefined) coupon.endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if (body.usageLimitTotal !== undefined) coupon.usageLimitTotal = body.usageLimitTotal;
  if (body.usageLimitPerUser !== undefined) coupon.usageLimitPerUser = body.usageLimitPerUser;
  if (body.isActive !== undefined) coupon.isActive = body.isActive;

  if (coupon.discountType === "percent" && coupon.value > 100) {
    return res.status(400).json({ message: "Percent discount cannot exceed 100" });
  }

  await coupon.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "VENDOR_COUPON_UPDATED",
    entityType: "Coupon",
    entityId: coupon._id,
    meta: { code: coupon.code, vendorId: req.vendorContext.vendorId },
  });

  res.json({ coupon });
}

module.exports = {
  vendorListCoupons,
  vendorCreateCoupon,
  vendorUpdateCoupon,
};
