const GiaiDacBietStats = require('../models/stats/giaiDacBietStats.model');
const baseImageGenerator = require('./baseImageGenerator.service');

/**
 * Service để generate hình ảnh thống kê đặc biệt từ dữ liệu database
 * Bao gồm: Đặc biệt lâu chưa ra, Thống kê gan theo tổng, Thống kê gan theo chạm
 * Tối ưu: Sử dụng base service để share browser và cache
 */
class ThongKeDacBietImageGeneratorService {
    constructor() {
        this.baseService = baseImageGenerator;
    }

    /**
     * Lấy dữ liệu thống kê đặc biệt từ database
     * Tối ưu: Sử dụng cache để tránh query database nhiều lần
     */
    async getStatsData() {
        const cacheKey = 'thongke_db_365';
        
        // Kiểm tra cache trước
        const cached = this.baseService.getCachedData(cacheKey);
        if (cached) {
            return cached;
        }
        
        const todayStr = new Date().toLocaleDateString('vi-VN');
        
        // Lấy đặc biệt (365 ngày)
        const dbSpecial = await GiaiDacBietStats.findOne({ days: 365 });
        const specialRecords = dbSpecial?.statistics || [];

        // Tính toán gan đặc biệt
        const lastSeen = new Map();
        const sumLastSeen = new Map();
        const chamLastSeen = new Map();
        const today = new Date();
        const dayMs = 24 * 60 * 60 * 1000;

        specialRecords.forEach(r => {
            if (!r?.number || !r?.drawDate) return;
            const lastTwo = String(r.number).slice(-2).padStart(2, '0');
            let dateObj;
            if (r.drawDate instanceof Date) {
                dateObj = r.drawDate;
            } else {
                const dateStr = String(r.drawDate);
                if (dateStr.includes('/')) {
                    const [d, m, y] = dateStr.split('/');
                    dateObj = new Date(Number(y), Number(m) - 1, Number(d));
                } else {
                    dateObj = new Date(dateStr);
                }
            }

            // Cập nhật lastSeen cho 2 số cuối
            const existed = lastSeen.get(lastTwo);
            if (!existed || dateObj > existed) {
                lastSeen.set(lastTwo, dateObj);
            }

            // Tổng: (a + b) % 10
            const a = parseInt(lastTwo[0], 10);
            const b = parseInt(lastTwo[1], 10);
            const sumDigit = (a + b) % 10;
            const sumExist = sumLastSeen.get(sumDigit);
            if (!sumExist || dateObj > sumExist) {
                sumLastSeen.set(sumDigit, dateObj);
            }

            // Chạm: mỗi chữ số có mặt trong 2 số cuối
            const digits = new Set([a, b]);
            digits.forEach(dg => {
                const chamExist = chamLastSeen.get(dg);
                if (!chamExist || dateObj > chamExist) {
                    chamLastSeen.set(dg, dateObj);
                }
            });
        });

        // Tính gap cho đặc biệt (2 số cuối)
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

        // Tính gap cho tổng (0-9)
        const sumGaps = [];
        for (let s = 0; s <= 9; s++) {
            const dt = sumLastSeen.get(s);
            const days = dt ? Math.max(0, Math.round((today - dt) / dayMs)) : 365;
            sumGaps.push({ sum: s, days });
        }
        sumGaps.sort((a, b) => b.days - a.days);

        // Tính gap cho chạm (0-9)
        const chamGaps = [];
        for (let c = 0; c <= 9; c++) {
            const dt = chamLastSeen.get(c);
            const days = dt ? Math.max(0, Math.round((today - dt) / dayMs)) : 365;
            chamGaps.push({ cham: c, days });
        }
        chamGaps.sort((a, b) => b.days - a.days);

        // Tìm top sum gap để hiển thị các cặp số
        const topSumGap = sumGaps[0];
        const topSumGapPairs = [];
        if (topSumGap) {
            for (let i = 0; i <= 9; i++) {
                for (let j = 0; j <= 9; j++) {
                    if (((i + j) % 10) === topSumGap.sum) {
                        topSumGapPairs.push(`${i}${j}`.padStart(2, '0'));
                    }
                }
            }
        }

        const result = {
            todayStr,
            specialGapTop,
            sumGaps,
            chamGaps,
            topSumGap,
            topSumGapPairs: [...new Set(topSumGapPairs)].slice(0, 10)
        };
        
        // Lưu vào cache
        this.baseService.setCachedData(cacheKey, result);
        
        return result;
    }

