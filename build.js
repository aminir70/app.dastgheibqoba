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
        console.log('✅ build complete');
    }
})().catch(e => { console.error(e); process.exit(1); });
