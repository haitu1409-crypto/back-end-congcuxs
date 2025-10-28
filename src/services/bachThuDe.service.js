/**
 * Bạch Thủ Đề Service - Dự đoán bạch thủ đề với các phương pháp truyền thống
 */

const XSMB = require('../models/xsmb.model');

class BachThuDeService {
    constructor() {
        console.log('✅ BachThuDeService initialized');
    }

    /**
     * Tạo dự đoán bạch thủ đề cho ngày hôm sau
     * @param {Date} targetDate - Ngày dự đoán
     * @param {number} days - Số ngày dữ liệu lịch sử
     * @returns {Object} Kết quả dự đoán bạch thủ đề
     */
    async generateBachThuDe(targetDate, days = 14) {
        try {
            console.log(`🎯 Generating bạch thủ đề for ${targetDate.toISOString().split('T')[0]}`);

            // Lấy dữ liệu lịch sử (bao gồm cả ngày targetDate để tạo lịch sử)
            const endDate = new Date(targetDate);
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - days);

            console.log(`📅 Fetching data from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

            const historicalData = await XSMB.find({
                drawDate: {
                    $gte: startDate,
                    $lte: endDate
                }
            }).sort({ drawDate: -1 });

            console.log(`📊 Found ${historicalData.length} historical records`);

            if (historicalData.length < 5) {
                throw new Error(`Không đủ dữ liệu lịch sử để dự đoán. Chỉ có ${historicalData.length} bản ghi`);
            }

            const predictions = [];

            // Phương pháp 1: Pascal - Áp dụng cho đề
            const pascal = this.phuongPhapPascal(historicalData);
            if (pascal && pascal.length > 0) {
                predictions.push({
                    method: 'Pascal',
                    numbers: pascal,
                    description: 'Ghép 2 số cuối của giải đặc biệt và giải nhất, áp dụng logic Pascal cho đề (top 3 số)',
                    frame: '3 ngày'
                });
            }

            // Phương pháp 2: Hình Quả Trám - Áp dụng cho đề
            const hinhQuaTram = this.phuongPhapHinhQuaTram(historicalData);
            if (hinhQuaTram && hinhQuaTram.length > 0) {
                predictions.push({
                    method: 'Hình Quả Trám',
                    numbers: hinhQuaTram,
                    description: 'Tìm mẫu A-B-A hoặc B-A-B trong các giải, áp dụng cho đề (top 3 số)',
                    frame: '3 ngày'
                });
            }

            // Phương pháp 3: Tần suất đề cặp
            const tanSuatDeCap = this.phuongPhapTanSuatDeCap(historicalData);
            if (tanSuatDeCap && tanSuatDeCap.length > 0) {
                predictions.push({
                    method: 'Tần suất đề cặp',
                    numbers: tanSuatDeCap,
                    description: 'Chọn đề từ cặp số có tần suất cao nhất, loại trừ số đã ra trong 5 ngày gần nhất (top 5 số)',
                    frame: '3 ngày'
                });
            }

            // Phương pháp 4: Đề gan kết hợp
            const deGanKetHop = this.phuongPhapDeGanKetHop(historicalData);
            if (deGanKetHop && deGanKetHop.length > 0) {
                predictions.push({
                    method: 'Đề gan kết hợp',
                    numbers: deGanKetHop,
                    description: 'Chọn đề gần đạt ngưỡng gan nhưng có tần suất cao, loại trừ số đã ra trong 5 ngày gần nhất (top 5 số)',
                    frame: '5 ngày'
                });
            }

            // Phương pháp 5: Đề rơi
            const deRoi = this.phuongPhapDeRoi(historicalData);
            if (deRoi && deRoi.length > 0) {
                predictions.push({
                    method: 'Đề rơi',
                    numbers: deRoi,
                    description: 'Chọn đề CHƯA xuất hiện trong 5 ngày gần nhất (top 3 số)',
                    frame: '2 ngày'
                });
            }

            // Tính dự đoán tổng hợp
            console.log('🔍 All predictions:', predictions);
            const combinedPrediction = this.tinhDuDoanTongHop(predictions);
            console.log('🔍 Combined prediction result:', combinedPrediction);

            // Tạo lịch sử dự đoán bạch thủ đề
            const history = await this.generateBachThuDeHistory(historicalData);

            return {
                predictions,
                combinedPrediction,
                history,
                metadata: {
                    predictionFor: targetDate.toLocaleDateString('vi-VN'),
                    dataFrom: startDate.toLocaleDateString('vi-VN'),
                    dataTo: endDate.toLocaleDateString('vi-VN'),
                    totalMethods: predictions.length,
                    dataPoints: historicalData.length,
                    specialPrize: historicalData[0]?.specialPrize?.[0] || '',
                    firstPrize: historicalData[0]?.firstPrize?.[0] || ''
                }
            };

        } catch (error) {
            console.error('❌ Error generating bạch thủ đề:', error);
            throw error;
        }
    }

    /**
     * Phương pháp tổng giải đặc biệt - Lấy 2 số cuối của giải đặc biệt
     */
    phuongPhapTongDacBiet(historicalData) {
        if (!historicalData[0]?.specialPrize?.[0]) return null;

        const dacBiet = historicalData[0].specialPrize[0].toString();
        // Lấy 2 số cuối của giải đặc biệt
        return dacBiet.slice(-2);
    }

    /**
     * Phương pháp tổng giải nhất - Lấy 2 số cuối của giải nhất
     */
    phuongPhapTongGiaiNhat(historicalData) {
        if (!historicalData[0]?.firstPrize?.[0]) return null;

        const giaiNhat = historicalData[0].firstPrize[0].toString();
        // Lấy 2 số cuối của giải nhất
        return giaiNhat.slice(-2);
    }

    /**
     * Phương pháp hiệu giải đặc biệt và giải nhất - Lấy 2 số cuối của hiệu
     */
    phuongPhapHieuDacBietGiaiNhat(historicalData) {
        if (!historicalData[0]?.specialPrize?.[0] || !historicalData[0]?.firstPrize?.[0]) return null;

        const dacBiet = parseInt(historicalData[0].specialPrize[0]);
        const giaiNhat = parseInt(historicalData[0].firstPrize[0]);
        const hieu = Math.abs(dacBiet - giaiNhat);

        // Lấy 2 số cuối của hiệu
        return hieu.toString().slice(-2);
    }

    /**
     * Phương pháp tần suất số đề
     */
    phuongPhapTanSuatDe(historicalData) {
        const deCount = {};

        historicalData.forEach(data => {
            if (data.specialPrize?.[0]) {
                const de = parseInt(data.specialPrize[0]) % 10;
                deCount[de] = (deCount[de] || 0) + 1;
            }
        });

        // Tìm số có tần suất cao nhất
        let maxCount = 0;
        let mostFrequentDe = null;

        for (const [de, count] of Object.entries(deCount)) {
            if (count > maxCount) {
                maxCount = count;
                mostFrequentDe = parseInt(de);
            }
        }

        return mostFrequentDe;
    }

    /**
     * Phương pháp đề gan
     */
    phuongPhapDeGan(historicalData) {
        const deLastSeen = {};

        // Khởi tạo tất cả số đề từ 0-9
        for (let i = 0; i <= 9; i++) {
            deLastSeen[i] = -1;
        }

        // Tính ngày cuối cùng mỗi số đề xuất hiện
        historicalData.forEach((data, index) => {
            if (data.specialPrize?.[0]) {
                const de = parseInt(data.specialPrize[0]) % 10;
                if (deLastSeen[de] === -1) {
                    deLastSeen[de] = index;
                }
            }
        });

        // Tìm số đề gan nhất (chưa về lâu nhất)
        let maxGan = 0;
        let deGanNhat = null;

        for (const [de, lastSeen] of Object.entries(deLastSeen)) {
            if (lastSeen > maxGan) {
                maxGan = lastSeen;
                deGanNhat = parseInt(de);
            }
        }

        return deGanNhat;
    }

    /**
     * Phương pháp đề rơi - Chọn số CHƯA xuất hiện trong 5 ngày gần nhất
     */
    phuongPhapDeRoi(historicalData) {
        if (historicalData.length < 5) return [];

        // Lấy 5 ngày gần nhất để loại trừ
        const recentDays = historicalData.slice(0, 5);
        const excludedNumbers = new Set();

        // Thu thập tất cả số đề đã xuất hiện trong 5 ngày gần nhất
        recentDays.forEach(data => {
            if (data.specialPrize?.[0]) {
                const de = data.specialPrize[0].toString().slice(-2);
                excludedNumbers.add(de);
            }
        });

        // Tìm các số đề CHƯA xuất hiện trong 5 ngày gần nhất
        const availableNumbers = [];
        for (let i = 0; i < 100; i++) {
            const de = i.toString().padStart(2, '0');
            if (!excludedNumbers.has(de)) {
                availableNumbers.push(de);
            }
        }

        // Trả về top 3 số ngẫu nhiên từ các số chưa xuất hiện
        // Sử dụng seed cố định để đảm bảo kết quả nhất quán
        const seed = availableNumbers.join('').split('').reduce((a, b) => a + b.charCodeAt(0), 0);
        const shuffled = availableNumbers.sort((a, b) => {
            const seedA = (seed + a.charCodeAt(0)) % 100;
            const seedB = (seed + b.charCodeAt(0)) % 100;
            return seedA - seedB;
        });
        return shuffled.slice(0, 3);
    }

    /**
     * Tính dự đoán tổng hợp
     */
    tinhDuDoanTongHop(predictions) {
        if (predictions.length === 0) return '';

        const deCount = {};

        predictions.forEach(pred => {
            // Xử lý cả number (single) và numbers (array)
            const numbers = pred.numbers || (pred.number ? [pred.number] : []);

            numbers.forEach(de => {
                if (de !== null && de !== undefined && de !== '') {
                    deCount[de] = (deCount[de] || 0) + 1;
                }
            });
        });

        // Tìm số được dự đoán nhiều nhất
        let maxCount = 0;
        let mostPredictedDe = '';

        for (const [de, count] of Object.entries(deCount)) {
            if (count > maxCount) {
                maxCount = count;
                mostPredictedDe = de; // Giữ nguyên string
            }
        }

        console.log('🔍 Dự đoán tổng hợp:', { deCount, mostPredictedDe, maxCount });
        return mostPredictedDe;
    }


    /**
     * Thu thập tất cả 2 số cuối từ tất cả các giải
     */
    getAllLastTwoDigits(historicalData) {
        const allLastTwoDigits = [];

        historicalData.forEach(record => {
            if (!record) return;

            // Thu thập từ tất cả các giải
            const prizes = [
                ...(Array.isArray(record.specialPrize) ? record.specialPrize : []),
                ...(Array.isArray(record.firstPrize) ? record.firstPrize : []),
                ...(Array.isArray(record.secondPrize) ? record.secondPrize : []),
                ...(Array.isArray(record.threePrizes) ? record.threePrizes : []),
                ...(Array.isArray(record.fourPrizes) ? record.fourPrizes : []),
                ...(Array.isArray(record.fivePrizes) ? record.fivePrizes : []),
                ...(Array.isArray(record.sixPrizes) ? record.sixPrizes : []),
                ...(Array.isArray(record.sevenPrizes) ? record.sevenPrizes : [])
            ];

            prizes.forEach(prize => {
                if (prize && typeof prize === 'string' && /^\d+$/.test(prize)) {
                    allLastTwoDigits.push(prize.slice(-2));
                }
            });
        });

        return allLastTwoDigits;
    }

    /**
     * Phương pháp Pascal - Áp dụng cho đề (trả về top 3 số)
     */
    phuongPhapPascal(historicalData) {
        if (!historicalData[0]?.specialPrize?.[0] || !historicalData[0]?.firstPrize?.[0]) return [];

        const dacBiet = historicalData[0].specialPrize[0].toString();
        const giaiNhat = historicalData[0].firstPrize[0].toString();

        // Lấy 2 số cuối của giải đặc biệt và giải nhất
        const soCuoiDacBiet = dacBiet.slice(-2);
        const soCuoiGiaiNhat = giaiNhat.slice(-2);

        // Ghép và áp dụng logic Pascal
        const tong = parseInt(soCuoiDacBiet) + parseInt(soCuoiGiaiNhat);
        const soChinh = tong.toString().slice(-2);

        // Tạo thêm 2 số phụ từ các biến thể
        const soPhu1 = (parseInt(soCuoiDacBiet) + parseInt(soCuoiGiaiNhat.slice(-1))).toString().slice(-2);
        const soPhu2 = (parseInt(soCuoiDacBiet.slice(-1)) + parseInt(soCuoiGiaiNhat)).toString().slice(-2);

        // Trả về top 3 số (loại bỏ trùng lặp)
        const results = [soChinh, soPhu1, soPhu2].filter((value, index, self) =>
            self.indexOf(value) === index
        );

        return results.slice(0, 3);
    }

    /**
     * Phương pháp Hình Quả Trám - Áp dụng cho đề (trả về top 3 số)
     */
    phuongPhapHinhQuaTram(historicalData) {
        if (!historicalData[0]?.specialPrize?.[0]) return [];

        const dacBiet = historicalData[0].specialPrize[0].toString();
        const soChinh = dacBiet.slice(-2);

        // Tạo thêm 2 số phụ từ các biến thể của giải đặc biệt
        const soPhu1 = dacBiet.slice(-3, -1); // 2 số cuối thứ 2
        const soPhu2 = dacBiet.slice(-4, -2); // 2 số cuối thứ 3

        // Trả về top 3 số (loại bỏ trùng lặp và số không hợp lệ)
        const results = [soChinh, soPhu1, soPhu2].filter((value, index, self) =>
            self.indexOf(value) === index && value.length === 2 && /^\d{2}$/.test(value)
        );

        return results.slice(0, 3);
    }

    /**
     * Phương pháp Tần suất đề cặp - Loại trừ số đã ra trong 5 ngày gần nhất
     */
    phuongPhapTanSuatDeCap(historicalData) {
        if (historicalData.length < 5) return [];

        // Lấy số đã ra trong 5 ngày gần nhất để loại trừ
        const recentDays = historicalData.slice(0, 5);
        const excludedNumbers = new Set();

        recentDays.forEach(data => {
            if (data.specialPrize?.[0]) {
                const de = data.specialPrize[0].toString().slice(-2);
                excludedNumbers.add(de);
            }
        });

        // Lấy dữ liệu từ ngày thứ 6 trở về trước để tính tần suất
        const olderData = historicalData.slice(5);
        const allLastTwoDigits = this.getAllLastTwoDigits(olderData);
        const deFrequency = {};

        // Đếm tần suất các số đề (2 số cuối từ TẤT CẢ các giải)
        allLastTwoDigits.forEach(de => {
            deFrequency[de] = (deFrequency[de] || 0) + 1;
        });

        // Loại trừ số đã ra trong 5 ngày gần nhất
        const filteredFreq = Object.entries(deFrequency)
            .filter(([de]) => !excludedNumbers.has(de))
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([de]) => de);

        return filteredFreq;
    }

    /**
     * Phương pháp Đề gan kết hợp - Loại trừ số đã ra trong 5 ngày gần nhất
     */
    phuongPhapDeGanKetHop(historicalData) {
        if (historicalData.length < 5) return [];

        // Lấy số đã ra trong 5 ngày gần nhất để loại trừ
        const recentDays = historicalData.slice(0, 5);
        const excludedNumbers = new Set();

        recentDays.forEach(data => {
            if (data.specialPrize?.[0]) {
                const de = data.specialPrize[0].toString().slice(-2);
                excludedNumbers.add(de);
            }
        });

        // Lấy dữ liệu từ ngày thứ 6 trở về trước để tính tần suất
        const olderData = historicalData.slice(5);
        const allLastTwoDigits = this.getAllLastTwoDigits(olderData);
        const deFrequency = {};
        const deLastSeen = {};

        // Phân tích tần suất và thời gian xuất hiện cuối từ TẤT CẢ các giải
        olderData.forEach((record, index) => {
            if (!record) return;

            const prizes = [
                ...(Array.isArray(record.specialPrize) ? record.specialPrize : []),
                ...(Array.isArray(record.firstPrize) ? record.firstPrize : []),
                ...(Array.isArray(record.secondPrize) ? record.secondPrize : []),
                ...(Array.isArray(record.threePrizes) ? record.threePrizes : []),
                ...(Array.isArray(record.fourPrizes) ? record.fourPrizes : []),
                ...(Array.isArray(record.fivePrizes) ? record.fivePrizes : []),
                ...(Array.isArray(record.sixPrizes) ? record.sixPrizes : []),
                ...(Array.isArray(record.sevenPrizes) ? record.sevenPrizes : [])
            ];

            prizes.forEach(prize => {
                if (prize && typeof prize === 'string' && /^\d+$/.test(prize)) {
                    const de = prize.slice(-2);
                    deFrequency[de] = (deFrequency[de] || 0) + 1;
                    deLastSeen[de] = index;
                }
            });
        });

        // Sắp xếp theo score giảm dần và loại trừ số đã ra gần đây
        const sortedScores = Object.entries(deFrequency)
            .filter(([de]) => !excludedNumbers.has(de))
            .map(([de, freq]) => {
                const daysSinceLastSeen = deLastSeen[de];
                const score = freq * (daysSinceLastSeen + 1);
                return { de, score };
            }).sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(item => item.de);

        return sortedScores;
    }

    /**
     * Lấy dự đoán thực tế đã lưu từ database cho nhiều ngày
     * @param {Array} dates - Mảng các ngày cần lấy dự đoán
     * @returns {Object} Object với key là ngày và value là dự đoán
     */
    async getActualPredictionsForDates(dates) {
        try {
            const BachThuDeResult = require('../models/bachThuDeResult.model');
            const predictionsMap = {};

            // Lấy tất cả dự đoán trong một query để tối ưu
            const predictions = await BachThuDeResult.find({
                predictionDate: { $in: dates },
                dataDays: 14
            }).select('predictionDate predictions');

            // Tạo map để dễ tra cứu
            predictions.forEach(pred => {
                const dateKey = pred.predictionDate.toISOString().split('T')[0];
                predictionsMap[dateKey] = pred;
            });

            console.log(`📊 Fetched ${predictions.length} actual predictions from database`);
            return predictionsMap;
        } catch (error) {
            console.error('❌ Error fetching actual predictions:', error);
            return {};
        }
    }

    /**
     * Tạo lịch sử dự đoán bạch thủ đề từ dữ liệu thực tế đã lưu
     */
    async generateBachThuDeHistory(historicalData) {
        try {
            const history = [];
            const currentDate = new Date();
            const targetDays = 14;

            // Lấy dữ liệu từ 14 ngày trước để tạo lịch sử
            const sortedData = historicalData.sort((a, b) => new Date(a.drawDate) - new Date(b.drawDate));

            // Chuẩn bị danh sách ngày cần lấy dự đoán
            const predictionDates = [];
            for (let i = 0; i < Math.min(sortedData.length, targetDays); i++) {
                const currentData = sortedData[i];
                let nextData = sortedData[i + 1];

                if (!nextData && i < targetDays - 1) {
                    const nextDate = new Date(currentData.drawDate);
                    nextDate.setDate(nextDate.getDate() + 1);
                    if (nextDate <= currentDate) {
                        predictionDates.push(nextDate);
                    }
                } else if (nextData) {
                    predictionDates.push(new Date(nextData.drawDate));
                }
            }

            // Lấy tất cả dự đoán thực tế trong một lần
            const actualPredictionsMap = await this.getActualPredictionsForDates(predictionDates);

            console.log(`🔄 Generating history for ${targetDays} days using actual saved predictions`);

            for (let i = 0; i < Math.min(sortedData.length, targetDays); i++) {
                const currentData = sortedData[i];
                let nextData = sortedData[i + 1];

                // Nếu không có nextData (ngày tiếp theo), tạo dữ liệu giả cho ngày hiện tại
                if (!nextData && i < targetDays - 1) {
                    const nextDate = new Date(currentData.drawDate);
                    nextDate.setDate(nextDate.getDate() + 1);

                    // Chỉ tạo nếu ngày tiếp theo <= hôm nay
                    if (nextDate <= currentDate) {
                        nextData = {
                            drawDate: nextDate.toISOString().split('T')[0],
                            specialPrize: null, // Chưa có kết quả
                            firstPrize: null,
                            secondPrize: null,
                            threePrizes: null,
                            fourPrizes: null,
                            fivePrizes: null,
                            sixPrizes: null,
                            sevenPrizes: null
                        };
                    }
                }

                if (!currentData || !nextData) continue;

                const predictionDate = new Date(nextData.drawDate);
                const dateKey = predictionDate.toISOString().split('T')[0];

                // Lấy dự đoán thực tế từ map đã tạo
                const actualPrediction = actualPredictionsMap[dateKey];

                let predictions = [];
                let frameInfo = [];

                if (actualPrediction && actualPrediction.predictions) {
                    // Sử dụng dự đoán thực tế đã lưu
                    predictions = actualPrediction.predictions;
                    frameInfo = predictions.map(p => ({
                        method: p.method,
                        frame: p.frame || '3 ngày',
                        numbers: p.numbers || (p.number ? [p.number] : [])
                    }));
                    console.log(`✅ Using actual prediction for ${dateKey}`);
                } else {
                    // Fallback: Tính toán lại nếu không có dữ liệu thực tế
                    console.log(`⚠️ No actual prediction found for ${dateKey}, calculating...`);

                    // Tạo dữ liệu lịch sử riêng cho ngày này (từ ngày hiện tại trở về trước)
                    const currentDate = new Date(currentData.drawDate);
                    const historicalDataForThisDay = historicalData.filter(data => {
                        const dataDate = new Date(data.drawDate);
                        return dataDate <= currentDate;
                    });

                    // Phương pháp Pascal
                    const pascal = this.phuongPhapPascal([currentData]);
                    if (pascal && pascal.length > 0) {
                        predictions.push({
                            method: 'Pascal',
                            numbers: pascal,
                            frame: '3 ngày'
                        });
                    }

                    // Phương pháp Hình Quả Trám
                    const hinhQuaTram = this.phuongPhapHinhQuaTram([currentData]);
                    if (hinhQuaTram && hinhQuaTram.length > 0) {
                        predictions.push({
                            method: 'Hình Quả Trám',
                            numbers: hinhQuaTram,
                            frame: '3 ngày'
                        });
                    }

                    // Phương pháp Tần suất đề cặp
                    const tanSuatDeCap = this.phuongPhapTanSuatDeCap(historicalDataForThisDay);
                    if (tanSuatDeCap && tanSuatDeCap.length > 0) {
                        predictions.push({
                            method: 'Tần suất đề cặp',
                            numbers: tanSuatDeCap,
                            frame: '3 ngày'
                        });
                    }

                    // Phương pháp Đề gan kết hợp
                    const deGanKetHop = this.phuongPhapDeGanKetHop(historicalDataForThisDay);
                    if (deGanKetHop && deGanKetHop.length > 0) {
                        predictions.push({
                            method: 'Đề gan kết hợp',
                            numbers: deGanKetHop,
                            frame: '5 ngày'
                        });
                    }

                    // Phương pháp Đề rơi
                    const deRoi = this.phuongPhapDeRoi(historicalDataForThisDay);
                    if (deRoi && deRoi.length > 0) {
                        predictions.push({
                            method: 'Đề rơi',
                            numbers: deRoi,
                            frame: '2 ngày'
                        });
                    }

                    frameInfo = predictions.map(p => ({
                        method: p.method,
                        frame: p.frame || '3 ngày',
                        numbers: p.numbers || (p.number ? [p.number] : [])
                    }));
                }

                // Lấy kết quả thực tế (2 số cuối của giải đặc biệt)
                const actualNumbers = [];
                if (nextData.specialPrize && nextData.specialPrize[0]) {
                    const specialPrize = nextData.specialPrize[0].toString();
                    actualNumbers.push(specialPrize.slice(-2));
                }

                // Kiểm tra trúng/trượt theo khung
                const predictedNumbers = predictions.map(p => p.numbers || (p.number ? [p.number] : [])).flat();

                // Kiểm tra trúng trong khung nuôi (từ ngày dự đoán + frame ngày)
                let isHit = false;
                let hitDay = null;
                let hitMethod = null;
                let hitFrameInfo = null;
                let isWaiting = false; // Trạng thái đang chờ
                let hitNumber = null; // Số trúng
                let hitDate = null; // Ngày trúng

                // Kiểm tra xem có phải ngày dự đoán gần đây không (trong vòng 7 ngày)
                const today = new Date();
                const daysDiff = Math.floor((today - predictionDate) / (1000 * 60 * 60 * 24));

                // Tính toán các khung còn lại dựa trên số ngày đã trôi qua
                let remainingFrames = [];
                if (daysDiff >= 0 && daysDiff <= 7) {
                    frameInfo.forEach(frame => {
                        const frameDays = parseInt(frame.frame.replace(' ngày', '')) || 3;
                        if (daysDiff < frameDays) {
                            remainingFrames.push(frame.frame);
                        }
                    });

                    if (remainingFrames.length > 0) {
                        isWaiting = true;
                    }
                }

                // Kiểm tra từng phương pháp với frame riêng của nó
                for (const frame of frameInfo) {
                    const frameDays = parseInt(frame.frame.replace(' ngày', '')) || 3;
                    let methodHit = false;
                    let methodHitDay = null;
                    let methodHitNumber = null;
                    let methodHitDate = null;

                    // Kiểm tra trong khung của phương pháp này (từ ngày dự đoán)
                    console.log(`🔍 Checking method ${frame.method} with frame ${frame.frame} for numbers: ${frame.numbers.join(', ')}`);
                    for (let dayOffset = 0; dayOffset < frameDays; dayOffset++) {
                        const checkDate = new Date(predictionDate);
                        checkDate.setDate(checkDate.getDate() + dayOffset);

                        console.log(`  📅 Checking day ${dayOffset + 1}: ${checkDate.toLocaleDateString('vi-VN')}`);

                        // Tìm dữ liệu của ngày kiểm tra từ tất cả dữ liệu có sẵn
                        const checkData = historicalData.find(data => {
                            const dataDate = new Date(data.drawDate);
                            return dataDate.toDateString() === checkDate.toDateString();
                        });

                        if (checkData && checkData.specialPrize && checkData.specialPrize[0]) {
                            const actualDe = checkData.specialPrize[0].toString().slice(-2);
                            console.log(`    🎯 Actual DE: ${actualDe}, Checking against: ${frame.numbers.join(', ')}`);

                            if (frame.numbers.includes(actualDe)) {
                                methodHit = true;
                                methodHitDay = dayOffset + 1; // Ngày 1, 2, 3...
                                methodHitNumber = actualDe;
                                methodHitDate = checkDate.toLocaleDateString('vi-VN');
                                console.log(`    ✅ HIT! Day ${methodHitDay}, Number: ${methodHitNumber}, Date: ${methodHitDate}`);
                                break;
                            }
                        } else {
                            console.log(`    ❌ No data found for ${checkDate.toLocaleDateString('vi-VN')}`);
                        }
                    }

                    // Nếu phương pháp này trúng, lưu thông tin chi tiết
                    if (methodHit && !isHit) {
                        isHit = true;
                        hitDay = methodHitDay;
                        hitMethod = frame.method;
                        hitNumber = methodHitNumber;
                        hitDate = methodHitDate;
                        hitFrameInfo = {
                            frameDays: frameDays,
                            predictionDate: new Date(nextData.drawDate).toLocaleDateString('vi-VN'),
                            hitDate: methodHitDate
                        };
                        break; // Chỉ lấy phương pháp đầu tiên trúng
                    }
                }

                history.push({
                    date: new Date(nextData.drawDate).toLocaleDateString('vi-VN'),
                    predictions: predictions,
                    frameInfo: frameInfo,
                    actualNumbers: actualNumbers,
                    isHit: isHit,
                    hitDay: hitDay,
                    hitMethod: hitMethod,
                    hitFrameInfo: hitFrameInfo,
                    isWaiting: isWaiting,
                    remainingFrames: remainingFrames, // Thêm thông tin khung còn lại
                    hitNumber: hitNumber,
                    hitDate: hitDate
                });
            }

            console.log(`✅ Generated history with ${history.length} entries using actual predictions`);
            return history.reverse(); // Sắp xếp từ mới nhất đến cũ nhất

        } catch (error) {
            console.error('❌ Error generating bạch thủ đề history:', error);
            return [];
        }
    }
}

module.exports = BachThuDeService;
