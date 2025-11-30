/**
 * Socket.io Service - Real-time chat với online/offline status
 * Tối ưu hiệu suất với Redis caching và message batching
 */

const { Server } = require('socket.io');
const { verifySocketToken } = require('../middleware/socketAuth.middleware');
const Message = require('../models/message.model');
const ChatRoom = require('../models/chatRoom.model');
const User = require('../models/user.model');
const { deleteResource, buildImageUrl } = require('../utils/cloudinary');

const CHAT_IMAGE_FOLDER = process.env.CLOUDINARY_CHAT_FOLDER || 'chat_uploads';
const CHAT_IMAGE_MAX_BYTES = Number(process.env.CHAT_IMAGE_MAX_BYTES) || 6 * 1024 * 1024;
const MAX_CHAT_IMAGE_ATTACHMENTS = Number(process.env.CHAT_IMAGE_MAX_COUNT) || 4;
const CHAT_IMAGE_TRANSFORMATION = process.env.CLOUDINARY_CHAT_TRANSFORMATION || 'c_limit,w_1600,h_1600,q_auto,f_auto';
const CHAT_IMAGE_THUMB_TRANSFORMATION = process.env.CLOUDINARY_CHAT_THUMB_TRANSFORMATION || 'c_limit,w_600,h_600,q_auto,f_auto';

const sanitizeIncomingAttachment = (attachment) => {
    if (!attachment || typeof attachment !== 'object') {
        return null;
    }

    const publicId = attachment.publicId || attachment.public_id;
    let secureUrl = attachment.secureUrl || attachment.secure_url || attachment.url;

    if (!publicId || !secureUrl) {
        return null;
    }

    if (secureUrl.startsWith('http://')) {
        secureUrl = secureUrl.replace('http://', 'https://');
    }

    if (CHAT_IMAGE_FOLDER && !publicId.startsWith(`${CHAT_IMAGE_FOLDER}/`)) {
        return null;
    }

    const resourceType = attachment.resourceType || attachment.resource_type || 'image';

    const optimizedUrl = buildImageUrl(publicId, {
        transformation: CHAT_IMAGE_TRANSFORMATION
    }) || secureUrl;

    const thumbnailUrl = attachment.thumbnailUrl || attachment.thumbnail_url || buildImageUrl(publicId, {
        transformation: CHAT_IMAGE_THUMB_TRANSFORMATION
    }) || optimizedUrl;

    const bytes = Number(attachment.bytes || attachment.size);
    if (Number.isFinite(bytes) && bytes > CHAT_IMAGE_MAX_BYTES) {
        return null;
    }

    const width = attachment.width ? Number(attachment.width) : undefined;
    const height = attachment.height ? Number(attachment.height) : undefined;
    const originalFilename = attachment.originalFilename || attachment.original_filename || attachment.name || null;
    const type = attachment.type || 'image';

    return {
        url: optimizedUrl,
        secureUrl: optimizedUrl,
        thumbnailUrl,
        publicId,
        resourceType,
        format: attachment.format || null,
        bytes: Number.isFinite(bytes) ? bytes : undefined,
        size: Number.isFinite(bytes) ? bytes : undefined,
        width: Number.isFinite(width) ? width : undefined,
        height: Number.isFinite(height) ? height : undefined,
        originalFilename,
        name: attachment.name || originalFilename || null,
        type
    };
};

const formatAttachmentForClient = (attachment) => {
    if (!attachment) {
        return null;
    }

    const plain = typeof attachment.toObject === 'function' ? attachment.toObject() : attachment;
    const secureUrl = plain.secureUrl || plain.url;
    const publicId = plain.publicId || plain.public_id;

    if (!secureUrl || !publicId) {
        return null;
    }

    const optimizedUrl = buildImageUrl(publicId, {
        transformation: CHAT_IMAGE_TRANSFORMATION
    }) || secureUrl;

    const thumbnailUrl = plain.thumbnailUrl || buildImageUrl(publicId, {
        transformation: CHAT_IMAGE_THUMB_TRANSFORMATION
    }) || optimizedUrl;

    return {
        url: optimizedUrl,
        secureUrl: optimizedUrl,
        thumbnailUrl,
        publicId,
        resourceType: plain.resourceType || plain.resource_type || 'image',
        format: plain.format || null,
        bytes: plain.bytes || plain.size || null,
        size: plain.size || plain.bytes || null,
        width: plain.width || null,
        height: plain.height || null,
        originalFilename: plain.originalFilename || plain.original_filename || plain.name || null,
        name: plain.name || plain.originalFilename || plain.original_filename || null,
        type: plain.type || 'image'
    };
};

let io = null;
let redisClient = null;

// Message batch queue
const messageBatches = new Map(); // roomId -> messages[]

