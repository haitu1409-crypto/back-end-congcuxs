/**
 * Thống Kê Service
 * Xử lý logic nghiệp vụ cho bảng thống kê 3 miền
 */

const ThongKe = require('../models/thongke.model');
const cacheManager = require('../utils/cache');

class ThongKeService {
    /**
     * Lấy dữ liệu thống kê 3 miền với caching
     * @param {Object} params - Tham số lọc
     * @param {string} params.startDate - Ngày bắt đầu (YYYY-MM-DD)
     * @param {string} params.endDate - Ngày kết thúc (YYYY-MM-DD)
     * @param {number} params.limit - Số lượng bản ghi tối đa
     * @returns {Object} Dữ liệu thống kê
     */
    async getThongKe3Mien(params = {}) {
        const cacheKey = cacheManager.createKey('thongke_3mien', params);

        return cacheManager.wrap(cacheKey, async () => {
            try {
                const { startDate, endDate, limit = 30 } = params;

                // Tạo query filter với optimization
                const filter = {};
                if (startDate || endDate) {
                    filter.date = {};
                    if (startDate) filter.date.$gte = startDate;
                    if (endDate) filter.date.$lte = endDate;
                }

                // Lấy dữ liệu từ MongoDB với index optimization
                const statistics = await ThongKe.find(filter)
                    .sort({ date: -1 })
                    .limit(limit)
                    .lean() // Sử dụng lean() để tăng performance
                    .select('-__v') // Loại bỏ field không cần thiết
                    .hint({ date: -1 }); // Sử dụng index hint

                // Nếu không có dữ liệu, tạo dữ liệu mẫu
                if (statistics.length === 0) {
                    await ThongKe.createSampleData(limit);
                    const newStatistics = await ThongKe.find(filter)
                        .sort({ date: -1 })
                        .limit(limit)
                        .lean()
                        .select('-__v')
                        .hint({ date: -1 });
                    statistics.push(...newStatistics);
                }

                return {
                    success: true,
                    data: {
                        statistics: statistics,
                        summary: this.calculateSummary(statistics),
                        metadata: {
                            totalRecords: statistics.length,
                            dateRange: {
                                start: startDate || this.getDateString(-30),
                                end: endDate || this.getDateString(0)
                            },
                            lastUpdated: new Date().toISOString()
                        }
                    }
                };
            } catch (error) {
                console.error('Lỗi khi lấy thống kê 3 miền:', error);
                throw new Error('Không thể lấy dữ liệu thống kê');
            }
        }, 300); // Cache 5 phút
    }

    /**
     * Tạo dữ liệu mẫu cho thống kê
     * @param {string} startDate 
     * @param {string} endDate 
     * @param {number} limit 
     * @returns {Array} Mảng dữ liệu thống kê
     */
    generateMockData(startDate, endDate, limit) {
        const data = [];
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        // Tạo dữ liệu cho từng ngày
        for (let d = new Date(start); d <= end && data.length < limit; d.setDate(d.getDate() + 1)) {
            const dateStr = this.formatDate(d);

            data.push({
                date: dateStr,
                displayDate: this.formatDisplayDate(d),
                mienNam: {
                    db: this.generateRandomNumber(),
                    nhan: this.generateRandomResult()
                },
                mienTrung: {
                    db: this.generateRandomNumber(),
                    nhan: this.generateRandomResult()
                },
                mienBac: {
                    db: this.generateRandomNumber(),
                    nhan: this.generateRandomResult()
                }
            });
        }

        return data.reverse(); // Sắp xếp từ mới nhất đến cũ nhất
    }

