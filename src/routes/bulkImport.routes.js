const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { loadVendorContext } = require("../middlewares/vendorContext.middleware");

const bulkImport = require("../controllers/bulkImport.controller");

router.use(requireAuth, requireRole("vendor"), loadVendorContext);

// Bulk import
router.post("/import/upload", bulkImport.upload, asyncHandler(bulkImport.uploadImportFile));
router.get("/import/jobs", asyncHandler(bulkImport.listImportJobs));
router.get("/import/jobs/:jobId", asyncHandler(bulkImport.getImportStatus));
router.get("/import/jobs/:jobId/errors", asyncHandler(bulkImport.downloadErrorReport));
router.get("/import/template", asyncHandler(bulkImport.getImportTemplate));

// Export
router.get("/export/products", asyncHandler(bulkImport.exportProducts));

module.exports = router;