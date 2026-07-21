function normalizeDate(value = '') {
    const cleaned = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
        return cleaned;
    }

    const match = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

    if (!match) {
        throw new Error(
            `Formato de fecha inválido: ${value}. Usa YYYY-MM-DD o DD/MM/YYYY`
        );
    }

    const [, day, month, year] = match;

    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

module.exports = {
    normalizeDate
};