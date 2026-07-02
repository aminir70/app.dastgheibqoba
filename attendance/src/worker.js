// اپ حضور و غیاب — Cloudflare Worker + D1
// API تحت /api/* ؛ فایل‌های استاتیک از پوشه public سرو می‌شوند.

const TOKEN_TTL = 60 * 60 * 24 * 30; // ۳۰ روز

/* ---------- ابزارهای پاسخ ---------- */
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
const err = (message, status = 400) => json({ error: message }, status);

/* ---------- رمزنگاری (Web Crypto) ---------- */
const te = new TextEncoder();

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', te.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signToken(payload, secret) {
  const body = b64url(te.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), te.encode(body));
  return `${body}.${b64url(sig)}`;
}

async function verifyToken(token, secret) {
  const [body, sig] = (token || '').split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret),
    b64urlDecode(sig), te.encode(body));
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

async function hashPassword(password, saltHex) {
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  return { hash: hex(bits), salt: hex(salt) };
}

/* ---------- کمکی‌های تاریخ (هفته شمسی: شنبه تا جمعه) ---------- */
function weekRange(isoDate) {
  const d = new Date(isoDate + 'T12:00:00Z');
  const satOffset = (d.getUTCDay() + 1) % 7; // شنبه=0 ... جمعه=6
  const start = new Date(d); start.setUTCDate(d.getUTCDate() - satOffset);
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
  const iso = x => x.toISOString().slice(0, 10);
  return [iso(start), iso(end)];
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUS = ['present', 'absent', 'late', 'excused'];

/* ---------- احراز هویت ---------- */
async function getUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7), env.JWT_SECRET || 'dev-secret-change-me');
}

/* ---------- منطق واجد شرایط بودن کلاس ورزشی ---------- */
// برای جلسه یک کلاس ورزشی: هر دانشجویی که در همان هفته (شنبه تا تاریخ جلسه)
// در یکی از کلاس‌های پیش‌نیاز «غیبت» (غیرموجه) داشته باشد، قرمز می‌شود.
async function computeEligibility(env, classId, sessionDate, studentIds) {
  const reqRows = (await env.DB.prepare(
    `SELECT c.id, c.name FROM class_requirements r
     JOIN classes c ON c.id = r.required_class_id
     WHERE r.sport_class_id = ?`).bind(classId).all()).results;
  if (!reqRows.length || !studentIds.length) return {};

  const [weekStart] = weekRange(sessionDate);
  const reqIds = reqRows.map(r => r.id);
  const ph = ids => ids.map(() => '?').join(',');

  const rows = (await env.DB.prepare(
    `SELECT a.student_id, c.name AS class_name, s.date
     FROM attendance a
     JOIN sessions s ON s.id = a.session_id
     JOIN classes c ON c.id = s.class_id
     WHERE a.status = 'absent'
       AND s.class_id IN (${ph(reqIds)})
       AND s.date >= ? AND s.date <= ?
       AND a.student_id IN (${ph(studentIds)})`)
    .bind(...reqIds, weekStart, sessionDate, ...studentIds).all()).results;

  const result = {};
  for (const r of rows) {
    (result[r.student_id] ||= []).push({ class_name: r.class_name, date: r.date });
  }
  return result; // student_id → لیست غیبت‌های پیش‌نیاز؛ نبودن کلید یعنی مجاز
}

