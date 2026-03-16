const crypto = require("crypto");

function generateOtp6() {
  // 6-digit numeric string
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

module.exports = { generateOtp6, hashOtp };