    /**
     * Generate HTML template từ dữ liệu thống kê đặc biệt
     */
    generateHTMLTemplate(data) {
        const { todayStr, specialGapTop, sumGaps, chamGaps, topSumGap, topSumGapPairs } = data;

        // Chia specialGapTop thành các nhóm 5
        const specialGapGroups = [];
        for (let i = 0; i < specialGapTop.length; i += 5) {
            specialGapGroups.push(specialGapTop.slice(i, i + 5));
        }

        // Tính bar height cho sum và cham
        const maxDaysInSumGaps = Math.max(...sumGaps.map(s => s.days));
        const maxDaysInChamGaps = Math.max(...chamGaps.map(c => c.days));
        
        const calcBarHeight = (days, maxDays) => {
            const maxPx = 110;
            const minPx = 40;
            if (!maxDays || maxDays <= 0) return minPx;
            const h = Math.round((days / maxDays) * maxPx);
            return Math.max(minPx, Math.min(maxPx, h));
        };

        const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Thống Kê Đặc Biệt</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: Arial, sans-serif;
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
    </style>
</head>
<body>
    <div class="container">
        <div class="box">
            <div class="header">
                <div>THỐNG KÊ NHANH CHO NGÀY ${todayStr}</div>
            </div>
            
            <div style="border: 1px solid rgb(196, 210, 227); margin-top: 10px;">
                <div style="padding: 5px; margin-top: 10px; color: rgb(183, 0, 0); font-weight: bold; background: rgb(253, 236, 213); font-size: 19px;">Đặc biệt lâu chưa ra:</div>
                <div style="display: flex; flex-wrap: nowrap; gap: 5px; padding: 8px;">
                    ${specialGapGroups.map(group => `
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
            </div>
            
            <div style="padding: 5px;">
                <div style="margin: 5px 0px 0px; color: rgb(119, 0, 96); font-weight: bold; font-size: 19px;">Thống kê gan đặc biệt theo tổng:</div>
                <div style="display: flex; align-items: flex-end; flex-wrap: wrap; margin-top: 10px;">
                    ${sumGaps.map(s => {
                        const height = calcBarHeight(s.days, maxDaysInSumGaps);
                        return `
                            <div style="display: inline-block; margin: 20px 5px 0px 0px;">
                                <div title="Tổng ${s.sum}: ${s.days} ngày" style="border-radius: 4px 4px 0px 0px; position: relative; display: flex; align-items: flex-end; justify-content: center; width: 38px; background: rgb(246, 166, 255); font-weight: 700; color: rgb(255, 255, 255); box-shadow: rgba(0, 0, 0, 0.06) 0px 1px 0px; height: ${height}px;">
                                    <div style="position: absolute; bottom: 100%; left: 50%; transform: translate(-50%, -4px); font-size: 16px; color: rgb(37, 99, 235); pointer-events: none; white-space: nowrap;">${s.days} ng</div>
                                    <div style="padding-bottom: 6px; font-size: 18px;">${s.sum}</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${topSumGap ? `
                <div style="padding: 5px 0px; font-size: 17px;">Thống kê cho thấy tổng đề lâu chưa xuất hiện nhất là tổng ${topSumGap.sum} (bao gồm 10 cặp số: <span style="color: rgb(169, 1, 211); font-weight: bold;">${topSumGapPairs.join(', ')}</span>) đã ${topSumGap.days} ngày chưa ra.</div>
                ` : ''}
            </div>
            
            <div style="padding: 5px;">
                <div style="margin: 5px 0px 0px; color: rgb(194, 1, 113); font-weight: bold; font-size: 19px;">Thống kê gan đặc biệt theo chạm:</div>
                <div style="display: flex; align-items: flex-end; flex-wrap: wrap; margin-top: 10px;">
                    ${chamGaps.map(c => {
                        const height = calcBarHeight(c.days, maxDaysInChamGaps);
                        return `
                            <div style="display: inline-block; margin: 20px 5px 0px 0px;">
                                <div title="Chạm ${c.cham}: ${c.days} ngày" style="border-radius: 4px 4px 0px 0px; position: relative; display: flex; align-items: flex-end; justify-content: center; width: 38px; background: rgb(255, 166, 214); font-weight: 700; color: rgb(255, 255, 255); box-shadow: rgba(0, 0, 0, 0.06) 0px 1px 0px; height: ${height}px;">
                                    <div style="position: absolute; bottom: 100%; left: 50%; transform: translate(-50%, -4px); font-size: 16px; color: rgb(37, 99, 235); pointer-events: none; white-space: nowrap;">${c.days} ng</div>
                                    <div style="padding-bottom: 6px; font-size: 18px;">${c.cham}</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${chamGaps[0] ? `
                <div style="padding: 5px 0px; font-size: 17px;">Thống kê cho thấy chạm đề lâu chưa xuất hiện nhất là chạm ${chamGaps[0].cham}, đã ${chamGaps[0].days} ngày chưa ra.</div>
                ` : ''}
            </div>
        </div>
    </div>
</body>
</html>
        `;

        return html;
    }

    /**
     * Generate hình ảnh từ dữ liệu thống kê đặc biệt
     * Tối ưu: Sử dụng base service để generate image
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

module.exports = new ThongKeDacBietImageGeneratorService();

