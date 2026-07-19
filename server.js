require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 8080;

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('WARN: SUPABASE_URL or SUPABASE_SERVICE_KEY not set');
}

const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder'
);

// E-Mail-Konfiguration
const EMAIL_CONFIG = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER || 'goonie6688@gmail.com',
        pass: process.env.EMAIL_PASS || 'uadl seao vmmg zfou'
    }
};

let transporter = null;

function initEmailTransporter() {
    try {
        transporter = nodemailer.createTransport(EMAIL_CONFIG);
        console.log('E-Mail-Transporter initialisiert');
    } catch (error) {
        console.warn('E-Mail-Versand nicht konfiguriert:', error.message);
    }
}

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Wochenplan PIN
const WOCHENPLAN_PIN = process.env.WOCHENPLAN_PIN || '3911';

// Passwort Hashing
function hashPassword(password, salt) {
    salt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return { salt, hash };
}

function verifyPassword(password, salt, hash) {
    const result = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return result === hash;
}

// Session Management
async function createSession(userId) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    try {
        const { error } = await supabase.from('sessions').insert({
            session_id: sessionId,
            user_id: userId,
            created_at: new Date().toISOString()
        });
        if (error) console.error('Session insert error:', error.message);
    } catch(e) {
        console.error('Session create error:', e.message);
    }
    return sessionId;
}

async function getSession(sessionId) {
    try {
        const { data, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('session_id', sessionId)
            .single();
        if (error) { console.error('Session get error:', error.message); return null; }
        return data || null;
    } catch(e) {
        console.error('Session get error:', e.message);
        return null;
    }
}

// Auth Middleware
async function requireAuth(req, res, next) {
    const sessionId = req.headers.authorization?.replace('Bearer ', '');
    if (!sessionId) return res.status(401).json({ error: 'Nicht eingeloggt' });

    // Pruefe zuerst Wochenplan HMAC-Token
    try {
        const parts = sessionId.split('.');
        if (parts.length === 2) {
            const data = Buffer.from(parts[0], 'base64').toString('utf-8');
            const expectedSig = crypto.createHmac('sha256', WOCHENPLAN_PIN).update(data).digest('hex');
            if (parts[1] === expectedSig) {
                const payload = JSON.parse(data);
                if (Date.now() <= payload.exp) {
                    req.userId = 'wochenplan:' + payload.role;
                    return next();
                }
            }
        }
    } catch(e) {}

    // Fallback: Datenbank-Session
    const session = await getSession(sessionId);
    if (!session) return res.status(401).json({ error: 'Session abgelaufen' });
    req.userId = session.user_id;
    next();
}

// ==================== AUTH API ====================

app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, E-Mail und Passwort erforderlich' });
    }

    const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', email.toLowerCase())
        .single();

    if (existing) return res.status(400).json({ error: 'E-Mail bereits registriert' });

    const { salt, hash } = hashPassword(password);
    const { data: user, error } = await supabase
        .from('users')
        .insert({
            name,
            email: email.toLowerCase(),
            salt,
            hash,
            phone: phone || '',
            created_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) return res.status(500).json({ error: 'Registrierung fehlgeschlagen' });

    const sessionId = await createSession(user.id);
    res.json({
        success: true,
        sessionId,
        user: { id: user.id, name: user.name, email: user.email }
    });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });

    const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

    if (!user || !verifyPassword(password, user.salt, user.hash)) {
        return res.status(401).json({ error: 'Falsche Anmeldedaten' });
    }

    const sessionId = await createSession(user.id);
    res.json({
        success: true,
        sessionId,
        user: { id: user.id, name: user.name, email: user.email }
    });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
    const { data: user } = await supabase
        .from('users')
        .select('id, name, email, phone')
        .eq('id', req.userId)
        .single();

    if (!user) return res.status(404).json({ error: 'User nicht gefunden' });
    res.json({ user });
});

// ==================== APPOINTMENTS API ====================

const SERVICES = [
    'Erstuntersuchung', 'Kontrolluntersuchung', 'Prophylaxe',
    'Zahnheilkunde', 'Kieferorthopädie', 'Implantologie',
    'Ästhetische Zahnheilkunde', 'Notfallversorgung'
];

app.get('/api/appointments', async (req, res) => {
    const { date } = req.query;
    let query = supabase.from('appointments').select('*');
    if (date) query = query.eq('date', date);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Fehler beim Laden' });
    res.json(data || []);
});

