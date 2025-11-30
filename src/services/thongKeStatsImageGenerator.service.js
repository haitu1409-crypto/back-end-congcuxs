const LoGanStats = require('../models/stats/loganStats.model');
const TanSuatLotoStats = require('../models/stats/tanSuatLotoStats.model');
const GiaiDacBietStats = require('../models/stats/giaiDacBietStats.model');
const baseImageGenerator = require('./baseImageGenerator.service');

/**
 * Service để generate hình ảnh thống kê từ dữ liệu database
 * Tương tự như xsmbImageGenerator nhưng cho thống kê
 * Tối ưu: Sử dụng base service để share browser và cache
 */
class ThongKeStatsImageGeneratorService {
    constructor() {
        this.baseService = baseImageGenerator;
    }

    /**
     * Lấy dữ liệu thống kê từ database
     * Tối ưu: Fetch song song các queries và sử dụng cache
     */
    async getStatsData() {
        const cacheKey = 'thongke_stats';
        
        // Kiểm tra cache trước
        const cached = this.baseService.getCachedData(cacheKey);
        if (cached) {
            return cached;
        }
        
        const todayStr = new Date().toLocaleDateString('vi-VN');

        // Tối ưu: Fetch song song các queries độc lập
        const [dbLoGan, dbTanSuat, dbSpecial] = await Promise.all([
            LoGanStats.findOne({ filterType: '60' }),
            TanSuatLotoStats.findOne({ days: 30 }),
            GiaiDacBietStats.findOne({ days: 365 })
        ]);

        // Xử lý lô gan
        const loGanStats = dbLoGan?.statistics || [];
        const loGanTop = loGanStats
            .sort((a, b) => (b?.gapDraws || 0) - (a?.gapDraws || 0))
            .slice(0, 30)
            .map(item => ({
                number: String(item.number).padStart(2, '0'),
                days: item.gapDraws
            }));

        // Xử lý tần suất loto
        const tanSuatStats = dbTanSuat?.statistics || [];
        const tanSuatTop = tanSuatStats
            .sort((a, b) => (b?.count || 0) - (a?.count || 0))
            .slice(0, 30)
            .map(item => ({
                number: String(item.number).padStart(2, '0'),
                count: item.count
            }));

        // Xử lý đặc biệt
        const specialRecords = dbSpecial?.statistics || [];

        // Tính toán gan đặc biệt
        const lastSeen = new Map();
        const today = new Date();
        const dayMs = 24 * 60 * 60 * 1000;

        specialRecords.forEach(r => {
            if (!r?.number || !r?.drawDate) return;
            const lastTwo = String(r.number).slice(-2).padStart(2, '0');
            const [d, m, y] = String(r.drawDate).split('/');
            const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
            const existed = lastSeen.get(lastTwo);
            if (!existed || dateObj > existed) {
                lastSeen.set(lastTwo, dateObj);
            }
        });

        const specialGapTop = Array.from(lastSeen.entries())
            .map(([num, dt]) => ({
                number: num,
                days: Math.max(0, Math.round((today - dt) / dayMs))
            }))
            .sort((a, b) => b.days - a.days)
            .slice(0, 25);

        // Với các số không có trong 365 ngày qua, coi như >= 365 ngày
        for (let i = 0; i < 100; i++) {
            const num = String(i).padStart(2, '0');
            if (!lastSeen.has(num)) {
                specialGapTop.push({ number: num, days: 365 });
            }
        }
        specialGapTop.sort((a, b) => b.days - a.days).slice(0, 25);

        // Tính các cặp lộn có cùng gan cao nhất từ loGanTop
        const byNum = new Map(loGanTop.map(x => [x.number, x.days]));
        const seen = new Set();
        const loCapGanPairs = [];
        loGanTop.forEach(x => {
            const rev = x.number.split('').reverse().join('');
            if (byNum.has(rev)) {
                const key = [x.number, rev].sort().join('-');
                if (!seen.has(key) && x.number !== rev) {
                    seen.add(key);
                    const aDays = byNum.get(x.number) || 0;
                    const bDays = byNum.get(rev) || 0;
                    loCapGanPairs.push({
                        aNumber: x.number,
                        aDays,
                        bNumber: rev,
                        bDays,
                        sortKey: Math.max(aDays, bDays)
                    });
                }
            }
        });
        loCapGanPairs.sort((p, q) => q.sortKey - p.sortKey);
        const topLoCapPairs = loCapGanPairs.slice(0, 4);

        // Tính maxDays cho bar chart
        const maxDaysInLoCapPairs = loCapGanPairs.length > 0
            ? Math.max(...loCapGanPairs.map(p => Math.max(p.aDays, p.bDays)))
            : 1;

        const result = {
            todayStr,
            loGanTop,
            tanSuatTop,
            specialGapTop,
            topLoCapPairs,
            maxDaysInLoCapPairs
        };
        
        // Lưu vào cache
        this.baseService.setCachedData(cacheKey, result);
        
        return result;
    }

