#!/usr/bin/env node
// Build pipeline: Tailwind CSS + JS minify
// Usage: node build.js [--watch]
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const watch = process.argv.includes('--watch');

// actions.js هم کمینه می‌شود (اپ /js/dist/actions.min.js را اول از همه در <head> می‌گیرد؛ پنل ادمین همان /js/actions.js ساده را)
const JS_ENTRIES = ['actions','app','books','lectures','media','news','nowplaying','utils','offline','aichat'];

async function buildCss() {
    const watchFlag = watch ? '--watch' : '';
    const cmd = `npx tailwindcss -i ${path.join(ROOT,'src','tailwind.css')} -o ${path.join(PUB,'css','tailwind.dist.css')} --minify ${watchFlag}`;
    console.log('  → tailwind →', path.join('public','css','tailwind.dist.css'));
    execSync(cmd, { stdio: watch ? 'inherit' : 'pipe' });
}

async function buildJs() {
    const distDir = path.join(PUB, 'js', 'dist');
    if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
    const opts = {
        entryPoints: JS_ENTRIES.map(n => path.join(PUB,'js',`${n}.js`)),
        outdir: distDir,
        outExtension: { '.js': '.min.js' },
        minify: true,
        target: 'es2020',
        sourcemap: false,
        legalComments: 'none',
    };
    if (watch) {
        const ctx = await esbuild.context(opts);
        await ctx.watch();
        console.log('  → esbuild watching…');
    } else {
        await esbuild.build(opts);
        console.log('  → esbuild → public/js/dist/*.min.js');
    }
}

// شمارهٔ نسخهٔ فایل‌ها (?v=) از روی محتوای خود فایل ساخته می‌شود: هر فایلی که عوض شود
// نشانی‌اش هم عوض می‌شود و مرورگرها (با کش یک‌ساله) نسخهٔ تازه را می‌گیرند؛ فایل
// تغییرنکرده همان نشانی را نگه می‌دارد. دیگر نیازی به بالا بردن دستی عدد نیست.
function stampVersions() {
    const crypto = require('crypto');
    for (const page of ['index.html', 'admin.html']) {
        const file = path.join(PUB, page);
        if (!fs.existsSync(file)) continue;
        const html = fs.readFileSync(file, 'utf8');
        let n = 0;
        const out = html.replace(/((?:href|src)=")(\/[^"?#]+\.(?:css|js))\?v=[^"]*"/g, (m, pre, url) => {
            const f = path.join(PUB, url);
            if (!fs.existsSync(f)) return m;
            const v = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 8);
            n++;
            return `${pre}${url}?v=${v}"`;
        });
        if (out !== html) fs.writeFileSync(file, out);
        console.log(`  → نسخهٔ ${n} فایل در public/${page} ${out !== html ? 'به‌روز شد' : 'بدون تغییر'}`);
    }
}

(async () => {
    console.log('🛠  building…');
    if (watch) {
        // در watch mode، CSS رو background می‌بریم
        require('child_process').spawn('npx',
            ['tailwindcss','-i', path.join(ROOT,'src','tailwind.css'),'-o', path.join(PUB,'css','tailwind.dist.css'),'--minify','--watch'],
            { stdio: 'inherit' });
        await buildJs();
    } else {
        await buildCss();
        await buildJs();
        stampVersions();
        console.log('✅ build complete');
    }
})().catch(e => { console.error(e); process.exit(1); });
