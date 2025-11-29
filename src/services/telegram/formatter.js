function formatResultSimple(doc) {
    if (!doc) return 'Không có dữ liệu.';

    let dateStr = 'Kết Quả Xổ Số';
    if (doc.drawDate) {
        const date = new Date(doc.drawDate);
        const dateFormatted = date.toLocaleDateString('vi-VN');
        dateStr = `Kết Quả Xổ Số ${dateFormatted}`;
    }

    const formatNumbers = (arr) => {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return arr.filter(Boolean);
    };

    const formatPrize = (label, numbers, emoji = '') => {
        if (!numbers || numbers.length === 0) return null;

        const numbersStr = numbers.map(n => `<b>${String(n).trim()}</b>`).join('   ');
        const title = emoji ? `${emoji} <b>${label}:</b>` : `<b>${label}:</b>`;

        if (numbers.length === 6) {
            const line1 = numbers.slice(0, 3).map(n => `<b>${String(n).trim()}</b>`).join('   ');
            const line2 = numbers.slice(3, 6).map(n => `<b>${String(n).trim()}</b>`).join('   ');
            return `${title}\n${line1}\n${line2}`;
        }

        return `${title}\n${numbersStr}`;
    };

    const specialPrize = formatNumbers(doc.specialPrize) || (doc.maDB ? [doc.maDB] : null);
    const firstPrize = formatNumbers(doc.firstPrize);
    const secondPrize = formatNumbers(doc.secondPrize);
    const threePrizes = formatNumbers(doc.threePrizes);
    const fourPrizes = formatNumbers(doc.fourPrizes);
    const fivePrizes = formatNumbers(doc.fivePrizes);
    const sixPrizes = formatNumbers(doc.sixPrizes);
    const sevenPrizes = formatNumbers(doc.sevenPrizes);

    const resultLines = [`<b>🎯 ${dateStr}</b>`];

    const appendPrize = (label, list, emoji) => {
        const formatted = formatPrize(label, list, emoji);
        if (formatted) resultLines.push(formatted);
    };

    appendPrize('Giải Đặc Biệt', specialPrize, '🥇');
    appendPrize('Giải 1', firstPrize, '🥈');
    appendPrize('Giải 2', secondPrize, '🥉');
    appendPrize('Giải 3', threePrizes, '4️⃣');
    appendPrize('Giải 4', fourPrizes, '5️⃣');
    appendPrize('Giải 5', fivePrizes, '6️⃣');
    appendPrize('Giải 6', sixPrizes, '7️⃣');
    appendPrize('Giải 7', sevenPrizes, '8️⃣');

    return resultLines.filter(Boolean).join('\n\n');
}

