const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
};

const createUploadDirs = () => {
  const dirs = [
    path.join(__dirname, '../../uploads/banners'),
    path.join(__dirname, '../../uploads/blogs'),
    path.join(__dirname, '../../uploads/misc'),
    path.join(__dirname, '../../uploads/vendor/logos'),
    path.join(__dirname, '../../uploads/vendor/banners'),
    path.join(__dirname, '../../uploads/vendor/documents'),
    path.join(__dirname, '../../uploads/vendor/products'),
    path.join(__dirname, '../../uploads/customer/payment-proofs'),
  ];

  dirs.forEach(ensureDir);
};

createUploadDirs();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = path.join(__dirname, '../../uploads/misc');

    if (req.originalUrl.includes('/vendors/me/logo')) {
      uploadPath = path.join(__dirname, '../../uploads/vendor/logos');
    } else if (req.originalUrl.includes('/vendors/me/banner')) {
      uploadPath = path.join(__dirname, '../../uploads/vendor/banners');
    } else if (req.originalUrl.includes('/vendors/me/docs')) {
      uploadPath = path.join(__dirname, '../../uploads/vendor/documents');
    } else if (req.originalUrl.includes('/products/me/images') || req.originalUrl.includes('/products/admin/images')) {
      uploadPath = path.join(__dirname, '../../uploads/vendor/products');
    } else if (req.originalUrl.includes('/bank-transfer/submit-proof')) {
      uploadPath = path.join(__dirname, '../../uploads/customer/payment-proofs');
    } else if (req.originalUrl.includes('/banners')) {
      uploadPath = path.join(__dirname, '../../uploads/banners');
    } else if (req.originalUrl.includes('/blog')) {
      uploadPath = path.join(__dirname, '../../uploads/blogs');
    }

    ensureDir(uploadPath);
    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();

    if (file.fieldname === 'coverImage') {
      return cb(null, `cover-${uniqueSuffix}${ext}`);
    }

    if (file.fieldname === 'image') {
      return cb(null, `image-${uniqueSuffix}${ext}`);
    }

    if (file.fieldname === 'imageMobile') {
      return cb(null, `imageMobile-${uniqueSuffix}${ext}`);
    }

    if (file.fieldname === 'logo') {
      return cb(null, `logo-${uniqueSuffix}${ext}`);
    }

    if (file.fieldname === 'banner') {
      return cb(null, `banner-${uniqueSuffix}${ext}`);
    }

    if (file.fieldname === 'document') {
      return cb(null, `document-${uniqueSuffix}${ext}`);
    }

    if (file.fieldname === 'productImage') {
      return cb(null, `product-${uniqueSuffix}${ext}`);
    }

    if (file.fieldname === 'proofImage') {
      return cb(null, `proof-${uniqueSuffix}${ext}`);
    }

    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const imageMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
  ];

  const docMimeTypes = [...imageMimeTypes, 'application/pdf'];
  const isVendorDocRoute = req.originalUrl.includes('/vendors/me/docs');
  const allowedMimeTypes = isVendorDocRoute ? docMimeTypes : imageMimeTypes;

  const ext = path.extname(file.originalname || '').toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
  const allowByExtForProofImage =
    file.fieldname === 'proofImage' &&
    imageExts.includes(ext) &&
    (file.mimetype === 'application/octet-stream' || !file.mimetype);

  if (allowedMimeTypes.includes(file.mimetype) || allowByExtForProofImage) {
    return cb(null, true);
  }

  cb(new Error(isVendorDocRoute ? 'Only image or PDF files are allowed' : 'Only image files are allowed'));
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

module.exports = upload;