app.post('/api/appointments', async (req, res) => {
    const { name, email, phone, service, date, time, notes } = req.body;
    if (!name || !email || !service || !date || !time) {
        return res.status(400).json({ error: 'Pflichtfelder fehlen' });
    }

    const { data, error } = await supabase
        .from('appointments')
        .insert({
            name,
            email,
            phone: phone || '',
            service,
            date,
            time,
            notes: notes || '',
            status: 'offen',
            created_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) return res.status(500).json({ error: 'Termin konnte nicht erstellt werden' });

    // E-Mail-Bestätigung
    if (transporter) {
        try {
            await transporter.sendMail({
                from: '"Dr. Erkens Praxis" <goonie6688@gmail.com>',
                to: email,
                subject: `Terminbestätigung: ${service} am ${date}`,
                html: `
                    <h2>Terminbestätigung</h2>
                    <p>Vielen Dank für Ihren Termin, ${name}!</p>
                    <p><strong>Leistung:</strong> ${service}</p>
                    <p><strong>Datum:</strong> ${date}</p>
                    <p><strong>Uhrzeit:</strong> ${time}</p>
                    <p><strong>Ort:</strong> Tiergartenstraße 27, 47533 Kleve</p>
                    <br>
                    <p>Mit freundlichen Grüßen<br>Dr. med. Friedhelm Erkens</p>
                `
            });
        } catch (e) {
            console.error('E-Mail-Fehler:', e);
        }
    }

    res.json({ success: true, appointment: data });
});

app.put('/api/appointments/:id', async (req, res) => {
    const { status, assigned_to } = req.body;
    const update = {};
    if (status) update.status = status;
    if (assigned_to !== undefined) update.assigned_to = assigned_to;

    const { error } = await supabase
        .from('appointments')
        .update(update)
        .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: 'Update fehlgeschlagen' });
    res.json({ success: true });
});

app.put('/api/appointments/:id/decline', async (req, res) => {
    const { error } = await supabase
        .from('appointments')
        .update({ status: 'abgesagt' })
        .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: 'Absage fehlgeschlagen' });

    const { data: apt } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', req.params.id)
        .single();

    if (apt && transporter) {
        try {
            await transporter.sendMail({
                from: '"Dr. Erkens Praxis" <goonie6688@gmail.com>',
                to: apt.email,
                subject: `Ihr Termin wurde abgesagt`,
                html: `
                    <h2>Termin abgesagt</h2>
                    <p>Sehr geehrte(r) ${apt.name},</p>
                    <p>Leider mussten wir Ihren Termin am ${apt.date} um ${apt.time} Uhr absagen.</p>
                    <p>Bitte kontaktieren Sie uns für eine Neuterminierung.</p>
                    <br>
                    <p>Mit freundlichen Grüßen<br>Dr. med. Friedhelm Erkens</p>
                `
            });
        } catch (e) {
            console.error('E-Mail-Fehler:', e);
        }
    }

    res.json({ success: true });
});

app.delete('/api/appointments/:id', async (req, res) => {
    const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: 'Löschen fehlgeschlagen' });
    res.json({ success: true });
});

app.post('/api/appointments/:id/move', async (req, res) => {
    const { newDate, newTime } = req.body;
    const { error } = await supabase
        .from('appointments')
        .update({ date: newDate, time: newTime })
        .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: 'Verschieben fehlgeschlagen' });

    // E-Mail über Verschiebung
    const { data: apt } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', req.params.id)
        .single();

    if (apt && transporter) {
        try {
            await transporter.sendMail({
                from: '"Dr. Erkens Praxis" <goonie6688@gmail.com>',
                to: apt.email,
                subject: `Ihr Termin wurde verschoben`,
                html: `
                    <h2>Termin verschoben</h2>
                    <p>Sehr geehrte(r) ${apt.name},</p>
                    <p>Ihr Termin wurde verschoben:</p>
                    <p><strong>Neues Datum:</strong> ${newDate}</p>
                    <p><strong>Neue Uhrzeit:</strong> ${newTime}</p>
                    <br>
                    <p>Mit freundlichen Grüßen<br>Dr. med. Friedhelm Erkens</p>
                `
            });
        } catch (e) {
            console.error('E-Mail-Fehler:', e);
        }
    }

    res.json({ success: true });
});

// ==================== ADMIN API ====================

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@drerkens.de';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Onix1111';

app.post('/api/admin/login', async (req, res) => {
    const { email, password } = req.body;

    let { data: admin } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

    // Erstelle Admin-Account falls nicht vorhanden
    if (!admin && email.toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        const { salt, hash } = hashPassword(password);
        const { data: newAdmin } = await supabase
            .from('admin_users')
            .insert({
                email: ADMIN_EMAIL,
                name: 'Dr. Erkens',
                salt,
                hash,
                role: 'admin',
                created_at: new Date().toISOString()
            })
            .select()
            .single();
        admin = newAdmin;
    }

    if (!admin || !verifyPassword(password, admin.salt, admin.hash)) {
        return res.status(401).json({ error: 'Zugang verweigert' });
    }

    const sessionId = await createSession(admin.id);
    res.json({
        success: true,
        sessionId,
        admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role }
    });
});

