const router = require("express").Router();
const path = require("path");
const { asyncHandler } = require("../utils/asyncHandler");
const { requireAuth } = require("../middlewares/auth.middleware");
const upload = require("../middlewares/upload.middleware");

// Upload a single attachment for a bulk offer or RFQ
// POST /api/v1/attachments/upload (multipart, field "attachment")
router.post(
  "/upload",
  requireAuth,
  upload.single("attachment"),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    // req.file.path is an absolute path; build a public URL
    const relative = path.relative(path.join(__dirname, "../../uploads"), req.file.path).split(path.sep).join("/");
    const url = `/uploads/${relative}`;
    res.status(201).json({
      url,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  })
);

module.exports = router;