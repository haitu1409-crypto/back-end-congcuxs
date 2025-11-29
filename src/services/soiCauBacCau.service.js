/**
 * Service Soi Cầu Bắc Cầu
 * Tính toán và định vị chính xác từng chữ số trong mỗi ô theo số ngày
 */

const XSMB = require('../models/xsmb.model');

class SoiCauBacCauService {
    constructor() {
        this.prizeStructure = {
            0: { name: 'Giải đặc biệt', count: 1, digits: 5 },
            1: { name: 'Giải nhất', count: 1, digits: 5 },
            2: { name: 'Giải nhì', count: 2, digits: 5 },
            3: { name: 'Giải ba', count: 6, digits: 5 },
            4: { name: 'Giải tư', count: 4, digits: 5 },
            5: { name: 'Giải năm', count: 6, digits: 5 },
            6: { name: 'Giải sáu', count: 3, digits: 5 },
            7: { name: 'Giải bảy', count: 4, digits: 5 }
        };
    }

    /**
     * Format date to DD/MM/YYYY
     */
    formatDate(date) {
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }

    /**
     * Tính toán vị trí trong bảng (weekIndex, dayIndex) từ ngày
     */
    calculateCellPosition(date, startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        
        const current = new Date(date);
        current.setHours(0, 0, 0, 0);
        
        // Tính số ngày từ startDate
        const diffTime = current - start;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        // Tính thứ trong tuần (0 = Thứ 2, 6 = Chủ nhật)
        const dayOfWeekIndex = (date.getDay() + 6) % 7;
        
        // Tính số tuần (0-based)
        const weekIndex = Math.floor(diffDays / 7);
        
        return {
            weekIndex,
            dayIndex: dayOfWeekIndex
        };
    }

    /**
     * Tính globalIndex cho từng chữ số dựa trên số ngày
     * Với 90 ngày: mỗi chữ số có globalIndex duy nhất
     * GlobalIndex được tính dựa trên thứ tự ngày thực tế (dayNumber) và vị trí trong ngày đó
     * @param {number} dayNumber - Số thứ tự ngày từ đầu (0-based) trong bảng days ngày
     * @param {number} prize - Index của giải (0-7)
     * @param {number} elementIndex - Index của số trong giải (0-based)
     * @param {number} digitIndex - Index của chữ số trong số (0-based)
     */
    calculateGlobalIndex(dayNumber, prize, elementIndex, digitIndex) {
        // Tính tổng số chữ số tối đa trong 1 ngày
        const maxTotalDigits = this.getMaxTotalDigits();
        
        // Tính offset của giải (mỗi giải có số lượng số và chữ số khác nhau)
        let prizeOffset = 0;
        for (let p = 0; p < prize; p++) {
            const prizeInfo = this.prizeStructure[p];
            prizeOffset += prizeInfo.count * prizeInfo.digits;
        }
        
        // Tính offset của element trong giải
        const elementOffset = elementIndex * this.prizeStructure[prize].digits;
        
        // Global index = (dayNumber * maxTotalDigits) + prizeOffset + elementOffset + digitIndex
        // Đảm bảo mỗi chữ số có globalIndex duy nhất trong bảng days ngày
        return dayNumber * maxTotalDigits + prizeOffset + elementOffset + digitIndex;
    }

    /**
     * Tính tổng số chữ số tối đa trong 1 ngày (tất cả các giải)
     */
    getMaxTotalDigits() {
        let total = 0;
        for (const prize in this.prizeStructure) {
            const info = this.prizeStructure[prize];
            total += info.count * info.digits;
        }
        return total; // ~126 chữ số
    }

