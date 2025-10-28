const mongoose = require('mongoose');
const DailyDataCollectionService = require('./src/services/dailyDataCollection.service');
const SoiCauService = require('./src/services/soicau.service');

require('dotenv').config();

// Colors for console
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

async function testUpgradedBayesian() {
    try {
        console.log(`${colors.cyan}=== TESTING UPGRADED BAYESIAN LOGIC ===${colors.reset}\n`);

        // Connect MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dande_thongke');
        console.log(`${colors.green}✅ Connected to MongoDB${colors.reset}\n`);

        const dailyService = new DailyDataCollectionService();
        const soicauService = new SoiCauService();

        // Test 3 days: yesterday, today, tomorrow
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const dayBefore = new Date(today);
        dayBefore.setDate(dayBefore.getDate() - 2);

        const testDates = [dayBefore, yesterday, today];

        console.log(`${colors.blue}Testing ${testDates.length} days with UPGRADED logic (time-decay + penalty)${colors.reset}\n`);

        for (let i = 0; i < testDates.length; i++) {
            const testDate = testDates[i];
            const dateStr = testDate.toISOString().split('T')[0];

            console.log(`${colors.cyan}\n--- Day ${i + 1}: ${dateStr} ---${colors.reset}`);

            try {
                // Step 1: Tạo bộ dữ liệu
                console.log(`${colors.yellow}📊 Step 1: Tạo bộ dữ liệu cho ngày ${dateStr}...${colors.reset}`);
                const dataResult = await dailyService.collectAndSaveDailyData(testDate, 30);
                if (dataResult.success) {
                    console.log(`${colors.green}✅ Bộ dữ liệu đã tạo hoặc đã tồn tại${colors.reset}`);
                    console.log(`   📈 Record count: ${dataResult.data.historicalData?.recordCount || 0}`);
                } else {
                    console.log(`${colors.yellow}⚠️ ${dataResult.message}${colors.reset}`);
                }

                // Step 2: Soi cầu
                console.log(`${colors.yellow}🔮 Step 2: Soi cầu cho ngày ${dateStr}...${colors.reset}`);
                const soicauResult = await soicauService.generateSoiCau(testDate, 30, 5);
                if (soicauResult) {
                    console.log(`${colors.green}✅ Soi cầu đã tạo${colors.reset}`);

                    // Check predictions
                    const ensemblePredictions = soicauResult.predictions?.ensemble || [];
                    if (ensemblePredictions.length > 0) {
                        console.log(`   🎯 Top 5 predictions:`);
                        ensemblePredictions.slice(0, 5).forEach((pred, idx) => {
                            console.log(`      ${idx + 1}. Số ${pred.number}: ${pred.percentage}% (prob: ${pred.probability?.toFixed(6) || 'N/A'})`);
                        });

                        // Check if probability varies (not all same)
                        const probs = ensemblePredictions.map(p => p.probability).filter(p => p);
                        const maxProb = Math.max(...probs);
                        const minProb = Math.min(...probs);
                        const variance = (maxProb - minProb) / maxProb * 100;

                        console.log(`   📊 Probability variance: ${variance.toFixed(2)}% (max: ${maxProb.toFixed(4)}, min: ${minProb.toFixed(4)})`);

                        if (variance > 10) {
                            console.log(`${colors.green}   ✅ GOOD: Probabilities vary significantly (new logic working)${colors.reset}`);
                        } else {
                            console.log(`${colors.yellow}   ⚠️ WARNING: Probabilities too similar (${variance.toFixed(1)}%) - may still using old logic${colors.reset}`);
                        }
                    }
                } else {
                    console.log(`${colors.red}❌ Không tạo được soi cầu${colors.reset}`);
                }

            } catch (error) {
                console.log(`${colors.red}❌ Error testing date ${dateStr}: ${error.message}${colors.reset}`);
                console.error(error.stack);
            }
        }

        console.log(`\n${colors.cyan}=== TEST SUMMARY ===${colors.reset}`);
        console.log(`${colors.green}✅ Test completed for ${testDates.length} days${colors.reset}`);
        console.log(`${colors.blue}Check logs above for [NEW LOGIC] messages and probability variance${colors.reset}\n`);

        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        console.error(`${colors.red}❌ Test failed:${colors.reset}`, error);
        process.exit(1);
    }
}

testUpgradedBayesian();
