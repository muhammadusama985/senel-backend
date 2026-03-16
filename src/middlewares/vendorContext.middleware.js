const Vendor = require("../models/Vendor");

async function loadVendorContext(req, res, next) {
  try {
    // req.user._id is set by requireAuth middleware (this is the user's ID)
    const vendor = await Vendor.findOne({ ownerUserId: req.user._id }).lean();
    
    if (!vendor) {
      return res.status(403).json({ message: "Vendor profile not found" });
    }
    
    // Check if vendor is approved (optional - you can decide if unapproved vendors can manage inventory)
    if (vendor.status !== "approved") {
      return res.status(403).json({ message: "Vendor account not approved" });
    }
    
    // Attach vendor context to request
    req.vendorContext = {
      vendorId: vendor._id,
      vendor: vendor
    };
    
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { loadVendorContext };