    /**
     * Phân tích định vị chính xác từng số trong kết quả xổ số
     * @param {Object} result - Kết quả xổ số
     * @param {Date} startDate - Ngày bắt đầu của bảng
     * @param {number} dayNumber - Số thứ tự ngày từ đầu (0-based) trong bảng
     */
    analyzePrizePositions(result, startDate, dayNumber) {
        const cellPos = this.calculateCellPosition(result.drawDate, startDate);
        const positions = {
            specialPrize: [],
            firstPrize: [],
            secondPrize: [],
            threePrizes: [],
            fourPrizes: [],
            fivePrizes: [],
            sixPrizes: [],
            sevenPrizes: []
        };

        // Tính số thứ tự số trong ô (numberIndex) cho mỗi giải
        // Giải đặc biệt = 0, Giải nhất = 1, Giải nhì [0,1] = [2,3], ...
        let currentNumberIndex = 0;

        // Helper function để tạo positions cho một giải
        const createPositions = (prizeArray, prizeIndex, prizeName) => {
            if (!Array.isArray(prizeArray)) return [];
            
            return prizeArray.map((number, elementIndex) => {
                if (!number || typeof number !== 'string') return null;
                
                // Tính numberIndex: thứ tự số trong toàn bộ ô
                const numberIndex = currentNumberIndex++;
                
                const digitPositions = [];
                for (let digitIndex = 0; digitIndex < number.length; digitIndex++) {
                    const digit = number[digitIndex];
                    const position = `(${prizeIndex}-${elementIndex}-${digitIndex})`;
                    
                    // Tính globalIndex dựa trên dayNumber (thứ tự ngày thực tế trong bảng)
                    const globalIndex = this.calculateGlobalIndex(
                        dayNumber,
                        prizeIndex,
                        elementIndex,
                        digitIndex
                    );
                    
                    // Tính vị trí ngang/dọc trong ô (nếu các số được hiển thị theo layout 2D)
                    // Giả sử mỗi hàng có tối đa 3 số (có thể điều chỉnh)
                    const numbersPerRow = 3;
                    const rowIndexInCell = Math.floor(numberIndex / numbersPerRow);
                    const colIndexInCell = numberIndex % numbersPerRow;
                    
                    digitPositions.push({
                        digit,
                        position,
                        globalIndex,
                        cellPosition: {
                            weekIndex: cellPos.weekIndex,      // Dòng trong bảng (hàng)
                            dayIndex: cellPos.dayIndex,        // Cột trong bảng (ngang)
                            numberIndex: numberIndex,          // Thứ tự số trong toàn bộ ô (0, 1, 2, ...)
                            rowIndexInCell: rowIndexInCell,    // Hàng trong ô (0 = hàng đầu, 1 = hàng 2, ...)
                            colIndexInCell: colIndexInCell,    // Cột trong ô (0 = cột đầu, 1 = cột 2, ...)
                            digitIndex                          // Vị trí chữ số trong số (0-4)
                        }
                    });
                }
                
                return {
                    number,
                    ...(prizeIndex !== 0 && { elementIndex }), // Chỉ thêm cho giải có nhiều số
                    positions: digitPositions
                };
            }).filter(item => item !== null);
        };

        // Phân tích từng giải
        if (result.specialPrize && Array.isArray(result.specialPrize)) {
            positions.specialPrize = createPositions(result.specialPrize, 0, 'specialPrize');
        }

        if (result.firstPrize && Array.isArray(result.firstPrize)) {
            positions.firstPrize = createPositions(result.firstPrize, 1, 'firstPrize');
        }

        if (result.secondPrize && Array.isArray(result.secondPrize)) {
            positions.secondPrize = createPositions(result.secondPrize, 2, 'secondPrize');
        }

        if (result.threePrizes && Array.isArray(result.threePrizes)) {
            positions.threePrizes = createPositions(result.threePrizes, 3, 'threePrizes');
        }

        if (result.fourPrizes && Array.isArray(result.fourPrizes)) {
            positions.fourPrizes = createPositions(result.fourPrizes, 4, 'fourPrizes');
        }

        if (result.fivePrizes && Array.isArray(result.fivePrizes)) {
            positions.fivePrizes = createPositions(result.fivePrizes, 5, 'fivePrizes');
        }

        if (result.sixPrizes && Array.isArray(result.sixPrizes)) {
            positions.sixPrizes = createPositions(result.sixPrizes, 6, 'sixPrizes');
        }

        if (result.sevenPrizes && Array.isArray(result.sevenPrizes)) {
            positions.sevenPrizes = createPositions(result.sevenPrizes, 7, 'sevenPrizes');
        }

        return positions;
    }

