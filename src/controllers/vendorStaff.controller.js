const { z } = require("zod");
const VendorStaff = require("../models/VendorStaff");
const User = require("../models/User");
const Vendor = require("../models/Vendor");
const { sendLocalizedEmail } = require("../services/localizedEmail.service");
const { logActivity } = require("./vendorActivity.controller");

const staffInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager", "editor", "viewer"]),
  notes: z.string().optional()
});

const staffUpdateSchema = z.object({
  role: z.enum(["admin", "manager", "editor", "viewer"]).optional(),
  status: z.enum(["active", "suspended", "inactive"]).optional(),
  permissions: z.array(z.string()).optional(),
  notes: z.string().optional()
});

/**
 * List all staff members for a vendor
 */
async function listStaff(req, res) {
  try {
    const vendorId = req.vendorContext.vendorId;
    const { status } = req.query;

    const query = { vendorId };
    if (status) query.status = status;

    const staff = await VendorStaff.find(query)
      .populate("userId", "email firstName lastName")
      .sort({ role: 1, createdAt: -1 })
      .lean();

    // Get owner info
    const vendor = await Vendor.findById(vendorId)
      .populate("ownerUserId", "email firstName lastName")
      .lean();

    res.json({
      owner: {
        userId: vendor.ownerUserId,
        email: vendor.ownerUserId?.email,
        role: "owner"
      },
      staff: staff.map(s => ({
        ...s,
        userId: undefined,
        user: s.userId
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Invite a new staff member
 */
async function inviteStaff(req, res) {
  try {
    const vendorId = req.vendorContext.vendorId;
    const body = staffInviteSchema.parse(req.body);

    // Only allow existing users
    const user = await User.findOne({ email: body.email });

    if (!user) {
      return res.status(400).json({
        message: "This email is not registered yet. Ask the user to sign up first."
      });
    }

    // Check if already staff
    const existing = await VendorStaff.findOne({
      vendorId,
      userId: user._id
    });

    if (existing) {
      return res.status(400).json({
        message: "User is already staff member"
      });
    }

    // Create staff record
    const staff = await VendorStaff.create({
      vendorId,
      userId: user._id,
      role: body.role,
      invitedBy: req.user._id,
      status: "pending",
      notes: body.notes || ""
    });

    // Log activity
    await logActivity({
      vendorId,
      userId: req.user._id,
      action: "STAFF_INVITED",
      entityType: "staff",
      entityId: staff._id,
      details: { email: body.email, role: body.role }
    });

    res.status(201).json({ staff });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message });
  }
}

/**
 * Update staff member
 */
async function updateStaff(req, res) {
  try {
    const { staffId } = req.params;
    const body = staffUpdateSchema.parse(req.body);

    const staff = await VendorStaff.findById(staffId);
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    // Update fields
    if (body.role) staff.role = body.role;
    if (body.status) staff.status = body.status;
    if (body.permissions) staff.permissions = body.permissions;
    if (body.notes !== undefined) staff.notes = body.notes;

    await staff.save();

    // Log activity
    await logActivity({
      vendorId: staff.vendorId,
      userId: req.user._id,
      action: "STAFF_UPDATED",
      details: { staffId, updates: body }
    });

    res.json({ staff });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message });
  }
}

/**
 * Remove staff member
 */
async function removeStaff(req, res) {
  try {
    const { staffId } = req.params;

    const staff = await VendorStaff.findById(staffId);
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    await staff.deleteOne();

    // Log activity
    await logActivity({
      vendorId: staff.vendorId,
      userId: req.user._id,
      action: "STAFF_REMOVED",
      details: { staffId, email: staff.email }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Accept invitation
 */
async function acceptInvitation(req, res) {
  try {
    const { token } = req.params;

    // Decode token to get staffId
    const staffId = decodeInviteToken(token);

    const staff = await VendorStaff.findById(staffId);
    if (!staff) {
      return res.status(404).json({ message: "Invitation not found" });
    }

    if (staff.status !== "pending") {
      return res.status(400).json({ message: "Invitation already processed" });
    }

    staff.status = "active";
    staff.acceptedAt = new Date();
    await staff.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Get my staff profile
 */
async function getMyStaffProfile(req, res) {
  try {
    const staff = await VendorStaff.findOne({
      userId: req.user._id,
      status: "active"
    }).populate("vendorId").lean();

    if (!staff) {
      return res.status(404).json({ message: "No staff profile found" });
    }

    res.json({ staff });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Helper functions (implement with JWT or similar)
function generateInviteToken(staffId) {
  return Buffer.from(JSON.stringify({ staffId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64');
}

function decodeInviteToken(token) {
  const data = JSON.parse(Buffer.from(token, 'base64').toString());
  if (data.exp < Date.now()) throw new Error("Token expired");
  return data.staffId;
}

module.exports = {
  listStaff,
  inviteStaff,
  updateStaff,
  removeStaff,
  acceptInvitation,
  getMyStaffProfile
};