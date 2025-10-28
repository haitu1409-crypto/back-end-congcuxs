/**
 * Script để sửa lỗi field " isComplete" thành "isComplete"
 * Chạy: node fix-iscomplete-field.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Kết nối MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dande_thongke');
        console.log('✅ Kết nối MongoDB thành công');
    } catch (error) {
        console.error('❌ Lỗi kết nối MongoDB:', error);
        process.exit(1);
    }
};

// Schema XSMB
const xsmbSchema = new mongoose.Schema({
    drawDate: { type: Date, required: true },
    dayOfWeek: { type: String },
    tentinh: { type: String, required: true },
    tinh: { type: String, required: true },
    slug: { type: String, unique: true },
    year: { type: Number },
    month: { type: Number },
    maDB: { type: String },
    specialPrize: { type: [String] },
    firstPrize: { type: [String] },
    secondPrize: { type: [String] },
    threePrizes: { type: [String] },
    fourPrizes: { type: [String] },
    fivePrizes: { type: [String] },
    sixPrizes: { type: [String] },
    sevenPrizes: { type: [String] },
    station: { type: String, required: true, default: 'xsmb' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    isComplete: { type: Boolean, default: false },
    scrapedAt: { type: Date },
}, { timestamps: true });

const XSMB = mongoose.model('XSMB', xsmbSchema);

const fixIsCompleteField = async () => {
    try {
        console.log('🔍 Đang tìm các document có field " isComplete" (có dấu cách)...');
        
        // Tìm tất cả documents có field " isComplete"
        const documentsWithSpace = await XSMB.find({ " isComplete": { $exists: true } });
        
        console.log(`📊 Tìm thấy ${documentsWithSpace.length} documents cần sửa`);
        
        if (documentsWithSpace.length === 0) {
            console.log('✅ Không có document nào cần sửa');
            return;
        }
        
        // Sửa từng document
        for (const doc of documentsWithSpace) {
            console.log(`🔧 Đang sửa document ${doc._id} - ngày ${doc.drawDate}`);
            
            // Lấy giá trị của field " isComplete"
            const isCompleteValue = doc[" isComplete"];
            
            // Cập nhật document
            await XSMB.updateOne(
                { _id: doc._id },
                {
                    $set: {
                        isComplete: isCompleteValue
                    },
                    $unset: {
                        " isComplete": ""
                    }
                }
            );
            
            console.log(`✅ Đã sửa document ${doc._id}`);
        }
        
        console.log('🎉 Hoàn thành sửa lỗi field " isComplete"');
        
        // Kiểm tra lại
        const remainingDocs = await XSMB.find({ " isComplete": { $exists: true } });
        console.log(`📊 Còn lại ${remainingDocs.length} documents có field " isComplete"`);
        
    } catch (error) {
        console.error('❌ Lỗi khi sửa field:', error);
    }
};

const main = async () => {
    await connectDB();
    await fixIsCompleteField();
    await mongoose.connection.close();
    console.log('✅ Đã đóng kết nối MongoDB');
};

main().catch(console.error);
