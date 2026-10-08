import multer from 'multer';
import path from 'path';
import os from 'os';

// Use OS temp directory for initial upload before moving it via StorageProvider
const tempDir = os.tmpdir();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 20,
    fields: 10,
  },
  fileFilter: (req, file, cb) => {
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.mimetype)) return cb(Object.assign(new Error('Supported formats: PDF, PNG and JPEG'), { status: 415 }));
    cb(null, true);
  },
});
