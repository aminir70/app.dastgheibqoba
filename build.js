#!/usr/bin/env node
// Build pipeline: Tailwind CSS + JS minify
// Usage: node build.js [--watch]
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const watch = process.argv.includes('--watch');

const JS_ENTRIES = ['app','books','lectures','media','news','utils','offline'];

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

// نسخه‌گذاری خودکار: هش محتوای فایل‌های build شده را در ?v= (index/admin) و
// نام کش‌های sw.js می‌گذارد تا هر تغییری بلافاصله برای کاربران اعمال شود.
function stampVersion() {
    const hashFiles = [
        ...JS_ENTRIES.map(n => path.join(PUB, 'js', 'dist', `${n}.min.js`)),
        path.join(PUB, 'css', 'tailwind.dist.css'),
        path.join(PUB, 'css', 'app.css'),
    ];
    const h = crypto.createHash('sha1');
    hashFiles.forEach(f => { try { h.update(fs.readFileSync(f)); } catch(e) {} });
    const ver = h.digest('hex').slice(0, 10);

    ['index.html', 'admin.html'].forEach(name => {
        const fp = path.join(PUB, name);
        try {
            let html = fs.readFileSync(fp, 'utf8');
            const next = html.replace(/\?v=[A-Za-z0-9]+/g, '?v=' + ver);
            if (next !== html) fs.writeFileSync(fp, next);
        } catch(e) {}
    });
    try {
        const swp = path.join(PUB, 'sw.js');
        let sw = fs.readFileSync(swp, 'utf8');
        const next = sw.replace(/(nashr-(?:asar|static|dynamic))-v[A-Za-z0-9]+/g, '$1-v' + ver);
        if (next !== sw) fs.writeFileSync(swp, next);
    } catch(e) {}
    console.log('  → version stamped:', ver);
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
        stampVersion();
        console.log('✅ build complete');
    }
})().catch(e => { console.error(e); process.exit(1); });
