'use strict';


// نرمال‌سازی فارسی/عربی: ی/ك/ة و حذف اعراب
function _normFa(s) {
    return (s == null ? '' : s.toString()).toLowerCase()
        .replace(/[يى]/g, 'ی')              // ي ى → ی
        .replace(/ك/g, 'ک')                       // ك → ک
        .replace(/ة/g, 'ه')                       // ة → ه
        .replace(/[أإآٱ]/g, 'ا')   // أ إ آ ٱ → ا
        .replace(/[ً-ْٰ]/g, '')              // حذف اعراب
        .replace(/‌/g, ' ')                            // نیم‌فاصله → فاصله
        .replace(/\s+/g, ' ')
        .trim();
}
// عبارت SQL برای نرمال‌سازی همان دو حرف رایج (ی و ک) روی ستون
function _sqlNorm(col) {
    return `REPLACE(REPLACE(REPLACE(LOWER(${col}),'ي','ی'),'ى','ی'),'ك','ک')`;
}
// نرمال‌سازی query هماهنگ با _sqlNorm (فقط ي/ى/ك) تا LIKE متقارن باشد
function _sqlNormQ(s) {
    return (s == null ? '' : s.toString()).toLowerCase()
        .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').trim();
}

module.exports = { _normFa, _sqlNorm, _sqlNormQ };
