const mongoose = require("mongoose");

const TICKET_PRIORITY = ["low", "medium", "high", "urgent"];
const TICKET_STATUS = ["open", "in_progress", "waiting", "resolved", "closed"];
const TICKET_CATEGORY = [
  "technical",
  "billing",
  "product",
  "order",
  "shipping",
  "account",
  "other"
];

const supportTicketSchema = new mongoose.Schema(
  {
    vendorId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Vendor", 
      required: true,
      index: true 
    },
    
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    
    ticketNumber: { 
      type: String, 
      unique: true 
    },
    
    subject: { 
      type: String, 
      required: true 
    },
    
    description: { 
      type: String, 
      required: true 
    },
    
    category: { 
      type: String, 
      enum: TICKET_CATEGORY,
      default: "other" 
    },
    
    priority: { 
      type: String, 
      enum: TICKET_PRIORITY,
      default: "medium" 
    },
    
    status: { 
      type: String, 
      enum: TICKET_STATUS,
      default: "open",
      index: true 
    },
    
    attachments: [{
      url: String,
      filename: String,
      size: Number
    }],
    
    assignedTo: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    },
    
    assignedAt: { 
      type: Date 
    },
    
    resolvedAt: { 
      type: Date 
    },
    
    closedAt: { 
      type: Date 
    },
    
    closedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    },
    
    metadata: {
      type: Object,
      default: {}
    }
  },
  { timestamps: true }
);

// Generate ticket number before saving
supportTicketSchema.pre("save", async function() {
  if (!this.ticketNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const count = await mongoose.model("SupportTicket").countDocuments();
    this.ticketNumber = `TKT-${year}${month}-${String(count + 1).padStart(5, "0")}`;
  }
});

// Ticket messages sub-schema
const ticketMessageSchema = new mongoose.Schema(
  {
    ticketId: { 
      type: mongoose.Schema.Types.ObjectId, 
      
      ref: "SupportTicket", 
    
      index: true 
    },
    
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    
    userRole: { 
      type: String, 
enum: ["vendor", "admin", "staff", "system"],
      required: true 
    },
    
    message: { 
      type: String, 
      required: true 
    },
    
    attachments: [{
      url: String,
      filename: String,
      size: Number
    }],
    
    isInternal: { 
      type: Boolean, 
      default: false // Internal notes visible only to admins
    }
  },
  { timestamps: true }
);

const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);
const TicketMessage = mongoose.model("TicketMessage", ticketMessageSchema);

module.exports = { SupportTicket, TicketMessage };