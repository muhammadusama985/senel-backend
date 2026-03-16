const csv = require('csv-parser');
const { Readable } = require('stream');
const Product = require('../models/Product');
const Category = require('../models/Category');

class CSVParserService {
  /**
   * Parse CSV buffer to array
   */
  async parseCSV(buffer) {
    return new Promise((resolve, reject) => {
      const results = [];
      const stream = Readable.from(buffer.toString());
      
      stream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', (error) => reject(error));
    });
  }

  /**
   * Validate product CSV row
   */
  async validateProductRow(row, index, vendorId) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!row.title) {
      errors.push({ field: 'title', message: 'Title is required' });
    }

    if (!row.price) {
      errors.push({ field: 'price', message: 'Price is required' });
    } else if (isNaN(parseFloat(row.price))) {
      errors.push({ field: 'price', message: 'Price must be a number' });
    }

    if (!row.moq) {
      errors.push({ field: 'moq', message: 'MOQ is required' });
    } else if (isNaN(parseInt(row.moq))) {
      errors.push({ field: 'moq', message: 'MOQ must be a number' });
    }

    // Validate category
    if (row.category) {
      const category = await Category.findOne({ 
        name: row.category,
        isActive: true 
      }).lean();
      
      if (!category) {
        warnings.push({ field: 'category', message: `Category "${row.category}" not found. Will use default.` });
      }
    }

    // Validate price tiers
    if (row.priceTiers) {
      try {
        const tiers = JSON.parse(row.priceTiers);
        if (!Array.isArray(tiers)) {
          errors.push({ field: 'priceTiers', message: 'Price tiers must be an array' });
        }
      } catch (e) {
        errors.push({ field: 'priceTiers', message: 'Invalid JSON format for price tiers' });
      }
    }

    return { errors, warnings };
  }

  /**
   * Convert CSV row to product data
   */
  async rowToProduct(row, vendorId) {
    const product = {
      vendorId,
      title: row.title,
      description: row.description || '',
      moq: parseInt(row.moq) || 1,
      stockQty: parseInt(row.stockQty) || 0,
      sku: row.sku || '',
      status: 'draft'
    };

    // Parse price tiers
    if (row.priceTiers) {
      try {
        product.priceTiers = JSON.parse(row.priceTiers);
      } catch (e) {
        // Fallback to single price
        product.priceTiers = [{
          minQty: product.moq,
          unitPrice: parseFloat(row.price)
        }];
      }
    } else {
      product.priceTiers = [{
        minQty: product.moq,
        unitPrice: parseFloat(row.price)
      }];
    }

    // Set category
    if (row.category) {
      const category = await Category.findOne({ name: row.category }).lean();
      if (category) {
        product.categoryId = category._id;
      }
    }

    // Handle images
    if (row.images) {
      product.imageUrls = row.images.split(',').map(url => url.trim());
    }

    return product;
  }

  /**
   * Generate CSV template
   */
  generateTemplate() {
    const headers = [
      'title',
      'description',
      'price',
      'moq',
      'stockQty',
      'sku',
      'category',
      'priceTiers',
      'images'
    ];

    const example = {
      title: 'Example Product',
      description: 'Product description here',
      price: '29.99',
      moq: '50',
      stockQty: '1000',
      sku: 'SKU-123',
      category: 'Electronics',
      priceTiers: '[{"minQty":50,"unitPrice":29.99},{"minQty":100,"unitPrice":24.99}]',
      images: 'https://example.com/image1.jpg,https://example.com/image2.jpg'
    };

    return { headers, example };
  }
}

module.exports = new CSVParserService();