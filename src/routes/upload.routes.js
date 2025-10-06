/**
 * Upload Routes - API endpoints cho upload file
 * Tối ưu hiệu suất với multer và rate limiting
 */

const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Rate limiting for uploads
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 uploads per windowMs
    message: {
        success: false,
        message: 'Quá nhiều upload, vui lòng thử lại sau'
    }
});

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 1
    },
    fileFilter: (req, file, cb) => {
        // Check file type
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Chỉ cho phép upload file ảnh (JPEG, PNG, GIF, WebP)'), false);
        }
    }
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Upload endpoint
router.post('/upload', 
    uploadLimiter,
    upload.single('image'),
    (err, req, res, next) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({
                success: false,
                message: 'Lỗi upload file: ' + err.message
            });
        } else if (err) {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }
        next();
    },
    (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'Không có file được upload'
                });
            }

            // Get file extension from original name
            const ext = path.extname(req.file.originalname);
            const newFilename = req.file.filename + ext;
            const newPath = path.join(uploadsDir, newFilename);

            // Rename file to include extension
            fs.renameSync(req.file.path, newPath);

            // Return file info
            res.json({
                success: true,
                data: {
                    filename: newFilename,
                    originalname: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size,
                    url: `/uploads/${newFilename}`
                }
            });
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({
                success: false,
                message: 'Lỗi server khi upload file'
            });
        }
    }
);

module.exports = router;
