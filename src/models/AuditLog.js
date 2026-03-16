const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, // admin
    action: { type: String, required: true, trim: true, index: true }, // e.g. "VENDOR_APPROVED"
    entityType: { type: String, required: true, trim: true, index: true }, // e.g. "Vendor"
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);