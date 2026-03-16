const { z } = require("zod");
const PasswordResetToken = require("../models/PasswordResetToken");

async function adminListPasswordResetTokens(req, res) {
  const schema = z.object({
    email: z.string().optional(),
    status: z.string().optional(),
    limit: z.string().optional(),
  });

  const qp = schema.parse(req.query);
  const limit = Math.min(Math.max(parseInt(qp.limit || "50", 10), 1), 200);
  const query = {};

  if (qp.email) query.email = qp.email.trim().toLowerCase();
  if (qp.status) query.status = qp.status;

  const items = await PasswordResetToken.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({ items });
}

async function adminUpdatePasswordResetToken(req, res) {
  const body = z.object({
    status: z.enum(["active", "expired", "locked"]),
  }).parse(req.body);

  const token = await PasswordResetToken.findById(req.params.tokenId);
  if (!token) return res.status(404).json({ message: "Password reset token not found" });

  token.status = body.status;
  await token.save();

  res.json({ token });
}

module.exports = {
  adminListPasswordResetTokens,
  adminUpdatePasswordResetToken,
};
