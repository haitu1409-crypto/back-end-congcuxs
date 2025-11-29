function normalizeDateInput(input) {
    if (!input) return null;
    const parts = input.split(/[-/]/);

    if (parts.length === 2) {
        const [day, month] = parts;
        const currentYear = new Date().getFullYear();
        return `${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    if (parts.length === 3) {
        const [part1, part2, part3] = parts;
        if (part1.length === 4) {
            return `${part1}-${part2.padStart(2, '0')}-${part3.padStart(2, '0')}`;
        }
        return `${part3}-${part2.padStart(2, '0')}-${part1.padStart(2, '0')}`;
    }

    return null;
}

/**
 * Parse khoảng ngày như "29/11-30/11" hoặc "29-11-30-11"
 * Trả về mảng 2 ngày [date1, date2] hoặc null nếu không parse được
 */
function parseDateRange(input) {
    if (!input) return null;

    // Tách bằng dấu - (như 29/11-30/11)
    const parts = input.split('-').map(p => p.trim()).filter(Boolean);
    
    if (parts.length === 2) {
        const date1 = normalizeDateInput(parts[0]);
        const date2 = normalizeDateInput(parts[1]);
        
        if (date1 && date2) {
            // Kiểm tra ngày 2 phải sau ngày 1 (liên tiếp)
            const date1Obj = new Date(`${date1}T00:00:00.000Z`);
            const date2Obj = new Date(`${date2}T00:00:00.000Z`);
            const diffDays = Math.floor((date2Obj - date1Obj) / (1000 * 60 * 60 * 24));
            
            // Chỉ chấp nhận nếu 2 ngày liên tiếp (diffDays = 1)
            if (diffDays === 1) {
                return [date1, date2];
            }
        }
    }

    return null;
}

function formatDateForDisplay(normalizedDate) {
    if (!normalizedDate) return '';
    const [year, month, day] = normalizedDate.split('-');
    return `${day}/${month}/${year}`;
}

module.exports = {
    normalizeDateInput,
    formatDateForDisplay,
    parseDateRange
};



