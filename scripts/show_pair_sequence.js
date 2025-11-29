require('dotenv').config();
const database = require('../src/config/database');
const PositionAnalyzer = require('../src/services/positionAnalyzer.service');
const XSMB = require('../src/models/xsmb.model');

async function main() {
    const start = new Date('2025-11-13T00:00:00Z');
    const end = new Date('2025-11-20T00:00:00Z');
    const targetKey = '(2-1-0)|(3-0-1)';
    const targetDirection = 'rtl';

    try {
        await database.connect();

        const results = await XSMB.find({
            drawDate: { $gte: start, $lte: end },
            station: 'xsmb'
        })
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
            .sort({ drawDate: -1 })
            .lean();

        const patterns = PositionAnalyzer.findPositionPatterns(results, 8, { mode: 'loto' });
        const normalized = PositionAnalyzer.validateConsistentPatterns(patterns, {
            mode: 'loto',
            requiredConsecutiveDays: 7
        });

        normalized.slice(0, 5).forEach((p, idx) => {
            console.log(`Debug[${idx}] key=${p.positionKey} direction=${p.direction} pairs=${p.pairs?.length || 0}`);
        });

        const pattern = normalized.find((p) => {
            if (!p.positionKey || !p.positionKey.includes(targetKey)) {
                return false;
            }
            const direction = p.direction || p.pairs?.[0]?.direction || 'ltr';
            return direction === targetDirection;
        });

        if (!pattern) {
            console.log('Không tìm thấy pattern mong muốn.');
            return;
        }

        console.log(`Pattern: ${pattern.positionKey} direction=${pattern.direction}`);
        (pattern.pairs || []).forEach((entry, idx) => {
            const fromDate = entry.date ? new Date(entry.date).toISOString().slice(0, 10) : '?';
            const toDate = entry.nextDate ? new Date(entry.nextDate).toISOString().slice(0, 10) : '?';
            console.log(
                `Day ${idx + 1}: ${fromDate} -> ${toDate} | target=${entry.targetNumber} | prize=${entry.targetPrizeName}`
            );
        });
    } finally {
        await database.disconnect();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

