-- Fuege Vertretung-Spalte zur vacation-Tabelle hinzu
-- Fuehre dies im Supabase SQL Editor aus

ALTER TABLE vacation ADD COLUMN IF NOT EXISTS coverage TEXT DEFAULT 'Ungeklärt';

-- Bestehende Eintraege ohne Vertretung auf 'Ungeklärt' setzen
UPDATE vacation SET coverage = 'Ungeklärt' WHERE coverage IS NULL;