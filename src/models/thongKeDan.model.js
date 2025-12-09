const mongoose = require('mongoose');

const ThongKeDanSchema = new mongoose.Schema(
    {
        // Thông tin người dùng
        tenCaoThu: {
            type: String,
            required: true,
            index: true
        },
        
        // Ngày dự đoán
        ngay: {
            type: Date,
            required: true,
            index: true
        },
        
        // Điểm số
        diemSo: {
            type: Number,
            default: 0
        },
        
        // Dàn số (mảng các số 2 chữ số)
        dan: {
            type: [String],
            default: [],
            validate: {
                validator: (arr) => arr.every(num => /^\d{2}$/.test(num)),
                message: 'Each number must be 2 digits'
            }
        },
        
        // Kết quả (mảng các số trúng)
        ketQua: {
            type: [String],
            default: [],
            validate: {
                validator: (arr) => arr.every(num => /^\d{2}$/.test(num)),
                message: 'Each result number must be 2 digits'
            }
        },
        
        // Các nhóm dàn theo tiêu đề (tương tự UserPrediction)
        groups: {
            type: [
                {
                    label: { type: String }, // Tiêu đề: 0X, 1X, TTĐ, STĐ, BTĐ, CHẠM, etc.
                    rawLabel: { type: String }, // Tiêu đề gốc
                    count: { type: Number }, // Số lượng số trong nhóm
                    numbers: {
                        type: [String],
                        default: [],
                        validate: {
                            validator: (arr) => arr.every(num => /^\d{2}$/.test(num)),
                            message: 'Each number must be 2 digits'
                        }
                    },
                    groupType: {
                        type: String,
                        enum: ['default', 'cham'],
                        default: 'default'
                    },
                    chamDigits: {
                        type: [String],
                        default: [],
                        validate: {
                            validator: (arr) => arr.every(digit => /^\d$/.test(digit)),
                            message: 'Cham digits must be single digits'
                        }
                    }
                }
            ],
            default: []
        },
        
        // Trạng thái
        status: {
            type: String,
            enum: ['pending', 'completed'],
            default: 'pending'
        },
        
        // STT để sắp xếp
        stt: {
            type: Number,
            default: 0
        },
        
        // Ghi chú thêm
        ghiChu: {
            type: String,
            default: ''
        }
    },
    { timestamps: true }
);

// Index để tìm kiếm nhanh
ThongKeDanSchema.index({ tenCaoThu: 1, ngay: 1 });
ThongKeDanSchema.index({ ngay: 1, stt: 1 });

module.exports = mongoose.model('ThongKeDan', ThongKeDanSchema);









