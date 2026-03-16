const { z } = require("zod");
const multer = require('multer');
const BulkImportJob = require("../models/BulkImportJob");
const bulkImportService = require("../services/bulkImport.service");
const { logActivity } = require("./vendorActivity.controller");

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

/**
 * Upload CSV for bulk import
 */
async function uploadImportFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const vendorId = req.vendorContext.vendorId;

    // Create import job
    const job = await BulkImportJob.create({
      vendorId,
      createdBy: req.user._id,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileData: req.file.buffer,
      status: "pending"
    });

    // Log activity
    await logActivity({
      vendorId,
      userId: req.user._id,
      action: "BULK_IMPORT_STARTED",
      entityType: "product",
      details: { jobId: job._id, fileName: job.fileName }
    });

    // Process asynchronously
    bulkImportService.processImport(job._id).catch(console.error);

    res.status(201).json({ 
      jobId: job._id,
      message: "Import started. Check status endpoint for progress." 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Get import job status
 */
async function getImportStatus(req, res) {
  try {
    const { jobId } = req.params;
    const vendorId = req.vendorContext.vendorId;

    const job = await BulkImportJob.findOne({ _id: jobId, vendorId });
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    res.json({
      jobId: job._id,
      status: job.status,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      successfulRows: job.successfulRows,
      failedRows: job.failedRows,
      errors: job.errors,
      summary: job.summary,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * List import jobs
 */
async function listImportJobs(req, res) {
  try {
    const vendorId = req.vendorContext.vendorId;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      BulkImportJob.find({ vendorId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BulkImportJob.countDocuments({ vendorId })
    ]);

    res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      jobs: jobs.map(j => ({
        ...j,
        fileData: undefined // Remove file data from response
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Download error report
 */
async function downloadErrorReport(req, res) {
  try {
    const { jobId } = req.params;
    const vendorId = req.vendorContext.vendorId;

    const job = await BulkImportJob.findOne({ _id: jobId, vendorId });
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const errors = job.errors || [];
    
    // Generate CSV error report
    let csv = 'Row,Field,Message,Data\n';
    errors.forEach(e => {
      e.errors.forEach(err => {
        csv += `${e.row},"${err.field || 'general'}","${err.message}","${JSON.stringify(e.data).replace(/"/g, '""')}"\n`;
      });
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=import-errors-${jobId}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Get import template
 */
async function getImportTemplate(req, res) {
  try {
    const template = csvParser.generateTemplate();

    // Generate CSV template
    let csv = template.headers.join(',') + '\n';
    csv += Object.values(template.example).join(',') + '\n';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=product-import-template.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/**
 * Export products
 */
async function exportProducts(req, res) {
  try {
    const vendorId = req.vendorContext.vendorId;
    const { format = 'csv' } = req.query;

    const data = await bulkImportService.exportProducts(vendorId, format);

    if (format === 'csv') {
      let csv = 'Title,Description,Price,MOQ,Stock,SKU,Category,Price Tiers,Images,Status,Created At\n';
      
      data.forEach(row => {
        csv += `"${row.title}","${row.description || ''}",${row.price},${row.moq},${row.stockQty},"${row.sku || ''}","${row.category}","${row.priceTiers.replace(/"/g, '""')}","${row.images}",${row.status},${row.createdAt}\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=products-export-${Date.now()}.csv`);
      res.send(csv);
    } else {
      res.json({ products: data });
    }

    // Log activity
    await logActivity({
      vendorId,
      userId: req.user._id,
      action: "EXPORT_PRODUCTS",
      entityType: "product",
      details: { format }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

module.exports = {
  uploadImportFile,
  getImportStatus,
  listImportJobs,
  downloadErrorReport,
  getImportTemplate,
  exportProducts,
  upload: upload.single('file')
};