    /**
     * Generate HTML template từ dữ liệu thống kê
     */
    generateHTMLTemplate(data) {
        const { todayStr, loGanTop, tanSuatTop, specialGapTop, topLoCapPairs, maxDaysInLoCapPairs } = data;

        // Chia loGanTop thành các nhóm 5
        const loGanGroups = [];
        for (let i = 0; i < loGanTop.length; i += 5) {
            loGanGroups.push(loGanTop.slice(i, i + 5));
        }

        // Chia tanSuatTop thành các nhóm 5
        const tanSuatGroups = [];
        for (let i = 0; i < tanSuatTop.length; i += 5) {
            tanSuatGroups.push(tanSuatTop.slice(i, i + 5));
        }

        // Chia specialGapTop thành các nhóm 5
        const specialGapGroups = [];
        for (let i = 0; i < specialGapTop.length; i += 5) {
            specialGapGroups.push(specialGapTop.slice(i, i + 5));
        }

        // Tính bar height cho lo cap pairs
        const calcBarHeight = (days, maxDays) => {
            const maxPx = 110;
            const minPx = 40;
            if (!maxDays || maxDays <= 0) return minPx;
            const h = Math.round((days / maxDays) * maxPx);
            return Math.max(minPx, Math.min(maxPx, h));
        };

        // Top 2 lotto dẫn đầu
        const top2LoGan = loGanTop.slice(0, 2);

        const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Thống Kê Nhanh</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: "Roboto", "Segoe UI", "Arial Unicode MS", "Tahoma", "Verdana", sans-serif;
            background: #ffffff;
            padding: 20px;
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: flex-start;
        }
        
        .container {
            max-width: 800px;
            width: 100%;
            margin: 0 auto;
            padding: 0;
        }
        
        .box {
            border: 1px solid rgb(196, 210, 227);
            background: #FFFFFF;
            margin: 0;
            font-size: 13px;
            line-height: 1.5;
            width: 100%;
            box-sizing: border-box;
        }
        
        .header {
            background: #3a8de0;
            color: #FFFFFF;
            font-weight: bold;
            padding: 6px 8px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 18px;
        }
        
        .section-title {
            padding: 5px;
            margin: 0;
            color: rgb(1, 65, 182);
            font-weight: bold;
            font-size: 20px;
            background: rgb(213, 233, 253);
        }
        
        .group-wrap {
            display: flex;
            flex-wrap: nowrap;
            gap: 5px;
            padding: 8px;
        }
        
        .group-box {
            border: 1px solid rgb(196, 210, 227);
            padding: 6px;
            display: inline-flex;
            flex-direction: column;
            gap: 6px;
            background: #fff;
        }
        
        .item-box {
            border: 1px solid rgb(158, 195, 239);
            border-radius: 3px;
            padding: 4px 6px;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: #fff;
        }
        
        .num {
            color: rgb(215, 0, 0);
            font-weight: 700;
            min-width: 22px;
            text-align: center;
            font-size: 18px;
        }
        
