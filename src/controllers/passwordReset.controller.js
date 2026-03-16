const { z } = require("zod");
const bcrypt = require('bcrypt');

const User = require("../models/User");
const PasswordResetToken = require("../models/PasswordResetToken");

const { generateOtp6, hashOtp } = require("../utils/otp");
const { sendEmail } = require("../services/email.service");

const FORGOT_COOLDOWN_SECONDS = 60;     // 1 minute resend cooldown
const OTP_TTL_MINUTES = 10;             // OTP valid duration
const MAX_ACTIVE_TOKENS = 3;            // prevent spam creating infinite tokens

const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({
  email: z.string().email(),
  otp: z.string().min(6).max(6),
  newPassword: z.string().min(8),
});

async function forgotPassword(req, res) {
  const body = forgotSchema.parse(req.body);
  const email = body.email.trim().toLowerCase();

  // Always respond OK (don’t leak user existence)
  const user = await User.findOne({ email }).lean();
  if (!user) return res.json({ ok: true });

  // cleanup old tokens
  await PasswordResetToken.updateMany(
    { email, status: "active", expiresAt: { $lt: new Date() } },
    { $set: { status: "expired" } }
  );

  const activeCount = await PasswordResetToken.countDocuments({ email, status: "active" });
  if (activeCount >= MAX_ACTIVE_TOKENS) return res.json({ ok: true });

  // If last token exists and just sent, enforce cooldown
  const last = await PasswordResetToken.findOne({ email, status: "active" }).sort({ createdAt: -1 });
  if (last?.lastSentAt) {
    const since = (Date.now() - last.lastSentAt.getTime()) / 1000;
    if (since < FORGOT_COOLDOWN_SECONDS) return res.json({ ok: true });
  }

  const otp = generateOtp6();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const token = await PasswordResetToken.create({
    email,
    otpHash,
    expiresAt,
    attempts: 0,
    maxAttempts: 5,
    resendCount: 0,
    lastSentAt: new Date(),
    status: "active",
  });

  await sendEmail({
    to: email,
    subject: "Password reset code",
    text: `Your password reset code is: ${otp}\nThis code expires in ${OTP_TTL_MINUTES} minutes.`,
  });

  res.json({ ok: true });
}

async function resendOtp(req, res) {
  const body = forgotSchema.parse(req.body);
  const email = body.email.trim().toLowerCase();

  const user = await User.findOne({ email }).lean();
  if (!user) return res.json({ ok: true });

  const token = await PasswordResetToken.findOne({ email, status: "active" }).sort({ createdAt: -1 });
  if (!token) return res.json({ ok: true });

  if (token.expiresAt.getTime() < Date.now()) {
    token.status = "expired";
    await token.save();
    return res.json({ ok: true });
  }

  // cooldown
  if (token.lastSentAt) {
    const since = (Date.now() - token.lastSentAt.getTime()) / 1000;
    if (since < FORGOT_COOLDOWN_SECONDS) return res.json({ ok: true });
  }

  // resend limit (optional)
  if (token.resendCount >= 3) return res.json({ ok: true });

  const otp = generateOtp6();
  token.otpHash = hashOtp(otp);
  token.resendCount += 1;
  token.lastSentAt = new Date();
  token.attempts = 0;
  await token.save();

  await sendEmail({
    to: email,
    subject: "Password reset code (resend)",
    text: `Your password reset code is: ${otp}\nThis code expires in ${OTP_TTL_MINUTES} minutes.`,
  });

  res.json({ ok: true });
}

async function resetPassword(req, res) {
  const body = resetSchema.parse(req.body);
  const email = body.email.trim().toLowerCase();

  const user = await User.findOne({ email });
  // don’t leak; same response
  if (!user) return res.json({ ok: true });

  const token = await PasswordResetToken.findOne({ email, status: "active" }).sort({ createdAt: -1 });
  if (!token) return res.status(400).json({ message: "Invalid or expired code" });

  if (token.expiresAt.getTime() < Date.now()) {
    token.status = "expired";
    await token.save();
    return res.status(400).json({ message: "Invalid or expired code" });
  }

  if (token.status === "locked") return res.status(400).json({ message: "Too many attempts. Try again later." });

  token.attempts += 1;

  const ok = token.otpHash === hashOtp(body.otp);
  if (!ok) {
    if (token.attempts >= token.maxAttempts) {
      token.status = "locked";
    }
    await token.save();
    return res.status(400).json({ message: "Invalid or expired code" });
  }

  // OTP valid → set new password
  const salt = await bcrypt.genSalt(10);
  user.passwordHash = await bcrypt.hash(body.newPassword, salt);

  await user.save();

  token.status = "used";
  token.usedAt = new Date();
  await token.save();

  res.json({ ok: true });
}

module.exports = { forgotPassword, resetPassword, resendOtp };