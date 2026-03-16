const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Optional authentication middleware
 * If valid token provided, attaches user to req.user
 * If no token or invalid token, continues as guest
 */
async function requireAuthOptional(req, res, next) {
  const authHeader = req.headers.authorization;
  
  // No token provided - continue as guest
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.substring(7);

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    
    // Get user (without password)
    const user = await User.findById(decoded.sub)
      .select("-passwordHash")
      .lean();
    
    if (user) {
      req.user = user;
    }
  } catch (error) {
    // Token invalid - continue as guest
    // (just log in development if needed)
    if (process.env.NODE_ENV === "development") {
      console.log("Optional auth: invalid token");
    }
  }

  next();
}

module.exports = { requireAuthOptional };