// ==================== WORK SCHEDULE API ====================

app.get('/api/work-schedule', async (req, res) => {
    const { data, error } = await supabase
        .from('work_schedule')
        .select('*')
        .order('day_of_week');

    if (error) return res.status(500).json({ error: 'Fehler beim Laden' });
    res.json(data || []);
});

app.post('/api/work-schedule', requireAuth, async (req, res) => {
    const { day_of_week, is_workday, start_time, end_time, pause_start, pause_end } = req.body;

    const { data: existing } = await supabase
        .from('work_schedule')
        .select('id')
        .eq('day_of_week', day_of_week)
        .single();

    if (existing) {
        await supabase
            .from('work_schedule')
            .update({ is_workday, start_time, end_time, pause_start, pause_end })
            .eq('id', existing.id);
    } else {
        await supabase
            .from('work_schedule')
            .insert({ day_of_week, is_workday, start_time, end_time, pause_start, pause_end });
    }

    res.json({ success: true });
});

// ==================== BLOCKED SLOTS API ====================

app.get('/api/blocked-slots', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('blocked_slots')
            .select('*');
        if (error) return res.status(500).json({ error: 'Fehler beim Laden' });
        res.json(data || []);
    } catch(e) {
        res.json([]);
    }
});

app.post('/api/blocked-slots', async (req, res) => {
    const { date, time, reason } = req.body;
    if (!date || !time) return res.status(400).json({ error: 'Datum und Uhrzeit erforderlich' });

    try {
        const { data, error } = await supabase
            .from('blocked_slots')
            .upsert({ date, time, reason: reason || '' }, { onConflict: 'date,time' })
            .select()
            .single();
        if (error) return res.status(500).json({ error: 'Blockieren fehlgeschlagen' });
        res.json({ success: true, slot: data });
    } catch(e) {
        res.status(500).json({ error: 'Blockieren fehlgeschlagen' });
    }
});

app.post('/api/blocked-slots/batch', async (req, res) => {
    const { slots } = req.body;
    if (!slots || !Array.isArray(slots)) return res.status(400).json({ error: 'slots Array erforderlich' });

    try {
        const { data, error } = await supabase
            .from('blocked_slots')
            .upsert(slots.map(s => ({ date: s.date, time: s.time, reason: s.reason || '' })), { onConflict: 'date,time' });
        if (error) return res.status(500).json({ error: 'Blockieren fehlgeschlagen' });
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: 'Blockieren fehlgeschlagen' });
    }
});

app.delete('/api/blocked-slots/:date/:time', async (req, res) => {
    const { date, time } = req.params;
    try {
        const { error } = await supabase
            .from('blocked_slots')
            .delete()
            .eq('date', date)
            .eq('time', decodeURIComponent(time));
        if (error) return res.status(500).json({ error: 'Entfernen fehlgeschlagen' });
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: 'Entfernen fehlgeschlagen' });
    }
});

app.delete('/api/blocked-slots', async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Datum erforderlich' });
    try {
        const { error } = await supabase
            .from('blocked_slots')
            .delete()
            .eq('date', date);
        if (error) return res.status(500).json({ error: 'Entfernen fehlgeschlagen' });
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ error: 'Entfernen fehlgeschlagen' });
    }
});

// ==================== VACATION API ====================

const VACATION_DAYS_PER_YEAR = 30;

app.get('/api/vacation', async (req, res) => {
    const { employee } = req.query;
    let query = supabase.from('vacation').select('*');
    if (employee) query = query.eq('employee', employee);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: 'Fehler beim Laden' });
    res.json(data || []);
});

app.post('/api/vacation', requireAuth, async (req, res) => {
    const { employee, start_date, end_date, days, reason, coverage } = req.body;
    if (!employee || !start_date || !end_date || !days) {
        return res.status(400).json({ error: 'Pflichtfelder fehlen' });
    }

    // Prüfe verbleibende Urlaubstage
    const usedDays = await getUsedVacationDays(employee);
    if (usedDays + days > VACATION_DAYS_PER_YEAR) {
        return res.status(400).json({ error: `Nur ${VACATION_DAYS_PER_YEAR - usedDays} Urlaubstage verfügbar` });
    }

    const insertData = {
        employee,
        start_date,
        end_date,
        days,
        reason: reason || '',
        status: 'offen',
        created_at: new Date().toISOString()
    };

    // coverage nur hinzufügen wenn Spalte existiert
    if (coverage) insertData.coverage = coverage;

    // created_by nur setzen wenn es eine gueltige UUID ist
    if (req.userId && !req.userId.startsWith('wochenplan:')) {
        insertData.created_by = req.userId;
    }

    const { data, error } = await supabase
        .from('vacation')
        .insert(insertData)
        .select();

    if (error) {
        console.error('Vacation insert error:', error.message);
        return res.status(500).json({ error: 'Antrag fehlgeschlagen: ' + error.message });
    }
    res.json({ success: true });
});

