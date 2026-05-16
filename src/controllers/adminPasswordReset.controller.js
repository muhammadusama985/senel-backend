const { z } = require("zod");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const PasswordResetToken = require("../models/PasswordResetToken");

// Password validation regex patterns
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 50;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,50}$/;

function validatePassword(password) {
  const errors = [];
  
  if (!password) {
    errors.push("Password is required");
    return errors;
  }
  
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
  }
  
  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Password must not exceed ${PASSWORD_MAX_LENGTH} characters`);
  }
  
  if (!/(?=.*[a-z])/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  
  if (!/(?=.*\d)/.test(password)) {
    errors.push("Password must contain at least one number");
  }
  
  if (!/(?=.*[!@#$%^&*(),.?":{}|<>])/.test(password)) {
    errors.push("Password must contain at least one special character (!@#$%^&*(),.?\":{}|<>)");
  }
  
  return errors;
}

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

async function adminChangePassword(req, res) {
  const schema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(1, "New password is required"),
    confirmPassword: z.string().min(1, "Confirm password is required"),
  });

  const body = schema.parse(req.body);

  // Check if new passwords match
  if (body.newPassword !== body.confirmPassword) {
    return res.status(400).json({ message: "New password and confirm password do not match" });
  }

  // Validate new password strength
  const passwordErrors = validatePassword(body.newPassword);
  if (passwordErrors.length > 0) {
    return res.status(400).json({ 
      message: "Password does not meet requirements",
      errors: passwordErrors 
    });
  }

  // Find the admin user
  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  // Verify current password
  const isPasswordValid = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!isPasswordValid) {
    return res.status(400).json({ message: "Current password is incorrect" });
  }

  // Check that new password is different from current password
  const isSamePassword = await bcrypt.compare(body.newPassword, user.passwordHash);
  if (isSamePassword) {
    return res.status(400).json({ message: "New password must be different from current password" });
  }

  // Hash and save new password
  const salt = await bcrypt.genSalt(10);
  user.passwordHash = await bcrypt.hash(body.newPassword, salt);
  await user.save();

  res.json({ 
    success: true, 
    message: "Password changed successfully" 
  });
}

module.exports = {
  adminListPasswordResetTokens,
  adminUpdatePasswordResetToken,
  adminChangePassword,
};