    /**
     * Tính toán thống kê soi cầu bắc cầu
     */
    async calculateSoiCauBacCauStats(days = 90) {
        try {
            console.log(`🔄 Bắt đầu tính toán soi cầu bắc cầu cho ${days} ngày...`);

            // Tính ngày bắt đầu và kết thúc
            const endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            
            let startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - days + 1);
            startDate.setHours(0, 0, 0, 0);

            console.log(`📅 Khoảng thời gian: ${this.formatDate(startDate)} đến ${this.formatDate(endDate)}`);

            // Lấy dữ liệu từ database - không filter isComplete để lấy đủ dữ liệu như page thống kê
            let results = await XSMB.find({
                drawDate: { $gte: startDate, $lte: endDate },
                station: 'xsmb'
            })
                .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
                .sort({ drawDate: 1 }) // Sắp xếp từ cũ đến mới
                .lean();

            // Nếu không có đủ dữ liệu trong khoảng thời gian yêu cầu, lấy tối đa số ngày có sẵn từ ngày mới nhất
            if (results.length === 0) {
                console.log(`⚠️ Không có dữ liệu trong khoảng ${days} ngày, lấy tối đa số ngày có sẵn...`);
                // Lấy tối đa số ngày có sẵn từ ngày mới nhất trở về trước
                results = await XSMB.find({
                    station: 'xsmb',
                    drawDate: { $lte: endDate }
                })
                    .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
                    .sort({ drawDate: -1 }) // Sắp xếp từ mới đến cũ
                    .limit(days) // Giới hạn số lượng
                    .lean();
                
                // Sắp xếp lại từ cũ đến mới
                results.sort((a, b) => new Date(a.drawDate) - new Date(b.drawDate));
                
                // Cập nhật startDate để phản ánh khoảng thời gian thực tế
                if (results.length > 0) {
                    startDate = new Date(results[0].drawDate);
                    startDate.setHours(0, 0, 0, 0);
                    console.log(`📅 Đã điều chỉnh khoảng thời gian: ${this.formatDate(startDate)} đến ${this.formatDate(endDate)}`);
                }
            }

            if (results.length === 0) {
                throw new Error(`Không có dữ liệu xổ số trong database`);
            }

            console.log(`📊 Tìm thấy ${results.length} kết quả xổ số (yêu cầu: ${days} ngày)`);

            // Phân tích từng ngày với định vị chính xác
            const statistics = [];
            
            // Tìm ngày đầu tiên có dữ liệu để làm baseline
            const firstResultDate = results.length > 0 ? new Date(results[0].drawDate) : null;
            if (!firstResultDate) {
                throw new Error('Không có dữ liệu xổ số để tính toán');
            }

            results.forEach((result, index) => {
                const drawDate = new Date(result.drawDate);
                const dateStr = this.formatDate(drawDate);
                
                // Tính dayNumber: số thứ tự ngày từ ngày đầu tiên (0-based)
                // Đảm bảo mỗi ngày có dayNumber duy nhất
                const diffTime = drawDate - firstResultDate;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                const dayNumber = diffDays; // 0-based
                
                // Phân tích định vị - chỉ phân tích nếu có dữ liệu
                let prizes = {};
                if (result.specialPrize && Array.isArray(result.specialPrize) && result.specialPrize.length > 0) {
                    prizes = this.analyzePrizePositions(result, startDate, dayNumber);
                } else {
                    // Tạo cấu trúc prizes rỗng nhưng vẫn giữ thông tin ngày
                    prizes = {
                        specialPrize: [],
                        firstPrize: [],
                        secondPrize: [],
                        threePrizes: [],
                        fourPrizes: [],
                        fivePrizes: [],
                        sixPrizes: [],
                        sevenPrizes: []
                    };
                }
                
                // Lấy 2 số cuối giải đặc biệt
                const lastTwoDigits = result.specialPrize && result.specialPrize[0] 
                    ? result.specialPrize[0].slice(-2) 
                    : '';

                // Thông tin ngày trong tuần
                const dayOfWeek = drawDate.getDay();
                const dayOfWeekNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

                // Chỉ thêm vào statistics nếu có giải đặc biệt (để hiển thị giống page thống kê)
                if (result.specialPrize && Array.isArray(result.specialPrize) && result.specialPrize.length > 0) {
                    statistics.push({
                        drawDate: dateStr,
                        prizes,
                        info: {
                            lastTwoDigits,
                            dayOfWeek,
                            dayOfWeekName: dayOfWeekNames[dayOfWeek]
                        }
                    });
                }
            });

            // Tính metadata
            const coverageStatus = statistics.length < days ? 'partial' : 'full';
            const coverageMessage = coverageStatus === 'partial'
                ? `Chỉ có ${statistics.length} ngày dữ liệu trong hệ thống (yêu cầu ${days} ngày). Đã trả về tối đa dữ liệu hiện có.`
                : null;

            const metadata = {
                startDate: this.formatDate(startDate),
                endDate: this.formatDate(endDate),
                totalDays: statistics.length, // Số ngày thực tế có dữ liệu
                totalCells: Math.ceil(statistics.length / 7) * 7, // Làm tròn lên số tuần * 7
                requestedDays: days,
                availableDays: statistics.length,
                coverageStatus,
                coverageMessage,
                message: coverageMessage,
                lastUpdated: new Date()
            };

            console.log(`✅ Hoàn thành tính toán soi cầu bắc cầu: ${statistics.length} ngày`);

            return {
                statistics,
                metadata
            };

        } catch (error) {
            console.error('❌ Lỗi khi tính toán soi cầu bắc cầu:', error);
            throw error;
        }
    }
}

module.exports = new SoiCauBacCauService();

