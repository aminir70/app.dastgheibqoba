'use strict';
// پیکربندی مشترک که باید هنگام بارگذاری اجرا شود (ریشهٔ پروژه، رمز ادمین).
// dotenv پیش از این فایل در server.js بارگذاری می‌شود.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
// رمز ادمین — الزامی است؛ اگر تنظیم نشده، random fallback تولید می‌شود تا app اجرا بشه
// ولی هشدار جدی نمایش داده می‌شود تا deployer متوجه شود
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
    ADMIN_PASSWORD = crypto.randomBytes(24).toString('hex');
    console.error('========================================================');
    console.error('⚠️  ADMIN_PASSWORD env var is not set or is too short.');
    // رمز تصادفی فقط در فایل با دسترسی 0600 نوشته می‌شود، نه در لاگ
    const _genPwFile = path.join(ROOT, '.admin-password.generated');
    try { fs.writeFileSync(_genPwFile, ADMIN_PASSWORD + '\n', { mode: 0o600 }); fs.chmodSync(_genPwFile, 0o600); } catch(e) {}
    console.error('   A random password was generated for this session and written to:');
    console.error('   ' + _genPwFile);
    console.error('   Set ADMIN_PASSWORD in .env to make it persistent.');
    console.error('========================================================');
} else {
    console.log('🔑 ADMIN_PASSWORD loaded from env');
}

module.exports = { ROOT, ADMIN_PASSWORD };
