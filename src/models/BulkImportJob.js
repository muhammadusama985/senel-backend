const mongoose = require("mongoose");

const BULK_JOB_STATUS = [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled"
];

const bulkImportJobSchema = new mongoose.Schema(
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
    
    fileName: { 
      type: String, 
      required: true 
    },
    
    fileSize: { 
      type: Number 
    },
    
    totalRows: { 
      type: Number, 
      default: 0 
    },
    
    processedRows: { 
      type: Number, 
      default: 0 
    },
    
    successfulRows: { 
      type: Number, 
      default: 0 
    },
    
    failedRows: { 
      type: Number, 
      default: 0 
    },
    
    status: { 
      type: String, 
      enum: BULK_JOB_STATUS,
      default: "pending",
      index: true 
    },
    
    errors: [{
      row: Number,
      field: String,
      message: String,
      data: Object
    }],
    
    summary: {
      type: Object,
      default: {}
    },
    
    startedAt: { 
      type: Date 
    },
    
    completedAt: { 
      type: Date 
    },
    
    downloadUrl: { 
      type: String 
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("BulkImportJob", bulkImportJobSchema);