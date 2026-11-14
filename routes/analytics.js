'use strict';
const express = require('express');
const { mainDb } = require('../lib/db');
const { adminAuth } = require('../lib/auth');
const { _getClientIp } = require('../lib/client-ip');
const { _HUMAN_SQL, _ITEM_TYPES, _TEHRAN_OFFSET_MS, _classifySource, _cleanStr, _countryOf, _isBotUa, _parseBrowser, _parseDevice, _parseOs, _slug, _tehranPeriodStarts, jalaali } = require('../lib/analytics');

// Admin analytics endpoint
// ستون‌های زمانی به UTC ذخیره می‌شوند؛ مرز «امروز/هفته/ماه/امسال» به وقت تهران و
// تقویم شمسی است. «بازدیدکننده» از visitor_sessions می‌آید (سابقهٔ کامل دارد)؛
// «بازدید» و «صفحه» از جدول‌های تازه، که از tracking_since به بعد پر شده‌اند.
const _dbAll = (sql, params = []) => new Promise(ok => mainDb.all(sql, params, (e, rows) => ok(e ? [] : rows || [])));
const _toJalali = (y, m, d) => { const j = jalaali.toJalaali(y, m, d); return `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`; };
const _utcToJalali = s => {
    const t = new Date(new Date(String(s).replace(' ', 'T') + 'Z').getTime() + _TEHRAN_OFFSET_MS);
    return _toJalali(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};

function mount(app) {
// Ping: ضربان هر ۲ دقیقه + شروع بازدید (start) + دیدن هر بخش یا محتوا (view)
app.post('/api/analytics/ping', express.json({limit:'2kb'}), (req, res) => {
    const b = req.body || {};
    const visitor_id = typeof b.visitor_id === 'string' ? b.visitor_id.slice(0, 64) : null;
    if (!visitor_id || visitor_id.length < 8) return res.status(400).json({error:'invalid'});
    const ua = (req.headers['user-agent'] || '').slice(0, 300);
    if (_isBotUa(ua)) return res.json({ok:1});
    const ip = _getClientIp(req).slice(0, 60);

    // نسخه‌های قدیمیِ کلاینت شناسهٔ بازدید نمی‌فرستند؛ برایشان هر روز یک بازدید حساب می‌شود
    const visit_id = (typeof b.visit_id === 'string' && b.visit_id.length >= 8)
        ? b.visit_id.slice(0, 64)
        : 'L' + visitor_id + ':' + _tehranPeriodStarts().day.slice(0, 10);

    const start = (b.start && typeof b.start === 'object') ? b.start : null;
    let src = { source: null, host: null };
    if (start) {
        const ownHost = String(req.headers.host || '').split(':')[0].toLowerCase();
        src = _classifySource(_cleanStr(start.ref, 500), _cleanStr(start.utm_source, 100), !!start.pwa, ownHost);
    }
    let view = null;
    if (b.view && typeof b.view === 'object' && _slug(b.view.screen)) {
        const type = _ITEM_TYPES.has(b.view.type) ? b.view.type : null;
        view = {
            screen: _slug(b.view.screen), type,
            id: type && b.view.id != null ? String(b.view.id).slice(0, 40) : null,
            title: type ? (_cleanStr(b.view.title, 200) || null) : null,
        };
    }

    const upsertVisitor = next => mainDb.run(
        'UPDATE visitor_sessions SET last_seen=CURRENT_TIMESTAMP, total_visits=total_visits+1 WHERE visitor_id=?',
        [visitor_id],
        function (err) {
            if (err || this.changes > 0) return next();
            mainDb.run(
                'INSERT OR IGNORE INTO visitor_sessions (visitor_id,ip,user_agent,device_type,country_code,os,browser) VALUES (?,?,?,?,?,?,?)',
                [visitor_id, ip, ua, _parseDevice(ua), _countryOf(ip), _parseOs(ua), _parseBrowser(ua)],
                () => next()
            );
        }
    );
    // «جدید» یعنی اولین بازدیدِ این بازدیدکننده (ثبت‌شده در ۳۰ دقیقهٔ اخیر)
    const upsertVisit = next => mainDb.run(
        `INSERT OR IGNORE INTO analytics_visits (visit_id, visitor_id, is_new)
         VALUES (?, ?, COALESCE((SELECT first_seen >= datetime('now','-30 minutes') FROM visitor_sessions WHERE visitor_id=?), 1))`,
        [visit_id, visitor_id, visitor_id],
        () => mainDb.run(
            `UPDATE analytics_visits SET last_seen=CURRENT_TIMESTAMP, pageviews=pageviews+?,
                source=COALESCE(source, ?), referrer_host=COALESCE(referrer_host, ?),
                utm_source=COALESCE(utm_source, ?), utm_medium=COALESCE(utm_medium, ?), utm_campaign=COALESCE(utm_campaign, ?),
                is_pwa=MAX(is_pwa, ?)
             WHERE visit_id=? AND visitor_id=?`,
            [view ? 1 : 0, src.source, src.host,
             start ? (_cleanStr(start.utm_source, 100) || null) : null,
             start ? (_cleanStr(start.utm_medium, 100) || null) : null,
             start ? (_cleanStr(start.utm_campaign, 100) || null) : null,
             start && start.pwa ? 1 : 0, visit_id, visitor_id],
            () => next()
        )
    );
    const insertView = next => {
        if (!view) return next();
        mainDb.run(
            'INSERT INTO analytics_pageviews (visit_id, visitor_id, screen, item_type, item_id, title) VALUES (?,?,?,?,?,?)',
            [visit_id, visitor_id, view.screen, view.type, view.id, view.title],
            () => next()
        );
    };
    upsertVisitor(() => upsertVisit(() => insertView(() => res.json({ok:1}))));
});
app.get('/api/admin/analytics', adminAuth, async (req, res) => {
    const p = _tehranPeriodStarts();
    const fmt = d => d.toISOString().slice(0, 19).replace('T', ' ');
    const d30 = fmt(new Date(Date.now() - 30 * 86400000));
    const RANGES = { today: p.day, week: p.week, month: p.month, year: p.year, '30d': d30, all: '1970-01-01 00:00:00' };
    const range = RANGES[req.query.range] ? req.query.range : 'month';
    const since = RANGES[range];
    const H = _HUMAN_SQL;
    const per = col => `SUM(${col}>=?) today, SUM(${col}>=?) week, SUM(${col}>=?) month, SUM(${col}>=?) year, COUNT(*) total`;
    const periodParams = [p.day, p.week, p.month, p.year];

    // روند ۳۰ روز اخیر؛ «روز» به وقت تهران
    const trendFrom = fmt(new Date(Date.parse(p.day.replace(' ', 'T') + 'Z') - 29 * 86400000));

    const [
        [vs], [vi], [pv], sources, otherHosts, campaigns, [eng], hours, weekdays,
        content, sections, countries, devices, oses, browsers, liveNow, trendVisits, trendViews, [first],
    ] = await Promise.all([
        _dbAll(`SELECT ${per('last_seen')}, SUM(first_seen>=?) new_today,
                SUM(last_seen > datetime('now','-5 minutes')) online FROM visitor_sessions WHERE ${H}`, [...periodParams, p.day]),
        _dbAll(`SELECT ${per('started_at')} FROM analytics_visits`, periodParams),
        _dbAll(`SELECT ${per('ts')} FROM analytics_pageviews`, periodParams),
        _dbAll(`SELECT COALESCE(source,'unknown') source, COUNT(*) visits FROM analytics_visits WHERE started_at>=? GROUP BY 1 ORDER BY 2 DESC`, [since]),
        _dbAll(`SELECT referrer_host host, COUNT(*) visits FROM analytics_visits WHERE started_at>=? AND source='other' AND referrer_host IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, [since]),
        _dbAll(`SELECT utm_source source, utm_campaign campaign, COUNT(*) visits FROM analytics_visits WHERE started_at>=? AND COALESCE(utm_campaign,'')<>'' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 10`, [since]),
        _dbAll(`SELECT COUNT(*) visits, AVG(pageviews) pages_per_visit,
                AVG((julianday(last_seen)-julianday(started_at))*86400) avg_duration,
                SUM(pageviews<=1) bounces, SUM(is_new) new_visits, SUM(is_pwa) pwa_visits
                FROM analytics_visits WHERE started_at>=?`, [since]),
        _dbAll(`SELECT CAST(strftime('%H', started_at, '+210 minutes') AS INTEGER) h, COUNT(*) c FROM analytics_visits WHERE started_at>=? GROUP BY h`, [since]),
        _dbAll(`SELECT CAST(strftime('%w', started_at, '+210 minutes') AS INTEGER) w, COUNT(*) c FROM analytics_visits WHERE started_at>=? GROUP BY w`, [since]),
        _dbAll(`SELECT item_type type, item_id id, MAX(title) title, COUNT(*) views, COUNT(DISTINCT visitor_id) visitors
                FROM analytics_pageviews WHERE ts>=? AND item_type IS NOT NULL GROUP BY item_type, item_id ORDER BY views DESC LIMIT 15`, [since]),
        _dbAll(`SELECT screen, COUNT(*) views FROM analytics_pageviews WHERE ts>=? AND screen IS NOT NULL GROUP BY screen ORDER BY views DESC LIMIT 12`, [since]),
        _dbAll(`SELECT COALESCE(country_code,'XX') code, COUNT(*) visitors FROM visitor_sessions WHERE ${H} AND last_seen>=? GROUP BY 1 ORDER BY 2 DESC LIMIT 15`, [since]),
        _dbAll(`SELECT COALESCE(device_type,'unknown') name, COUNT(*) visitors FROM visitor_sessions WHERE ${H} AND last_seen>=? GROUP BY 1 ORDER BY 2 DESC`, [since]),
        _dbAll(`SELECT COALESCE(os,'other') name, COUNT(*) visitors FROM visitor_sessions WHERE ${H} AND last_seen>=? GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [since]),
        _dbAll(`SELECT COALESCE(browser,'other') name, COUNT(*) visitors FROM visitor_sessions WHERE ${H} AND last_seen>=? GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [since]),
        // آخرین چیزی که هر کاربرِ آنلاین دیده
        _dbAll(`SELECT pv.screen, pv.item_type type, pv.item_id id, pv.title, COUNT(*) visitors
                FROM analytics_pageviews pv
                JOIN (SELECT visitor_id, MAX(id) mid FROM analytics_pageviews WHERE ts > datetime('now','-5 minutes') GROUP BY visitor_id) l ON pv.id = l.mid
                GROUP BY pv.screen, pv.item_type, pv.item_id ORDER BY visitors DESC LIMIT 8`),
        _dbAll(`SELECT date(started_at,'+210 minutes') d, COUNT(*) visits, COUNT(DISTINCT visitor_id) visitors
                FROM analytics_visits WHERE started_at>=? GROUP BY d`, [trendFrom]),
        _dbAll(`SELECT date(ts,'+210 minutes') d, COUNT(*) pageviews FROM analytics_pageviews WHERE ts>=? GROUP BY d`, [trendFrom]),
        _dbAll(`SELECT MIN(started_at) m FROM analytics_visits`),
    ]);

    const card = k => ({ visitors: (vs && vs[k]) || 0, visits: (vi && vi[k]) || 0, pageviews: (pv && pv[k]) || 0 });
    const byDay = new Map(trendVisits.map(r => [r.d, r]));
    const viewsByDay = new Map(trendViews.map(r => [r.d, r.pageviews]));
    const trend = [];
    const dayStartMs = Date.parse(p.day.replace(' ', 'T') + 'Z') + _TEHRAN_OFFSET_MS;  // نیمه‌شب امروزِ تهران به‌صورت ساعت دیواری
    for (let i = 29; i >= 0; i--) {
        const t = new Date(dayStartMs - i * 86400000);
        const key = t.toISOString().slice(0, 10);
        const r = byDay.get(key) || {};
        trend.push({
            date: _toJalali(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()),
            weekday: (t.getUTCDay() + 1) % 7,   // ۰ = شنبه
            visitors: r.visitors || 0, visits: r.visits || 0, pageviews: viewsByDay.get(key) || 0,
        });
    }
    const hourArr = Array(24).fill(0); hours.forEach(r => { if (r.h >= 0 && r.h < 24) hourArr[r.h] = r.c; });
    const weekArr = Array(7).fill(0);  weekdays.forEach(r => { weekArr[(r.w + 1) % 7] = r.c; });   // ۰ = شنبه

    res.json({
        online: (vs && vs.online) || 0,
        new_today: (vs && vs.new_today) || 0,
        cards: { today: card('today'), week: card('week'), month: card('month'), year: card('year'), total: card('total') },
        tracking_since: first && first.m ? _utcToJalali(first.m) : null,
        range,
        sources, other_hosts: otherHosts, campaigns,
        engagement: {
            visits: (eng && eng.visits) || 0,
            pages_per_visit: eng && eng.pages_per_visit ? Math.round(eng.pages_per_visit * 10) / 10 : 0,
            avg_duration: eng && eng.avg_duration ? Math.round(eng.avg_duration) : 0,
            bounces: (eng && eng.bounces) || 0,
            new_visits: (eng && eng.new_visits) || 0,
            pwa_visits: (eng && eng.pwa_visits) || 0,
        },
        hours: hourArr, weekdays: weekArr,
        content, sections, countries, devices, oses, browsers,
        live: liveNow, trend,
    });
});
}

module.exports = mount;
