/**
 * Admin Password Middleware - Xác thực admin bằng password
 * Sử dụng cho các trang admin không dùng JWT token
 */

const ADMIN_PASSWORD = '141920';

exports.requireAdminPassword = (req, res, next) => {
    // Check password từ query hoặc body
    const password = req.query.password || req.body.password;
    
    if (password === ADMIN_PASSWORD) {
        return next();
    }
    
    return res.status(401).json({
        success: false,
        message: 'Unauthorized - Mật khẩu không đúng'
    });
};