    /**
     * Tính toán thống kê tổng hợp
     * @param {Array} data - Dữ liệu thống kê
     * @returns {Object} Thống kê tổng hợp
     */
    calculateSummary(data) {
        const summary = {
            mienNam: { totalScore: 0, totalRecords: 0, hitRate: 0 },
            mienTrung: { totalScore: 0, totalRecords: 0, hitRate: 0 },
            mienBac: { totalScore: 0, totalRecords: 0, hitRate: 0 }
        };

        data.forEach(record => {
            ['mienNam', 'mienTrung', 'mienBac'].forEach(region => {
                const nhanValue = record[region].nhan;

                // Chỉ tính những bản ghi có dữ liệu
                if (nhanValue && nhanValue.trim() !== '' && nhanValue.toLowerCase() !== 'đợi kết quả') {
                    summary[region].totalRecords++;

                    // Tính điểm dựa trên quy tắc: 0X = 10 điểm, 1X = 9 điểm, ..., 9X = 1 điểm
                    const score = this.calculateHitScore(nhanValue);
                    summary[region].totalScore += score;

                    // Debug logging cho miền Bắc
                    if (region === 'mienBac') {
                        console.log(`[DEBUG] ${region} - Date: ${record.date}, Nhan: "${nhanValue}", Score: ${score}`);
                    }
                }
            });
        });

        // Tính tỷ lệ trúng (điểm trung bình / 10 * 100)
        ['mienNam', 'mienTrung', 'mienBac'].forEach(region => {
            if (summary[region].totalRecords > 0) {
                const averageScore = summary[region].totalScore / summary[region].totalRecords;
                summary[region].hitRate = Math.round((averageScore / 10) * 100);

                // Debug logging cho miền Bắc
                if (region === 'mienBac') {
                    console.log(`[DEBUG] ${region} - Total Records: ${summary[region].totalRecords}, Total Score: ${summary[region].totalScore}, Average: ${averageScore}, Hit Rate: ${summary[region].hitRate}%`);
                }
            } else {
                summary[region].hitRate = 0;

                // Debug logging cho miền Bắc
                if (region === 'mienBac') {
                    console.log(`[DEBUG] ${region} - No valid records found, Hit Rate: 0%`);
                }
            }
        });

        return summary;
    }

    /**
     * Tính điểm cho kết quả nhận
     * @param {string} nhanValue - Giá trị nhận (0X, 1X, 2X, ..., 9X)
     * @returns {number} Điểm từ 1-10
     */
    calculateHitScore(nhanValue) {
        if (!nhanValue || typeof nhanValue !== 'string') {
            return 0;
        }

        // Trim và chuyển về uppercase để đảm bảo format
        const cleanValue = nhanValue.trim().toUpperCase();

        // Bỏ qua các giá trị không hợp lệ
        if (cleanValue === 'ĐỢI KẾT QUẢ' || cleanValue === '') {
            return 0;
        }

        // Lấy số đầu tiên trong chuỗi (0X -> 0, 1X -> 1, ...)
        const match = cleanValue.match(/^(\d)X?$/);
        if (match) {
            const digit = parseInt(match[1]);
            // 0X = 10 điểm, 1X = 9 điểm, 2X = 8 điểm, ..., 9X = 1 điểm
            return 10 - digit;
        }

        // Nếu chỉ có X, cho điểm trung bình
        if (cleanValue === 'X') {
            return 5;
        }

        console.log(`Giá trị nhận không hợp lệ: "${nhanValue}" -> "${cleanValue}"`);
        return 0;
    }

    /**
     * Tạo số ngẫu nhiên 2 chữ số
     * @returns {string} Số 2 chữ số
     */
    generateRandomNumber() {
        return Math.floor(Math.random() * 100).toString().padStart(2, '0');
    }

    /**
     * Tạo kết quả ngẫu nhiên (số + X)
     * @returns {string} Kết quả
     */
    generateRandomResult() {
        const results = ['0X', '1X', '2X', '3X', '4X', '5X', '6X', '7X', '8X', '9X'];
        return results[Math.floor(Math.random() * results.length)];
    }

    /**
     * Format ngày theo định dạng YYYY-MM-DD
     * @param {Date} date 
     * @returns {string}
     */
    formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    /**
     * Format ngày hiển thị (d/m)
     * @param {Date} date 
     * @returns {string}
     */
    formatDisplayDate(date) {
        return `${date.getDate()}/${date.getMonth() + 1}`;
    }

    /**
     * Lấy chuỗi ngày cách hiện tại n ngày
     * @param {number} daysOffset 
     * @returns {string}
     */
    getDateString(daysOffset) {
        const date = new Date();
        date.setDate(date.getDate() + daysOffset);
        return this.formatDate(date);
    }

    /**
     * Lấy thống kê theo miền cụ thể
     * @param {string} region - Tên miền (mienNam, mienTrung, mienBac)
     * @param {Object} params - Tham số lọc
     * @returns {Object} Thống kê theo miền
     */
    async getThongKeoTheoMien(region, params = {}) {
        try {
            const allData = await this.getThongKe3Mien(params);

            if (!['mienNam', 'mienTrung', 'mienBac'].includes(region)) {
                throw new Error('Miền không hợp lệ');
            }

            const regionData = allData.data.statistics.map(record => ({
                date: record.date,
                displayDate: record.displayDate,
                data: record[region]
            }));

            return {
                success: true,
                data: {
                    region: region,
                    statistics: regionData,
                    summary: allData.data.summary[region],
                    metadata: allData.data.metadata
                }
            };
        } catch (error) {
            console.error(`Lỗi khi lấy thống kê miền ${region}:`, error);
            throw new Error(`Không thể lấy dữ liệu thống kê miền ${region}`);
        }
    }

