const { z } = require("zod");
const Review = require("../models/Review");
const AuditLog = require("../models/AuditLog");

// GET /api/v1/admin/reviews?status=pending
async function adminListReviews(req, res) {
  const { status, productId, vendorId } = req.query;

  const q = {};
  if (status) q.status = status;
  if (productId) q.productId = productId;
  if (vendorId) q.vendorId = vendorId;

  const items = await Review.find(q).sort({ createdAt: -1 }).lean();
  res.json({ items });
}

const moderateSchema = z.object({
  status: z.enum(["approved", "rejected", "hidden"]),
  note: z.string().optional(),
});

// POST /api/v1/admin/reviews/:reviewId/moderate
async function adminModerateReview(req, res) {
  const body = moderateSchema.parse(req.body);
  const reviewId = req.params.reviewId;

  const review = await Review.findById(reviewId);
  if (!review) return res.status(404).json({ message: "Review not found" });

  review.status = body.status;
  review.moderationNote = body.note || "";
  review.moderatedByAdminId = req.user._id;
  review.moderatedAt = new Date();
  await review.save();

  await AuditLog.create({
    actorUserId: req.user._id,
    action: "REVIEW_MODERATED",
    entityType: "Review",
    entityId: review._id,
    meta: { status: body.status, note: review.moderationNote },
  });

  res.json({ review });
}

module.exports = { adminListReviews, adminModerateReview };