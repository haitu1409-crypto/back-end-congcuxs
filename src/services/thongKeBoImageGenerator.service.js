const SpecialDetailedStats = require('../models/stats/specialDetailedStats.model');
const baseImageGenerator = require('./baseImageGenerator.service');

/**
 * Service để generate hình ảnh thống kê bộ số đặc biệt từ dữ liệu database
 * Bao gồm: Thống kê gan đặc biệt theo bộ, Bộ số đặc biệt ra nhiều nhất
 * Tối ưu: Sử dụng base service để share browser và cache
 */
class ThongKeBoImageGeneratorService {
    constructor() {
        this.baseService = baseImageGenerator;
    }

    /**
     * Lấy dữ liệu thống kê bộ số đặc biệt từ database
     * Tối ưu: Sử dụng cache để tránh query database nhiều lần
     */
    async getStatsData() {
        const cacheKey = 'thongke_bo_365';
        
        // Kiểm tra cache trước
        const cached = this.baseService.getCachedData(cacheKey);
        if (cached) {
            return cached;
        }
        
        // Lấy thống kê chi tiết 365 ngày
        const dbStats = await SpecialDetailedStats.findOne({ days: 365 });
        
        if (!dbStats) {
            return {
                boGanTop: [],
                boHotTop: [],
                topBoGap: null
            };
        }

        // Lấy top 25 bộ gan
        const boGanTop = (dbStats.boGaps || [])
            .sort((a, b) => (b.days || 0) - (a.days || 0))
            .slice(0, 25)
            .map(item => ({
                setId: item.setId || String(item.setId).padStart(2, '0'),
                days: item.days || 0,
                lastDate: item.lastDate || null
            }));

        // Lấy top 50 bộ hot
        const boHotTop = (dbStats.boFrequency || [])
            .sort((a, b) => (b.count || 0) - (a.count || 0))
            .slice(0, 50)
            .map(item => ({
                setId: item.setId || String(item.setId).padStart(2, '0'),
                count: item.count || 0
            }));

        const topBoGap = boGanTop[0] || null;

        const result = {
            boGanTop,
            boHotTop,
            topBoGap
        };
        
        // Lưu vào cache
        this.baseService.setCachedData(cacheKey, result);
        
        return result;
    }

    /**
     * Tạo HTML template cho ảnh thống kê bộ số
     */
    generateHTMLTemplate(data) {
        const { boGanTop, boHotTop, topBoGap } = data;
        const todayStr = new Date().toLocaleDateString('vi-VN');

        // Chia boGanTop thành các group 5 items
        const boGanGroups = [];
        for (let i = 0; i < boGanTop.length; i += 5) {
            boGanGroups.push(boGanTop.slice(i, i + 5));
        }

        // Chia boHotTop thành 5 cột, mỗi cột 10 items
        const boHotGroups = [
            { label: 'Top 10', items: boHotTop.slice(0, 10), startIdx: 1 },
            { label: 'Top 20', items: boHotTop.slice(10, 20), startIdx: 11 },
            { label: 'Top 30', items: boHotTop.slice(20, 30), startIdx: 21 },
            { label: 'Top 40', items: boHotTop.slice(30, 40), startIdx: 31 },
            { label: 'Top 50', items: boHotTop.slice(40, 50), startIdx: 41 }
        ];

        return `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Thống Kê Bộ Số Đặc Biệt</title>
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
    </style>
</head>
<body>
    <div class="container">
        <div class="box">
            <div class="header">
                <div>THỐNG KÊ NHANH CHO NGÀY ${todayStr}</div>
            </div>
            
            <div style="border: 1px solid rgb(196, 210, 227); margin-top: 10px;">
                <div style="padding: 5px; margin-top: 10px; color: rgb(142, 0, 204); font-weight: bold; background: rgb(240, 230, 255); font-size: 19px;">Thống kê gan đặc biệt theo bộ (1 năm):</div>
                <div style="display: flex; flex-wrap: nowrap; gap: 8px; padding: 8px;">
                    ${boGanGroups.map(group => `
                        <div style="border: 1px solid rgb(196, 210, 227); padding: 6px; display: inline-flex; flex-direction: column; gap: 6px; background: rgb(255, 255, 255);">
                            ${group.map(item => `
                                <div style="border: 1px solid rgb(158, 195, 239); border-radius: 3px; padding: 4px 6px; display: inline-flex; align-items: center; gap: 5px; background: rgb(255, 255, 255);">
                                    <span style="color: rgb(215, 0, 0); font-weight: 700; min-width: 22px; text-align: center; font-size: 20px;">Bộ ${item.setId}</span>
                                    <span style="color: rgb(10, 138, 42); font-weight: 700; font-size: 20px;">${item.days} ngày</span>
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
                ${topBoGap ? `
                <div style="padding: 5px;">
                    <div style="margin: 5px 0px; font-size: 19px; color: rgb(142, 0, 204);">Thống kê cho thấy bộ số đặc biệt lâu chưa xuất hiện nhất là <b>Bộ ${topBoGap.setId}</b>, đã <b>${topBoGap.days}</b> ngày chưa ra${topBoGap.lastDate ? `<span style="color: rgb(102, 102, 102); font-size: 17px;"> (lần cuối: ${topBoGap.lastDate})</span>` : ''}.</div>
                </div>
                ` : ''}
                
                ${boHotTop.length > 0 ? `
                <div style="padding: 5px; margin-top: 15px; border-top: 1px solid rgb(224, 224, 224);">
                    <div style="margin: 5px 0px 10px; font-size: 20px; font-weight: bold; color: rgb(1, 65, 182);">Bộ số đặc biệt ra nhiều nhất:</div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start;">
                        ${boHotGroups.map((group, colIdx) => `
                            <div style="flex: 1 1 calc(20% - 6.4px); min-width: calc(20% - 6.4px); max-width: calc(20% - 6.4px);">
                                <div style="border: 1px solid rgb(196, 210, 227); padding: 6px; display: inline-flex; flex-direction: column; gap: 6px; background: rgb(255, 255, 255);">
                                    ${group.items.map((item, rowIdx) => `
                                        <div style="border: 1px solid rgb(158, 195, 239); border-radius: 3px; padding: 4px 6px; display: inline-flex; align-items: center; gap: 5px; background: rgb(255, 255, 255);">
                                            <span style="color: rgb(215, 0, 0); font-weight: 700; min-width: 22px; text-align: center; font-size: 20px;">Bộ ${item.setId}</span>
                                            <span style="color: rgb(10, 138, 42); font-weight: 700; font-size: 20px;">${item.count} lần</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
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
        instance = new ThongKeBoImageGeneratorService();
    }
    return instance;
};

module.exports = getInstance();

