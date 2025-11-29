const SpecialDetailedStats = require('../models/stats/specialDetailedStats.model');
const baseImageGenerator = require('./baseImageGenerator.service');

/**
 * Service để generate hình ảnh thống kê đầu đuôi đặc biệt từ dữ liệu database
 * Bao gồm: Đầu/đuôi lâu chưa ra, Đầu/đuôi ra nhiều nhất
 * Tối ưu: Sử dụng base service để share browser và cache
 */
class ThongKeDauDuoiImageGeneratorService {
    constructor() {
        this.baseService = baseImageGenerator;
    }

    /**
     * Lấy dữ liệu thống kê đầu đuôi đặc biệt từ database
     * Tối ưu: Sử dụng cache để tránh query database nhiều lần
     */
    async getStatsData() {
        const cacheKey = 'thongke_dauduoi_365';
        
        // Kiểm tra cache trước
        const cached = this.baseService.getCachedData(cacheKey);
        if (cached) {
            return cached;
        }
        
        // Lấy thống kê chi tiết 365 ngày
        const dbStats = await SpecialDetailedStats.findOne({ days: 365 });
        
        if (!dbStats) {
            return {
                dauGanTop: [],
                duoiGanTop: [],
                dauHotTop: [],
                duoiHotTop: [],
                topDauGap: null,
                topDuoiGap: null
            };
        }

        // Lấy đầu/đuôi gan (đã được sort sẵn)
        const dauGanTop = (dbStats.dauGaps || [])
            .map(item => ({
                digit: item.digit || 0,
                days: item.days || 0,
                lastDate: item.lastDate || null
            }));

        const duoiGanTop = (dbStats.duoiGaps || [])
            .map(item => ({
                digit: item.digit || 0,
                days: item.days || 0,
                lastDate: item.lastDate || null
            }));

        // Lấy top 5 đầu/đuôi hot
        const dauHotTop = (dbStats.dauFrequency || [])
            .slice(0, 5)
            .map(item => ({
                digit: item.digit || 0,
                count: item.count || 0,
                percentage: item.percentage || '0%'
            }));

        const duoiHotTop = (dbStats.duoiFrequency || [])
            .slice(0, 5)
            .map(item => ({
                digit: item.digit || 0,
                count: item.count || 0,
                percentage: item.percentage || '0%'
            }));

        const topDauGap = dauGanTop[0] || null;
        const topDuoiGap = duoiGanTop[0] || null;

        const result = {
            dauGanTop,
            duoiGanTop,
            dauHotTop,
            duoiHotTop,
            topDauGap,
            topDuoiGap
        };
        
        // Lưu vào cache
        this.baseService.setCachedData(cacheKey, result);
        
        return result;
    }

    /**
     * Tính chiều cao bar chart
     */
    calcBarHeight(days, maxDays) {
        const maxPx = 110;
        const minPx = 40;
        if (!maxDays || maxDays <= 0) return minPx;
        const h = Math.round((days / maxDays) * maxPx);
        return Math.max(minPx, Math.min(maxPx, h));
    }

