const mongoose = require('mongoose');
const DailySoiCauData = require('./src/models/dailySoiCauData.model');

async function checkDatabase() {
    try {
        await mongoose.connect('mongodb://localhost:27017/dande_thongke');
        console.log('✅ Connected to MongoDB');

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

        console.log('Checking for data between:', today.toISOString(), 'and', tomorrow.toISOString());

        const data = await DailySoiCauData.find({
            predictionDate: {
                $gte: today,
                $lt: tomorrow
            }
        });

        console.log('Found records:', data.length);
        data.forEach(d => {
            console.log(d.predictionDate.toISOString().split('T')[0], d.metadata.status);
        });

        // Check all records
        const allData = await DailySoiCauData.find().sort({ predictionDate: -1 });
        console.log('\nAll records in database:');
        allData.forEach(d => {
            console.log(d.predictionDate.toISOString().split('T')[0], d.metadata.status);
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkDatabase();