        .val {
            color: rgb(10, 138, 42);
            font-weight: 700;
            font-size: 18px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="box">
            <div class="header">
                <div>THỐNG KÊ NHANH CHO NGÀY ${todayStr}</div>
            </div>
            <div style="border: rgb(196, 210, 227) 1px solid;">
                <div style="padding: 5px; margin: 0px; color: rgb(1, 65, 182); font-weight: bold; font-size: 24px; background: rgb(213, 233, 253);">Lotto lâu chưa ra (lô gan):</div>
                <div style="display: flex; flex-wrap: nowrap; gap: 5px; padding: 8px;">
                    ${loGanGroups.map(group => `
                        <div style="border: 1px solid rgb(196, 210, 227); padding: 6px; display: inline-flex; flex-direction: column; gap: 6px; background: rgb(255, 255, 255);">
                            ${group.map(item => `
                                <div style="border: 1px solid rgb(158, 195, 239); border-radius: 3px; padding: 4px 6px; display: inline-flex; align-items: center; gap: 5px; background: rgb(255, 255, 255);">
                                    <span style="color: rgb(215, 0, 0); font-weight: 700; min-width: 22px; text-align: center; font-size: 20px;">${item.number}</span>
                                    <span style="color: rgb(10, 138, 42); font-weight: 700; font-size: 20px;">${item.days} ngày</span>
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
                
                <div style="padding: 5px;">
                    <div style="margin: 5px; color: rgb(1, 65, 182); font-size: 20px; font-weight: bold;">Các cặp lotto dẫn đầu bảng gan:</div>
                    <ul style="margin: 0px; padding-left: 15px;">
                        ${top2LoGan.map(item => `
                            <li style="margin-bottom: 4px; font-size: 23px;">Cặp số <b style="color: rgb(142, 0, 204); font-size: 20px;">${item.number}</b> đã <b style="color: rgb(0, 62, 204); font-size: 20px;">${item.days}</b> ngày chưa ra <span style="font-style: italic; color: rgb(102, 102, 102); font-size: 19px;">(xem chi tiết lịch sử trong trang thống kê)</span></li>
                        `).join('')}
                    </ul>
                    <div style="margin: 5px 3px; font-size: 15px; color: rgb(139, 139, 139);">(Kết quả thống kê dựa trên dữ liệu gần đây trong hệ thống)</div>
                </div>
                
                <div style="padding: 5px;">
                    <div style="margin: 5px 0px 30px; font-size: 20px; color: rgb(60, 60, 60); font-weight: bold;">Các cặp lô tô lộn cùng gan nhiều nhất:</div>
                    <div style="display: flex; flex-wrap: nowrap; align-items: flex-end;">
                        ${topLoCapPairs.map(pair => {
            const aHeight = calcBarHeight(pair.aDays, maxDaysInLoCapPairs);
            const bHeight = calcBarHeight(pair.bDays, maxDaysInLoCapPairs);
            return `
                                <div style="display: flex; align-items: flex-end; margin: 0px 6px 0px 0px;">
                                    <div style="border-radius: 4px 4px 0px 0px; position: relative; display: flex; align-items: flex-end; justify-content: center; width: 48px; background: rgb(179, 166, 255); font-weight: 700; color: rgb(255, 255, 255); box-shadow: rgba(0, 0, 0, 0.06) 0px 1px 0px; height: ${aHeight}px;">
                                        <div style="position: absolute; bottom: 100%; left: 50%; transform: translate(-50%, -4px); font-size: 16px; color: rgb(37, 99, 235); pointer-events: none; white-space: nowrap;">${pair.aDays} ng</div>
                                        <div style="padding-bottom: 6px; font-size: 22px;">${pair.aNumber}</div>
                                    </div>
                                    <div style="width: 0px;"></div>
                                    <div style="border-radius: 4px 4px 0px 0px; position: relative; display: flex; align-items: flex-end; justify-content: center; width: 48px; background: rgb(106, 119, 255); font-weight: 700; color: rgb(255, 255, 255); box-shadow: rgba(0, 0, 0, 0.06) 0px 1px 0px; height: ${bHeight}px;">
                                        <div style="position: absolute; bottom: 100%; left: 50%; transform: translate(-50%, -4px); font-size: 16px; color: rgb(37, 99, 235); pointer-events: none; white-space: nowrap;">${pair.bDays} ng</div>
                                        <div style="padding-bottom: 6px; font-size: 22px;">${pair.bNumber}</div>
                                    </div>
                                </div>
                            `;
        }).join('')}
                    </div>
                </div>
                
                <div style="padding: 5px; margin: 8px 0px 0px; color: rgb(1, 65, 182); font-weight: bold; font-size: 24px; background: rgb(213, 233, 253);">Lotto ra nhiều trong 30 ngày qua:</div>
                <div style="display: flex; flex-wrap: nowrap; gap: 5px; padding: 8px;">
                    ${tanSuatGroups.map(group => `
                        <div style="border: 1px solid rgb(196, 210, 227); padding: 6px; display: inline-flex; flex-direction: column; gap: 6px; background: rgb(255, 255, 255);">
                            ${group.map(item => `
                                <div style="border: 1px solid rgb(158, 195, 239); border-radius: 3px; padding: 4px 6px; display: inline-flex; align-items: center; gap: 5px; background: rgb(255, 255, 255);">
                                    <span style="color: rgb(215, 0, 0); font-weight: 700; min-width: 22px; text-align: center; font-size: 20px;">${item.number}</span>
                                    <span style="color: rgb(10, 138, 42); font-weight: 700; font-size: 20px;">${item.count} lần</span>
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    </div>
</body>
</html>
        `;

        return html;
    }

    /**
     * Generate hình ảnh từ dữ liệu thống kê
     * @returns {Promise<Buffer>} Buffer của hình ảnh PNG
     */
    async generateImage() {
        // Lấy dữ liệu thống kê
        const statsData = await this.getStatsData();

        // Generate HTML
        const html = this.generateHTMLTemplate(statsData);

        // Sử dụng base service để generate image với tối ưu
        return await this.baseService.generateImageFromHTML(html, {
            viewportWidth: 900,
            viewportHeight: 4000,
            deviceScaleFactor: 1.5, // Giảm từ 2 xuống 1.5 để nhanh hơn, vẫn đảm bảo chất lượng
            waitTime: 100, // Giảm từ 200ms xuống 100ms
            timeout: 6000 // Giảm từ 8000ms xuống 6000ms
        });
    }
}

module.exports = new ThongKeStatsImageGeneratorService();

