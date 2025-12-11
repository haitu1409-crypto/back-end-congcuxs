/**
 * Upload Routes - API endpoints cho upload file
 * Upload ảnh lên Cloudinary thay vì lưu local
 */

const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { uploadBuffer } = require('../utils/cloudinary');

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

// Configure multer for file uploads (temporary storage)
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

// Create uploads directory if it doesn't exist (for temporary storage)
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Upload endpoint - Upload to Cloudinary
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
    async (req, res) => {
        let tempFilePath = null;
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: 'Không có file được upload'
                });
            }

            tempFilePath = req.file.path;

            // Read file buffer
            const fileBuffer = fs.readFileSync(tempFilePath);

            // Upload to Cloudinary
            const cloudinaryResult = await uploadBuffer(fileBuffer, {
                folder: 'articles/images',
                transformation: [
                    { width: 1200, height: 800, crop: 'limit', quality: 'auto' }
                ],
                resource_type: 'image'
            });

            // Clean up temporary file
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (cleanupError) {
                    console.error('Error cleaning up temp file:', cleanupError);
                }
            }

            // Return file info with Cloudinary URL
            res.json({
                success: true,
                data: {
                    filename: cloudinaryResult.original_filename || req.file.originalname,
                    originalname: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size,
                    url: cloudinaryResult.secure_url,
                    publicId: cloudinaryResult.public_id,
                    alt: path.parse(req.file.originalname).name
                }
            });
        } catch (error) {
            console.error('Upload error:', error);
            
            // Clean up temporary file on error
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (cleanupError) {
                    console.error('Error cleaning up temp file:', cleanupError);
                }
            }

            res.status(500).json({
                success: false,
                message: 'Lỗi server khi upload file: ' + error.message
            });
        }
    }
);

module.exports = router;