// Initialize Socket.io
const initializeSocket = (server, redis) => {
    redisClient = redis;

    io = new Server(server, {
        cors: {
            origin: function (origin, callback) {
                // Allow requests with no origin (like mobile apps or curl requests)
                if (!origin) return callback(null, true);
                
                const allowedOrigins = process.env.FRONTEND_URL?.split(',') || ['*'];
                
                // Check if origin is allowed
                if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
                    return callback(null, true);
                }
                
                // Check for subdomain matches
                const isSubdomainMatch = allowedOrigins.some(allowedOrigin => {
                    if (allowedOrigin.includes('.')) {
                        const domain = allowedOrigin.replace(/^https?:\/\//, '');
                        const requestDomain = origin.replace(/^https?:\/\//, '');
                        
                        // Exact match
                        if (requestDomain === domain) return true;
                        
                        // Subdomain match
                        if (requestDomain.endsWith('.' + domain)) return true;
                        if (domain.endsWith('.' + requestDomain)) return true;
                        
                        // Same root domain
                        const requestParts = requestDomain.split('.');
                        const domainParts = domain.split('.');
                        if (requestParts.length >= 2 && domainParts.length >= 2) {
                            const requestRoot = requestParts.slice(-2).join('.');
                            const domainRoot = domainParts.slice(-2).join('.');
                            return requestRoot === domainRoot;
                        }
                    }
                    return false;
                });
                
                if (isSubdomainMatch) {
                    return callback(null, true);
                }
                
                return callback(new Error('Not allowed by CORS'));
            },
            credentials: true,
            methods: ['GET', 'POST', 'OPTIONS']
        },
        pingTimeout: 60000,
        pingInterval: 20000, // 🔥 OPTIMIZED: Reduced from 25s to 20s for better connection monitoring
        // Performance optimizations
        transports: ['websocket', 'polling'],
        allowEIO3: true,
        // WebSocket compression
        perMessageDeflate: {
            threshold: 1024, // Only compress messages > 1KB
            zlibDeflateOptions: {
                chunkSize: 8 * 1024,
                level: 3 // Fast compression
            }
        },
        httpCompression: {
            threshold: 1024,
            level: 3
        },
        // Upgrade transport immediately
        upgradeTimeout: 10000,
        // Max HTTP buffer size
        maxHttpBufferSize: 1e8, // 100MB
        // Connection state recovery
        connectionStateRecovery: {
            maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
            skipMiddlewares: true,
        }
    });

    // Socket authentication middleware
    io.use(verifySocketToken);

    // Connection handler
    io.on('connection', async (socket) => {
        const userId = socket.userId;
        const userRole = socket.userRole;
        const user = socket.user;

        console.log(`✅ User connected: ${user.username} (${userRole})`);

        try {
            // Update user status to online
            await updateUserStatus(userId, 'online', socket.id);
            
            // Join personal room for real-time notifications
            socket.join(`user:${userId}`);
            console.log(`📱 User joined personal room: user:${userId}`);

            // Join user to their rooms first
            await joinUserRooms(socket, userId, userRole);

            // Get all rooms user is in (giới hạn để tránh hết bộ nhớ)
            const groupchatRoom = await ChatRoom.getGroupchatRoom();
            const privateRooms = await ChatRoom.find({
                type: 'private',
                'participants.userId': userId,
                isActive: true
            })
            .limit(100); // Giới hạn tối đa 100 phòng chat

            // Broadcast user online to all rooms user is in
            const allRooms = [groupchatRoom, ...privateRooms].filter(Boolean);
            for (const room of allRooms) {
                if (room && room.roomId) {
                    io.to(`room:${room.roomId}`).emit('user:online', {
                        userId,
                        username: user.username,
                        displayName: user.displayName,
                        avatar: user.avatar || null,
                        status: 'online',
                        roomId: room.roomId
                    });
                    
                    // Invalidate online users cache for this room
                    if (redisClient && redisClient.isOpen) {
                        try {
                            await redisClient.del(`room:${room.roomId}:online_users`);
                        } catch (error) {
                            // Silently fail
                        }
                    }
                }
            }

            // Send ALL participants list for groupchat (both online and offline)
            if (groupchatRoom && groupchatRoom.roomId) {
                const onlineUsers = await getOnlineUsersInRoom(groupchatRoom.roomId);
                const onlineUserIds = onlineUsers.map(u => u.userId);
                
                // Get all participants from room
                const allParticipantIds = groupchatRoom.participants.map(p => p.userId.toString());
                
                // Fetch all user data
                const allUsersData = await Promise.all(
                    allParticipantIds.map(async (userId) => {
                        const userData = await User.findById(userId).select('username displayName role avatar lastSeen');
                        if (!userData) return null;
                        
                        const isOnline = onlineUserIds.includes(userId);
                        return {
                            userId: userId,
                            username: userData.username || '',
                            displayName: userData.displayName || userData.username || '',
                            avatar: userData.avatar || null,
                            role: userData.role || 'user',
                            status: isOnline ? 'online' : 'offline',
                            lastSeen: userData.lastSeen
                        };
                    })
                );
                
                // Filter out nulls and sort: online first, then by displayName
                const sortedUsers = allUsersData
                    .filter(Boolean)
                    .sort((a, b) => {
                        // Online users first
                        if (a.status === 'online' && b.status === 'offline') return -1;
                        if (a.status === 'offline' && b.status === 'online') return 1;
                        // Then sort by displayName
                        return (a.displayName || '').localeCompare(b.displayName || '');
                    });
                
                socket.emit('users:list', {
                    roomId: groupchatRoom.roomId,
                    users: sortedUsers
                });
            }

            // Handle events
            setupSocketEvents(socket, userId, userRole, user);

            // Handle disconnect
            socket.on('disconnect', async () => {
                await handleDisconnect(socket, userId, user);
            });

            // Handle ping (heartbeat)
            socket.on('ping', async () => {
                await handlePing(userId);
                socket.emit('pong');
            });

        } catch (error) {
            console.error('Socket connection error:', error);
            socket.disconnect();
        }
    });

    // Batch message sender (every 10ms for ultra-low latency - optimized for real-time)
    // Reduced from 20ms to 10ms for better real-time feel, especially for groupchat
    setInterval(() => {
        flushMessageBatches();
    }, 10);

    // Auto cleanup offline users (every 1 minute)
    setInterval(async () => {
        await cleanupOfflineUsers();
    }, 60000);

    if (process.env.NODE_ENV === 'development') {
        console.log('✅ Socket.io initialized');
    }
    return io;
};

// Update user status
const updateUserStatus = async (userId, status, socketId = null) => {
    try {
        // Update MongoDB
        await User.findByIdAndUpdate(userId, {
            socketId,
            lastSeen: new Date(),
            ...(socketId && { socketId })
        });

        // Cache in Redis
        if (redisClient && redisClient.isOpen) {
            try {
                if (status === 'online') {
                    await redisClient.set(`user:${userId}:status`, 'online', { EX: 300 }); // 5 min TTL
                } else {
                    await redisClient.del(`user:${userId}:status`);
                }
            } catch (error) {
                // Silently fail if Redis is not available
            }
        }
    } catch (error) {
        console.error('Update user status error:', error);
    }
};

// Join user to their rooms
const joinUserRooms = async (socket, userId, userRole) => {
    try {
        // Always join groupchat
        const groupchatRoom = await ChatRoom.getGroupchatRoom();
        if (groupchatRoom && groupchatRoom.roomId) {
            await groupchatRoom.addParticipant(userId, userRole);
            socket.join(`room:${groupchatRoom.roomId}`);
            console.log(`📱 User joined groupchat: ${groupchatRoom.roomId}`);
        } else {
            console.error('❌ Failed to get or create groupchat room');
        }

        // Join private chats
        const privateRooms = await ChatRoom.find({
            type: 'private',
            'participants.userId': userId,
            isActive: true
        });

        for (const room of privateRooms) {
            if (room && room.roomId) {
                socket.join(`room:${room.roomId}`);
                console.log(`📱 User joined private chat: ${room.roomId}`);
            }
        }
    } catch (error) {
        console.error('Join rooms error:', error);
    }
};

// Setup socket events
const setupSocketEvents = (socket, userId, userRole, user) => {
    // Send message
    socket.on('message:send', async (data) => {
        try {
            const {
                roomId,
                content,
                type = 'text',
                mentions = [],
                replyTo = null,
                attachments = [],
                clientMessageId: incomingClientMessageId = null
            } = data || {};

            if (!roomId) {
                return socket.emit('error', { message: 'Thiếu thông tin phòng chat' });
            }

            const trimmedContent = typeof content === 'string' ? content.trim() : '';
            const clientMessageId = incomingClientMessageId || null;

            let sanitizedAttachments = [];
            if (Array.isArray(attachments)) {
                sanitizedAttachments = attachments
                    .map(sanitizeIncomingAttachment)
                    .filter(Boolean);
            }

            if (attachments && attachments.length > 0 && sanitizedAttachments.length !== attachments.length) {
                return socket.emit('error', { message: 'Tệp đính kèm không hợp lệ' });
            }

            if (sanitizedAttachments.length > MAX_CHAT_IMAGE_ATTACHMENTS) {
                return socket.emit('error', { message: `Chỉ gửi tối đa ${MAX_CHAT_IMAGE_ATTACHMENTS} ảnh mỗi tin nhắn` });
            }

            let messageType = type || 'text';
            const hasAttachments = sanitizedAttachments.length > 0;

            if (hasAttachments && messageType === 'text') {
                messageType = 'image';
            }

            if ((messageType === 'text' || messageType === 'system') && !trimmedContent) {
                return socket.emit('error', { message: 'Nội dung không được để trống' });
            }

            if (messageType === 'image' && !hasAttachments) {
                return socket.emit('error', { message: 'Ảnh đính kèm không hợp lệ' });
            }

            const room = await ChatRoom.findOne({ roomId });
            
            if (!room) {
                return socket.emit('error', { message: 'Phòng chat không tồn tại' });
            }

            // Check if user is participant
            const isParticipant = room.participants.some(
                p => p.userId.toString() === userId
            );
            if (!isParticipant) {
                return socket.emit('error', { message: 'Bạn không có quyền gửi tin nhắn' });
            }

            // Check private chat permission
            if (room.type === 'private') {
                const otherParticipant = room.participants.find(
                    p => p.userId.toString() !== userId
                );
                
                if (otherParticipant) {
                    const otherUser = await User.findById(otherParticipant.userId);
                    
                    if (!otherUser) {
                        return socket.emit('error', { message: 'Người dùng không tồn tại' });
                    }

                    // User can only chat with admin
                    if (userRole === 'user' && otherUser.role !== 'admin') {
                        return socket.emit('error', { message: 'User không thể chat với user khác' });
                    }
                }
            }

            // Validate replyTo if provided
            let replyToMessage = null;
            if (replyTo) {
                try {
                    // Handle both string and ObjectId formats
                    const replyToId = typeof replyTo === 'string' ? replyTo : (replyTo.id || replyTo._id);
                    
                    if (!replyToId) {
                        return socket.emit('error', { message: 'ID tin nhắn được trả lời không hợp lệ' });
                    }
                    
                    replyToMessage = await Message.findOne({ 
                        _id: replyToId, 
                        roomId: roomId, 
                        isDeleted: false 
                    });
                    
                    if (!replyToMessage) {
                        return socket.emit('error', { message: 'Tin nhắn được trả lời không tồn tại hoặc đã bị xóa' });
                    }
                } catch (error) {
                    console.error('Error validating replyTo:', error);
                    return socket.emit('error', { message: 'Lỗi khi kiểm tra tin nhắn được trả lời' });
                }
            }

            // Process mentions - validate and get user info
            const processedMentions = [];
            if (mentions && mentions.length > 0) {
                for (const mention of mentions) {
                    if (mention.userId) {
                        const mentionedUser = await User.findById(mention.userId).select('username displayName');
                        if (mentionedUser) {
                            // Check if user is in the room
                            const isInRoom = room.participants.some(
                                p => p.userId.toString() === mention.userId.toString()
                            );
                            if (isInRoom) {
                                processedMentions.push({
                                    userId: mentionedUser._id,
                                    username: mentionedUser.username,
                                    displayName: mentionedUser.displayName || mentionedUser.username
                                });
                            }
                        }
                    }
                }
            }

            const messageContent = trimmedContent || '';

            // Create message
            const message = await Message.create({
                roomId,
                roomType: room.type,
                senderId: userId,
                senderUsername: user.username,
                senderDisplayName: user.displayName,
                senderRole: userRole,
                content: messageContent,
                type: messageType,
                attachments: sanitizedAttachments,
                mentions: processedMentions,
                replyTo: replyToMessage ? replyToMessage._id : null
            });

            // Update room last message
            await room.updateLastMessage({
                _id: message._id,
                content: message.content,
                senderId: message.senderId,
                senderDisplayName: message.senderDisplayName,
                createdAt: message.createdAt,
                type: message.type,
                attachments: sanitizedAttachments
            });

            // 🔥 OPTIMIZE: Cache user avatar in Redis to reduce DB queries
            // Get user avatar
            let senderAvatar = null;
            if (redisClient && redisClient.isOpen) {
                try {
                    const cachedAvatar = await redisClient.get(`user:${userId}:avatar`);
                    if (cachedAvatar !== null) {
                        senderAvatar = cachedAvatar === 'null' ? null : cachedAvatar;
                    } else {
            const senderUser = await User.findById(userId).select('avatar');
                        senderAvatar = senderUser?.avatar || null;
                        // Cache for 10 minutes
                        await redisClient.set(`user:${userId}:avatar`, senderAvatar || 'null', { EX: 600 });
                    }
                } catch (error) {
                    // Fallback to DB if Redis fails
                    const senderUser = await User.findById(userId).select('avatar');
                    senderAvatar = senderUser?.avatar || null;
                }
            } else {
                const senderUser = await User.findById(userId).select('avatar');
                senderAvatar = senderUser?.avatar || null;
            }

            // Prepare message data with replyTo info
            const formattedAttachments = (message.attachments || [])
                .map(formatAttachmentForClient)
                .filter(Boolean);

            const messageData = {
                id: message._id.toString(),
                roomId: message.roomId,
                roomType: message.roomType,
                senderId: message.senderId.toString(), // Convert ObjectId to string
                senderUsername: message.senderUsername,
                senderDisplayName: message.senderDisplayName,
                senderRole: message.senderRole,
                senderAvatar: senderAvatar, // Add avatar to message data
                content: message.content,
                type: message.type,
                attachments: formattedAttachments,
                createdAt: message.createdAt,
                isEdited: message.isEdited,
                readBy: [],
                clientMessageId: clientMessageId || undefined
            };

            // Add replyTo info if exists
            if (replyToMessage) {
                messageData.replyTo = {
                    id: replyToMessage._id.toString(),
                    content: replyToMessage.content,
                    senderDisplayName: replyToMessage.senderDisplayName,
                    senderUsername: replyToMessage.senderUsername,
                    createdAt: replyToMessage.createdAt
                };
            }

            // Add mentions info if exists
            if (processedMentions.length > 0) {
                messageData.mentions = processedMentions;
            }

            // Add to batch queue
            addToBatch(roomId, messageData);

            // 🔥 OPTIMIZE: Redis caching moved to flushMessageBatches() for batch operations
            // This reduces Redis operations from 3 per message to 1 per batch
            // Cache in Redis will be handled in flushMessageBatches() for better performance
            
            // 🔥 REAL-TIME: If private chat, notify the other user instantly
            if (room.type === 'private') {
                const otherParticipant = room.participants.find(
                    p => p.userId.toString() !== userId.toString()
                );
                
                if (otherParticipant) {
                    const otherUserId = otherParticipant.userId.toString();
                    
                    // 🔥 OPTIMIZED: Use Redis counter (INCR) for atomic increment - much faster than get+set
                    let unreadMessages = 1; // Default to 1 (this new message)
                    if (redisClient && redisClient.isOpen) {
                        try {
                            const counterKey = `room:${roomId}:unread:${otherUserId}`;
                            // Use INCR for atomic increment (faster than get+set)
                            const newCount = await redisClient.incr(counterKey);
                            // Set TTL if this is the first increment (key doesn't exist)
                            if (newCount === 1) {
                                await redisClient.expire(counterKey, 300); // 5 min TTL
                            } else {
                                // Refresh TTL on each increment
                                await redisClient.expire(counterKey, 300);
                            }
                            unreadMessages = newCount;
                        } catch (error) {
                            console.error('Redis unread count error:', error);
                            // Fallback to DB if Redis fails
                            unreadMessages = await Message.countDocuments({
                                roomId: roomId,
                                senderId: { $ne: otherUserId },
                                readBy: { $ne: { $elemMatch: { userId: otherUserId } } },
                                isDeleted: false
                            });
                            // Try to cache the result
                            if (redisClient && redisClient.isOpen) {
                                try {
                                    await redisClient.set(`room:${roomId}:unread:${otherUserId}`, unreadMessages.toString(), { EX: 300 });
                                } catch (cacheError) {
                                    // Silently fail
                                }
                            }
                        }
                    } else {
                        // No Redis, use DB
                        unreadMessages = await Message.countDocuments({
                            roomId: roomId,
                            senderId: { $ne: otherUserId },
                            readBy: { $ne: { $elemMatch: { userId: otherUserId } } },
                            isDeleted: false
                        });
                    }
                    
                    // Emit to the other user's personal room (instant notification!)
                    io.to(`user:${otherUserId}`).emit('private:message:new', {
                        fromUserId: userId,
                        fromUsername: user.username,
                        fromDisplayName: user.displayName,
                        fromAvatar: senderAvatar,
                        roomId: roomId,
                        unreadCount: unreadMessages,
                        messagePreview: (messageContent || (formattedAttachments.length > 0 ? '[Hình ảnh]' : '')).substring(0, 80),
                        timestamp: Date.now()
                    });
                    
                    console.log(`🔔 Notified user ${otherUserId} about new message from ${user.username}`);
                }
            }

        } catch (error) {
            console.error('Send message error:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                roomId,
                userId,
                hasContent: !!content,
                hasReplyTo: !!replyTo
            });
            
            // Send more detailed error to client for debugging
            const errorMessage = process.env.NODE_ENV === 'development' 
                ? `Lỗi khi gửi tin nhắn: ${error.message}`
                : 'Lỗi khi gửi tin nhắn';
            
            socket.emit('error', { message: errorMessage });
        }
    });

    // Join room
    socket.on('room:join', async (data) => {
        try {
            const { roomId } = data;
            const room = await ChatRoom.findOne({ roomId });

            if (!room) {
                return socket.emit('error', { message: 'Phòng chat không tồn tại' });
            }

            // Check permission
            const isParticipant = room.participants.some(
                p => p.userId.toString() === userId
            );

            if (!isParticipant) {
                // Add user if allowed
                if (room.type === 'groupchat') {
                    await room.addParticipant(userId, userRole);
                } else {
                    return socket.emit('error', { message: 'Bạn không có quyền vào phòng này' });
                }
            }

            socket.join(`room:${roomId}`);
            socket.emit('room:joined', { roomId });

            // Send recent messages
            const messages = await Message.getMessagesByRoom(roomId, { limit: 50 });
            messages.reverse();
            socket.emit('messages:history', { roomId, messages });

            // Send ALL participants list (both online and offline)
            const onlineUsers = await getOnlineUsersInRoom(roomId);
            const onlineUserIds = onlineUsers.map(u => u.userId);
            
            // Get all participants from room
            const allParticipantIds = room.participants.map(p => p.userId.toString());
            
            // Fetch all user data
            const allUsersData = await Promise.all(
                allParticipantIds.map(async (userId) => {
                    const userData = await User.findById(userId).select('username displayName role avatar lastSeen');
                    if (!userData) return null;
                    
                    const isOnline = onlineUserIds.includes(userId);
                    return {
                        userId: userId,
                        username: userData.username || '',
                        displayName: userData.displayName || userData.username || '',
                        avatar: userData.avatar || null,
                        role: userData.role || 'user',
                        status: isOnline ? 'online' : 'offline',
                        lastSeen: userData.lastSeen
                    };
                })
            );
            
            // Filter out nulls and sort: online first, then by displayName
            const sortedUsers = allUsersData
                .filter(Boolean)
                .sort((a, b) => {
                    // Online users first
                    if (a.status === 'online' && b.status === 'offline') return -1;
                    if (a.status === 'offline' && b.status === 'online') return 1;
                    // Then sort by displayName
                    return (a.displayName || '').localeCompare(b.displayName || '');
                });
            
            socket.emit('users:list', {
                roomId,
                users: sortedUsers
            });

        } catch (error) {
            console.error('Join room error:', error);
            socket.emit('error', { message: 'Lỗi khi tham gia phòng' });
        }
    });

    // Leave room
    socket.on('room:leave', async (data) => {
        try {
            const { roomId } = data;
            socket.leave(`room:${roomId}`);
            socket.emit('room:left', { roomId });
        } catch (error) {
            console.error('Leave room error:', error);
        }
    });

    // Typing indicator
    socket.on('typing:start', async (data) => {
        try {
            const { roomId } = data;
            socket.to(`room:${roomId}`).emit('typing:user', {
                userId,
                username: user.username,
                displayName: user.displayName,
                roomId
            });
        } catch (error) {
            console.error('Typing error:', error);
        }
    });

    socket.on('typing:stop', async (data) => {
        try {
            const { roomId } = data;
            socket.to(`room:${roomId}`).emit('typing:stop', {
                userId,
                roomId
            });
        } catch (error) {
            console.error('Typing stop error:', error);
        }
    });

    // Mark as read
    // 🔥 OPTIMIZED: Mark entire room as read via socket (no HTTP rate limiting!)
    socket.on('room:mark-read', async (data) => {
        try {
            const { roomId } = data;
            
            if (!roomId) {
                return socket.emit('error', { message: 'Thiếu roomId' });
            }

            // Get room to verify access and check type
            const room = await ChatRoom.findOne({ roomId });
            if (!room) {
                return socket.emit('error', { message: 'Phòng chat không tồn tại' });
            }

            // Check if user is in this room
            const isParticipant = room.participants.some(
                p => p.userId.toString() === userId.toString()
            );
            if (!isParticipant) {
                return socket.emit('error', { message: 'Bạn không có quyền truy cập phòng này' });
            }

            // Get unread messages (optimized query)
            const unreadMessages = await Message.find({
                roomId,
                isDeleted: false,
                senderId: { $ne: userId },
                readBy: { $ne: { $elemMatch: { userId } } }
            }).limit(100).lean(); // Use lean() for faster queries

            // If no unread messages, just emit confirmation
            if (unreadMessages.length === 0) {
                // Still emit socket event for private chat to sync unread counts
                if (room.type === 'private') {
                    const otherParticipant = room.participants.find(
                        p => p.userId.toString() !== userId.toString()
                    );
                    if (otherParticipant) {
                        const otherUserId = otherParticipant.userId.toString();
                        
                        // Get updated unread count (fast query with lean)
                        const updatedUnreadCount = await Message.countDocuments({
                            roomId: roomId,
                            senderId: { $ne: otherUserId },
                            readBy: { $ne: { $elemMatch: { userId: otherUserId } } },
                            isDeleted: false
                        });
                        
                        // Update Redis cache
                        if (redisClient && redisClient.isOpen) {
                            try {
                                await redisClient.set(`room:${roomId}:unread:${userId}`, '0', { EX: 300 });
                            } catch (error) {
                                // Silently fail
                            }
                        }
                        
                        // Emit to both users
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
                
                return socket.emit('room:marked-read', {
                    roomId,
                    count: 0,
                    timestamp: Date.now()
                });
            }

            // Batch mark as read (optimized)
            const messageIds = unreadMessages.map(msg => msg._id);
            await Message.updateMany(
                { _id: { $in: messageIds } },
                { 
                    $push: { 
                        readBy: { 
                            userId: userId,
                            readAt: new Date()
                        }
                    }
                }
            );

            // 🔥 REAL-TIME: If private chat, emit socket event to update unread counts
            if (room.type === 'private') {
                // Use io directly (already available in this file's scope)
                if (io) {
                    const otherParticipant = room.participants.find(
                        p => p.userId.toString() !== userId.toString()
                    );
                    
                    if (otherParticipant) {
                        const otherUserId = otherParticipant.userId.toString();
                        
                        // 🔥 OPTIMIZED: Use Redis counter for unread count (faster than DB query)
                        let updatedUnreadCount = 0;
                        if (redisClient && redisClient.isOpen) {
                            try {
                                // Set counter to 0 for user who read (clear their unread)
                                const userCounterKey = `room:${roomId}:unread:${userId}`;
                                await redisClient.set(userCounterKey, '0', { EX: 300 });
                                
                                // Get other user's unread count from Redis (or fallback to DB)
                                const otherCounterKey = `room:${roomId}:unread:${otherUserId}`;
                                const cachedCount = await redisClient.get(otherCounterKey);
                                if (cachedCount !== null) {
                                    updatedUnreadCount = parseInt(cachedCount, 10);
                                } else {
                                    // Fallback to DB only if cache miss
                                    updatedUnreadCount = await Message.countDocuments({
                            roomId: roomId,
                            senderId: { $ne: otherUserId },
                            readBy: { $ne: { $elemMatch: { userId: otherUserId } } },
                            isDeleted: false
                        });
                                    // Cache the result
                                    await redisClient.set(otherCounterKey, updatedUnreadCount.toString(), { EX: 300 });
                                }
                            } catch (error) {
                                // Fallback to DB if Redis fails
                                updatedUnreadCount = await Message.countDocuments({
                                    roomId: roomId,
                                    senderId: { $ne: otherUserId },
                                    readBy: { $ne: { $elemMatch: { userId: otherUserId } } },
                                    isDeleted: false
                                });
                            }
                        } else {
                            // No Redis, use DB
                            updatedUnreadCount = await Message.countDocuments({
                                roomId: roomId,
                                senderId: { $ne: otherUserId },
                                readBy: { $ne: { $elemMatch: { userId: otherUserId } } },
                                isDeleted: false
                            });
                        }
                        
                        // Emit to both users
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

            // Confirm to sender
            socket.emit('room:marked-read', {
                roomId,
                count: unreadMessages.length,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('Mark room as read error:', error);
            socket.emit('error', { 
                message: 'Lỗi khi đánh dấu đã đọc',
                roomId: data?.roomId 
            });
        }
    });

    // Legacy: Mark single message as read (for backward compatibility)
    socket.on('message:read', async (data) => {
        try {
            const { messageId, roomId } = data;
            const message = await Message.findById(messageId);

            if (message && message.roomId === roomId) {
                await message.markAsRead(userId);
            }
        } catch (error) {
            console.error('Mark as read error:', error);
        }
    });

    // Toggle reaction
    socket.on('message:reaction', async (data) => {
        try {
            const { messageId, emoji } = data;

            if (!messageId || !emoji) {
                return socket.emit('error', { message: 'Thiếu dữ liệu reaction' });
            }

            // Validate emoji
            const allowedEmojis = ['👍', 'thumbs-up', 'thumbsup', 'like', '❤️', '❤', 'heart', '♥️', '♥'];
            if (!allowedEmojis.includes(emoji)) {
                return socket.emit('error', { message: 'Emoji không hợp lệ' });
            }

            // Find message
            const message = await Message.findById(messageId);
            if (!message) {
                return socket.emit('error', { message: 'Tin nhắn không tồn tại' });
            }

            // Check if user has already reacted with this emoji
            const existingReactionIndex = message.reactions.findIndex(
                r => r.userId.toString() === userId.toString() && r.emoji === emoji
            );

            if (existingReactionIndex >= 0) {
                // Remove reaction
                message.reactions.splice(existingReactionIndex, 1);
            } else {
                // Add new reaction
                message.reactions.push({
                    userId,
                    emoji
                });
            }

            const updatedMessage = await message.save();

            // Count reactions
            const likeCount = updatedMessage.reactions.filter(r => 
                ['👍', 'thumbs-up', 'thumbsup', 'like'].includes(r.emoji)
            ).length;
            const heartCount = updatedMessage.reactions.filter(r => 
                ['❤️', '❤', 'heart', '♥️', '♥'].includes(r.emoji)
            ).length;

            // Broadcast to all users in the room
            io.to(`room:${message.roomId}`).emit('message:reaction:updated', {
                messageId: updatedMessage._id,
                reactions: updatedMessage.reactions,
                likeCount,
                heartCount,
                userId,
                emoji
            });
        } catch (error) {
            console.error('Toggle reaction error:', error);
            socket.emit('error', { message: 'Lỗi khi thêm reaction' });
        }
    });

    // Delete messages - Admin only
    socket.on('messages:delete', async (data) => {
        try {
            const { messageIds, roomId } = data;

            // Only admin can delete messages
            if (userRole !== 'admin') {
                return socket.emit('error', { message: 'Chỉ admin mới có quyền xóa tin nhắn' });
            }

            if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
                return socket.emit('error', { message: 'Thiếu danh sách tin nhắn cần xóa' });
            }

            // Find and soft delete messages
            const messages = await Message.find({
                _id: { $in: messageIds },
                roomId: roomId,
                isDeleted: false
            });

            if (messages.length === 0) {
                return socket.emit('error', { message: 'Không tìm thấy tin nhắn cần xóa' });
            }

            // Delete attachments on Cloudinary (if any)
            const attachmentsToDelete = [];
            messages.forEach(msg => {
                if (Array.isArray(msg.attachments)) {
                    msg.attachments.forEach(att => {
                        const publicId = att?.publicId || att?.public_id;
                        if (publicId) {
                            attachmentsToDelete.push({
                                publicId,
                                resourceType: att?.resourceType || att?.type || 'image'
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

            // Broadcast to all users in the room
            io.to(`room:${roomId}`).emit('messages:deleted', {
                roomId,
                messageIds: messages.map(m => m._id.toString()),
                deletedCount: messages.length
            });
        } catch (error) {
            console.error('Delete messages error:', error);
            socket.emit('error', { message: 'Lỗi khi xóa tin nhắn' });
        }
    });

    // Delete single message
    socket.on('message:delete', async (data) => {
        try {
            const { messageId, roomId } = data;

            const message = await Message.findById(messageId);
            if (!message || message.isDeleted) {
                return socket.emit('error', { message: 'Tin nhắn không tồn tại' });
            }

            if (message.roomId !== roomId) {
                return socket.emit('error', { message: 'Tin nhắn không thuộc phòng này' });
            }

            // Check permission
            const isOwner = message.senderId.toString() === userId.toString();
            const isAdmin = userRole === 'admin';
            
            if (!isOwner && !isAdmin) {
                return socket.emit('error', { message: 'Bạn không có quyền xóa tin nhắn này' });
            }

            // Check time limit for non-admin users (5 minutes)
            if (isOwner && !isAdmin) {
                const messageAge = Date.now() - new Date(message.createdAt).getTime();
                const fiveMinutes = 5 * 60 * 1000;
                
                if (messageAge > fiveMinutes) {
                    return socket.emit('error', { message: 'Chỉ có thể xóa tin nhắn trong vòng 5 phút sau khi gửi' });
                }
            }

            // Delete attachment on Cloudinary if exists
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

            // Broadcast to all users in the room
            io.to(`room:${roomId}`).emit('message:deleted', {
                roomId,
                messageId: message._id.toString()
            });
        } catch (error) {
            console.error('Delete message error:', error);
            socket.emit('error', { message: 'Lỗi khi xóa tin nhắn' });
        }
    });

    // Edit message
    socket.on('message:edit', async (data) => {
        try {
            const { messageId, roomId, content } = data;

            if (!content || content.trim().length === 0) {
                return socket.emit('error', { message: 'Nội dung tin nhắn không được để trống' });
            }

            if (content.length > 5000) {
                return socket.emit('error', { message: 'Tin nhắn không được vượt quá 5000 ký tự' });
            }

            const message = await Message.findById(messageId);
            if (!message || message.isDeleted) {
                return socket.emit('error', { message: 'Tin nhắn không tồn tại' });
            }

            if (message.roomId !== roomId) {
                return socket.emit('error', { message: 'Tin nhắn không thuộc phòng này' });
            }

            // Check permission
            const isOwner = message.senderId.toString() === userId.toString();
            const isAdmin = userRole === 'admin';
            
            if (!isOwner && !isAdmin) {
                return socket.emit('error', { message: 'Bạn không có quyền sửa tin nhắn này' });
            }

            // Check time limit for non-admin users (5 minutes)
            if (isOwner && !isAdmin) {
                const messageAge = Date.now() - new Date(message.createdAt).getTime();
                const fiveMinutes = 5 * 60 * 1000;
                
                if (messageAge > fiveMinutes) {
                    return socket.emit('error', { message: 'Chỉ có thể sửa tin nhắn trong vòng 5 phút sau khi gửi' });
                }
            }

            // Update message
            message.content = content.trim();
            message.isEdited = true;
            await message.save();

            // Broadcast to all users in the room
            io.to(`room:${roomId}`).emit('message:edited', {
                roomId,
                messageId: message._id.toString(),
                content: message.content,
                isEdited: message.isEdited,
                updatedAt: message.updatedAt
            });
        } catch (error) {
            console.error('Edit message error:', error);
            socket.emit('error', { message: 'Lỗi khi sửa tin nhắn' });
        }
    });
};

// Add message to batch
const addToBatch = (roomId, message) => {
    if (!messageBatches.has(roomId)) {
        messageBatches.set(roomId, []);
    }
    messageBatches.get(roomId).push(message);
};

// Flush message batches with error handling and delivery confirmation
const flushMessageBatches = () => {
    for (const [roomId, messages] of messageBatches.entries()) {
        if (messages.length > 0) {
            try {
                // Get sockets in room to ensure delivery
                const socketsInRoom = io.sockets.adapter.rooms.get(`room:${roomId}`);
                
                if (socketsInRoom && socketsInRoom.size > 0) {
                    // Emit with acknowledgment for reliability
                    io.to(`room:${roomId}`).emit('messages:batch', {
                        roomId,
                        messages,
                        timestamp: Date.now()
                    });
                    
                    console.log(`📤 Sent batch: ${messages.length} messages to ${socketsInRoom.size} clients in room ${roomId}`);
                } else {
                    console.log(`⚠️ No clients in room ${roomId}, queuing messages`);
                }
            } catch (error) {
                console.error('Flush message batch error:', error);
                // Keep messages in queue for next flush attempt
                continue;
            }
            
            // Clear batch after successful emit
            messageBatches.set(roomId, []);
        }
    }
};

// Handle disconnect
const handleDisconnect = async (socket, userId, user) => {
    try {
        console.log(`❌ User disconnected: ${user.username}`);

        // Update user status to offline
        await updateUserStatus(userId, 'offline', null);

        // Get all rooms user was in
        const groupchatRoom = await ChatRoom.getGroupchatRoom();
        const privateRooms = await ChatRoom.find({
            type: 'private',
            'participants.userId': userId,
            isActive: true
        });

        // Broadcast user offline to all rooms user was in
        const allRooms = [groupchatRoom, ...privateRooms].filter(Boolean);
        for (const room of allRooms) {
            if (room && room.roomId) {
                io.to(`room:${room.roomId}`).emit('user:offline', {
                    userId,
                    username: user.username,
                    displayName: user.displayName,
                    avatar: user.avatar || null,
                    status: 'offline',
                    lastSeen: new Date(),
                    roomId: room.roomId
                });
                
                // Invalidate online users cache for this room
                if (redisClient && redisClient.isOpen) {
                    try {
                        await redisClient.del(`room:${room.roomId}:online_users`);
                    } catch (error) {
                        // Silently fail
                    }
                }
            }
        }
    } catch (error) {
        console.error('Disconnect handler error:', error);
    }
};

// Handle ping (heartbeat)
const handlePing = async (userId) => {
    try {
        await User.findByIdAndUpdate(userId, {
            lastSeen: new Date()
        });

        if (redisClient && redisClient.isOpen) {
            try {
                await redisClient.set(`user:${userId}:status`, 'online', { EX: 300 });
            } catch (error) {
                // Silently fail if Redis is not available
            }
        }
    } catch (error) {
        console.error('Ping handler error:', error);
    }
};

// Auto cleanup offline users
const cleanupOfflineUsers = async () => {
    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const staleUsers = await User.find({
            socketId: { $ne: null },
            lastSeen: { $lt: fiveMinutesAgo }
        });

        for (const user of staleUsers) {
            await updateUserStatus(user._id.toString(), 'offline', null);
            
            // Find all rooms user was in
            const groupchatRoom = await ChatRoom.getGroupchatRoom();
            const privateRooms = await ChatRoom.find({
                type: 'private',
                'participants.userId': user._id,
                isActive: true
            });
            
            const allRooms = [groupchatRoom, ...privateRooms].filter(Boolean);
            for (const room of allRooms) {
                if (room && room.roomId) {
                    io.to(`room:${room.roomId}`).emit('user:offline', {
                        userId: user._id.toString(),
                        username: user.username,
                        displayName: user.displayName,
                        avatar: user.avatar || null,
                        status: 'offline',
                        lastSeen: user.lastSeen,
                        roomId: room.roomId
                    });
                }
            }
        }

        if (staleUsers.length > 0) {
            console.log(`🧹 Cleaned up ${staleUsers.length} offline users`);
        }
    } catch (error) {
        console.error('Cleanup offline users error:', error);
    }
};

// Get online users for a room (with Redis caching)
const getOnlineUsersInRoom = async (roomId) => {
    try {
        // Try to get from Redis cache first
        if (redisClient && redisClient.isOpen) {
            try {
                const cachedList = await redisClient.get(`room:${roomId}:online_users`);
                if (cachedList) {
                    return JSON.parse(cachedList);
                }
            } catch (error) {
                // Fall through to compute
            }
        }

        const room = await ChatRoom.findOne({ roomId });
        if (!room) return [];

        const userIds = room.participants.map(p => p.userId.toString());
        
        // Check Redis cache for individual user status
        if (redisClient && redisClient.isOpen) {
            try {
                const statuses = await Promise.all(
                    userIds.map(id => redisClient.get(`user:${id}:status`))
                );
                
                const onlineUsers = userIds
                    .map((id, i) => ({
                        userId: id,
                        status: statuses[i] || 'offline'
                    }))
                    .filter(u => u.status === 'online');

                // Cache the result for 30 seconds
                await redisClient.set(
                    `room:${roomId}:online_users`,
                    JSON.stringify(onlineUsers),
                    { EX: 30 }
                );

                return onlineUsers;
            } catch (error) {
                // Fall through to MongoDB fallback
            }
        }

        // Fallback to MongoDB
        const users = await User.find({
            _id: { $in: userIds },
            socketId: { $ne: null },
            lastSeen: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
        });

        const onlineUsers = users.map(u => ({
            userId: u._id.toString(),
            status: 'online'
        }));

        // Cache for 30 seconds
        if (redisClient && redisClient.isOpen) {
            try {
                await redisClient.set(
                    `room:${roomId}:online_users`,
                    JSON.stringify(onlineUsers),
                    { EX: 30 }
                );
            } catch (error) {
                // Silently fail
            }
        }

        return onlineUsers;
    } catch (error) {
        console.error('Get online users error:', error);
        return [];
    }
};

module.exports = {
    initializeSocket,
    getIO: () => io,
    getRedisClient: () => redisClient,
    getOnlineUsersInRoom
};

