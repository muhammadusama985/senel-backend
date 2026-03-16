const Product = require("../models/Product");
const mongoose = require("mongoose");

class SearchService {
  constructor() {
    this.isAtlas = false;
    this.mongoVersion = null;
    this.hasSearch = null;
  }

  /**
   * Detect MongoDB capabilities
   */
  async detectCapabilities() {
    try {
      const db = mongoose.connection.db;
      const buildInfo = await db.command({ buildInfo: 1 });
      this.mongoVersion = buildInfo.version;
      
      // Check if we're on Atlas
      const isAtlas = buildInfo.modules?.includes('enterprise') || 
                      process.env.MONGODB_URI?.includes('mongodb.net');
      
      this.isAtlas = isAtlas;
      this.hasSearch = parseFloat(this.mongoVersion) >= 8.2 || isAtlas;
      
      console.log(`📊 MongoDB Version: ${this.mongoVersion}`);
      console.log(`📍 Environment: ${isAtlas ? 'Atlas' : 'Local'}`);
      console.log(`🔍 Search Mode: ${this.hasSearch ? 'Native $search' : 'Enhanced Regex'}`);
    } catch (error) {
      console.error('Error detecting MongoDB capabilities:', error);
      this.hasSearch = false;
    }
  }

  /**
   * Unified search - automatically chooses best method
   */
  async searchProducts(query, lang = 'en', filters = {}, page = 1, limit = 20) {
    // Detect capabilities on first run
    if (this.hasSearch === null) {
      await this.detectCapabilities();
    }

    try {
      // Try Atlas/Native search if available
      if (this.hasSearch) {
        try {
          const results = await this.atlasSearch(query, lang, filters, page, limit);
          return results;
        } catch (error) {
          console.log('Atlas search failed, falling back to regex:', error.message);
        }
      }

      // Use enhanced regex search
      return await this.regexSearch(query, lang, filters, page, limit);
    } catch (error) {
      console.error('Search error:', error);
      return {
        hits: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        error: error.message
      };
    }
  }

