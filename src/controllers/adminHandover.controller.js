const { z } = require("zod");
const VendorOrder = require("../models/VendorOrder");
const Order = require("../models/Order");
const { notifyUser, notifyVendorOwner } = require("../services/notification.service"); // ✅ Use existing

// Schema for updating handover status
const statusSchema = z.object({
  status: z.enum(["picked_up", "in_transit", "delivered"]),
  note: z.string().optional(),
  tracking: z.object({
    carrier: z.string().optional(),
    trackingNumber: z.string().optional(),
    trackingUrl: z.string().optional(),
  }).optional(),
});

const schedulePickupSchema = z.object({
  scheduledAt: z.string().datetime(),
  pickupWindow: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Admin lists all orders ready for pickup
 */
async function adminListReadyForPickup(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);
    const skip = (page - 1) * limit;

    const query = { handoverStatus: "ready_for_pickup" };

    const [items, total] = await Promise.all([
      VendorOrder.find(query)
        .sort({ readyForPickupAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      VendorOrder.countDocuments(query),
    ]);

    res.json({ page, limit, total, pages: Math.ceil(total / limit), items });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function adminSchedulePickup(req, res) {
  try {
    const body = schedulePickupSchema.parse(req.body);
    
    const vo = await VendorOrder.findById(req.params.vendorOrderId);
    if (!vo) return res.status(404).json({ message: "Vendor order not found" });

    // Check if order is ready for pickup
    if (vo.handoverStatus !== "ready_for_pickup") {
      return res.status(400).json({ 
        message: `Cannot schedule pickup for order with status: ${vo.handoverStatus}` 
      });
    }

    // Update pickup details
    vo.pickup = {
      scheduledAt: new Date(body.scheduledAt),
      pickupWindow: body.pickupWindow || "",
      notes: body.notes || "",
    };

    await vo.save();

    // Notify vendor
    await notifyVendorOwner({
      vendorId: vo.vendorId,
      title: "📅 Pickup Scheduled",
      body: `Pickup scheduled for order ${vo.vendorOrderNumber} on ${new Date(body.scheduledAt).toLocaleString()}`,
      type: "handover",
      data: {
        vendorOrderId: vo._id,
        scheduledAt: body.scheduledAt,
        pickupWindow: body.pickupWindow,
      },
    });

    res.json({ 
      message: "Pickup scheduled successfully",
      vendorOrder: vo 
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to schedule pickup" });
  }
}

/**
 * Admin updates handover status (picked_up → in_transit → delivered)
 */
async function adminUpdateHandoverStatus(req, res) {
  try {
    const body = statusSchema.parse(req.body);

    const vo = await VendorOrder.findById(req.params.vendorOrderId);
    if (!vo) return res.status(404).json({ message: "Vendor order not found" });

    // Define valid status transitions
    const validTransitions = {
      ready_for_pickup: ["picked_up"],
      picked_up: ["in_transit"],
      in_transit: ["delivered"],
    };

    const current = vo.handoverStatus;
    const next = body.status;

    // Check if transition is valid
    if (!validTransitions[current] || !validTransitions[current].includes(next)) {
      return res.status(400).json({ 
        message: `Invalid transition from ${current} to ${next}`,
        allowedTransitions: validTransitions[current] || []
      });
    }

    // Update status and timestamps
    vo.handoverStatus = next;
    if (body.note) vo.handoverNote = body.note;

    // Update tracking info if provided
    if (body.tracking) {
      vo.tracking = {
        carrier: body.tracking.carrier || vo.tracking?.carrier || "",
        trackingNumber: body.tracking.trackingNumber || vo.tracking?.trackingNumber || "",
        trackingUrl: body.tracking.trackingUrl || vo.tracking?.trackingUrl || "",
      };
    }

    // Set timestamps based on status
    if (next === "picked_up") vo.pickedUpAt = new Date();
    if (next === "delivered") vo.deliveredAt = new Date();

    await vo.save();

    // ===== NOTIFY VENDOR OWNER ===== (using existing function)
    await notifyVendorOwner({
      vendorId: vo.vendorId,
      title: "🚚 Shipping Update",
      body: `Vendor order ${vo.vendorOrderNumber || vo._id} is now ${next.replace("_", " ")}.`,
      type: "handover",
      data: {
        vendorOrderId: vo._id,
        status: next,
        tracking: vo.tracking
      },
    });

    // ===== NOTIFY CUSTOMER =====
    const order = await Order.findById(vo.orderId).lean();
    if (order?.customerUserId) {
      let customerMessage = "";
      if (next === "picked_up") customerMessage = "Your order has been picked up by the courier.";
      else if (next === "in_transit") customerMessage = "Your order is in transit.";
      else if (next === "delivered") customerMessage = "Your order has been delivered!";

      await notifyUser({
        userId: order.customerUserId,
        title: "📦 Order Update",
        body: customerMessage || `Your order is now ${next.replace("_", " ")}.`,
        type: "order",
        data: { 
          orderId: order._id, 
          vendorOrderId: vo._id, 
          status: next,
          tracking: vo.tracking
        },
      });
    }

    res.json({ vendorOrder: vo });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ message: error.message || "Failed to update handover status" });
  }
}

module.exports = { adminListReadyForPickup, adminUpdateHandoverStatus, adminSchedulePickup };