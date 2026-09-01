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