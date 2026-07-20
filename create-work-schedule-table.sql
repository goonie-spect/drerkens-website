-- Work_schedule Tabelle anlegen
CREATE TABLE IF NOT EXISTS work_schedule (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    day_of_week TEXT UNIQUE NOT NULL,
    is_workday BOOLEAN DEFAULT true,
    start_time TEXT DEFAULT '08:00',
    end_time TEXT DEFAULT '18:00',
    pause_start TEXT DEFAULT '12:00',
    pause_end TEXT DEFAULT '14:00'
);

-- Standard-Werte fuer Wochentage einfügen (falls leer)
INSERT INTO work_schedule (day_of_week, is_workday, start_time, end_time, pause_start, pause_end)
VALUES
    ('Montag', true, '08:00', '18:00', '12:00', '14:00'),
    ('Dienstag', true, '08:00', '18:00', '12:00', '14:00'),
    ('Mittwoch', true, '08:00', '18:00', '12:00', '14:00'),
    ('Donnerstag', true, '08:00', '18:00', '12:00', '14:00'),
    ('Freitag', true, '08:00', '18:00', '12:00', '14:00'),
    ('Samstag', false, '08:00', '18:00', '12:00', '14:00'),
    ('Sonntag', false, '08:00', '18:00', '12:00', '14:00')
ON CONFLICT (day_of_week) DO NOTHING;

-- Blocked_slots Tabelle anlegen (falls nicht vorhanden)
CREATE TABLE IF NOT EXISTS blocked_slots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    reason TEXT DEFAULT '',
    UNIQUE(date, time)
);