'use strict';
const { mainDb } = require('../lib/db');

function mountHealth(app) {
const _APP_VERSION = (() => { try { return require('../package.json').version; } catch(e) { return 'unknown'; } })();
const _STARTED_AT = new Date().toISOString();
app.get('/api/version', (req, res) => res.json({ v: _APP_VERSION, started: _STARTED_AT }));
app.get('/api/health', (req, res) => {
    mainDb.get('SELECT 1 AS ok', [], (err) => {
        if (err) return res.status(500).json({ ok: false });
        res.json({ ok: true, uptime: Math.floor(process.uptime()) });
    });
});
}

module.exports = { mountHealth };