  /**
   * Enhanced Regex Search (Works everywhere)
   */
  async regexSearch(query, lang = 'en', filters = {}, page = 1, limit = 20) {
    const searchTerms = query.split(' ').filter(t => t.length > 2);
    const skip = (page - 1) * limit;

    // Base match stage
    const matchStage = { status: 'approved' };

    // Add language-aware search
    if (query && query.trim()) {
      matchStage.$or = [
        // Exact phrase in requested language
        { [`titleML.${lang}`]: { $regex: query, $options: 'i' } },
        { [`descriptionML.${lang}`]: { $regex: query, $options: 'i' } },
        { title: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        // Exact phrase in English (fallback)
        ...(lang !== 'en' ? [
          { 'titleML.en': { $regex: query, $options: 'i' } },
          { 'descriptionML.en': { $regex: query, $options: 'i' } }
        ] : []),
        // Individual terms in requested language
        ...searchTerms.flatMap(term => [
          { [`titleML.${lang}`]: { $regex: term, $options: 'i' } },
          { [`descriptionML.${lang}`]: { $regex: term, $options: 'i' } },
          { title: { $regex: term, $options: 'i' } },
          { description: { $regex: term, $options: 'i' } }
        ]),
        // Individual terms in English (fallback)
        ...(lang !== 'en' ? searchTerms.flatMap(term => [
          { 'titleML.en': { $regex: term, $options: 'i' } },
          { 'descriptionML.en': { $regex: term, $options: 'i' } }
        ]) : [])
      ];
    }

    // Add filters
    if (filters.categoryId) matchStage.categoryId = filters.categoryId;
    if (filters.vendorId) matchStage.vendorId = filters.vendorId;
    if (filters.country) matchStage.country = filters.country;
    if (filters.featured !== undefined) matchStage.isFeatured = filters.featured;
    
    if (filters.minMoq || filters.maxMoq) {
      matchStage.moq = {};
      if (filters.minMoq) matchStage.moq.$gte = filters.minMoq;
      if (filters.maxMoq) matchStage.moq.$lte = filters.maxMoq;
    }

    if (filters.minPrice || filters.maxPrice) {
      matchStage.priceTiers = {
        $elemMatch: {
          unitPrice: {}
        }
      };
      if (filters.minPrice) matchStage.priceTiers.$elemMatch.unitPrice.$gte = filters.minPrice;
      if (filters.maxPrice) matchStage.priceTiers.$elemMatch.unitPrice.$lte = filters.maxPrice;
    }

    // Build aggregation pipeline
    const pipeline = [
      { $match: matchStage }
    ];

    // Add scoring if we have a query
    if (query && query.trim()) {
      pipeline.push({
        $addFields: {
          searchScore: {
            $add: [
              // Title exact match in requested language
              { $cond: [{ $regexMatch: { input: { $ifNull: [`$titleML.${lang}`, "$title"] }, regex: query, options: 'i' } }, 10, 0] },
              // Title exact match in English (fallback)
              ...(lang !== 'en' ? [
                { $cond: [{ $regexMatch: { input: { $ifNull: ["$titleML.en", "$title"] }, regex: query, options: 'i' } }, 5, 0] }
              ] : []),
              // Description exact match
              { $cond: [{ $regexMatch: { input: { $ifNull: [`$descriptionML.${lang}`, "$description"] }, regex: query, options: 'i' } }, 5, 0] },
              // Each term in title (requested language)
              ...searchTerms.map(term => ({
                $cond: [{ $regexMatch: { input: { $ifNull: [`$titleML.${lang}`, "$title"] }, regex: term, options: 'i' } }, 2, 0]
              })),
              // Each term in description (requested language)
              ...searchTerms.map(term => ({
                $cond: [{ $regexMatch: { input: { $ifNull: [`$descriptionML.${lang}`, "$description"] }, regex: term, options: 'i' } }, 1, 0]
              }))
            ]
          }
        }
      });

      pipeline.push({ $sort: { searchScore: -1, createdAt: -1 } });
    } else {
      pipeline.push({ $sort: filters.sort === 'price_asc' ? { 'priceTiers.unitPrice': 1 } : 
                             filters.sort === 'price_desc' ? { 'priceTiers.unitPrice': -1 } : 
                             { createdAt: -1 } });
    }

    // Get total count
    const countPipeline = [...pipeline];
    countPipeline.push({ $count: 'total' });
    const countResult = await Product.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Add pagination
    pipeline.push({ $skip: skip }, { $limit: limit });

    const results = await Product.aggregate(pipeline);

    return {
      hits: results,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Atlas Search (When on MongoDB Atlas)
   */
  async atlasSearch(query, lang = 'en', filters = {}, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    // Build search pipeline
    const pipeline = [
      {
        $search: {
          index: 'product_search',
          compound: {
            should: [
              // Exact phrase in requested language (highest weight)
              {
                text: {
                  query,
                  path: {
                    wildcard: `titleML.${lang}`
                  },
                  score: { boost: { value: 10 } }
                }
              },
              // Exact phrase in description (high weight)
              {
                text: {
                  query,
                  path: {
                    wildcard: `descriptionML.${lang}`
                  },
                  score: { boost: { value: 5 } }
                }
              },
              // Fallback to English titles
              ...(lang !== 'en' ? [{
                text: {
                  query,
                  path: 'titleML.en',
                  score: { boost: { value: 3 } }
                }
              }] : []),
              // Fuzzy matching for typos
              {
                text: {
                  query,
                  path: {
                    wildcard: `titleML.${lang}`
                  },
                  fuzzy: {
                    maxEdits: 2,
                    prefixLength: 3
                  },
                  score: { boost: { value: 2 } }
                }
              }
            ],
            filter: [
              // Status filter
              {
                equals: {
                  path: 'status',
                  value: 'approved'
                }
              },
              // Category filter
              ...(filters.categoryId ? [{
                equals: {
                  path: 'categoryId',
                  value: new mongoose.Types.ObjectId(filters.categoryId)
                }
              }] : []),
              // Vendor filter
              ...(filters.vendorId ? [{
                equals: {
                  path: 'vendorId',
                  value: new mongoose.Types.ObjectId(filters.vendorId)
                }
              }] : []),
              // Country filter
              ...(filters.country ? [{
                equals: {
                  path: 'country',
                  value: filters.country
                }
              }] : []),
              // Featured filter
              ...(filters.featured !== undefined ? [{
                equals: {
                  path: 'isFeatured',
                  value: filters.featured
                }
              }] : []),
              // Price range filter
              ...(filters.minPrice || filters.maxPrice ? [{
                range: {
                  path: 'priceTiers.unitPrice',
                  ...(filters.minPrice && { gte: filters.minPrice }),
                  ...(filters.maxPrice && { lte: filters.maxPrice })
                }
              }] : [])
            ]
          }
        }
      },
      {
        $facet: {
          metadata: [{ $count: 'total' }],
          results: [
            { $skip: skip },
            { $limit: limit }
          ]
        }
      }
    ];

    const result = await Product.aggregate(pipeline);
    const hits = result[0]?.results || [];
    const total = result[0]?.metadata[0]?.total || 0;

    return {
      hits,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Create search indexes (run once)
   */
  async createIndexes() {
    try {
      const db = mongoose.connection.db;
      
      // Text indexes for regex search
      await db.collection('products').createIndex({
        'title': 'text',
        'titleML.en': 'text',
        'titleML.de': 'text',
        'titleML.tr': 'text',
        'description': 'text',
        'descriptionML.en': 'text',
        'descriptionML.de': 'text',
        'descriptionML.tr': 'text'
      }, {
        weights: {
          'title': 10,
          'titleML.en': 10,
          'titleML.de': 10,
          'titleML.tr': 10,
          'description': 5,
          'descriptionML.en': 5,
          'descriptionML.de': 5,
          'descriptionML.tr': 5
        },
        name: 'product_text_search'
      });

      // Atlas search index (if on Atlas)
      if (this.isAtlas) {
        await db.collection('products').createSearchIndex({
          name: 'product_search',
          definition: {
            mappings: {
              dynamic: false,
              fields: {
                'title': { type: 'string', analyzer: 'lucene.english' },
                'titleML.en': { type: 'string', analyzer: 'lucene.english' },
                'titleML.de': { type: 'string', analyzer: 'lucene.german' },
                'titleML.tr': { type: 'string', analyzer: 'lucene.turkish' },
                'description': { type: 'string', analyzer: 'lucene.english' },
                'descriptionML.en': { type: 'string', analyzer: 'lucene.english' },
                'descriptionML.de': { type: 'string', analyzer: 'lucene.german' },
                'descriptionML.tr': { type: 'string', analyzer: 'lucene.turkish' },
                'categoryId': { type: 'string' },
                'vendorId': { type: 'string' },
                'status': { type: 'string' },
                'isFeatured': { type: 'boolean' },
                'country': { type: 'string' },
                'priceTiers.unitPrice': { type: 'number' },
                'moq': { type: 'number' }
              }
            }
          }
        });
      }

      console.log('✅ Search indexes created successfully');
    } catch (error) {
      console.error('Error creating indexes:', error);
    }
  }

  // ========== 🆕 NEW METHOD ADDED HERE ==========
  /**
   * Index a single product (for real-time updates)
   * This is called when products are created or updated
   */
  async indexProduct(product) {
    try {
      console.log(`🔍 Indexing product: ${product._id} - ${product.title}`);
      
      // For MongoDB native search, we don't need to do anything special
      // The product is already in the database and will be found by searches
      
      // If you want to maintain a separate search index or cache, you could:
      // - Update a search collection
      // - Call an external search API
      // - Update Redis cache
      
      // For now, just log success and return
      console.log(`✅ Product indexed successfully: ${product._id}`);
      
      return { 
        success: true, 
        productId: product._id,
        message: 'Product indexed successfully' 
      };
    } catch (error) {
      console.error(`❌ Error indexing product ${product._id}:`, error);
      
      // Return error but don't throw - we don't want to break the main operation
      return { 
        success: false, 
        productId: product._id,
        error: error.message 
      };
    }
  }
  // =============================================

  /**
   * Reindex all products (for admin use)
   */
  async reindexAll() {
    try {
      // Detect capabilities first
      await this.detectCapabilities();
      
      // Get all approved products
      const products = await Product.find({ status: "approved" }).lean();
      
      // Recreate indexes
      await this.createIndexes();
      
      return { count: products.length };
    } catch (error) {
      console.error("Reindex error:", error);
      throw error;
    }
  }
}

module.exports = new SearchService();