app.put('/api/vacation/:id', requireAuth, async (req, res) => {
    const { status } = req.body;

    // Update mit nur status — reviewed_by/reviewed_at nur wenn Spalten existieren
    const { error } = await supabase
        .from('vacation')
        .update({ status })
        .eq('id', req.params.id);

    if (error) {
        console.error('Vacation update error:', error.message);
        return res.status(500).json({ error: 'Update fehlgeschlagen: ' + error.message });
    }

    // E-Mail an Mitarbeiter
    const { data: vacation } = await supabase
        .from('vacation')
        .select('*')
        .eq('id', req.params.id)
        .single();

    if (vacation && transporter) {
        try {
            await transporter.sendMail({
                from: '"Dr. Erkens Praxis" <goonie6688@gmail.com>',
                to: 'goonie6688@gmail.com',
                subject: `Urlaubsantrag ${status === 'genehmigt' ? 'genehmigt' : 'abgelehnt'}`,
                html: `
                    <h2>Urlaubsantrag ${status === 'genehmigt' ? 'genehmigt' : 'abgelehnt'}</h2>
                    <p><strong>Mitarbeiter:</strong> ${vacation.employee}</p>
                    <p><strong>Zeitraum:</strong> ${vacation.start_date} bis ${vacation.end_date}</p>
                    <p><strong>Tage:</strong> ${vacation.days}</p>
                    <p><strong>Vertretung:</strong> ${vacation.coverage || 'Ungeklärt'}</p>
                    <p><strong>Status:</strong> ${status}</p>
                `
            });
        } catch (e) {
            console.error('E-Mail-Fehler:', e);
        }
    }

    res.json({ success: true });
});

app.delete('/api/vacation/:id', requireAuth, async (req, res) => {
    const { error } = await supabase
        .from('vacation')
        .delete()
        .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: 'Löschen fehlgeschlagen' });
    res.json({ success: true });
});

async function getUsedVacationDays(employee) {
    const { data: approved } = await supabase
        .from('vacation')
        .select('days')
        .eq('employee', employee)
        .eq('status', 'genehmigt');

    return (approved || []).reduce((sum, v) => sum + v.days, 0);
}

app.get('/api/vacation/balance/:employee', async (req, res) => {
    const employee = decodeURIComponent(req.params.employee);
    const used = await getUsedVacationDays(employee);
    res.json({ total: VACATION_DAYS_PER_YEAR, used, remaining: VACATION_DAYS_PER_YEAR - used });
});

// ==================== WOCHENPLAN PIN ====================

app.post('/api/wochenplan/login', async (req, res) => {
    try {
        const { pin, role } = req.body;
        if (pin !== WOCHENPLAN_PIN) return res.status(401).json({ error: 'Falscher Code' });

        const validRoles = ['Dr. Erkens', 'Praxis', 'Assistenz'];
        if (!validRoles.includes(role)) return res.status(400).json({ error: 'Ungültige Rolle' });

        const payload = { role, exp: Date.now() + 24 * 60 * 60 * 1000 };
        const data = JSON.stringify(payload);
        const sig = crypto.createHmac('sha256', WOCHENPLAN_PIN).update(data).digest('hex');
        const token = Buffer.from(data).toString('base64') + '.' + sig;

        res.json({ success: true, sessionId: token, role });
    } catch(e) {
        console.error('Wochenplan login error:', e);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

app.get('/api/wochenplan/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Nicht eingeloggt' });

        const parts = token.split('.');
        if (parts.length !== 2) return res.status(401).json({ error: 'Ungültiger Token' });

        const data = Buffer.from(parts[0], 'base64').toString('utf-8');
        const expectedSig = crypto.createHmac('sha256', WOCHENPLAN_PIN).update(data).digest('hex');

        if (parts[1] !== expectedSig) return res.status(401).json({ error: 'Ungültiger Token' });

        const payload = JSON.parse(data);
        if (Date.now() > payload.exp) return res.status(401).json({ error: 'Session abgelaufen' });

        res.json({ success: true, role: payload.role });
    } catch(e) {
        console.error('Wochenplan verify error:', e);
        res.status(500).json({ error: 'Serverfehler' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', env: { hasUrl: !!process.env.SUPABASE_URL, hasKey: !!process.env.SUPABASE_SERVICE_KEY } });
});

// ==================== START ====================

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server läuft auf http://localhost:${PORT}`);
        initEmailTransporter();
    });
}

module.exports = app;
