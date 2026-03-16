const mongoose = require("mongoose");

const mlString = {
  en: { type: String, default: "" },
  de: { type: String, default: "" },
  tr: { type: String, default: "" },
};

const emailTemplateSchema = new mongoose.Schema(
  {
    key: { 
      type: String, 
      required: true, 
      unique: true,
      trim: true,
      index: true 
    }, // e.g., "order_confirmation", "password_reset"
    
    // ✅ Multi-language fields (used by localizedEmail.service.js)
    subjectML: { 
      type: mlString,
      default: () => ({ en: "", de: "", tr: "" })
    },
    
    htmlBodyML: { 
      type: mlString,
      default: () => ({ en: "", de: "", tr: "" })
    },
    
    textBodyML: { 
      type: mlString,
      default: () => ({ en: "", de: "", tr: "" })
    },
    
    // Optional description for admin
    description: { 
      type: String, 
      default: "" 
    },
    
    isActive: { 
      type: Boolean, 
      default: true,
      index: true 
    },
    
    createdByAdminId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    },
    
    updatedByAdminId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmailTemplate", emailTemplateSchema);