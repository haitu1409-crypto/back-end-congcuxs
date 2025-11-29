require('dotenv').config();
const database = require('../src/config/database');
const PositionAnalyzer = require('../src/services/positionAnalyzer.service');
const XSMB = require('../src/models/xsmb.model');

async function main() {
    try {
        await database.connect();

        const end = new Date('2025-11-20T00:00:00Z');
        const start = new Date('2025-11-13T00:00:00Z');

        const results = await XSMB.find({
            drawDate: { $gte: start, $lte: end },
            station: 'xsmb'
        })
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
            .sort({ drawDate: -1 })
            .lean();

        const patterns = PositionAnalyzer.findPositionPatterns(results, 8, { mode: 'loto' });
        const normalized = PositionAnalyzer.validateConsistentPatterns(patterns, { mode: 'loto', requiredConsecutiveDays: 1 });

        const longChains = normalized.filter(p => p.consecutiveDays >= 7);
        console.log('Patterns with >=7 consecutive days:', longChains.length);
        longChains.forEach((p, idx) => {
            console.log(`Pattern ${idx}: consecutive=${p.consecutiveDays}, occurrences=${p.totalOccurrences}, direction=${p.direction}, positions=${p.positionKey}, lastNumber=${p.pairs?.[p.pairs.length-1]?.targetNumber}`);
        });
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await database.disconnect();
    }
}

main().then(() => process.exit());

