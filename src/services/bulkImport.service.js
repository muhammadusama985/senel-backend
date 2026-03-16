const BulkImportJob = require("../models/BulkImportJob");
const Product = require("../models/Product");
const csvParser = require("./csvParser.service");
const { logActivity } = require("../controllers/vendorActivity.controller");

class BulkImportService {
  /**
   * Process bulk import job
   */
  async processImport(jobId) {
    const job = await BulkImportJob.findById(jobId);
    if (!job) throw new Error("Job not found");

    try {
      // Update job status
      job.status = "processing";
      job.startedAt = new Date();
      await job.save();

      // Parse CSV
      const rows = await csvParser.parseCSV(job.fileData);
      job.totalRows = rows.length;
      await job.save();

      const errors = [];
      const successfulProducts = [];

      // Process each row
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        
        // Validate row
        const validation = await csvParser.validateProductRow(row, i, job.vendorId);
        
        if (validation.errors.length > 0) {
          errors.push({
            row: i + 2, // +2 for header row (1-indexed)
            errors: validation.errors,
            data: row
          });
          job.failedRows++;
        } else {
          try {
            // Convert row to product
            const productData = await csvParser.rowToProduct(row, job.vendorId);
            
            // Create product
            const product = await Product.create(productData);
            successfulProducts.push(product._id);
            job.successfulRows++;
          } catch (error) {
            errors.push({
              row: i + 2,
              errors: [{ field: 'general', message: error.message }],
              data: row
            });
            job.failedRows++;
          }
        }

        job.processedRows = i + 1;
        await job.save();
      }

      // Complete job
      job.status = "completed";
      job.completedAt = new Date();
      job.errors = errors;
      job.summary = {
        total: job.totalRows,
        successful: job.successfulRows,
        failed: job.failedRows,
        productIds: successfulProducts
      };
      await job.save();

      // Log activity
      await logActivity({
        vendorId: job.vendorId,
        userId: job.createdBy,
        action: "BULK_IMPORT_COMPLETED",
        entityType: "product",
        details: {
          jobId: job._id,
          total: job.totalRows,
          successful: job.successfulRows,
          failed: job.failedRows
        }
      });

      return job;
    } catch (error) {
      job.status = "failed";
      job.completedAt = new Date();
      job.errors = job.errors || [];
      job.errors.push({
        row: 0,
        errors: [{ field: 'general', message: error.message }]
      });
      await job.save();

      // Log activity
      await logActivity({
        vendorId: job.vendorId,
        userId: job.createdBy,
        action: "BULK_IMPORT_FAILED",
        entityType: "product",
        details: { jobId: job._id, error: error.message }
      });

      throw error;
    }
  }

  /**
   * Export products to CSV
   */
  async exportProducts(vendorId, format = 'csv') {
    const products = await Product.find({ vendorId })
      .populate('categoryId', 'name')
      .lean();

    const data = products.map(p => ({
      title: p.title,
      description: p.description,
      price: p.priceTiers[0]?.unitPrice || 0,
      moq: p.moq,
      stockQty: p.stockQty,
      sku: p.sku || '',
      category: p.categoryId?.name || '',
      priceTiers: JSON.stringify(p.priceTiers),
      images: p.imageUrls?.join(',') || '',
      status: p.status,
      createdAt: p.createdAt
    }));

    return data;
  }
}

module.exports = new BulkImportService();