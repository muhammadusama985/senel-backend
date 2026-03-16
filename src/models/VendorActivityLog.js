const mongoose = require("mongoose");

const ACTIVITY_TYPES = [
  "PRODUCT_CREATED",
  "PRODUCT_UPDATED",
  "PRODUCT_DELETED",
  "PRODUCT_APPROVED",
  "PRODUCT_REJECTED",
  "ORDER_ACCEPTED",
  "ORDER_PACKED",
  "ORDER_READY_PICKUP",
  "ORDER_SHIPPED",
  "ORDER_DELIVERED",
  "INVENTORY_UPDATED",
  "LOW_STOCK_ALERT",
  "PAYOUT_REQUESTED",
  "PAYOUT_RECEIVED",
  "STAFF_INVITED",
  "STAFF_UPDATED",
  "STAFF_REMOVED",
  "DISPUTE_REPLIED",
  "DISPUTE_RESOLVED",
  "SETTINGS_UPDATED",
  "BULK_IMPORT_STARTED",
  "BULK_IMPORT_COMPLETED",
  "BULK_IMPORT_FAILED",
  "LOGIN",
  "LOGOUT"
];

const vendorActivityLogSchema = new mongoose.Schema(
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
      index: true 
    },
    
    userRole: { 
      type: String, 
      enum: ["owner", "admin", "manager", "editor", "viewer"],
      required: true 
    },
    
    action: { 
      type: String, 
      enum: ACTIVITY_TYPES,
      required: true,
      index: true 
    },
    
    entityType: { 
      type: String, 
      enum: ["product", "order", "inventory", "payout", "staff", "dispute", "setting"],
      index: true 
    },
    
    entityId: { 
      type: mongoose.Schema.Types.ObjectId 
    },
    
    details: { 
      type: Object, 
      default: {} 
    },
    
    ipAddress: { 
      type: String 
    },
    
    userAgent: { 
      type: String 
    }
  },
  { timestamps: true }
);

// Compound indexes for efficient querying
vendorActivityLogSchema.index({ vendorId: 1, createdAt: -1 });
vendorActivityLogSchema.index({ vendorId: 1, action: 1, createdAt: -1 });
vendorActivityLogSchema.index({ vendorId: 1, userId: 1, createdAt: -1 });

module.exports = mongoose.model("VendorActivityLog", vendorActivityLogSchema);