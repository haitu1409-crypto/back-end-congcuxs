/**
 * Admin Middleware - Kiểm tra quyền admin
 */

exports.requireAdmin = (req, res, next) => {
    if (req.userRole !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Bạn không có quyền truy cập trang này'
        });
    }
    next();
};





























