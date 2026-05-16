const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const PasswordResetToken = require("../models/PasswordResetToken");
const { sendEmail } = require("../services/email.service");
const { generateOtp6, hashOtp } = require("../utils/otp");
const authController = require("../controllers/auth.controller");

// Helper functions
function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  });
}

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
    status: user.status,
    createdAt: user.createdAt,
  };
}

// ============================================
// GOOGLE OAUTH
// ============================================

// Generate Google OAuth URL
router.get("/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const redirectUri = `${baseUrl}/google-callback`;
  
  if (!clientId) {
    return res.status(500).json({ message: "Google OAuth not configured. Please set GOOGLE_CLIENT_ID in .env" });
  }

  const scopes = encodeURIComponent("email profile");
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${scopes}` +
    `&access_type=offline` +
    `&prompt=select_account`;

  res.json({ authUrl });
});

// Google OAuth Callback
router.post("/google/callback", async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ message: "Authorization code required" });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUri = `${baseUrl}/google-callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("Google token exchange error:", errorData);
      return res.status(401).json({ message: "Google authentication failed" });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user info from Google
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoResponse.ok) {
      return res.status(401).json({ message: "Failed to get user info from Google" });
    }

    const googleUser = await userInfoResponse.json();
    const { email, name, picture, id: googleId } = googleUser;

    // Find or create user
    let user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      // Create new user from Google
      const names = (name || "").split(" ");
      user = await User.create({
        email: email.toLowerCase(),
        passwordHash: await bcrypt.hash(googleId + Date.now(), 12), // Random password
        role: "customer",
        firstName: names[0] || "",
        lastName: names.slice(1).join(" ") || "",
        status: "active",
        isVerifiedBusiness: true,
        googleId: googleId,
      });
    } else {
      // Update Google ID if not set
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save();
      }
    }

    // Generate JWT
    const jwtToken = signAccessToken(user._id.toString());

    res.json({
      accessToken: jwtToken,
      user: toSafeUser(user),
      googlePicture: picture,
    });
  } catch (error) {
    console.error("Google OAuth error:", error);
    res.status(500).json({ message: "Google authentication failed" });
  }
});

// ============================================
// FORGOT PASSWORD
// ============================================

const OTP_TTL_MINUTES = 10;
const MAX_ACTIVE_TOKENS = 3;
const FORGOT_COOLDOWN_SECONDS = 60;

