const mongoose = require('mongoose');
require('dotenv').config();

const SoiCau = require('./src/models/soicau.model');

async function checkEnsemble() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dande_thongke');
        console.log('✅ Connected to MongoDB');

        const date = new Date('2025-10-25');
        date.setHours(0, 0, 0, 0);

        const soiCau = await SoiCau.findOne({ predictionDate: date });

        if (soiCau && soiCau.predictions && soiCau.predictions.ensemble) {
            const ensemble = soiCau.predictions.ensemble.slice(0, 10);
            console.log('\n📊 Top 10 Ensemble predictions:');
            ensemble.forEach(p => {
                console.log(`  ${p.number}: ${p.percentage}% (prob: ${p.probability?.toFixed(6) || 'N/A'})`);
            });
        } else {
            console.log('❌ No ensemble data found for this date');
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkEnsemble();