function formatResult(doc) {
    if (!doc) return 'Không có dữ liệu.';

    let dateStr = 'Kết Quả Xổ Số';
    if (doc.drawDate) {
        const date = new Date(doc.drawDate);
        const dateFormatted = date.toLocaleDateString('vi-VN');
        dateStr = `Kết Quả Xổ Số ${dateFormatted}`;
    }

    const formatNumbers = (arr) => {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return arr.filter(Boolean);
    };

    const headerText = `🎯 ${dateStr}`;
    const referenceWidth = headerText.length;

    const formatNumberDisplay = (num) => {
        const numStr = String(num).trim();
        return `<b>${numStr}</b>`;
    };

    const getTextLength = (html) => {
        return html.replace(/<[^>]*>/g, '').length;
    };

    const createPadding = (count) => {
        if (count <= 0) return '';
        return '\u2002'.repeat(count);
    };

    const centerPrizeTitle = (text, emoji = '') => {
        const rawText = emoji ? `${emoji} ${text}:` : `${text}:`;
        const textLength = rawText.length;
        const padding = Math.max(0, Math.floor((referenceWidth - textLength) / 2));
        const paddingStr = createPadding(padding);

        const htmlText = emoji ? `${emoji} <b>${text}:</b>` : `<b>${text}:</b>`;
        return paddingStr + htmlText;
    };

    const centerNumbersLine = (numbersHtml) => {
        const plainText = numbersHtml.replace(/<[^>]*>/g, '');
        const textLength = plainText.length;
        const padding = Math.max(0, Math.floor((referenceWidth - textLength) / 2));
        const paddingStr = createPadding(padding);
        return paddingStr + numbersHtml;
    };

    const formatPrizeRow = (label, numbers, emoji = '') => {
        if (!numbers || numbers.length === 0) {
            return null;
        }

        const numbersHtml = numbers.map(n => formatNumberDisplay(n)).join('    ');
        const centeredTitle = centerPrizeTitle(label, emoji);
        const centeredNumbers = centerNumbersLine(numbersHtml);
        const lines = [centeredTitle, centeredNumbers].map(line => line.trimEnd());
        return lines.join('\n');
    };

    const formatMultiLinePrize = (label, numbers, emoji = '') => {
        if (!numbers || numbers.length === 0) {
            return null;
        }

        if (numbers.length === 6) {
            const line1 = numbers.slice(0, 3).map(n => formatNumberDisplay(n)).join('    ');
            const line2 = numbers.slice(3, 6).map(n => formatNumberDisplay(n)).join('    ');
            const centeredTitle = centerPrizeTitle(label, emoji);
            const centeredLine1 = centerNumbersLine(line1);
            const centeredLine2 = centerNumbersLine(line2);
            const lines = [centeredTitle, centeredLine1, centeredLine2].map(line => line.trimEnd());
            return lines.join('\n');
        }

        return formatPrizeRow(label, numbers, emoji);
    };

    const specialPrize = formatNumbers(doc.specialPrize) || (doc.maDB ? [doc.maDB] : null);
    const firstPrize = formatNumbers(doc.firstPrize);
    const secondPrize = formatNumbers(doc.secondPrize);
    const threePrizes = formatNumbers(doc.threePrizes);
    const fourPrizes = formatNumbers(doc.fourPrizes);
    const fivePrizes = formatNumbers(doc.fivePrizes);
    const sixPrizes = formatNumbers(doc.sixPrizes);
    const sevenPrizes = formatNumbers(doc.sevenPrizes);

    const centerHeaderText = (text) => {
        const textLength = text.length;
        const padding = Math.max(0, Math.floor((referenceWidth - textLength) / 2));
        const paddingStr = createPadding(padding);
        return paddingStr + `<b>${text}</b>`;
    };

    const createSeparatorLine = () => {
        const separatorLength = Math.floor(referenceWidth * 0.7);
        const separator = '─'.repeat(separatorLength);
        const padding = Math.max(0, Math.floor((referenceWidth - separatorLength) / 2));
        const paddingStr = createPadding(padding);
        return paddingStr + separator;
    };

    const resultLines = [
        centerHeaderText(headerText)
    ];

    const formattedPrizes = [];

    const pushIfFormatted = (fnResult) => {
        if (fnResult) formattedPrizes.push(fnResult);
    };

    pushIfFormatted(formatPrizeRow('Giải Đặc Biệt', specialPrize, '🥇'));
    pushIfFormatted(formatPrizeRow('Giải 1', firstPrize, '🥈'));
    pushIfFormatted(formatPrizeRow('Giải 2', secondPrize, '🥉'));
    pushIfFormatted(formatMultiLinePrize('Giải 3', threePrizes, '4️⃣'));
    pushIfFormatted(formatPrizeRow('Giải 4', fourPrizes, '5️⃣'));
    pushIfFormatted(formatMultiLinePrize('Giải 5', fivePrizes, '6️⃣'));
    pushIfFormatted(formatPrizeRow('Giải 6', sixPrizes, '7️⃣'));
    pushIfFormatted(formatPrizeRow('Giải 7', sevenPrizes, '8️⃣'));

    formattedPrizes.forEach((formatted, index) => {
        const trimmedFormatted = formatted.trim();
        resultLines.push(trimmedFormatted);
        if (index < formattedPrizes.length - 1) {
            resultLines.push(createSeparatorLine());
        }
    });

    return resultLines.join('\n');
}

module.exports = {
    formatResult,
    formatResultSimple
};



