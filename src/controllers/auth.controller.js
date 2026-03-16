const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const User = require("../models/User");
const { generateOtp6, hashOtp } = require("../utils/otp");
const { sendEmail } = require("../services/email.service");

const registerSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  password: z.string().min(8),
  role: z.enum(["vendor", "customer"]), // prevent creating admin from public route
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  companyName: z.string().min(1).max(160).optional(),
  taxId: z.string().min(1).max(80).optional(),
  country: z.string().min(1).max(80).optional(),
  city: z.string().min(1).max(80).optional(),
  addressLine: z.string().min(1).max(250).optional(),
  contactPhone: z.string().min(5).max(40).optional(),
  preferredLanguage: z.enum(["en", "de", "tr"]).optional(),
});

function toSafeUser(user) {
  if (!user) return null;
  return {
    id: user._id || user.id,
    role: user.role,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    companyName: user.companyName || "",
    taxId: user.taxId || "",
    country: user.country || "",
    city: user.city || "",
    addressLine: user.addressLine || "",
    contactPhone: user.contactPhone || "",
    preferredLanguage: user.preferredLanguage || "en",
    createdAt: user.createdAt,
  };
}

function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  });
}

async function register(req, res) {
  const body = registerSchema.parse(req.body);

  const where = [];
  if (body.email) where.push({ email: body.email.toLowerCase() });
  if (body.phone) where.push({ phone: body.phone });

  const existing = await User.findOne(where.length ? { $or: where } : {}).lean();
  if (existing) return res.status(409).json({ message: "User already exists" });

  const passwordHash = await bcrypt.hash(body.password, 12);

  const user = await User.create({
    email: body.email?.toLowerCase(),
    phone: body.phone,
    passwordHash,
    role: body.role,
    firstName: body.firstName || "",
    lastName: body.lastName || "",
    companyName: body.companyName || "",
    taxId: body.taxId || "",
    country: body.country || "",
    city: body.city || "",
    addressLine: body.addressLine || "",
    contactPhone: body.contactPhone || "",
    preferredLanguage: body.preferredLanguage || "en",
  });

  const token = signAccessToken(user._id.toString());
  res.status(201).json({
    accessToken: token,
    user: toSafeUser(user),
  });
}

const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  password: z.string().min(1),
});

const requestLoginOtpSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
});

const verifyLoginOtpSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  otp: z.string().min(6).max(6),
});

async function login(req, res) {
  const body = loginSchema.parse(req.body);

  const where = [];
  if (body.email) where.push({ email: body.email.toLowerCase() });
  if (body.phone) where.push({ phone: body.phone });

  if (!where.length) return res.status(400).json({ message: "email or phone is required" });

  const user = await User.findOne({ $or: where });
  if (!user) return res.status(401).json({ message: "Invalid credentials" });
  if (user.status !== "active") return res.status(403).json({ message: "Account not active" });

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Invalid credentials" });

  const token = signAccessToken(user._id.toString());
  res.json({
    accessToken: token,
    user: toSafeUser(user),
  });
}

async function requestLoginOtp(req, res) {
  const body = requestLoginOtpSchema.parse(req.body);
  const where = [];
  if (body.email) where.push({ email: body.email.toLowerCase() });
  if (body.phone) where.push({ phone: body.phone });

  if (!where.length) return res.status(400).json({ message: "email or phone is required" });

  const user = await User.findOne({ $or: where });
  if (!user || user.status !== "active") return res.json({ ok: true });

  const otp = generateOtp6();
  user.loginOtpHash = hashOtp(otp);
  user.loginOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  user.loginOtpAttempts = 0;
  await user.save();

  if (user.email) {
    await sendEmail({
      to: user.email,
      subject: "Your login OTP code",
      text: `Your Senel Express login OTP is: ${otp}. It expires in 10 minutes.`,
    });
  } else {
    // Placeholder for SMS provider integration.
    console.log(`[DEV OTP] Login OTP for ${user.phone}: ${otp}`);
  }

  return res.json({ ok: true });
}

async function verifyLoginOtp(req, res) {
  const body = verifyLoginOtpSchema.parse(req.body);
  const where = [];
  if (body.email) where.push({ email: body.email.toLowerCase() });
  if (body.phone) where.push({ phone: body.phone });

  if (!where.length) return res.status(400).json({ message: "email or phone is required" });

  const user = await User.findOne({ $or: where });
  if (!user || user.status !== "active") return res.status(401).json({ message: "Invalid OTP" });
  if (!user.loginOtpHash || !user.loginOtpExpiresAt) return res.status(400).json({ message: "OTP not requested" });
  if (user.loginOtpExpiresAt.getTime() < Date.now()) return res.status(400).json({ message: "OTP expired" });
  if ((user.loginOtpAttempts || 0) >= 5) return res.status(400).json({ message: "Too many attempts" });

  user.loginOtpAttempts = (user.loginOtpAttempts || 0) + 1;
  const isValid = user.loginOtpHash === hashOtp(body.otp);
  if (!isValid) {
    await user.save();
    return res.status(401).json({ message: "Invalid OTP" });
  }

  user.loginOtpHash = null;
  user.loginOtpExpiresAt = null;
  user.loginOtpAttempts = 0;
  await user.save();

  const token = signAccessToken(user._id.toString());
  return res.json({
    accessToken: token,
    user: toSafeUser(user),
  });
}

module.exports = { register, login, requestLoginOtp, verifyLoginOtp };
