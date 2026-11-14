'use strict';
const path = require('path');
const fs = require('fs');
const { mainDb } = require('./db');
const ROOT = path.resolve(__dirname, '..');

// Digital Asset Links — قبل از هر middleware تا هیچ‌چیزی بلاکش نکنه.
// مقدار از تنظیمات (پنل ادمین) خوانده می‌شود و اگر نبود از فایل public/.well-known.
// (فایل داخل git است و git reset آن را برمی‌گرداند؛ تنظیمات دیتابیس از آن در امان است.)
function _readAssetLinks(cb) {
    const fromDisk = () => {
        try { return cb(fs.readFileSync(path.join(ROOT, 'public', '.well-known', 'assetlinks.json'), 'utf8'), 'file'); }
        catch(e) { return cb('[]', 'empty'); }
    };
    if (!mainDb) return fromDisk();
    mainDb.get(`SELECT value FROM settings WHERE key='assetlinks'`, [], (err, row) => {
        if (row && row.value && row.value.trim()) return cb(row.value, 'db');
        fromDisk();
    });
}
// اعتبارسنجی سخت‌گیرانه: یک غلط تایپی در اثر انگشت یا نام پکیج باعث می‌شود اپ اندروید
// بی‌صدا با نوار آدرس کروم باز شود. خروجی: { error } یا { value } (نسخهٔ مرتب‌شده).
function _validateAssetLinks(text) {
    let arr;
    try { arr = JSON.parse(text); } catch(e) { return { error: 'JSON نامعتبر است' }; }
    if (!Array.isArray(arr) || !arr.length) return { error: 'فایل باید یک آرایه با حداقل یک مورد باشد (با [ شروع می‌شود)' };
    const PKG = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
    const FP = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
    const out = [];
    for (let i = 0; i < arr.length; i++) {
        const it = arr[i], n = `مورد ${i + 1}: `;
        if (!it || typeof it !== 'object') return { error: n + 'باید یک شیء باشد' };
        const t = it.target;
        const ns = t && t.namespace;
        // android_app: تأیید گوگل/کروم برای اپ. فروشگاه‌های ایرانی ردیف جداگانهٔ خودشان را
        // می‌خواهند (مثلاً cafebazaar_twa با relation دلخواه خودشان، مثل check_validation).
        if (ns !== 'android_app' && !(typeof ns === 'string' && /^[a-z][a-z0-9]*(_[a-z0-9]+)*_twa$/.test(ns)))
            return { error: n + 'target.namespace باید android_app یا namespace فروشگاه (مثل cafebazaar_twa) باشد' };
        if (ns === 'android_app') {
            if (!Array.isArray(it.relation) || !it.relation.includes('delegate_permission/common.handle_all_urls'))
                return { error: n + 'relation باید شامل delegate_permission/common.handle_all_urls باشد' };
        } else if (!Array.isArray(it.relation) || !it.relation.length || it.relation.some(r => typeof r !== 'string' || !r.trim())) {
            return { error: n + 'relation باید آرایهٔ غیرخالی از متن باشد (مثلاً ["check_validation"])' };
        }
        if (typeof t.package_name !== 'string' || !PKG.test(t.package_name)) return { error: n + 'package_name نامعتبر است (مثل info.dastgheibqoba.app.twa)' };
        if (!Array.isArray(t.sha256_cert_fingerprints) || !t.sha256_cert_fingerprints.length) return { error: n + 'sha256_cert_fingerprints خالی است' };
        const fps = [];
        for (const f of t.sha256_cert_fingerprints) {
            const up = typeof f === 'string' ? f.trim().toUpperCase() : '';
            if (!FP.test(up)) return { error: n + `اثر انگشت نامعتبر است: «${String(f).slice(0, 40)}» (باید ۳۲ جفت رقم هگز با «:» باشد)` };
            fps.push(up);
        }
        out.push({ relation: it.relation, target: { namespace: ns, package_name: t.package_name, sha256_cert_fingerprints: [...new Set(fps)] } });
    }
    return { value: JSON.stringify(out, null, 2) };
}
// === API SETTINGS (PUBLIC) ===
// کلیدهای داخلی با _ شروع می‌شوند (_jwt_secret، _vapid_private، …) و هرگز
// نباید از API بیرون بروند. این endpoint عمومی است و قبلاً کل جدول settings
// را برمی‌گرداند — یعنی روی نصبی که JWT_SECRET در env نداشت، کلید امضای
// توکن‌ها برای همه قابل خواندن بود.
const INTERNAL_SETTING = k => String(k || '').startsWith('_');

module.exports = { INTERNAL_SETTING, _readAssetLinks, _validateAssetLinks };
