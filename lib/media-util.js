'use strict';
const { _dbAllP, _dbGetP, _dbRunP } = require('./db');
const { unlinkPublicFile } = require('./uploads');

// --- حذف درخته‌ای دسته‌ها (گالری/صوت/ویدیو) ---
// فایل‌های محلی که هنوز ردیفی به آن‌ها اشاره می‌کند (مثلاً کاور دسته = کاور یک قطعه) پاک نمی‌شوند.
const _MEDIA_FILE_REFS = [['audio_tracks','audio_url'],['audio_tracks','cover'],['audio_categories','cover'],['video_categories','cover'],['video_items','thumbnail'],['gallery_categories','cover'],['gallery_photos','image']];
async function _unlinkMediaIfOrphan(rel, prefix) {
    if (!rel || typeof rel !== 'string' || !rel.startsWith(prefix)) return;   // فقط آپلودهای محلی همان پوشه
    for (const [t, c] of _MEDIA_FILE_REFS) if (await _dbGetP(`SELECT 1 AS x FROM ${t} WHERE ${c}=? LIMIT 1`, [rel])) return;
    unlinkPublicFile(rel);
}
// دستهٔ id و همهٔ زیردسته‌ها (هر عمق)، آیتم‌ها و فایل‌های فقط-متعلق‌به‌آن‌ها را حذف می‌کند.
// ترتیب: نام فایل‌ها خوانده می‌شود، سپس آیتم‌ها، سپس دسته‌ها، و در آخر فایل‌ها.
async function _deleteCategoryTree(catTable, itemTable, itemFileCols, id) {
    const ids = (await _dbAllP(`WITH RECURSIVE t(id) AS (SELECT id FROM ${catTable} WHERE id=? UNION SELECT c.id FROM ${catTable} c JOIN t ON c.parent_id=t.id) SELECT id FROM t`, [id])).map(r => r.id);
    if (!ids.length) return;
    const ph = ids.map(() => '?').join(',');
    const files = new Map();   // rel → prefix
    for (const [col, prefix] of itemFileCols) (await _dbAllP(`SELECT ${col} AS f FROM ${itemTable} WHERE category_id IN (${ph})`, ids)).forEach(r => r.f && files.set(r.f, prefix));
    (await _dbAllP(`SELECT cover AS f FROM ${catTable} WHERE id IN (${ph})`, ids)).forEach(r => r.f && files.set(r.f, '/gallery/'));
    await _dbRunP(`DELETE FROM ${itemTable} WHERE category_id IN (${ph})`, ids);
    await _dbRunP(`DELETE FROM ${catTable} WHERE id IN (${ph})`, ids);
    for (const [rel, prefix] of files) await _unlinkMediaIfOrphan(rel, prefix);
}
// === APARAT URL PARSER ===
function parseAparatEmbed(raw) {
    if(!raw || !raw.trim()) return null;
    raw = raw.trim();
    // Extract src from iframe HTML
    if(raw.includes('<iframe')) {
        const m = raw.match(/src\s*=\s*["']([^"']+)["']/i);
        if(m && m[1]) raw = m[1];
        else return null;
    }
    // Already an embed/player URL → use as-is
    if(/aparat\.com\/(video\/video\/embed|vplayer\.php|embed)/.test(raw) || /player\.aparat\.com\/embed/.test(raw)) {
        return raw;
    }
    // Direct video page: https://www.aparat.com/v/HASH or https://aparat.com/v/HASH
    const directMatch = raw.match(/aparat\.com\/v\/([a-zA-Z0-9]+)/i);
    if(directMatch) {
        return `https://www.aparat.com/video/video/embed/videohash/${directMatch[1]}/vt/frame`;
    }
    // videohash already in URL
    const hashMatch = raw.match(/videohash\/([a-zA-Z0-9]+)/i);
    if(hashMatch) return raw;
    // Fallback: if it's a valid URL, try using it directly
    if(/^https?:\/\//.test(raw)) return raw;
    return null;
}
// همه‌ی خروجی‌های parseAparatEmbed مستقیم داخل <iframe src> می‌نشینند، پس نتیجه
// باید حتماً یک URL با پروتکل http(s) باشد. بعضی شاخه‌ها raw را دست‌نخورده
// برمی‌گرداندند و مقداری مثل «javascript:…//aparat.com/embed» رد می‌شد.
function parseEmbedUrl(raw) {
    const out = parseAparatEmbed(raw);
    if (!out || !/^https?:\/\//i.test(out)) return null;
    return out.slice(0, 500);
}

function extractAparatThumb(embedUrl) {
    if(!embedUrl) return '';
    const m = embedUrl.match(/videohash\/([a-zA-Z0-9]+)/i) || embedUrl.match(/embed\/([a-zA-Z0-9]+)/i);
    if(m) return `https://static.cdn.asset.aparat.com/avt/${m[1]}_16.jpg`;
    return '';
}

module.exports = { _unlinkMediaIfOrphan, _deleteCategoryTree, parseAparatEmbed, parseEmbedUrl, extractAparatThumb };
