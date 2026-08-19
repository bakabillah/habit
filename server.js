const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb, dbQuery, dbGet, dbRun } = require('./database');
const habitAgent = require('./habitAgent');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Get local YYYY-MM-DD string
function getTodayDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Helper: Get past N days date strings YYYY-MM-DD
function getPastNDays(n = 7) {
    const dates = [];
    const today = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
    }
    return dates;
}

// ==========================================
// AUTHENTICATION APIs
// ==========================================

/**
 * POST /api/auth/register
 * Register a new user
 */
app.post('/api/auth/register', async (req, res, next) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !name.trim() || !email || !email.trim() || !password) {
            return res.status(400).json({
                success: false,
                error: 'All fields (name, email, password) are required.'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Check if email exists
        const existing = await dbGet('SELECT user_id FROM users WHERE email = ?', [normalizedEmail]);
        if (existing) {
            return res.status(409).json({
                success: false,
                error: 'An account with this email address already exists.'
            });
        }

        // Insert new user into SQLite database
        const result = await dbRun(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            [name.trim(), normalizedEmail, password]
        );

        const newUser = {
            user_id: result.lastID,
            name: name.trim(),
            email: normalizedEmail
        };

        habitAgent.addAgentLog(
            'SYSTEM',
            `New user registered: ${newUser.name} (${newUser.email}) [ID: ${newUser.user_id}]`,
            { userId: newUser.user_id }
        );

        res.status(201).json({
            success: true,
            message: 'User registered successfully.',
            user: newUser
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/auth/login
 * User login endpoint
 */
app.post('/api/auth/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required.'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = await dbGet('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

        if (!user || user.password !== password) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password.'
            });
        }

        const userData = {
            user_id: user.user_id,
            name: user.name,
            email: user.email
        };

        habitAgent.addAgentLog(
            'SYSTEM',
            `User logged in: ${userData.name} (${userData.email})`,
            { userId: userData.user_id }
        );

        res.json({
            success: true,
            message: 'Login successful.',
            user: userData
        });
    } catch (err) {
        next(err);
    }
});

// ==========================================
// REST API ENDPOINTS (USER-SCOPED RAW SQL)
// ==========================================

/**
 * GET /api/users
 * Returns list of system users
 */
app.get('/api/users', async (req, res, next) => {
    try {
        const users = await dbQuery('SELECT user_id, name, email FROM users');
        res.json({ success: true, data: users });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/dashboard
 * SAD Real-Time Progress Metrics Endpoint
 * Joins habits, streaks, and habit_log scoped to user_id.
 */
app.get('/api/dashboard', async (req, res, next) => {
    try {
        const userId = parseInt(req.query.user_id, 10) || 1;
        const today = getTodayDateString();
        const past7Days = getPastNDays(7);

        // Fetch user info
        const user = await dbGet('SELECT user_id, name, email FROM users WHERE user_id = ?', [userId]);

        // 1. Join habits and streaks for this user
        const habitsWithStreaks = await dbQuery(
            `SELECT 
                h.habit_id, 
                h.habit_name, 
                h.reminder_time, 
                h.created_date,
                COALESCE(s.current_streak, 0) AS current_streak,
                COALESCE(s.longest_streak, 0) AS longest_streak
             FROM habits h
             LEFT JOIN streaks s ON h.habit_id = s.habit_id
             WHERE h.user_id = ?
             ORDER BY h.habit_id ASC`,
            [userId]
        );

        // 2. Fetch logs for past 7 days for this user's habits
        let logs = [];
        if (habitsWithStreaks.length > 0) {
            const habitIds = habitsWithStreaks.map(h => h.habit_id);
            const habitPlaceholders = habitIds.map(() => '?').join(',');
            const datePlaceholders = past7Days.map(() => '?').join(',');
            
            logs = await dbQuery(
                `SELECT habit_id, date, status 
                 FROM habit_log 
                 WHERE habit_id IN (${habitPlaceholders}) AND date IN (${datePlaceholders})`,
                [...habitIds, ...past7Days]
            );
        }

        // Map logs into habit records
        const logsMap = {};
        logs.forEach(l => {
            logsMap[`${l.habit_id}_${l.date}`] = l.status;
        });

        let totalHabits = habitsWithStreaks.length;
        let todayCompletedCount = 0;
        let bestActiveStreakHabit = null;
        let maxStreakValue = -1;

        const detailedHabits = habitsWithStreaks.map(h => {
            const todayStatus = logsMap[`${h.habit_id}_${today}`] || 'unmarked';
            if (todayStatus === 'completed') {
                todayCompletedCount++;
            }

            if (h.current_streak > maxStreakValue) {
                maxStreakValue = h.current_streak;
                bestActiveStreakHabit = {
                    habit_id: h.habit_id,
                    habit_name: h.habit_name,
                    current_streak: h.current_streak
                };
            }

            const weeklyLogs = past7Days.map(date => ({
                date,
                status: logsMap[`${h.habit_id}_${date}`] || 'unmarked'
            }));

            return {
                ...h,
                today_status: todayStatus,
                weekly_logs: weeklyLogs
            };
        });

        const completionRate = totalHabits > 0 
            ? Math.round((todayCompletedCount / totalHabits) * 100) 
            : 0;

        res.json({
            success: true,
            data: {
                user: user || { user_id: userId, name: 'User', email: '' },
                today,
                past7Days,
                metrics: {
                    totalHabits,
                    todayCompletedCount,
                    completionRate,
                    bestActiveStreak: bestActiveStreakHabit || { habit_name: 'N/A', current_streak: 0 }
                },
                habits: detailedHabits
            }
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/habits
 * Returns list of habits for user_id with streak data
 */
app.get('/api/habits', async (req, res, next) => {
    try {
        const userId = parseInt(req.query.user_id, 10) || 1;
        const habits = await dbQuery(
            `SELECT 
                h.habit_id, h.habit_name, h.reminder_time, h.created_date,
                COALESCE(s.current_streak, 0) as current_streak,
                COALESCE(s.longest_streak, 0) as longest_streak
             FROM habits h
             LEFT JOIN streaks s ON h.habit_id = s.habit_id
             WHERE h.user_id = ?`,
            [userId]
        );
        res.json({ success: true, data: habits });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/habits
 * Creates a new habit for user_id and initializes streak row
 */
app.post('/api/habits', async (req, res, next) => {
    try {
        const { habit_name, reminder_time, user_id } = req.body;
        const userId = parseInt(user_id, 10) || 1;
        const today = getTodayDateString();

        if (!habit_name || !habit_name.trim()) {
            return res.status(400).json({ success: false, error: 'Habit name is required.' });
        }

        const validTimeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        const timeToSave = (reminder_time && validTimeRegex.test(reminder_time)) ? reminder_time : '09:00';

        // Raw SQL insert into habits
        const result = await dbRun(
            'INSERT INTO habits (user_id, habit_name, reminder_time, created_date) VALUES (?, ?, ?, ?)',
            [userId, habit_name.trim(), timeToSave, today]
        );

        const newHabitId = result.lastID;

        // Initialize streak entry
        await dbRun(
            'INSERT INTO streaks (habit_id, current_streak, longest_streak) VALUES (?, 0, 0)',
            [newHabitId]
        );

        habitAgent.addAgentLog(
            'SYSTEM',
            `New habit created: "${habit_name.trim()}" (ID: ${newHabitId}) for user #${userId} with reminder at ${timeToSave}`,
            { habitId: newHabitId, habit_name: habit_name.trim(), timeToSave, userId }
        );

        res.status(201).json({
            success: true,
            message: 'Habit created successfully',
            data: { habit_id: newHabitId, habit_name: habit_name.trim(), reminder_time: timeToSave, created_date: today, user_id: userId }
        });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/habits/:id
 * Deletes habit and cascaded records
 */
app.delete('/api/habits/:id', async (req, res, next) => {
    try {
        const habitId = req.params.id;

        const habit = await dbGet('SELECT habit_name FROM habits WHERE habit_id = ?', [habitId]);
        if (!habit) {
            return res.status(404).json({ success: false, error: 'Habit not found.' });
        }

        await dbRun('DELETE FROM habits WHERE habit_id = ?', [habitId]);

        habitAgent.addAgentLog(
            'SYSTEM',
            `Deleted habit: "${habit.habit_name}" (ID: ${habitId})`,
            { habitId }
        );

        res.json({ success: true, message: `Habit ${habitId} deleted successfully.` });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/habits/:id/log
 * Log status change ('completed' | 'incomplete' | 'unmarked')
 * Triggers Habit Automation Agent streak calculation
 */
app.post('/api/habits/:id/log', async (req, res, next) => {
    try {
        const habitId = parseInt(req.params.id, 10);
        const { date, status } = req.body;
        const logDate = date || getTodayDateString();

        if (!status || !['completed', 'incomplete', 'unmarked'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status. Must be "completed", "incomplete", or "unmarked".'
            });
        }

        if (status === 'unmarked') {
            await dbRun('DELETE FROM habit_log WHERE habit_id = ? AND date = ?', [habitId, logDate]);
        } else {
            await dbRun(
                `INSERT INTO habit_log (habit_id, date, status) 
                 VALUES (?, ?, ?)
                 ON CONFLICT(habit_id, date) 
                 DO UPDATE SET status = excluded.status`,
                [habitId, logDate, status]
            );
        }

        // TRIGGER AGENT CORE LOGIC: Recalculate Streak
        const streakResult = await habitAgent.recalculateStreak(habitId);

        res.json({
            success: true,
            message: `Habit ${habitId} status updated to '${status}' for date ${logDate}`,
            data: streakResult
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/agent/logs
 * Live terminal feed endpoint for Agent activity logging
 */
app.get('/api/agent/logs', (req, res) => {
    res.json({
        success: true,
        data: habitAgent.getAgentLogs()
    });
});

/**
 * POST /api/agent/trigger-reminder
 * Manual simulation endpoint to trigger background reminder check immediately
 */
app.post('/api/agent/trigger-reminder', async (req, res, next) => {
    try {
        await habitAgent.checkScheduledReminders();
        res.json({
            success: true,
            message: 'Manual scheduled reminder check triggered by agent terminal.'
        });
    } catch (err) {
        next(err);
    }
});

// ==========================================
// GLOBAL ERROR HANDLING MIDDLEWARE
// ==========================================
app.use((err, req, res, next) => {
    console.error('[EXPRESS ERROR MIDDLEWARE] Caught error:', err);

    if (err.message && (err.message.includes('SQLITE_CONSTRAINT') || err.message.includes('CONSTRAINT'))) {
        return res.status(409).json({
            success: false,
            error: 'Database Constraint Violation',
            details: err.message
        });
    }

    res.status(err.status || 500).json({
        success: false,
        error: 'Internal Server Error',
        details: err.message || 'An unexpected error occurred on the server.'
    });
});

// Auto initialize database & recalculate streaks
initDb()
    .then(async () => {
        await habitAgent.recalculateAllStreaks();
        
        // Start background worker & app.listen only when running locally (not on Vercel)
        if (!process.env.VERCEL) {
            habitAgent.startBackgroundWorker();
            app.listen(PORT, () => {
                console.log(`====================================================`);
                console.log(`🚀 Smart Habit Tracking System (SAD MVP) Server`);
                console.log(`Running on: http://localhost:${PORT}`);
                console.log(`====================================================`);
            });
        }
    })
    .catch((err) => {
        console.error('[SERVER BOOT ERROR] Database initialization failed:', err);
    });

module.exports = app;
