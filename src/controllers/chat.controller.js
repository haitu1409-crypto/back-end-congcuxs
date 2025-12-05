/**
 * Chat Controller - Xử lý groupchat và private chat
 * Tối ưu với caching và pagination
 */

const multer = require('multer');
const Message = require('../models/message.model');
const ChatRoom = require('../models/chatRoom.model');
const User = require('../models/user.model');
const { getIO, getRedisClient } = require('../services/socket.service');
const { cloudinary, uploadBuffer, deleteResource, buildImageUrl } = require('../utils/cloudinary');

const CHAT_IMAGE_MAX_BYTES = Number(process.env.CHAT_IMAGE_MAX_BYTES) || 6 * 1024 * 1024; // 6MB default
const MAX_CHAT_IMAGE_ATTACHMENTS = Number(process.env.CHAT_IMAGE_MAX_COUNT) || 4;
const CHAT_IMAGE_ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif'
]);
const CHAT_IMAGE_FOLDER = process.env.CLOUDINARY_CHAT_FOLDER || 'chat_uploads';
const CHAT_IMAGE_TRANSFORMATION = process.env.CLOUDINARY_CHAT_TRANSFORMATION || 'c_limit,w_1600,h_1600,q_auto,f_auto';
const CHAT_IMAGE_THUMB_TRANSFORMATION = process.env.CLOUDINARY_CHAT_THUMB_TRANSFORMATION || 'c_limit,w_600,h_600,q_auto,f_auto';
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || null;

const chatImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: CHAT_IMAGE_MAX_BYTES
    },
    fileFilter: (req, file, cb) => {
        if (CHAT_IMAGE_ALLOWED_MIME.has(file.mimetype)) {
            return cb(null, true);
        }
        const error = new Error('Chỉ cho phép upload ảnh (JPG, PNG, GIF, WebP, HEIC/HEIF)');
        error.code = 'UNSUPPORTED_FILE_TYPE';
        return cb(error);
    }
});

const buildAttachmentPayload = (cloudinaryResult) => {
    if (!cloudinaryResult) {
        return null;
    }

    const optimizedUrl = buildImageUrl(cloudinaryResult.public_id, {
        transformation: CHAT_IMAGE_TRANSFORMATION
    });

    const thumbnailUrl = buildImageUrl(cloudinaryResult.public_id, {
        transformation: CHAT_IMAGE_THUMB_TRANSFORMATION
    });

    return {
        url: optimizedUrl || cloudinaryResult.secure_url,
        secureUrl: optimizedUrl || cloudinaryResult.secure_url,
        thumbnailUrl,
        publicId: cloudinaryResult.public_id,
        resourceType: cloudinaryResult.resource_type,
        format: cloudinaryResult.format,
        bytes: cloudinaryResult.bytes,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        originalFilename: cloudinaryResult.original_filename,
        createdAt: cloudinaryResult.created_at
    };
};

const chatImageUploadSingle = chatImageUpload.single('image');