    /**
     * Cập nhật dữ liệu thống kê cho một ngày với cache invalidation
     * @param {string} date - Ngày cần cập nhật (YYYY-MM-DD)
     * @param {Object} data - Dữ liệu cập nhật
     * @param {string} updatedBy - Người cập nhật
     * @returns {Object} Kết quả cập nhật
     */
    async updateThongKe(date, data, updatedBy = 'user') {
        try {
            // Validate dữ liệu đầu vào
            if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                throw new Error('Ngày không hợp lệ. Định dạng: YYYY-MM-DD');
            }

            // Tạo displayDate từ date
            const dateObj = new Date(date);
            const displayDate = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;

            // Chuẩn bị dữ liệu cập nhật
            const updateData = {
                displayDate,
                updatedBy,
                updatedAt: new Date()
            };

            // Validate và cập nhật từng miền (chỉ cập nhật miền có dữ liệu)
            ['mienNam', 'mienTrung', 'mienBac'].forEach(region => {
                if (data[region]) {
                    // Chỉ tạo object nếu có ít nhất một field được cập nhật
                    const regionUpdate = {};
                    let hasUpdate = false;

                    if (data[region].db !== undefined) {
                        if (data[region].db && !/^\d{0,2}$/.test(data[region].db)) {
                            throw new Error(`${region}.db phải là số 2 chữ số hoặc rỗng`);
                        }
                        regionUpdate.db = data[region].db || '';
                        hasUpdate = true;
                    }

                    if (data[region].nhan !== undefined) {
                        if (data[region].nhan && !/^(\d{1}X|X|đợi kết quả)$/i.test(data[region].nhan)) {
                            throw new Error(`${region}.nhan phải có định dạng 0X, 1X, 2X...9X hoặc X hoặc 'đợi kết quả'`);
                        }
                        regionUpdate.nhan = data[region].nhan || '';
                        hasUpdate = true;
                    }

                    // Chỉ thêm vào updateData nếu có thay đổi
                    if (hasUpdate) {
                        updateData[region] = regionUpdate;
                    }
                }
            });

            // Cập nhật hoặc tạo mới với session để đảm bảo consistency
            const result = await ThongKe.findOneAndUpdate(
                { date },
                { $set: updateData },
                {
                    new: true,
                    upsert: true,
                    runValidators: true
                }
            );

            // Xóa cache liên quan sau khi update
            cacheManager.delPattern('thongke_3mien');
            cacheManager.delPattern('thongke_mien');
            cacheManager.delPattern(`thongke_date:${date}`);

            return {
                success: true,
                data: result,
                message: 'Cập nhật thành công'
            };
        } catch (error) {
            console.error('Lỗi khi cập nhật thống kê:', error);
            throw new Error(error.message || 'Không thể cập nhật dữ liệu thống kê');
        }
    }

    /**
     * Xóa dữ liệu thống kê theo ngày
     * @param {string} date - Ngày cần xóa
     * @returns {Object} Kết quả xóa
     */
    async deleteThongKe(date) {
        try {
            if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                throw new Error('Ngày không hợp lệ. Định dạng: YYYY-MM-DD');
            }

            const result = await ThongKe.findOneAndDelete({ date });

            if (!result) {
                throw new Error('Không tìm thấy dữ liệu để xóa');
            }

            return {
                success: true,
                message: 'Xóa thành công',
                data: result
            };
        } catch (error) {
            console.error('Lỗi khi xóa thống kê:', error);
            throw new Error(error.message || 'Không thể xóa dữ liệu thống kê');
        }
    }

    /**
     * Lấy một bản ghi thống kê theo ngày
     * @param {string} date - Ngày cần lấy
     * @returns {Object} Dữ liệu thống kê
     */
    async getThongKeByDate(date) {
        try {
            if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                throw new Error('Ngày không hợp lệ. Định dạng: YYYY-MM-DD');
            }

            const result = await ThongKe.findOne({ date }).lean();

            if (!result) {
                // Tạo bản ghi trống nếu chưa tồn tại
                const dateObj = new Date(date);
                const displayDate = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;

                const newRecord = new ThongKe({
                    date,
                    displayDate,
                    mienNam: { db: '', nhan: '' },
                    mienTrung: { db: '', nhan: '' },
                    mienBac: { db: '', nhan: '' }
                });

                const saved = await newRecord.save();
                return {
                    success: true,
                    data: saved
                };
            }

            return {
                success: true,
                data: result
            };
        } catch (error) {
            console.error('Lỗi khi lấy thống kê theo ngày:', error);
            throw new Error(error.message || 'Không thể lấy dữ liệu thống kê');
        }
    }
}

module.exports = new ThongKeService();
