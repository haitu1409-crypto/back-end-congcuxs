/**
 * Message Model - Quản lý tin nhắn trong groupchat và private chat
 * Tối ưu với indexing và pagination
 */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    roomId: {
        type: String,
        required: true,
        index: true
    },
    roomType: {
        type: String,
        enum: ['groupchat', 'private'],
        required: true,
        index: true
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    senderUsername: {
        type: String,
        required: true
    },
    senderDisplayName: {
        type: String,
        required: true
    },
    senderRole: {
        type: String,
        enum: ['user', 'admin'],
        required: true
    },
    content: {
        type: String,
        default: '',
        trim: true,
        maxlength: [5000, 'Tin nhắn không được vượt quá 5000 ký tự'],
        validate: {
            validator: function(value) {
                if (this.type === 'text' || this.type === 'system') {
                    return value && value.trim().length > 0;
                }
                return true;
            },
            message: 'Nội dung tin nhắn là bắt buộc'
        }
    },
    type: {
        type: String,
        enum: ['text', 'image', 'file', 'system'],
        default: 'text'
    },
    attachments: {
        type: [{
            url: String,
            secureUrl: String,
            thumbnailUrl: String,
            publicId: String,
            resourceType: {
                type: String,
                default: 'image'
            },
            format: String,
            bytes: Number,
            size: Number,
            width: Number,
            height: Number,
            originalFilename: String,
            name: String,
            type: {
                type: String
            }
        }],
        default: []
    },
    readBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }],
    isEdited: {
        type: Boolean,
        default: false
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true
    },
    deletedAt: {
        type: Date,
        default: null
    },
    reactions: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        emoji: String
    }],
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null,
        index: true
    },
    mentions: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        username: String,
        displayName: String
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Compound indexes for performance
messageSchema.index({ roomId: 1, createdAt: -1 });
messageSchema.index({ roomId: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ roomType: 1, roomId: 1, createdAt: -1 });

// TTL index: Auto delete messages older than 90 days (optional)
// Uncomment if needed
// messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

// Static method: Get messages by room with pagination (optimized with lean and projection)
messageSchema.statics.getMessagesByRoom = async function(roomId, options = {}) {
    const {
        limit = 50,
        skip = 0,
        beforeDate = null
    } = options;

    const query = {
        roomId,
        isDeleted: false
    };

    if (beforeDate) {
        query.createdAt = { $lt: beforeDate };
    }

    // Use lean() for better performance and projection to reduce data transfer
    const messages = await this.find(query)
        .select('-__v -isDeleted -deletedAt') // Exclude unnecessary fields
        .populate({
            path: 'replyTo',
            select: 'content senderDisplayName senderUsername createdAt',
            match: { isDeleted: false },
            options: { lean: true }
        })
        .populate({
            path: 'senderId',
            select: 'avatar',
            model: 'User',
            options: { lean: true }
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean({ virtuals: false }); // Disable virtuals for performance
    
    // Format replyTo and add senderAvatar to ensure consistent structure
    return messages.map(msg => {
        if (msg.replyTo && typeof msg.replyTo === 'object') {
            msg.replyTo = {
                id: msg.replyTo._id || msg.replyTo.id,
                content: msg.replyTo.content,
                senderDisplayName: msg.replyTo.senderDisplayName,
                senderUsername: msg.replyTo.senderUsername,
                createdAt: msg.replyTo.createdAt
            };
        }
        // Add senderAvatar from populated senderId
        if (msg.senderId && typeof msg.senderId === 'object' && msg.senderId.avatar) {
            msg.senderAvatar = msg.senderId.avatar;
        }
        // Clean up senderId object if it was populated - MUST convert to string!
        if (msg.senderId && typeof msg.senderId === 'object') {
            msg.senderId = (msg.senderId._id || msg.senderId).toString();
        } else if (msg.senderId) {
            // Ensure senderId is always string
            msg.senderId = msg.senderId.toString();
        }
        if (Array.isArray(msg.attachments)) {
            msg.attachments = msg.attachments.map(att => {
                const secureUrl = att?.secureUrl || att?.url;
                const publicId = att?.publicId || att?.public_id;
                if (!secureUrl || !publicId) {
                    return null;
                }
                return {
                    url: secureUrl,
                    secureUrl,
                    thumbnailUrl: att?.thumbnailUrl || secureUrl,
                    publicId,
                    resourceType: att?.resourceType || att?.resource_type || att?.type || 'image',
                    format: att?.format || null,
                    bytes: att?.bytes || att?.size || null,
                    size: att?.size || att?.bytes || null,
                    width: att?.width || null,
                    height: att?.height || null,
                    originalFilename: att?.originalFilename || att?.original_filename || att?.name || null,
                    name: att?.name || att?.originalFilename || att?.original_filename || null,
                    type: att?.type || 'image'
                };
            }).filter(Boolean);
        } else {
            msg.attachments = [];
        }
        return msg;
    });
};

// Static method: Get unread count for user
messageSchema.statics.getUnreadCount = async function(roomId, userId) {
    return this.countDocuments({
        roomId,
        isDeleted: false,
        senderId: { $ne: userId },
        readBy: { $ne: { $elemMatch: { userId } } }
    });
};

// Instance method: Mark as read
messageSchema.methods.markAsRead = async function(userId) {
    const alreadyRead = this.readBy.some(
        read => read.userId.toString() === userId.toString()
    );

    if (!alreadyRead) {
        this.readBy.push({
            userId,
            readAt: new Date()
        });
        return this.save();
    }
    return this;
};

// Instance method: Soft delete
messageSchema.methods.softDelete = async function() {
    this.isDeleted = true;
    this.deletedAt = new Date();
    return this.save();
};

module.exports = mongoose.model('Message', messageSchema);

