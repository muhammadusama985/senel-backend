const mongoose = require("mongoose");

const attributeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, lowercase: true }, // e.g. "size", "color"
    name: { type: String, required: true, trim: true },                 // e.g. "Size", "Color"
    type: { type: String, enum: ["select", "multi_select", "text", "number"], default: "select" },

    // Used mainly for select types:
    options: [{ type: String, trim: true }],

    isVariant: { type: Boolean, default: false }, // if true, contributes to SKU variants
    isRequired: { type: Boolean, default: false },
  },
  { _id: false }
);

const attributeSetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Clothing Attributes"
    code: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    attributes: { type: [attributeSchema], default: [] },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AttributeSet", attributeSetSchema);