exports.getChatUploadConfig = (req, res) => {
    try {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME || null;
        const mode = CLOUDINARY_UPLOAD_PRESET ? 'preset' : 'signed';

        return res.json({
            success: true,
            data: {
                mode,
                cloudName,
                uploadPreset: CLOUDINARY_UPLOAD_PRESET || null,
                folder: CHAT_IMAGE_FOLDER,
                uploadUrl: cloudName ? `https://api.cloudinary.com/v1_1/${cloudName}/image/upload` : null,
                transformation: CHAT_IMAGE_TRANSFORMATION,
                thumbTransformation: CHAT_IMAGE_THUMB_TRANSFORMATION,
                maxBytes: CHAT_IMAGE_MAX_BYTES,
                maxAttachments: MAX_CHAT_IMAGE_ATTACHMENTS,
                allowedMimeTypes: Array.from(CHAT_IMAGE_ALLOWED_MIME)
            }
        });
    } catch (error) {
        console.error('Get chat upload config error:', error);
        return res.status(500).json({
            success: false,
            message: 'Không thể lấy cấu hình upload chat',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

exports.getChatUploadSignature = async (req, res) => {
    try {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;

        if (!cloudName) {
            throw new Error('Cloudinary configuration thiếu thông tin cloud name');
        }

        if (CLOUDINARY_UPLOAD_PRESET) {
            return res.json({
                success: true,
                data: {
                    mode: 'preset',
                    uploadPreset: CLOUDINARY_UPLOAD_PRESET,
                    folder: CHAT_IMAGE_FOLDER,
                    cloudName,
                    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
                    transformation: CHAT_IMAGE_TRANSFORMATION,
                    thumbTransformation: CHAT_IMAGE_THUMB_TRANSFORMATION,
                    maxBytes: CHAT_IMAGE_MAX_BYTES
                }
            });
        }

        if (!apiKey || !process.env.CLOUDINARY_API_SECRET) {
            throw new Error('Cloudinary configuration thiếu API key hoặc secret để ký upload');
        }

        const timestamp = Math.round(Date.now() / 1000);
        const folder = CHAT_IMAGE_FOLDER;
        const userId = req.userId || 'guest';
        const publicId = req.query.publicId || `chat_${userId}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

        const paramsToSign = {
            timestamp,
            folder,
            public_id: publicId,
            resource_type: 'image',
            transformation: CHAT_IMAGE_TRANSFORMATION
        };

        const signature = cloudinary.utils.api_sign_request(
            paramsToSign,
            process.env.CLOUDINARY_API_SECRET
        );

        return res.json({
            success: true,
            data: {
                mode: 'signed',
                timestamp,
                signature,
                publicId,
                folder,
                cloudName,
                apiKey,
                uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
                transformation: CHAT_IMAGE_TRANSFORMATION,
                thumbTransformation: CHAT_IMAGE_THUMB_TRANSFORMATION,
                maxBytes: CHAT_IMAGE_MAX_BYTES
            }
        });
    } catch (error) {
        console.error('Get chat upload signature error:', error);
        return res.status(500).json({
            success: false,
            message: 'Không thể tạo chữ ký upload',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

exports.chatImageUploadMiddleware = (req, res, next) => {
    chatImageUploadSingle(req, res, (err) => {
        if (!err) {
            return next();
        }

        let status = 400;
        let message = 'Lỗi khi upload ảnh';

        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                message = `Ảnh vượt quá giới hạn ${Math.round(CHAT_IMAGE_MAX_BYTES / (1024 * 1024))}MB`;
            } else {
                message = err.message || message;
            }
        } else if (err.code === 'UNSUPPORTED_FILE_TYPE') {
            message = err.message;
        } else {
            status = err.statusCode || 500;
            message = err.message || message;
        }

        return res.status(status).json({
            success: false,
            message
        });
    });
};

exports.uploadChatImage = async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy file ảnh để upload'
            });
        }

        const uniqueSuffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
        const publicId = `chat_${req.userId || 'user'}_${uniqueSuffix}`;

        const uploadResult = await uploadBuffer(req.file.buffer, {
            folder: CHAT_IMAGE_FOLDER,
            resource_type: 'image',
            public_id: publicId,
            overwrite: false,
            transformation: [{ raw_transformation: CHAT_IMAGE_TRANSFORMATION }]
        });

        const attachment = buildAttachmentPayload(uploadResult);

        if (!attachment) {
            return res.status(500).json({
                success: false,
                message: 'Không thể xử lý dữ liệu ảnh sau khi upload'
            });
        }

        return res.json({
            success: true,
            data: {
                attachment,
                messageType: 'image',
                maxAttachments: MAX_CHAT_IMAGE_ATTACHMENTS
            }
        });
    } catch (error) {
        console.error('Upload chat image error:', error);
        let status = 500;
        let message = 'Lỗi server khi upload ảnh chat';

        if (error instanceof multer.MulterError) {
            status = 400;
            if (error.code === 'LIMIT_FILE_SIZE') {
                message = `Ảnh vượt quá giới hạn ${Math.round(CHAT_IMAGE_MAX_BYTES / (1024 * 1024))}MB`;
            } else {
                message = error.message;
            }
        } else if (error.code === 'UNSUPPORTED_FILE_TYPE') {
            status = 400;
            message = error.message;
        } else if (error.http_code) {
            status = error.http_code;
            message = error.message || message;
        }

        return res.status(status).json({
            success: false,
            message
        });
    }
};

// Verify chat access code
exports.verifyChatCode = async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.userId;

        const CHAT_ACCESS_CODE = '141920'; // Mã bảo mật chat

        if (!code || code !== CHAT_ACCESS_CODE) {
            return res.status(400).json({
                success: false,
                message: 'Mã bảo mật không đúng'
            });
        }

        // Update user as verified
        await User.findByIdAndUpdate(userId, {
            chatVerified: true,
            chatVerifiedAt: new Date()
        });

        res.json({
            success: true,
            message: 'Xác thực thành công. Bạn có thể truy cập chat.'
        });
    } catch (error) {
        console.error('Verify chat code error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi xác thực',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Check chat access status
exports.checkChatAccess = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('chatVerified chatBanned');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Người dùng không tồn tại'
            });
        }

        if (user.chatBanned) {
            return res.json({
                success: false,
                hasAccess: false,
                reason: 'banned',
                message: 'Tài khoản của bạn đã bị cấm sử dụng chat'
            });
        }

        if (!user.chatVerified) {
            return res.json({
                success: true,
                hasAccess: false,
                reason: 'not_verified',
                message: 'Bạn cần nhập mã bảo mật để truy cập chat'
            });
        }

        return res.json({
            success: true,
            hasAccess: true,
            message: 'Bạn đã có quyền truy cập chat'
        });
    } catch (error) {
        console.error('Check chat access error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get groupchat room
exports.getGroupchatRoom = async (req, res) => {
    try {
        // Check if user is banned
        const user = await User.findById(req.userId).select('chatBanned chatVerified');
        
        if (user.chatBanned) {
            return res.status(403).json({
                success: false,
                message: 'Tài khoản của bạn đã bị cấm sử dụng chat'
            });
        }

        if (!user.chatVerified) {
            return res.status(403).json({
                success: false,
                message: 'Bạn cần nhập mã bảo mật để truy cập chat',
                requiresVerification: true
            });
        }

        const room = await ChatRoom.getGroupchatRoom();
        
        if (!room || !room.roomId) {
            return res.status(500).json({
                success: false,
                message: 'Không thể tạo hoặc lấy phòng chat'
            });
        }
        
        // Add current user if not in room
        const isParticipant = room.participants.some(
            p => p.userId && p.userId.toString() === req.userId.toString()
        );
        
        if (!isParticipant) {
            try {
                await room.addParticipant(req.userId, req.userRole);
                // Reload room to get updated participants
                await room.populate('participants.userId', 'username displayName role');
            } catch (addError) {
                console.error('Error adding participant:', addError);
                // Continue anyway - user can still join via socket
            }
        }

        res.json({
            success: true,
            data: {
                room: {
                    roomId: room.roomId,
                    type: room.type,
                    name: room.name || 'Group Chat',
                    description: room.description || 'Phòng chat chung cho tất cả thành viên',
                    maxUsers: room.maxUsers || 100,
                    currentUsers: room.participants ? room.participants.length : 0
                }
            }
        });
    } catch (error) {
        console.error('Get groupchat room error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy phòng chat',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get or create private chat with admin
exports.getPrivateChatWithAdmin = async (req, res) => {
    try {
        const userId = req.userId;
        const userRole = req.userRole;

        // Find an admin user
        const adminUser = await User.findOne({ role: 'admin', isActive: true });
        
        if (!adminUser) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy admin'
            });
        }

        // Check permission: Only user can chat with admin (not user-user)
        if (userRole === 'user') {
            // User can only chat with admin
            const room = await ChatRoom.findOrCreatePrivateChat(userId, adminUser._id);
            
            res.json({
                success: true,
                data: {
                    room: {
                        roomId: room.roomId,
                        type: room.type,
                        participants: room.participants.map(p => ({
                            userId: p.userId,
                            role: p.role
                        }))
                    }
                }
            });
        } else if (userRole === 'admin') {
            // Admin can chat with any user
            const { targetUserId } = req.params;
            
            if (!targetUserId) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu user ID để chat'
                });
            }

            const targetUser = await User.findById(targetUserId);
            if (!targetUser || !targetUser.isActive) {
                return res.status(404).json({
                    success: false,
                    message: 'Người dùng không tồn tại'
                });
            }

            const room = await ChatRoom.findOrCreatePrivateChat(userId, targetUser._id);
            
            res.json({
                success: true,
                data: {
                    room: {
                        roomId: room.roomId,
                        type: room.type,
                        participants: room.participants.map(p => ({
                            userId: p.userId,
                            role: p.role
                        }))
                    }
                }
            });
        } else {
            return res.status(403).json({
                success: false,
                message: 'Không có quyền chat private'
            });
        }
    } catch (error) {
        console.error('Get private chat error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get messages with pagination
exports.getMessages = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { limit = 50, beforeDate } = req.query;

        // Check if user is participant
        const room = await ChatRoom.findOne({ roomId });
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Phòng chat không tồn tại'
            });
        }

        const isParticipant = room.participants.some(
            p => p.userId.toString() === req.userId.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền truy cập phòng chat này'
            });
        }

        // Get messages
        const messages = await Message.getMessagesByRoom(roomId, {
            limit: parseInt(limit),
            beforeDate: beforeDate ? new Date(beforeDate) : null
        });

        // Reverse để hiển thị từ cũ → mới
        messages.reverse();

        res.json({
            success: true,
            data: {
                messages,
                hasMore: messages.length === parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get groupchat room public (no auth required)
exports.getGroupchatRoomPublic = async (req, res) => {
    try {
        const room = await ChatRoom.getGroupchatRoom();
        
        if (!room || !room.roomId) {
            return res.status(500).json({
                success: false,
                message: 'Không thể tạo hoặc lấy phòng chat'
            });
        }

        res.json({
            success: true,
            data: {
                room: {
                    roomId: room.roomId,
                    type: room.type,
                    name: room.name || 'Group Chat',
                    description: room.description || 'Phòng chat chung cho tất cả thành viên',
                    maxUsers: room.maxUsers || 100,
                    currentUsers: room.participants ? room.participants.length : 0
                }
            }
        });
    } catch (error) {
        console.error('Get groupchat room public error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy phòng chat',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get groupchat messages public (no auth required, read-only)
exports.getGroupchatMessagesPublic = async (req, res) => {
    try {
        const { limit = 50, beforeDate } = req.query;

        // Get groupchat room
        const room = await ChatRoom.getGroupchatRoom();
        if (!room || !room.roomId) {
            return res.status(500).json({
                success: false,
                message: 'Không thể tạo hoặc lấy phòng chat'
            });
        }

        // Get messages (public read-only access)
        const messages = await Message.getMessagesByRoom(room.roomId, {
            limit: parseInt(limit),
            beforeDate: beforeDate ? new Date(beforeDate) : null
        });

        // Reverse để hiển thị từ cũ → mới
        messages.reverse();

        res.json({
            success: true,
            data: {
                messages,
                hasMore: messages.length === parseInt(limit),
                roomId: room.roomId
            }
        });
    } catch (error) {
        console.error('Get groupchat messages public error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get user's chat rooms (for admin)
exports.getMyChatRooms = async (req, res) => {
    try {
        const userId = req.userId;
        const userRole = req.userRole;

        if (userRole === 'admin') {
            // Admin: Get all private chats
            const rooms = await ChatRoom.find({
                type: 'private',
                'participants.userId': userId,
                isActive: true
            })
            .populate('participants.userId', 'username displayName avatar role')
            .sort({ lastActivity: -1 })
            .limit(50);

            res.json({
                success: true,
                data: {
                    rooms: rooms.map(room => ({
                        roomId: room.roomId,
                        type: room.type,
                        participants: room.participants.map(p => ({
                            userId: p.userId._id,
                            username: p.userId.username,
                            displayName: p.userId.displayName,
                            avatar: p.userId.avatar,
                            role: p.userId.role
                        })),
                        lastMessage: room.lastMessage,
                        lastActivity: room.lastActivity
                    }))
                }
            });
        } else {
            // User: Get only private chat with admin
            const adminUser = await User.findOne({ role: 'admin', isActive: true });
            if (!adminUser) {
                return res.json({
                    success: true,
                    data: { rooms: [] }
                });
            }

            const room = await ChatRoom.findOne({
                type: 'private',
                'participants.userId': { $all: [userId, adminUser._id] },
                isActive: true
            })
            .populate('participants.userId', 'username displayName avatar role');

            res.json({
                success: true,
                data: {
                    rooms: room ? [{
                        roomId: room.roomId,
                        type: room.type,
                        participants: room.participants.map(p => ({
                            userId: p.userId._id,
                            username: p.userId.username,
                            displayName: p.userId.displayName,
                            avatar: p.userId.avatar,
                            role: p.userId.role
                        })),
                        lastMessage: room.lastMessage,
                        lastActivity: room.lastActivity
                    }] : []
                }
            });
        }
    } catch (error) {
        console.error('Get my chat rooms error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Mark messages as read
exports.markAsRead = async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.userId;

        // Get room to check if it's private chat
        const room = await ChatRoom.findOne({ roomId });
        if (!room) {
            return res.status(404).json({
                success: false,
                message: 'Phòng chat không tồn tại'
            });
        }

        // Get unread messages
        const unreadMessages = await Message.find({
            roomId,
            isDeleted: false,
            senderId: { $ne: userId },
            readBy: { $ne: { $elemMatch: { userId } } }
        }).limit(100);

        // 🔥 OPTIMIZATION: Skip if no unread messages (avoid unnecessary DB operations)
        if (unreadMessages.length === 0) {
            // Still emit socket event for private chat to sync unread counts
            if (room.type === 'private') {
                const io = getIO();
                if (io) {
                    const otherParticipant = room.participants.find(
                        p => p.userId.toString() !== userId.toString()
                    );
                    if (otherParticipant) {
                        const otherUserId = otherParticipant.userId.toString();
                        const updatedUnreadCount = await Message.countDocuments({
                            roomId: roomId,
                            senderId: { $ne: otherUserId },
                            readBy: { $ne: { $elemMatch: { userId: otherUserId } } },
                            isDeleted: false
                        });
                        io.to(`user:${userId}`).emit('private:unread:updated', {
                            roomId: roomId,
                            fromUserId: otherUserId,
                            unreadCount: 0,
                            timestamp: Date.now()
                        });
                        io.to(`user:${otherUserId}`).emit('private:unread:updated', {
                            roomId: roomId,
                            fromUserId: userId,
                            unreadCount: updatedUnreadCount,
                            timestamp: Date.now()
                        });
                    }
                }
            }
            
            return res.json({
                success: true,
                message: 'Đã đánh dấu đã đọc',
                data: {
                    count: 0
                }
            });
        }

        // Mark as read
        await Promise.all(
            unreadMessages.map(msg => msg.markAsRead(userId))
        );

        // 🔥 REAL-TIME: If private chat, emit socket event to update unread counts
        if (room.type === 'private') {
            const io = getIO();
            if (io) {
                // Find the other participant
                const otherParticipant = room.participants.find(
                    p => p.userId.toString() !== userId.toString()
                );
                
                if (otherParticipant) {
                    const otherUserId = otherParticipant.userId.toString();
                    
                    // Get updated unread count (should be 0 now for the user who read)
                    const updatedUnreadCount = await Message.countDocuments({
                        roomId: roomId,
                        senderId: { $ne: otherUserId },
                        readBy: { $ne: { $elemMatch: { userId: otherUserId } } },
                        isDeleted: false
                    });
                    
                    // Update Redis cache for the user who read (clear their unread)
                    const redisClient = getRedisClient();
                    if (redisClient && redisClient.isOpen) {
                        try {
                            await redisClient.set(`room:${roomId}:unread:${userId}`, '0', { EX: 300 });
                        } catch (error) {
                            // Silently fail if Redis is not available
                        }
                    }
                    
                    // Emit to both users to update their unread counts
                    // Emit to the user who read (to update their own count for this conversation)
                    io.to(`user:${userId}`).emit('private:unread:updated', {
                        roomId: roomId,
                        fromUserId: otherUserId,
                        unreadCount: 0, // User just read, so their unread from this person is 0
                        timestamp: Date.now()
                    });
                    
                    // Emit to the other user if they're online (to update their count)
                    io.to(`user:${otherUserId}`).emit('private:unread:updated', {
                        roomId: roomId,
                        fromUserId: userId,
                        unreadCount: updatedUnreadCount, // Other user's unread count from this user
                        timestamp: Date.now()
                    });
                    
                    console.log(`📖 Marked as read: room ${roomId}, updated unread count for user ${otherUserId}: ${updatedUnreadCount}`);
                }
            }
        }

        res.json({
            success: true,
            message: 'Đã đánh dấu đã đọc',
            data: {
                count: unreadMessages.length
            }
        });
    } catch (error) {
        // Handle rate limit errors gracefully
        if (error.status === 429 || error.message?.includes('Too Many Requests')) {
            return res.status(429).json({
                success: false,
                message: 'Quá nhiều requests đánh dấu đã đọc, vui lòng đợi vài giây rồi thử lại.',
                retryAfter: 5 // seconds
            });
        }
        
        console.error('Mark as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get unread count
exports.getUnreadCount = async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.userId;

        const count = await Message.getUnreadCount(roomId, userId);

        res.json({
            success: true,
            data: {
                count
            }
        });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Toggle reaction (like/heart) for a message
exports.toggleReaction = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { emoji } = req.body; // '👍' for like, '❤️' for heart
        const userId = req.userId;

        if (!emoji) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu emoji reaction'
            });
        }

        // Validate emoji (only allow like and heart)
        const allowedEmojis = ['👍', 'thumbs-up', 'thumbsup', 'like', '❤️', '❤', 'heart', '♥️', '♥'];
        if (!allowedEmojis.includes(emoji)) {
            return res.status(400).json({
                success: false,
                message: 'Emoji không hợp lệ'
            });
        }

        // Find message
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Tin nhắn không tồn tại'
            });
        }

        // Check if user has already reacted with this emoji
        const existingReactionIndex = message.reactions.findIndex(
            r => r.userId.toString() === userId.toString() && r.emoji === emoji
        );

        let updatedMessage;
        let action = '';

        if (existingReactionIndex >= 0) {
            // Remove reaction (toggle off)
            message.reactions.splice(existingReactionIndex, 1);
            action = 'removed';
        } else {
            // Remove any existing reaction from this user (only one reaction per user)
            // But allow both like and heart
            // Actually, let's allow users to have both reactions
            // Add new reaction
            message.reactions.push({
                userId,
                emoji
            });
            action = 'added';
        }

        updatedMessage = await message.save();

        // Count reactions
        const likeCount = updatedMessage.reactions.filter(r => 
            ['👍', 'thumbs-up', 'thumbsup', 'like'].includes(r.emoji)
        ).length;
        const heartCount = updatedMessage.reactions.filter(r => 
            ['❤️', '❤', 'heart', '♥️', '♥'].includes(r.emoji)
        ).length;

        res.json({
            success: true,
            message: `Đã ${action === 'added' ? 'thêm' : 'xóa'} reaction`,
            data: {
                messageId: updatedMessage._id,
                reactions: updatedMessage.reactions,
                likeCount,
                heartCount,
                action
            }
        });
    } catch (error) {
        console.error('Toggle reaction error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Delete message(s) - Admin only
exports.deleteMessages = async (req, res) => {
    try {
        const { messageIds } = req.body; // Array of message IDs
        const userRole = req.userRole;

        // Only admin can delete messages
        if (userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ admin mới có quyền xóa tin nhắn'
            });
        }

        if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu danh sách tin nhắn cần xóa'
            });
        }

        // Find and soft delete messages
        const messages = await Message.find({
            _id: { $in: messageIds },
            isDeleted: false
        });

        if (messages.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy tin nhắn cần xóa'
            });
        }

        // Delete attachments on Cloudinary if present
        const attachmentsToDelete = [];
        messages.forEach(msg => {
            if (Array.isArray(msg.attachments)) {
                msg.attachments.forEach(att => {
                    if (att && (att.publicId || att.public_id)) {
                        attachmentsToDelete.push({
                            publicId: att.publicId || att.public_id,
                            resourceType: att.resourceType || att.type || 'image'
                        });
                    }
                });
            }
        });

        if (attachmentsToDelete.length > 0) {
            await Promise.all(attachmentsToDelete.map(({ publicId, resourceType }) =>
                deleteResource(publicId, {
                    resource_type: resourceType || 'image',
                    invalidate: true
                }).catch(error => {
                    console.error('Cloudinary delete error:', {
                        publicId,
                        error: error.message || error
                    });
                })
            ));
        }

        // Soft delete all messages
        await Promise.all(
            messages.map(msg => msg.softDelete())
        );

        res.json({
            success: true,
            message: `Đã xóa ${messages.length} tin nhắn`,
            data: {
                deletedCount: messages.length,
                messageIds: messages.map(m => m._id)
            }
        });
    } catch (error) {
        console.error('Delete messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Delete single message - User can delete own message within 5 minutes, admin can delete anytime
exports.deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.userId;
        const userRole = req.userRole;

        const message = await Message.findById(messageId);
        if (!message || message.isDeleted) {
            return res.status(404).json({
                success: false,
                message: 'Tin nhắn không tồn tại'
            });
        }

        // Check permission
        const isOwner = message.senderId.toString() === userId.toString();
        const isAdmin = userRole === 'admin';
        
        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền xóa tin nhắn này'
            });
        }

        // Check time limit for non-admin users (5 minutes)
        if (isOwner && !isAdmin) {
            const messageAge = Date.now() - new Date(message.createdAt).getTime();
            const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
            
            if (messageAge > fiveMinutes) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ có thể xóa tin nhắn trong vòng 5 phút sau khi gửi'
                });
            }
        }

        // Delete attachment on Cloudinary if present
        if (Array.isArray(message.attachments) && message.attachments.length > 0) {
            await Promise.all(message.attachments.map(att => {
                const publicId = att?.publicId || att?.public_id;
                if (!publicId) {
                    return Promise.resolve();
                }

                const resourceType = att?.resourceType || att?.type || 'image';

                return deleteResource(publicId, {
                    resource_type: resourceType,
                    invalidate: true
                }).catch(error => {
                    console.error('Cloudinary delete error:', {
                        publicId,
                        error: error.message || error
                    });
                });
            }));
        }

        // Soft delete message
        await message.softDelete();

        res.json({
            success: true,
            message: 'Đã xóa tin nhắn',
            data: {
                messageId: message._id
            }
        });
    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Edit message - User can edit own message within 5 minutes, admin can edit anytime
exports.editMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;
        const userId = req.userId;
        const userRole = req.userRole;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Nội dung tin nhắn không được để trống'
            });
        }

        if (content.length > 5000) {
            return res.status(400).json({
                success: false,
                message: 'Tin nhắn không được vượt quá 5000 ký tự'
            });
        }

        const message = await Message.findById(messageId);
        if (!message || message.isDeleted) {
            return res.status(404).json({
                success: false,
                message: 'Tin nhắn không tồn tại'
            });
        }

        // Check permission
        const isOwner = message.senderId.toString() === userId.toString();
        const isAdmin = userRole === 'admin';
        
        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền sửa tin nhắn này'
            });
        }

        // Check time limit for non-admin users (5 minutes)
        if (isOwner && !isAdmin) {
            const messageAge = Date.now() - new Date(message.createdAt).getTime();
            const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
            
            if (messageAge > fiveMinutes) {
                return res.status(403).json({
                    success: false,
                    message: 'Chỉ có thể sửa tin nhắn trong vòng 5 phút sau khi gửi'
                });
            }
        }

        // Update message
        message.content = content.trim();
        message.isEdited = true;
        await message.save();

        res.json({
            success: true,
            message: 'Đã sửa tin nhắn',
            data: {
                message: {
                    id: message._id,
                    content: message.content,
                    isEdited: message.isEdited,
                    updatedAt: message.updatedAt
                }
            }
        });
    } catch (error) {
        console.error('Edit message error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Create or get private chat room (general - for any user pair)
exports.createPrivateChat = async (req, res) => {
    try {
        const userId = req.userId;
        const userRole = req.userRole;
        const { targetUserId } = req.body;

        if (!targetUserId) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu targetUserId'
            });
        }

        // Can't chat with yourself
        if (userId.toString() === targetUserId.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Không thể chat với chính mình'
            });
        }

        // Get target user
        const targetUser = await User.findById(targetUserId).select('role isActive');
        if (!targetUser || !targetUser.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Người dùng không tồn tại'
            });
        }

        const isCurrentUserAdmin = userRole === 'admin';
        const isTargetAdmin = targetUser.role === 'admin';

        // Permission check:
        // - Admin can chat with anyone (admin or user)
        // - User can only chat with admin
        // - User cannot chat with other users
        if (!isCurrentUserAdmin && !isTargetAdmin) {
            return res.status(403).json({
                success: false,
                message: 'User chỉ có thể chat với admin'
            });
        }

        // Create or get private chat room
        const room = await ChatRoom.findOrCreatePrivateChat(userId, targetUserId);

        res.json({
            success: true,
            data: {
                room: {
                    roomId: room.roomId,
                    type: room.type,
                    participants: room.participants.map(p => ({
                        userId: p.userId,
                        role: p.role
                    }))
                }
            }
        });
    } catch (error) {
        console.error('Create private chat error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get unread counts for all private chats
exports.getPrivateChatsUnreadCounts = async (req, res) => {
    try {
        const userId = req.userId;

        // Get all private chat rooms user is in
        const privateRooms = await ChatRoom.find({
            type: 'private',
            'participants.userId': userId,
            isActive: true
        }).select('roomId participants');

        // Get unread count for each room
        const counts = {};
        
        await Promise.all(privateRooms.map(async (room) => {
            // Get the other participant
            const otherParticipant = room.participants.find(
                p => p.userId.toString() !== userId.toString()
            );
            
            if (otherParticipant) {
                const unreadCount = await Message.getUnreadCount(room.roomId, userId);
                if (unreadCount > 0) {
                    counts[otherParticipant.userId.toString()] = unreadCount;
                }
            }
        }));

        res.json({
            success: true,
            data: {
                counts
            }
        });
    } catch (error) {
        console.error('Get private chats unread counts error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

