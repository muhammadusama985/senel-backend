const mongoose = require("mongoose");

const staticPageSchema = new mongoose.Schema(
  {
    slug: { 
      type: String, 
      required: true, 
      unique: true, 
      trim: true, 
      lowercase: true,
      index: true 
    },
    title: { 
      type: String, 
      required: true, 
      trim: true 
    },
    content: { 
      type: String, 
      required: true 
    }, // HTML content
    status: { 
      type: String, 
      enum: ["draft", "published"], 
      default: "draft",
      index: true 
    },
    publishedAt: { 
      type: Date, 
      default: null 
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

module.exports = mongoose.model("StaticPage", staticPageSchema);