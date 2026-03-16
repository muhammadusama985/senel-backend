const VendorStaff = require("../models/VendorStaff");
const Vendor = require("../models/Vendor");

/**
 * Check if user has staff access to a vendor
 */
async function requireVendorStaff(req, res, next) {
  try {
    const vendorId = req.vendorContext?.vendorId || req.params.vendorId;
    
    if (!vendorId) {
      return res.status(400).json({ message: "Vendor ID required" });
    }

    // Check if user is the owner
    const vendor = await Vendor.findById(vendorId).lean();
    if (vendor && vendor.ownerUserId.toString() === req.user._id.toString()) {
      // Owner has full access
      req.staffRole = "owner";
      req.staffPermissions = [];
      return next();
    }

    // Check if user is staff
    const staff = await VendorStaff.findOne({
      vendorId,
      userId: req.user._id,
      status: "active"
    }).lean();

    if (!staff) {
      return res.status(403).json({ message: "Access denied" });
    }

    req.staffRole = staff.role;
    req.staffPermissions = staff.permissions || [];
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Check if user has specific permission
 */
function requireVendorPermission(permission) {
  return (req, res, next) => {
    // Owner has all permissions
    if (req.staffRole === "owner") {
      return next();
    }

    // Check if user has the specific permission
    if (req.staffPermissions.includes(permission)) {
      return next();
    }

    return res.status(403).json({ 
      message: `Permission denied: ${permission} required` 
    });
  };
}

module.exports = { requireVendorStaff, requireVendorPermission };