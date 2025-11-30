const thongKeImageGenerator = require('../services/thongKeImageGenerator.service');

/**
 * Controller để generate hình ảnh từ box thống kê
 */

/**
 * Generate hình ảnh từ HTML string của một box
 * POST /api/thongke/generate-image
 * Body: { html: string, boxId?: string, options?: Object }
 */
async function generateBoxImage(req, res) {
    try {
        const { html, boxId, options } = req.body;

        if (!html) {
            return res.status(400).json({
                success: false,
                error: 'Thiếu HTML để generate hình ảnh'
            });
        }

        const imageBuffer = await thongKeImageGenerator.generateImage(html, boxId, options || {});

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', 'inline; filename="thongke-box.png"');
        res.send(imageBuffer);
    } catch (error) {
        console.error('[ThongKeImage] Lỗi khi generate hình ảnh:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Không thể generate hình ảnh'
        });
    }
}

/**
 * Generate nhiều hình ảnh từ nhiều box HTML
 * POST /api/thongke/generate-multiple-images
 * Body: { boxes: Array<{html: string, id?: string, options?: Object}> }
 */
async function generateMultipleBoxImages(req, res) {
    try {
        const { boxes } = req.body;

        if (!Array.isArray(boxes) || boxes.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Thiếu danh sách boxes để generate hình ảnh'
            });
        }

        const imageBuffers = await thongKeImageGenerator.generateMultipleImages(boxes);

        // Trả về mảng các hình ảnh dưới dạng base64 hoặc buffer
        // Có thể trả về zip file hoặc mảng base64
        const images = imageBuffers.map((buffer, index) => ({
            index,
            data: buffer.toString('base64'),
            mimeType: 'image/png'
        }));

        res.json({
            success: true,
            count: images.length,
            images
        });
    } catch (error) {
        console.error('[ThongKeImage] Lỗi khi generate nhiều hình ảnh:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Không thể generate hình ảnh'
        });
    }
}

module.exports = {
    generateBoxImage,
    generateMultipleBoxImages
};





