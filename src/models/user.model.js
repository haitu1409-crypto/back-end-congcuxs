/**
 * User Model - Quản lý người dùng và authentication
 * Tối ưu cho hiệu suất với indexing và validation
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Tên đăng nhập là bắt buộc'],
        unique: true,
        trim: true,
        lowercase: true,
        minlength: [3, 'Tên đăng nhập phải có ít nhất 3 ký tự'],
        maxlength: [30, 'Tên đăng nhập không được vượt quá 30 ký tự'],
        match: [/^[a-z0-9_]+$/, 'Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới'],
        index: true
    },
    displayName: {
        type: String,
        required: [true, 'Tên người dùng là bắt buộc'],
        trim: true,
        minlength: [2, 'Tên người dùng phải có ít nhất 2 ký tự'],
        maxlength: [50, 'Tên người dùng không được vượt quá 50 ký tự']
    },
    password: {
        type: String,
        required: [true, 'Mật khẩu là bắt buộc'],
        minlength: [6, 'Mật khẩu phải có ít nhất 6 ký tự'],
        select: false // Không trả về password khi query
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
        index: true
    },
    avatar: {
        type: String,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    chatVerified: {
        type: Boolean,
        default: false,
        index: true
    },
    chatBanned: {
        type: Boolean,
        default: false,
        index: true
    },
    chatVerifiedAt: {
        type: Date,
        default: null
    },
    lastLogin: {
        type: Date,
        default: null
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    socketId: {
        type: String,
        default: null,
        index: true
    }
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: function (doc, ret) {
            delete ret.password;
            return ret;
        }
    },
    toObject: { virtuals: true }
});

// Indexes for performance
userSchema.index({ username: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ socketId: 1 });
userSchema.index({ createdAt: -1 });

// Pre-save middleware: Hash password
userSchema.pre('save', async function (next) {
    // Chỉ hash password khi password mới hoặc được thay đổi
    if (!this.isModified('password')) {
        return next();
    }

    try {
        // Hash password với salt rounds = 12
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Instance method: Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Instance method: Update last seen
userSchema.methods.updateLastSeen = async function () {
    this.lastSeen = new Date();
    return this.save({ validateBeforeSave: false });
};

// Static method: Find by username
userSchema.statics.findByUsername = function (username) {
    return this.findOne({ username: username.toLowerCase(), isActive: true });
};

// Static method: Find active users
userSchema.statics.findActiveUsers = function () {
    return this.find({ isActive: true });
};

// Static method: Find by role
userSchema.statics.findByRole = function (role) {
    return this.find({ role, isActive: true });
};

// Virtual: Check if user is admin
userSchema.virtual('isAdmin').get(function () {
    return this.role === 'admin';
});

// Virtual: Check if user is online (has socketId)
userSchema.virtual('isOnline').get(function () {
    return !!this.socketId;
});

module.exports = mongoose.model('User', userSchema);

