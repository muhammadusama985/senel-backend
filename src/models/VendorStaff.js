const mongoose = require("mongoose");

const VENDOR_STAFF_ROLES = [
  "owner",      // Full access - can do everything
  "admin",      // Can manage products, orders, staff
  "manager",    // Can manage products and orders
  "editor",     // Can edit products only
  "viewer"      // Read-only access
];

const VENDOR_STAFF_PERMISSIONS = {
  owner: [
    "manage_staff", "manage_products", "manage_orders", 
    "manage_inventory", "view_analytics", "manage_payouts",
    "manage_settings", "reply_disputes", "export_data"
  ],
  admin: [
    "manage_products", "manage_orders", "manage_inventory",
    "view_analytics", "reply_disputes", "export_data"
  ],
  manager: [
    "manage_products", "manage_orders", "manage_inventory",
    "view_analytics"
  ],
  editor: [
    "edit_products", "view_orders", "view_inventory"
  ],
  viewer: [
    "view_products", "view_orders", "view_analytics"
  ]
};

const vendorStaffSchema = new mongoose.Schema(
  {
    vendorId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Vendor", 
      required: true,
      index: true 
    },
    
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true,
      unique: true, // One user can only be staff for one vendor
      index: true 
    },
    
    role: { 
      type: String, 
      enum: VENDOR_STAFF_ROLES,
      default: "viewer",
      index: true 
    },
    
    permissions: [{
      type: String,
      enum: Object.values(VENDOR_STAFF_PERMISSIONS).flat()
    }],
    
    invitedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    },
    
    invitedAt: { 
      type: Date, 
      default: Date.now 
    },
    
    acceptedAt: { 
      type: Date 
    },
    
    status: { 
      type: String, 
      enum: ["pending", "active", "suspended", "inactive"],
      default: "pending",
      index: true 
    },
    
    lastActiveAt: { 
      type: Date 
    },
    
    notes: { 
      type: String, 
      default: "" 
    }
  },
  { timestamps: true }
);

// Compound index for vendor queries
vendorStaffSchema.index({ vendorId: 1, status: 1 });
vendorStaffSchema.index({ vendorId: 1, role: 1 });

module.exports = mongoose.model("VendorStaff", vendorStaffSchema);