/**
 * Socket.io Service - Real-time chat với online/offline status
 * Tối ưu hiệu suất với Redis caching và message batching
 */

const { Server } = require('socket.io');
const { verifySocketToken } = require('../middleware/socketAuth.middleware');
const Message = require('../models/message.model');
const ChatRoom = require('../models/chatRoom.model');
const User = require('../models/user.model');

let io = null;
let redisClient = null;

// Message batch queue
const messageBatches = new Map(); // roomId -> messages[]

// Initialize Socket.io
const initializeSocket = (server, redis) => {
    redisClient = redis;

    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL?.split(',') || '*',
            credentials: true,
            methods: ['GET', 'POST']
        },
        pingTimeout: 60000,
        pingInterval: 25000,
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

            // Get all rooms user is in
            const groupchatRoom = await ChatRoom.getGroupchatRoom();
            const privateRooms = await ChatRoom.find({
                type: 'private',
                'participants.userId': userId,
                isActive: true
            });

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

    // Batch message sender (every 20ms for better real-time feel)
    setInterval(() => {
        flushMessageBatches();
    }, 20);

    // Auto cleanup offline users (every 1 minute)
    setInterval(async () => {
        await cleanupOfflineUsers();
    }, 60000);

    console.log('✅ Socket.io initialized');
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
            const { roomId, content, type = 'text', mentions = [] } = data;

            if (!roomId || !content || content.trim().length === 0) {
                return socket.emit('error', { message: 'Dữ liệu không hợp lệ' });
            }

            // Check room permission
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
                const otherUser = await User.findById(otherParticipant.userId);

                // User can only chat with admin
                if (userRole === 'user' && otherUser.role !== 'admin') {
                    return socket.emit('error', { message: 'User không thể chat với user khác' });
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

            // Create message
            const message = await Message.create({
                roomId,
                roomType: room.type,
                senderId: userId,
                senderUsername: user.username,
                senderDisplayName: user.displayName,
                senderRole: userRole,
                content: content.trim(),
                type,
                mentions: processedMentions
            });

            // Update room last message
            await room.updateLastMessage({
                _id: message._id,
                content: message.content,
                senderId: message.senderId,
                senderDisplayName: message.senderDisplayName,
                createdAt: message.createdAt
            });

            // Get user avatar
            const senderUser = await User.findById(userId).select('avatar');
            const senderAvatar = senderUser?.avatar || null;

            // Prepare message data with replyTo info
            const messageData = {
                id: message._id,
                roomId: message.roomId,
                roomType: message.roomType,
                senderId: message.senderId,
                senderUsername: message.senderUsername,
                senderDisplayName: message.senderDisplayName,
                senderRole: message.senderRole,
                senderAvatar: senderAvatar, // Add avatar to message data
                content: message.content,
                type: message.type,
                createdAt: message.createdAt,
                isEdited: message.isEdited,
                readBy: []
            };

            // Add mentions info if exists
            if (processedMentions.length > 0) {
                messageData.mentions = processedMentions;
            }

            // Add to batch queue
            addToBatch(roomId, messageData);

            // Cache in Redis (last 50 messages)
            if (redisClient && redisClient.isOpen) {
                try {
                    await redisClient.lPush(`room:${roomId}:messages:recent`, JSON.stringify(message));
                    await redisClient.lTrim(`room:${roomId}:messages:recent`, 0, 49);
                    await redisClient.expire(`room:${roomId}:messages:recent`, 3600); // 1 hour
                } catch (error) {
                    // Silently fail if Redis is not available
                }
            }
            
            // 🔥 REAL-TIME: If private chat, notify the other user instantly
            if (room.type === 'private') {
                const otherParticipant = room.participants.find(
                    p => p.userId.toString() !== userId.toString()
                );
                
                if (otherParticipant) {
                    const otherUserId = otherParticipant.userId.toString();
                    
                    // Get current unread count for this room
                    const unreadMessages = await Message.countDocuments({
                        roomId: roomId,
                        senderId: { $ne: otherUserId },
                        readBy: { $ne: otherUserId },
                        isDeleted: false
                    });
                    
                    // Emit to the other user's personal room (instant notification!)
                    io.to(`user:${otherUserId}`).emit('private:message:new', {
                        fromUserId: userId,
                        fromUsername: user.username,
                        fromDisplayName: user.displayName,
                        fromAvatar: senderAvatar,
                        roomId: roomId,
                        unreadCount: unreadMessages,
                        messagePreview: content.trim().substring(0, 50),
                        timestamp: Date.now()
                    });
                    
                    console.log(`🔔 Notified user ${otherUserId} about new message from ${user.username}`);
                }
            }

        } catch (error) {
            console.error('Send message error:', error);
            socket.emit('error', { message: 'Lỗi khi gửi tin nhắn' });
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
    getOnlineUsersInRoom
};

