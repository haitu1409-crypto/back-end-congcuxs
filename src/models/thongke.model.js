/**
 * Thống Kê Model
 * MongoDB model cho dữ liệu thống kê 3 miền
 */

const mongoose = require('mongoose');

const thongKeSchema = new mongoose.Schema({
    date: {
        type: String,
        required: true,
        unique: true,
        match: /^\d{4}-\d{2}-\d{2}$/
    },
    displayDate: {
        type: String,
        required: true
    },
    mienNam: {
        db: {
            type: String,
            default: '',
            maxlength: 2
        },
        nhan: {
            type: String,
            default: '',
            maxlength: 3
        }
    },
    mienTrung: {
        db: {
            type: String,
            default: '',
            maxlength: 2
        },
        nhan: {
            type: String,
            default: '',
            maxlength: 3
        }
    },
    mienBac: {
        db: {
            type: String,
            default: '',
            maxlength: 2
        },
        nhan: {
            type: String,
            default: '',
            maxlength: 3
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: String,
        default: 'system'
    },
    updatedBy: {
        type: String,
        default: 'system'
    }
}, {
    timestamps: true,
    collection: 'thongke_3mien'
});

// Index cho tìm kiếm nhanh
thongKeSchema.index({ date: -1 });
thongKeSchema.index({ createdAt: -1 });

// Virtual field để tính tỷ lệ trúng
thongKeSchema.virtual('summary').get(function () {
    const calculateHits = (region) => {
        return region.nhan && region.nhan.includes('X') ? 1 : 0;
    };

    return {
        mienNam: {
            hits: calculateHits(this.mienNam),
            hasData: !!(this.mienNam.db || this.mienNam.nhan)
        },
        mienTrung: {
            hits: calculateHits(this.mienTrung),
            hasData: !!(this.mienTrung.db || this.mienTrung.nhan)
        },
        mienBac: {
            hits: calculateHits(this.mienBac),
            hasData: !!(this.mienBac.db || this.mienBac.nhan)
        }
    };
});

// Middleware để cập nhật updatedAt
thongKeSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

// Static method để tạo dữ liệu mẫu
thongKeSchema.statics.createSampleData = async function (days = 30) {
    const data = [];
    const today = new Date();

    // Tạo dữ liệu từ (days-1) ngày trước đến ngày hiện tại
    for (let i = days - 1; i >= 0; i--) {
        const currentDate = new Date(today);
        currentDate.setDate(today.getDate() - i);

        const dateStr = currentDate.toISOString().split('T')[0];
        const displayDate = `${currentDate.getDate()}/${currentDate.getMonth() + 1}`;

        // Kiểm tra xem dữ liệu đã tồn tại chưa
        const existing = await this.findOne({ date: dateStr });
        if (!existing) {
            data.push({
                date: dateStr,
                displayDate: displayDate,
                mienNam: { db: '', nhan: '' },
                mienTrung: { db: '', nhan: '' },
                mienBac: { db: '', nhan: '' },
                createdBy: 'system'
            });
        }
    }

    if (data.length > 0) {
        return await this.insertMany(data);
    }
    return [];
};

// Instance method để validate dữ liệu
thongKeSchema.methods.validateData = function () {
    const errors = [];

    ['mienNam', 'mienTrung', 'mienBac'].forEach(region => {
        if (this[region].db && !/^\d{0,2}$/.test(this[region].db)) {
            errors.push(`${region}.db phải là số 2 chữ số hoặc rỗng`);
        }
        if (this[region].nhan && !/^(\d{1}X|X|đợi kết quả)$/i.test(this[region].nhan)) {
            errors.push(`${region}.nhan phải có định dạng 0X, 1X, 2X...9X hoặc X hoặc 'đợi kết quả'`);
        }
    });

    return errors;
};

const ThongKe = mongoose.model('ThongKe', thongKeSchema);

module.exports = ThongKe;
