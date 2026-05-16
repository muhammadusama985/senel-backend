const router = require("express").Router();
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure upload directory exists
const uploadDir = path.join(__dirname, "../../uploads/shipping-companies");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for logo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `logo-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed"));
  },
});

const {
  adminCreateShippingCompany,
  adminListShippingCompanies,
  adminGetShippingCompany,
  adminUpdateShippingCompany,
  adminDeleteShippingCompany,
} = require("../controllers/adminShippingCompanies.controller");

// All routes require admin authentication
router.use(requireAuth, requireRole("admin"));

// CRUD endpoints
router.post("/shipping-companies", asyncHandler(adminCreateShippingCompany));
router.get("/shipping-companies", asyncHandler(adminListShippingCompanies));
router.get("/shipping-companies/:companyId", asyncHandler(adminGetShippingCompany));
router.patch("/shipping-companies/:companyId", asyncHandler(adminUpdateShippingCompany));
router.delete("/shipping-companies/:companyId", asyncHandler(adminDeleteShippingCompany));

// Logo upload endpoint
router.post("/shipping-companies/upload-logo", requireAuth, requireRole("admin"), upload.single("logo"), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const logoUrl = `${baseUrl}/uploads/shipping-companies/${req.file.filename}`;

  res.status(201).json({
    success: true,
    logoUrl,
    filename: req.file.filename,
  });
}));

module.exports = router;