    /**
     * Tạo HTML template cho ảnh thống kê đầu đuôi
     */
    generateHTMLTemplate(data) {
        const { dauGanTop, duoiGanTop, dauHotTop, duoiHotTop, topDauGap, topDuoiGap } = data;
        const todayStr = new Date().toLocaleDateString('vi-VN');

        // Tính max days cho bar chart
        const maxDauGap = Math.max(...dauGanTop.map(item => item.days || 0), 1);
        const maxDuoiGap = Math.max(...duoiGanTop.map(item => item.days || 0), 1);

        return `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Thống Kê Đầu Đuôi Đặc Biệt</title>
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
                <div style="padding: 5px; margin-top: 10px; color: rgb(194, 1, 113); font-weight: bold; background: rgb(253, 236, 245); font-size: 19px;">Thống kê gan đầu/đuôi giải đặc biệt theo 1 năm:</div>
                <div style="padding: 5px;">
                    <div style="margin: 5px 0px; font-size: 20px; font-weight: bold; color: rgb(194, 1, 113);">Đầu giải đặc biệt lâu chưa ra:</div>
                    <div style="display: flex; align-items: flex-end; flex-wrap: wrap; margin-top: 10px;">
                        ${dauGanTop.map(item => {
                            const height = this.calcBarHeight(item.days || 0, maxDauGap);
                            return `
                                <div style="display: inline-block; margin: 20px 5px 0px 0px;">
                                    <div title="Đầu ${item.digit}: ${item.days} ngày${item.lastDate ? ` (lần cuối ${item.lastDate})` : ''}" style="border-radius: 4px 4px 0px 0px; position: relative; display: flex; align-items: flex-end; justify-content: center; width: 38px; background: rgb(246, 166, 255); font-weight: 700; color: rgb(255, 255, 255); box-shadow: rgba(0, 0, 0, 0.06) 0px 1px 0px; height: ${height}px;">
                                        <div style="position: absolute; bottom: 100%; left: 50%; transform: translate(-50%, -4px); font-size: 16px; color: rgb(37, 99, 235); pointer-events: none; white-space: nowrap;">${item.days} ng</div>
                                        <div style="padding-bottom: 6px; font-size: 18px;">${item.digit}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    ${topDauGap ? `
                    <div style="padding: 5px 0px; color: rgb(51, 51, 51); font-size: 19px; line-height: 1.6;">Thống kê cho thấy <span style="color: rgb(194, 1, 113); font-weight: bold;">đầu đặc biệt</span> lâu chưa xuất hiện nhất là đầu <span style="color: rgb(194, 1, 113); font-weight: bold; font-size: 21px;">${topDauGap.digit}</span>, đã <span style="color: rgb(183, 0, 0); font-weight: bold;">${topDauGap.days} ngày</span> chưa ra.</div>
                    ` : ''}
                    
                    <div style="margin: 20px 0px 5px; font-size: 20px; font-weight: bold; color: rgb(194, 1, 113);">Đuôi giải đặc biệt lâu chưa ra:</div>
                    <div style="display: flex; align-items: flex-end; flex-wrap: wrap; margin-top: 10px;">
                        ${duoiGanTop.map(item => {
                            const height = this.calcBarHeight(item.days || 0, maxDuoiGap);
                            return `
                                <div style="display: inline-block; margin: 20px 5px 0px 0px;">
                                    <div title="Đuôi ${item.digit}: ${item.days} ngày${item.lastDate ? ` (lần cuối ${item.lastDate})` : ''}" style="border-radius: 4px 4px 0px 0px; position: relative; display: flex; align-items: flex-end; justify-content: center; width: 38px; background: rgb(255, 166, 214); font-weight: 700; color: rgb(255, 255, 255); box-shadow: rgba(0, 0, 0, 0.06) 0px 1px 0px; height: ${height}px;">
                                        <div style="position: absolute; bottom: 100%; left: 50%; transform: translate(-50%, -4px); font-size: 16px; color: rgb(37, 99, 235); pointer-events: none; white-space: nowrap;">${item.days} ng</div>
                                        <div style="padding-bottom: 6px; font-size: 18px;">${item.digit}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    ${topDuoiGap ? `
                    <div style="padding: 5px 0px; color: rgb(51, 51, 51); font-size: 19px; line-height: 1.6;">Thống kê cho thấy <span style="color: rgb(194, 1, 113); font-weight: bold;">đuôi đặc biệt</span> lâu chưa xuất hiện nhất là đuôi <span style="color: rgb(194, 1, 113); font-weight: bold; font-size: 21px;">${topDuoiGap.digit}</span>, đã <span style="color: rgb(183, 0, 0); font-weight: bold;">${topDuoiGap.days} ngày</span> chưa ra.</div>
                    ` : ''}
                    
                    <div style="display: flex; gap: 16px; margin-top: 20px;">
                        <div style="flex: 1 1 260px;">
                            <div style="margin: 0px 0px 5px; font-size: 20px; font-weight: bold; color: rgb(1, 65, 182);">Đầu đặc biệt ra nhiều nhất:</div>
                            <div style="display: flex; flex-wrap: nowrap; gap: 5px; padding: 8px;">
                                <div style="border: 1px solid rgb(196, 210, 227); padding: 6px; display: inline-flex; flex-direction: column; gap: 6px; background: rgb(255, 255, 255);">
                                    ${dauHotTop.map(item => `
                                        <div style="border: 1px solid rgb(158, 195, 239); border-radius: 3px; padding: 4px 6px; display: inline-flex; align-items: center; gap: 5px; background: rgb(255, 255, 255);">
                                            <span style="color: rgb(215, 0, 0); font-weight: 700; min-width: 22px; text-align: center; font-size: 20px;">Đầu ${item.digit}</span>
                                            <span style="color: rgb(10, 138, 42); font-weight: 700; font-size: 20px;">${item.count} lần <span style="color: rgb(85, 85, 85); font-weight: 500;">(${item.percentage})</span></span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        
                        <div style="flex: 1 1 260px;">
                            <div style="margin: 0px 0px 5px; font-size: 20px; font-weight: bold; color: rgb(1, 65, 182);">Đuôi đặc biệt ra nhiều nhất:</div>
                            <div style="display: flex; flex-wrap: nowrap; gap: 5px; padding: 8px;">
                                <div style="border: 1px solid rgb(196, 210, 227); padding: 6px; display: inline-flex; flex-direction: column; gap: 6px; background: rgb(255, 255, 255);">
                                    ${duoiHotTop.map(item => `
                                        <div style="border: 1px solid rgb(158, 195, 239); border-radius: 3px; padding: 4px 6px; display: inline-flex; align-items: center; gap: 5px; background: rgb(255, 255, 255);">
                                            <span style="color: rgb(215, 0, 0); font-weight: 700; min-width: 22px; text-align: center; font-size: 20px;">Đuôi ${item.digit}</span>
                                            <span style="color: rgb(10, 138, 42); font-weight: 700; font-size: 20px;">${item.count} lần <span style="color: rgb(85, 85, 85); font-weight: 500;">(${item.percentage})</span></span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * Generate ảnh từ HTML template
     * Tối ưu: Sử dụng base service để generate image
     */
    async generateImage(data) {
        const html = this.generateHTMLTemplate(data);
        return await this.baseService.generateImageFromHTML(html, {
            viewportWidth: 900,
            viewportHeight: 4000,
            deviceScaleFactor: 1.5, // Giảm từ 2 xuống 1.5 để nhanh hơn, vẫn đảm bảo chất lượng
            waitTime: 100, // Giảm từ 200ms xuống 100ms
            timeout: 6000 // Giảm từ 8000ms xuống 6000ms
        });
    }
}

// Singleton instance
let instance = null;

const getInstance = () => {
    if (!instance) {
        instance = new ThongKeDauDuoiImageGeneratorService();
    }
    return instance;
};

module.exports = getInstance();

