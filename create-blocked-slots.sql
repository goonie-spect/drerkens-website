CREATE TABLE IF NOT EXISTS blocked_slots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    reason TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS blocked_slots_date_time_unique ON blocked_slots (date, time);
