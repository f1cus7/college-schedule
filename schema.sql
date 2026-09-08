CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day INTEGER NOT NULL,
    lesson_number INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    teacher TEXT NOT NULL DEFAULT '',
    room TEXT NOT NULL DEFAULT '',
    time TEXT NOT NULL DEFAULT '',
    UNIQUE(day, lesson_number)
);

CREATE TABLE IF NOT EXISTS activity_tokens (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    token TEXT NOT NULL,
    activity_id TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
);