// Request password reset (send OTP)
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const emailLower = email.trim().toLowerCase();

    // Check if email is registered
    const user = await User.findOne({ email: emailLower }).lean();
    if (!user) {
      return res.status(404).json({ message: "Email not found. Please check your email address or register a new account." });
    }

    // Check if account is active
    if (user.status !== "active") {
      return res.status(403).json({ message: "This account is not active. Please contact support." });
    }

    // Cleanup old tokens
    await PasswordResetToken.updateMany(
      { email: emailLower, status: "active", expiresAt: { $lt: new Date() } },
      { $set: { status: "expired" } }
    );

    const activeCount = await PasswordResetToken.countDocuments({ email: emailLower, status: "active" });
    if (activeCount >= MAX_ACTIVE_TOKENS) {
      return res.status(429).json({ message: "Too many reset requests. Please try again later." });
    }

    // Check cooldown
    const last = await PasswordResetToken.findOne({ email: emailLower, status: "active" }).sort({ createdAt: -1 });
    if (last?.lastSentAt) {
      const since = (Date.now() - last.lastSentAt.getTime()) / 1000;
      if (since < FORGOT_COOLDOWN_SECONDS) {
        return res.status(429).json({ message: "Please wait before requesting another reset." });
      }
    }

    const otp = generateOtp6();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await PasswordResetToken.create({
      email: emailLower,
      otpHash,
      expiresAt,
      attempts: 0,
      maxAttempts: 5,
      resendCount: 0,
      lastSentAt: new Date(),
      status: "active",
    });

    await sendEmail({
      to: emailLower,
      subject: "Senel Express - Password Reset Code",
      text: `Your password reset code is: ${otp}\n\nThis code expires in ${OTP_TTL_MINUTES} minutes.\n\nIf you did not request this, please ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You requested a password reset for your Senel Express account.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <p style="font-size: 14px; margin: 0 0 10px 0; color: #666;">Your verification code:</p>
            <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; margin: 0; color: #333;">${otp}</p>
          </div>
          <p style="color: #666; font-size: 12px;">This code expires in ${OTP_TTL_MINUTES} minutes.</p>
          <p style="color: #666; font-size: 12px;">If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    res.json({ ok: true, message: "Password reset code sent to your email." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Failed to send reset code" });
  }
});

// Resend password reset OTP
router.post("/forgot-password/resend", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const emailLower = email.trim().toLowerCase();

    // Check if email is registered
    const user = await User.findOne({ email: emailLower }).lean();
    if (!user) {
      return res.status(404).json({ message: "Email not found. Please check your email address or register a new account." });
    }

    const token = await PasswordResetToken.findOne({ email: emailLower, status: "active" }).sort({ createdAt: -1 });
    if (!token) return res.status(404).json({ message: "No active reset request found. Please request a new reset code." });

    if (token.expiresAt.getTime() < Date.now()) {
      token.status = "expired";
      await token.save();
      return res.status(400).json({ message: "Previous reset code has expired. Please request a new one." });
    }

    // Cooldown
    if (token.lastSentAt) {
      const since = (Date.now() - token.lastSentAt.getTime()) / 1000;
      if (since < FORGOT_COOLDOWN_SECONDS) return res.status(429).json({ message: "Please wait before resending." });
    }

    if (token.resendCount >= 3) return res.status(429).json({ message: "Maximum resend limit reached. Please request a new reset code." });

    const otp = generateOtp6();
    token.otpHash = hashOtp(otp);
    token.resendCount += 1;
    token.lastSentAt = new Date();
    token.attempts = 0;
    await token.save();

    await sendEmail({
      to: emailLower,
      subject: "Senel Express - New Password Reset Code",
      text: `Your new password reset code is: ${otp}\n\nThis code expires in ${OTP_TTL_MINUTES} minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Password Reset Code</h2>
          <p>You requested a new password reset code.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <p style="font-size: 14px; margin: 0 0 10px 0; color: #666;">Your verification code:</p>
            <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; margin: 0; color: #333;">${otp}</p>
          </div>
          <p style="color: #666; font-size: 12px;">This code expires in ${OTP_TTL_MINUTES} minutes.</p>
        </div>
      `,
    });

    res.json({ ok: true, message: "New reset code sent to your email." });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ message: "Failed to resend code" });
  }
});

// Verify OTP and reset password
router.post("/forgot-password/reset", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP, and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const emailLower = email.trim().toLowerCase();
    const user = await User.findOne({ email: emailLower });
    if (!user) return res.json({ ok: true });

    const token = await PasswordResetToken.findOne({ email: emailLower, status: "active" }).sort({ createdAt: -1 });
    if (!token) return res.status(400).json({ message: "Invalid or expired code" });

    if (token.expiresAt.getTime() < Date.now()) {
      token.status = "expired";
      await token.save();
      return res.status(400).json({ message: "Code has expired. Please request a new one." });
    }

    if (token.status === "locked") {
      return res.status(400).json({ message: "Too many attempts. Please try again later." });
    }

    token.attempts += 1;

    const ok = token.otpHash === hashOtp(otp);
    if (!ok) {
      if (token.attempts >= token.maxAttempts) {
        token.status = "locked";
      }
      await token.save();
      return res.status(400).json({ message: "Invalid code. Please check and try again." });
    }

    // Valid OTP - set new password
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();

    token.status = "used";
    token.usedAt = new Date();
    await token.save();

    res.json({ ok: true, message: "Password reset successfully. You can now login with your new password." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Failed to reset password" });
  }
});

// Register and Login routes using the controller
router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/me", authController.me);

module.exports = router;