/* ---------- روتر ---------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await route(request, env, url);
    } catch (e) {
      return err('خطای داخلی سرور: ' + e.message, 500);
    }
  },
};

async function route(request, env, url) {
  const { pathname } = url;
  const method = request.method;
  const seg = pathname.split('/').filter(Boolean); // ['api', ...]
  const body = ['POST', 'PUT'].includes(method)
    ? await request.json().catch(() => ({})) : {};

  /* ----- ورود (بدون توکن) ----- */
  if (pathname === '/api/auth/login' && method === 'POST') {
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!username || !password) return err('نام کاربری و رمز عبور الزامی است');

    const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n;
    let user;
    if (count === 0) {
      // اولین ورود: ساخت خودکار حساب مدیر
      if (password.length < 6) return err('رمز عبور باید حداقل ۶ کاراکتر باشد');
      const { hash, salt } = await hashPassword(password);
      const r = await env.DB.prepare(
        'INSERT INTO users (username, password_hash, salt, role) VALUES (?,?,?,?)')
        .bind(username, hash, salt, 'admin').run();
      user = { id: r.meta.last_row_id, username, role: 'admin' };
    } else {
      const row = await env.DB.prepare('SELECT * FROM users WHERE username = ?')
        .bind(username).first();
      if (!row) return err('نام کاربری یا رمز عبور اشتباه است', 401);
      const { hash } = await hashPassword(password, row.salt);
      if (hash !== row.password_hash) return err('نام کاربری یا رمز عبور اشتباه است', 401);
      user = { id: row.id, username: row.username, role: row.role };
    }
    const token = await signToken(
      { uid: user.id, un: user.username, role: user.role,
        exp: Math.floor(Date.now() / 1000) + TOKEN_TTL },
      env.JWT_SECRET || 'dev-secret-change-me');
    return json({ ...user, token, first_run: count === 0 });
  }

  /* ----- از اینجا به بعد توکن لازم است ----- */
  const user = await getUser(request, env);
  if (!user) return err('ابتدا وارد شوید', 401);
  const isAdmin = user.role === 'admin';

  if (pathname === '/api/auth/me') {
    return json({ id: user.uid, username: user.un, role: user.role });
  }

  /* ----- مدیریت کاربران (فقط مدیر) ----- */
  if (seg[1] === 'users') {
    if (!isAdmin) return err('فقط مدیر به این بخش دسترسی دارد', 403);
    if (method === 'GET' && seg.length === 2) {
      const rows = (await env.DB.prepare(
        'SELECT id, username, role, created_at FROM users ORDER BY id').all()).results;
      return json(rows);
    }
    if (method === 'POST' && seg.length === 2) {
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const role = body.role === 'admin' ? 'admin' : 'teacher';
      if (!username || password.length < 6)
        return err('نام کاربری الزامی و رمز حداقل ۶ کاراکتر است');
      const { hash, salt } = await hashPassword(password);
      try {
        const r = await env.DB.prepare(
          'INSERT INTO users (username, password_hash, salt, role) VALUES (?,?,?,?)')
          .bind(username, hash, salt, role).run();
        return json({ id: r.meta.last_row_id, username, role });
      } catch { return err('این نام کاربری قبلاً ثبت شده است'); }
    }
    const id = parseInt(seg[2]);
    if (method === 'PUT' && id) {
      if (body.password) {
        if (String(body.password).length < 6) return err('رمز حداقل ۶ کاراکتر');
        const { hash, salt } = await hashPassword(String(body.password));
        await env.DB.prepare('UPDATE users SET password_hash=?, salt=? WHERE id=?')
          .bind(hash, salt, id).run();
      }
      if (body.role && id !== user.uid) {
        await env.DB.prepare('UPDATE users SET role=? WHERE id=?')
          .bind(body.role === 'admin' ? 'admin' : 'teacher', id).run();
      }
      return json({ ok: true });
    }
    if (method === 'DELETE' && id) {
      if (id === user.uid) return err('نمی‌توانید حساب خودتان را حذف کنید');
      await env.DB.prepare('DELETE FROM users WHERE id=?').bind(id).run();
      return json({ ok: true });
    }
  }

  /* ----- دانشجوها ----- */
  if (seg[1] === 'students') {
    if (method === 'GET' && seg.length === 2) {
      const q = url.searchParams.get('q');
      const all = url.searchParams.get('all') === '1';
      let sql = `SELECT st.*,
        (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = st.id) AS class_count
        FROM students st WHERE 1=1`;
      const binds = [];
      if (!all) sql += ' AND st.active = 1';
      if (q) { sql += ' AND (st.name LIKE ? OR st.code LIKE ?)'; binds.push(`%${q}%`, `%${q}%`); }
      sql += ' ORDER BY st.name';
      return json((await env.DB.prepare(sql).bind(...binds).all()).results);
    }
    if (method === 'POST' && seg.length === 2) {
      const name = String(body.name || '').trim();
      if (!name) return err('نام دانشجو الزامی است');
      const r = await env.DB.prepare(
        'INSERT INTO students (name, code, phone, notes) VALUES (?,?,?,?)')
        .bind(name, String(body.code || ''), String(body.phone || ''), String(body.notes || '')).run();
      // ثبت‌نام در کلاس‌های انتخابی
      if (Array.isArray(body.class_ids)) {
        for (const cid of body.class_ids) {
          await env.DB.prepare('INSERT OR IGNORE INTO enrollments (class_id, student_id) VALUES (?,?)')
            .bind(cid, r.meta.last_row_id).run();
        }
      }
      return json({ id: r.meta.last_row_id });
    }
    const id = parseInt(seg[2]);
    if (method === 'PUT' && id) {
      const name = String(body.name || '').trim();
      if (!name) return err('نام دانشجو الزامی است');
      await env.DB.prepare(
        'UPDATE students SET name=?, code=?, phone=?, notes=?, active=? WHERE id=?')
        .bind(name, String(body.code || ''), String(body.phone || ''),
              String(body.notes || ''), body.active === 0 ? 0 : 1, id).run();
      if (Array.isArray(body.class_ids)) {
        await env.DB.prepare('DELETE FROM enrollments WHERE student_id=?').bind(id).run();
        for (const cid of body.class_ids) {
          await env.DB.prepare('INSERT OR IGNORE INTO enrollments (class_id, student_id) VALUES (?,?)')
            .bind(cid, id).run();
        }
      }
      return json({ ok: true });
    }
    if (method === 'DELETE' && id) {
      await env.DB.prepare('DELETE FROM students WHERE id=?').bind(id).run();
      return json({ ok: true });
    }
    if (method === 'GET' && seg[3] === 'classes' && parseInt(seg[2])) {
      const rows = (await env.DB.prepare(
        'SELECT class_id FROM enrollments WHERE student_id=?').bind(parseInt(seg[2])).all()).results;
      return json(rows.map(r => r.class_id));
    }
  }

  /* ----- کلاس‌ها ----- */
  if (seg[1] === 'classes') {
    if (method === 'GET' && seg.length === 2) {
      const rows = (await env.DB.prepare(
        `SELECT c.*,
          (SELECT COUNT(*) FROM enrollments e WHERE e.class_id = c.id) AS student_count,
          (SELECT COUNT(*) FROM sessions s WHERE s.class_id = c.id) AS session_count
         FROM classes c ORDER BY c.is_sport, c.name`).all()).results;
      const reqs = (await env.DB.prepare('SELECT * FROM class_requirements').all()).results;
      for (const c of rows) {
        c.required_class_ids = reqs
          .filter(r => r.sport_class_id === c.id).map(r => r.required_class_id);
      }
      return json(rows);
    }
    if (method === 'POST' && seg.length === 2) {
      const name = String(body.name || '').trim();
      if (!name) return err('نام کلاس الزامی است');
      const r = await env.DB.prepare(
        'INSERT INTO classes (name, description, is_sport, weekday) VALUES (?,?,?,?)')
        .bind(name, String(body.description || ''), body.is_sport ? 1 : 0,
              Number.isInteger(body.weekday) ? body.weekday : null).run();
      await saveRequirements(env, r.meta.last_row_id, body);
      return json({ id: r.meta.last_row_id });
    }
    const id = parseInt(seg[2]);
    if (method === 'PUT' && seg.length === 3 && id) {
      const name = String(body.name || '').trim();
      if (!name) return err('نام کلاس الزامی است');
      await env.DB.prepare(
        'UPDATE classes SET name=?, description=?, is_sport=?, weekday=?, active=? WHERE id=?')
        .bind(name, String(body.description || ''), body.is_sport ? 1 : 0,
              Number.isInteger(body.weekday) ? body.weekday : null,
              body.active === 0 ? 0 : 1, id).run();
      await saveRequirements(env, id, body);
      return json({ ok: true });
    }
    if (method === 'DELETE' && seg.length === 3 && id) {
      await env.DB.prepare('DELETE FROM class_requirements WHERE sport_class_id=? OR required_class_id=?')
        .bind(id, id).run();
      await env.DB.prepare('DELETE FROM classes WHERE id=?').bind(id).run();
      return json({ ok: true });
    }
    // اعضای کلاس
    if (seg[3] === 'students' && id) {
      if (method === 'GET') {
        const rows = (await env.DB.prepare(
          'SELECT student_id FROM enrollments WHERE class_id=?').bind(id).all()).results;
        return json(rows.map(r => r.student_id));
      }
      if (method === 'PUT') {
        const ids = Array.isArray(body.student_ids) ? body.student_ids : [];
        await env.DB.prepare('DELETE FROM enrollments WHERE class_id=?').bind(id).run();
        for (const sid of ids) {
          await env.DB.prepare('INSERT OR IGNORE INTO enrollments (class_id, student_id) VALUES (?,?)')
            .bind(id, sid).run();
        }
        return json({ ok: true });
      }
    }
    // جلسات کلاس
    if (seg[3] === 'sessions' && id) {
      if (method === 'GET') {
        const rows = (await env.DB.prepare(
          `SELECT s.*,
            SUM(CASE WHEN a.status='present' THEN 1 ELSE 0 END) AS present,
            SUM(CASE WHEN a.status='absent'  THEN 1 ELSE 0 END) AS absent,
            SUM(CASE WHEN a.status='late'    THEN 1 ELSE 0 END) AS late,
            SUM(CASE WHEN a.status='excused' THEN 1 ELSE 0 END) AS excused
           FROM sessions s LEFT JOIN attendance a ON a.session_id = s.id
           WHERE s.class_id = ? GROUP BY s.id ORDER BY s.date DESC`).bind(id).all()).results;
        return json(rows);
      }
      if (method === 'POST') {
        const date = String(body.date || '');
        if (!ISO_RE.test(date)) return err('تاریخ نامعتبر است');
        const existing = await env.DB.prepare(
          'SELECT id FROM sessions WHERE class_id=? AND date=?').bind(id, date).first();
        if (existing) return json({ id: existing.id, existed: true });
        const r = await env.DB.prepare(
          'INSERT INTO sessions (class_id, date, note, created_by) VALUES (?,?,?,?)')
          .bind(id, date, String(body.note || ''), user.uid).run();
        return json({ id: r.meta.last_row_id });
      }
    }
  }

  /* ----- جلسات و حضور و غیاب ----- */
  if (seg[1] === 'sessions' && parseInt(seg[2])) {
    const sid = parseInt(seg[2]);
    const session = await env.DB.prepare(
      `SELECT s.*, c.name AS class_name, c.is_sport
       FROM sessions s JOIN classes c ON c.id = s.class_id WHERE s.id=?`).bind(sid).first();
    if (!session) return err('جلسه پیدا نشد', 404);

    if (method === 'GET' && seg.length === 3) {
      const roster = (await env.DB.prepare(
        `SELECT st.id, st.name, st.code, a.status, a.note
         FROM enrollments e
         JOIN students st ON st.id = e.student_id AND st.active = 1
         LEFT JOIN attendance a ON a.session_id = ? AND a.student_id = st.id
         WHERE e.class_id = ? ORDER BY st.name`).bind(sid, session.class_id).all()).results;
      let eligibility = {};
      if (session.is_sport) {
        eligibility = await computeEligibility(
          env, session.class_id, session.date, roster.map(r => r.id));
      }
      for (const r of roster) {
        r.blocked = !!eligibility[r.id];
        r.block_reasons = eligibility[r.id] || [];
      }
      return json({ session, roster });
    }
    if (method === 'POST' && seg[3] === 'attendance') {
      const records = Array.isArray(body.records) ? body.records : [];
      for (const rec of records) {
        if (!rec.student_id) continue;
        if (rec.status === null || rec.status === '') {
          await env.DB.prepare('DELETE FROM attendance WHERE session_id=? AND student_id=?')
            .bind(sid, rec.student_id).run();
          continue;
        }
        if (!VALID_STATUS.includes(rec.status)) continue;
        await env.DB.prepare(
          `INSERT INTO attendance (session_id, student_id, status, note, marked_by)
           VALUES (?,?,?,?,?)
           ON CONFLICT(session_id, student_id)
           DO UPDATE SET status=excluded.status, note=excluded.note,
                         marked_by=excluded.marked_by, marked_at=datetime('now')`)
          .bind(sid, rec.student_id, rec.status, String(rec.note || ''), user.uid).run();
      }
      return json({ ok: true });
    }
    if (method === 'DELETE' && seg.length === 3) {
      await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(sid).run();
      return json({ ok: true });
    }
  }

  /* ----- گزارش‌گیری ----- */
  if (pathname === '/api/reports' && method === 'GET') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const classId = parseInt(url.searchParams.get('class_id')) || null;
    const studentId = parseInt(url.searchParams.get('student_id')) || null;

    let sql = `
      SELECT st.id AS student_id, st.name AS student_name, st.code,
             c.id AS class_id, c.name AS class_name, c.is_sport,
             s.id AS session_id, s.date, a.status
      FROM enrollments e
      JOIN students st ON st.id = e.student_id
      JOIN classes c  ON c.id = e.class_id
      JOIN sessions s ON s.class_id = e.class_id
      LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = st.id
      WHERE 1=1`;
    const binds = [];
    if (from && ISO_RE.test(from)) { sql += ' AND s.date >= ?'; binds.push(from); }
    if (to && ISO_RE.test(to))     { sql += ' AND s.date <= ?'; binds.push(to); }
    if (classId)   { sql += ' AND c.id = ?';  binds.push(classId); }
    if (studentId) { sql += ' AND st.id = ?'; binds.push(studentId); }
    sql += ' ORDER BY s.date';
    const rows = (await env.DB.prepare(sql).bind(...binds).all()).results;

    // تجمیع: هر ردیف = دانشجو × کلاس
    const agg = new Map();
    for (const r of rows) {
      const key = `${r.student_id}:${r.class_id}`;
      if (!agg.has(key)) {
        agg.set(key, {
          student_id: r.student_id, student_name: r.student_name, code: r.code,
          class_id: r.class_id, class_name: r.class_name, is_sport: r.is_sport,
          total: 0, present: 0, absent: 0, late: 0, excused: 0, unmarked: 0,
        });
      }
      const a = agg.get(key);
      a.total++;
      if (r.status) a[r.status]++; else a.unmarked++;
    }
    const result = [...agg.values()].map(a => ({
      ...a,
      percent: a.total - a.unmarked > 0
        ? Math.round(((a.present + a.late) / (a.total - a.unmarked)) * 100) : null,
    })).sort((x, y) => x.student_name.localeCompare(y.student_name, 'fa'));

    // جزئیات جلسه‌به‌جلسه وقتی دانشجوی خاصی انتخاب شده
    let details = null;
    if (studentId) {
      details = rows.map(r => ({
        date: r.date, class_name: r.class_name, status: r.status,
      }));
    }
    return json({ summary: result, details });
  }

  /* ----- آمار داشبورد ----- */
  if (pathname === '/api/stats' && method === 'GET') {
    const today = new Date().toISOString().slice(0, 10);
    const [ws, we] = weekRange(today);
    const students = (await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM students WHERE active=1').first()).n;
    const classes = (await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM classes WHERE active=1').first()).n;
    const weekSessions = (await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM sessions WHERE date >= ? AND date <= ?').bind(ws, we).first()).n;
    const weekAbsents = (await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM attendance a JOIN sessions s ON s.id=a.session_id
       WHERE a.status='absent' AND s.date >= ? AND s.date <= ?`).bind(ws, we).first()).n;
    return json({ students, classes, weekSessions, weekAbsents });
  }

  return err('مسیر پیدا نشد', 404);
}

async function saveRequirements(env, classId, body) {
  if (!Array.isArray(body.required_class_ids)) return;
  await env.DB.prepare('DELETE FROM class_requirements WHERE sport_class_id=?')
    .bind(classId).run();
  if (!body.is_sport) return;
  for (const rid of body.required_class_ids) {
    if (rid === classId) continue;
    await env.DB.prepare(
      'INSERT OR IGNORE INTO class_requirements (sport_class_id, required_class_id) VALUES (?,?)')
      .bind(classId, rid).run();
  }
}
