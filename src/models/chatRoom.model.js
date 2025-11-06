/**
 * ChatRoom Model - Quản lý phòng chat (groupchat và private chat)
 */

const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    type: {
        type: String,
        enum: ['groupchat', 'private'],
        required: true,
        index: true
    },
    name: {
        type: String,
        required: function() {
            return this.type === 'groupchat';
        },
        maxlength: [100, 'Tên phòng không được vượt quá 100 ký tự']
    },
    description: {
        type: String,
        maxlength: [500, 'Mô tả không được vượt quá 500 ký tự']
    },
    participants: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        role: {
            type: String,
            enum: ['user', 'admin'],
            required: true
        },
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    maxUsers: {
        type: Number,
        default: 100,
        min: 2,
        max: 100
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Make optional to handle cases where no admin exists
    },
    lastMessage: {
        messageId: mongoose.Schema.Types.ObjectId,
        content: String,
        type: {
            type: String,
            default: 'text'
        },
        hasAttachments: {
            type: Boolean,
            default: false
        },
        senderId: mongoose.Schema.Types.ObjectId,
        senderDisplayName: String,
        createdAt: Date
    },
    lastActivity: {
        type: Date,
        default: Date.now,
        index: true
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
chatRoomSchema.index({ type: 1, isActive: 1 });
chatRoomSchema.index({ 'participants.userId': 1 });
chatRoomSchema.index({ lastActivity: -1 });

// Pre-save: Generate roomId if not exists
chatRoomSchema.pre('save', async function(next) {
    // Only generate if roomId is missing
    if (!this.roomId) {
        if (this.type === 'private') {
            // Private chat: roomId = sorted user IDs
            if (this.participants && this.participants.length >= 2) {
                const userIds = this.participants
                    .map(p => p.userId ? p.userId.toString() : null)
                    .filter(Boolean)
                    .sort()
                    .join('_');
                if (userIds) {
                    this.roomId = `private_${userIds}`;
                }
            }
        } else if (this.type === 'groupchat') {
            // Groupchat: roomId = 'groupchat_' + timestamp
            this.roomId = `groupchat_${Date.now()}`;
        }
    }
    next();
});

// Static method: Find or create private chat
chatRoomSchema.statics.findOrCreatePrivateChat = async function(userId1, userId2) {
    const sortedIds = [userId1.toString(), userId2.toString()].sort();
    const roomId = `private_${sortedIds.join('_')}`;

    let room = await this.findOne({ roomId, type: 'private' });

    if (!room) {
        // Set roomId explicitly before create
        room = await this.create({
            roomId: roomId, // Explicitly set roomId
            type: 'private',
            participants: [
                { userId: userId1, role: 'user' },
                { userId: userId2, role: 'user' }
            ],
            createdBy: userId1,
            maxUsers: 2
        });
    }

    return room;
};

// Static method: Get groupchat room
chatRoomSchema.statics.getGroupchatRoom = async function() {
    let room = await this.findOne({ 
        type: 'groupchat', 
        isActive: true 
    }).sort({ createdAt: 1 });

    if (!room) {
        // Create default groupchat
        const User = mongoose.model('User');
        const adminUser = await User.findOne({ role: 'admin', isActive: true });
        
        // Set roomId explicitly before create
        const defaultRoomId = `groupchat_${Date.now()}`;
        
        if (!adminUser) {
            // If no admin, create groupchat with first available user or system
            // Try to get any active user
            const anyUser = await User.findOne({ isActive: true }).sort({ createdAt: 1 });
            
            room = await this.create({
                roomId: defaultRoomId, // Set roomId explicitly
                type: 'groupchat',
                name: 'Group Chat',
                description: 'Phòng chat chung cho tất cả thành viên',
                participants: anyUser ? [{
                    userId: anyUser._id,
                    role: anyUser.role || 'user'
                }] : [],
                createdBy: anyUser?._id || null, // Use any user or null
                maxUsers: 100
            });
        } else {
            room = await this.create({
                roomId: defaultRoomId, // Set roomId explicitly
                type: 'groupchat',
                name: 'Group Chat',
                description: 'Phòng chat chung cho tất cả thành viên',
                participants: [{
                    userId: adminUser._id,
                    role: 'admin'
                }],
                createdBy: adminUser._id,
                maxUsers: 100
            });
        }
    }

    return room;
};

// Instance method: Add participant
chatRoomSchema.methods.addParticipant = async function(userId, role = 'user') {
    const exists = this.participants.some(
        p => p.userId.toString() === userId.toString()
    );

    if (!exists) {
        this.participants.push({
            userId,
            role,
            joinedAt: new Date()
        });
        this.lastActivity = new Date();
        return this.save();
    }
    return this;
};

// Instance method: Remove participant
chatRoomSchema.methods.removeParticipant = async function(userId) {
    this.participants = this.participants.filter(
        p => p.userId.toString() !== userId.toString()
    );
    this.lastActivity = new Date();
    return this.save();
};

// Instance method: Update last message
chatRoomSchema.methods.updateLastMessage = async function(messageData) {
    const hasAttachments = Array.isArray(messageData.attachments) && messageData.attachments.length > 0;
    const type = messageData.type || (hasAttachments ? 'image' : 'text');

    let content = messageData.content;
    if (!content || !content.trim()) {
        if (type === 'image') {
            content = '[Đã gửi hình ảnh]';
        } else if (type === 'file') {
            content = '[Đã gửi tệp tin]';
        } else if (type === 'system' && hasAttachments) {
            content = '[Thông báo hệ thống]';
        } else {
            content = '';
        }
    }

    this.lastMessage = {
        messageId: messageData._id || messageData.id,
        content,
        type,
        hasAttachments,
        senderId: messageData.senderId,
        senderDisplayName: messageData.senderDisplayName,
        createdAt: messageData.createdAt || new Date()
    };
    this.lastActivity = new Date();
    return this.save();
};

module.exports = mongoose.model('ChatRoom', chatRoomSchema);

