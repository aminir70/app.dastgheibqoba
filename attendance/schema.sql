-- اسکیمای دیتابیس D1 برای اپ حضور و غیاب
-- اجرا: wrangler d1 execute attendance-db --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'teacher',    -- 'admin' | 'teacher'
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_sport    INTEGER NOT NULL DEFAULT 0,           -- کلاس ورزشی؟
  weekday     INTEGER,                              -- 0=شنبه ... 6=جمعه (اختیاری)
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- پیش‌نیازهای هفتگی کلاس‌های ورزشی:
-- اگر دانشجو در همان هفته در required_class غیبت (غیرموجه) داشته باشد،
-- برای sport_class وضعیتش قرمز می‌شود.
CREATE TABLE IF NOT EXISTS class_requirements (
  sport_class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  required_class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (sport_class_id, required_class_id)
);

CREATE TABLE IF NOT EXISTS students (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  code       TEXT DEFAULT '',                       -- شماره دانشجویی / کد
  phone      TEXT DEFAULT '',
  notes      TEXT DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS enrollments (
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (class_id, student_id)
);

-- هر جلسه = یک کلاس در یک تاریخ (تاریخ میلادی ISO: YYYY-MM-DD؛ نمایش شمسی در UI)
CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  note       TEXT DEFAULT '',
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (class_id, date)
);

CREATE TABLE IF NOT EXISTS attendance (
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,                         -- 'present' | 'absent' | 'late' | 'excused'
  note       TEXT DEFAULT '',
  marked_by  INTEGER,
  marked_at  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);
CREATE INDEX IF NOT EXISTS idx_sessions_class ON sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
