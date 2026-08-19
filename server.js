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

// Helper: Get past N days date strings YYYY-MM-DD with offset
function getPastNDays(n = 7, offsetDays = 0) {
    const dates = [];
    const today = new Date();
    today.setDate(today.getDate() - offsetDays);
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

// Helper: Calculate Level & Badges
function getGamificationData(user, habitsWithStreaks, completionRate) {
    const points = user ? (user.points || 0) : 0;
    const level = Math.floor(points / 100) + 1;
    const xpCurrent = points % 100;
    const xpNeeded = 100;

    let maxStreak = 0;
    habitsWithStreaks.forEach(h => {
        if (h.current_streak > maxStreak) maxStreak = h.current_streak;
        if (h.longest_streak > maxStreak) maxStreak = h.longest_streak;
    });

    const totalHabitsCount = habitsWithStreaks.length;

    const badges = [
        {
            id: 'first_step',
            title: 'First Step',
            icon: '🌱',
            description: 'Completed your first habit',
            unlocked: points >= 10
        },
        {
            id: 'streak_7',
            title: '7-Day Streak Master',
            icon: '🔥',
            description: 'Maintained a 7-day streak',
            unlocked: maxStreak >= 7
        },
        {
            id: 'streak_30',
            title: '30-Day Legend',
            icon: '🏆',
            description: 'Achieved a 30-day streak milestone',
            unlocked: maxStreak >= 30
        },
        {
            id: 'habit_architect',
            title: 'Habit Architect',
            icon: '📋',
            description: 'Created 5 or more active habits',
            unlocked: totalHabitsCount >= 5
        },
        {
            id: 'level_3',
            title: 'Level 3 Achiever',
            icon: '⚡',
            description: 'Reached User Level 3',
            unlocked: level >= 3
        },
        {
            id: 'perfect_day',
            title: 'Perfect Day',
            icon: '💯',
            description: '100% completion rate on habits today',
            unlocked: completionRate === 100 && totalHabitsCount > 0
        }
    ];

    return {
        points,
        level,
        xpCurrent,
        xpNeeded,
        badges
    };
}

// ==========================================
// AUTHENTICATION & USER PROFILE APIs
// ==========================================

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

        const existing = await dbGet('SELECT user_id FROM users WHERE email = ?', [normalizedEmail]);
        if (existing) {
            return res.status(409).json({
                success: false,
                error: 'An account with this email address already exists.'
            });
        }

        const result = await dbRun(
            'INSERT INTO users (name, email, password, points) VALUES (?, ?, ?, 0)',
            [name.trim(), normalizedEmail, password]
        );

        const newUser = {
            user_id: result.lastID,
            name: name.trim(),
            email: normalizedEmail,
            points: 0
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
            email: user.email,
            points: user.points || 0
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

app.post('/api/auth/profile', async (req, res, next) => {
    try {
        const { user_id, name, email, password } = req.body;

        if (!user_id || !name || !name.trim() || !email || !email.trim()) {
            return res.status(400).json({
                success: false,
                error: 'User ID, name, and email are required.'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const existing = await dbGet(
            'SELECT user_id FROM users WHERE email = ? AND user_id != ?',
            [normalizedEmail, user_id]
        );
        if (existing) {
            return res.status(409).json({
                success: false,
                error: 'Email is already in use by another user.'
            });
        }

        if (password && password.trim()) {
            await dbRun(
                'UPDATE users SET name = ?, email = ?, password = ? WHERE user_id = ?',
                [name.trim(), normalizedEmail, password.trim(), user_id]
            );
        } else {
            await dbRun(
                'UPDATE users SET name = ?, email = ? WHERE user_id = ?',
                [name.trim(), normalizedEmail, user_id]
            );
        }

        const updatedUser = await dbGet('SELECT user_id, name, email, points FROM users WHERE user_id = ?', [user_id]);

        habitAgent.addAgentLog(
            'SYSTEM',
            `Profile updated for user #${user_id}: ${updatedUser.name} (${updatedUser.email})`,
            { userId: user_id }
        );

        res.json({
            success: true,
            message: 'Profile updated successfully.',
            user: updatedUser
        });
    } catch (err) {
        next(err);
    }
});

// ==========================================
// REST API ENDPOINTS (USER-SCOPED RAW SQL)
// ==========================================

app.get('/api/users', async (req, res, next) => {
    try {
        const users = await dbQuery('SELECT user_id, name, email, points FROM users');
        res.json({ success: true, data: users });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/dashboard
 * Accepts offset query parameter for date navigation to view historical back data.
 */
app.get('/api/dashboard', async (req, res, next) => {
    try {
        const userId = parseInt(req.query.user_id, 10) || 1;
        const offset = parseInt(req.query.offset, 10) || 0;
        const today = getTodayDateString();
        const past7Days = getPastNDays(7, offset);

        const user = await dbGet('SELECT user_id, name, email, points FROM users WHERE user_id = ?', [userId]);

        const habitsWithStreaks = await dbQuery(
            `SELECT 
                h.habit_id, 
                h.habit_name, 
                h.reminder_time, 
                h.created_date,
                COALESCE(h.category, 'General') AS category,
                COALESCE(h.priority, 'Medium') AS priority,
                COALESCE(h.target_days, 'All') AS target_days,
                h.subtasks,
                COALESCE(s.current_streak, 0) AS current_streak,
                COALESCE(s.longest_streak, 0) AS longest_streak
             FROM habits h
             LEFT JOIN streaks s ON h.habit_id = s.habit_id
             WHERE h.user_id = ?
             ORDER BY 
                CASE h.priority
                    WHEN 'High' THEN 1
                    WHEN 'Medium' THEN 2
                    WHEN 'Low' THEN 3
                    ELSE 4
                END, h.habit_id ASC`,
            [userId]
        );

        let logs = [];
        if (habitsWithStreaks.length > 0) {
            const habitIds = habitsWithStreaks.map(h => h.habit_id);
            const habitPlaceholders = habitIds.map(() => '?').join(',');
            const datePlaceholders = past7Days.map(() => '?').join(',');
            
            logs = await dbQuery(
                `SELECT habit_id, date, status, notes 
                 FROM habit_log 
                 WHERE habit_id IN (${habitPlaceholders}) AND date IN (${datePlaceholders})`,
                [...habitIds, ...past7Days]
            );
        }

        const logsMap = {};
        logs.forEach(l => {
            logsMap[`${l.habit_id}_${l.date}`] = { status: l.status, notes: l.notes || '' };
        });

        let totalHabits = habitsWithStreaks.length;
        let todayCompletedCount = 0;
        let bestActiveStreakHabit = null;
        let maxStreakValue = -1;

        const categoryStats = {};

        const weeklyTrend = past7Days.map(dateStr => {
            const dateObj = new Date(dateStr + 'T00:00:00');
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            let completedOnDate = 0;

            habitsWithStreaks.forEach(h => {
                const logInfo = logsMap[`${h.habit_id}_${dateStr}`];
                if (logInfo && logInfo.status === 'completed') {
                    completedOnDate++;
                }
            });

            const rate = totalHabits > 0 ? Math.round((completedOnDate / totalHabits) * 100) : 0;
            return {
                date: dateStr,
                dayName,
                completedCount: completedOnDate,
                totalHabits,
                completionRate: rate
            };
        });

        const detailedHabits = habitsWithStreaks.map(h => {
            const cat = h.category || 'General';
            if (!categoryStats[cat]) {
                categoryStats[cat] = { total: 0, completedToday: 0 };
            }
            categoryStats[cat].total++;

            const todayLog = logsMap[`${h.habit_id}_${today}`] || { status: 'unmarked', notes: '' };
            if (todayLog.status === 'completed') {
                todayCompletedCount++;
                categoryStats[cat].completedToday++;
            }

            if (h.current_streak > maxStreakValue) {
                maxStreakValue = h.current_streak;
                bestActiveStreakHabit = {
                    habit_id: h.habit_id,
                    habit_name: h.habit_name,
                    current_streak: h.current_streak
                };
            }

            const weeklyLogs = past7Days.map(date => {
                const logInfo = logsMap[`${h.habit_id}_${date}`] || { status: 'unmarked', notes: '' };
                return {
                    date,
                    status: logInfo.status,
                    notes: logInfo.notes
                };
            });

            return {
                ...h,
                today_status: todayLog.status,
                today_notes: todayLog.notes,
                weekly_logs: weeklyLogs
            };
        });

        const completionRate = totalHabits > 0 
            ? Math.round((todayCompletedCount / totalHabits) * 100) 
            : 0;

        const gamification = getGamificationData(user, habitsWithStreaks, completionRate);

        res.json({
            success: true,
            data: {
                user: user || { user_id: userId, name: 'User', email: '', points: 0 },
                today,
                offset,
                past7Days,
                metrics: {
                    totalHabits,
                    todayCompletedCount,
                    completionRate,
                    bestActiveStreak: bestActiveStreakHabit || { habit_name: 'N/A', current_streak: 0 }
                },
                weeklyTrend,
                categoryStats,
                gamification,
                habits: detailedHabits
            }
        });
    } catch (err) {
        next(err);
    }
});

app.get('/api/habits', async (req, res, next) => {
    try {
        const userId = parseInt(req.query.user_id, 10) || 1;
        const habits = await dbQuery(
            `SELECT 
                h.habit_id, h.habit_name, h.reminder_time, h.created_date,
                COALESCE(h.category, 'General') as category,
                COALESCE(h.priority, 'Medium') as priority,
                COALESCE(h.target_days, 'All') as target_days,
                h.subtasks,
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

app.post('/api/habits', async (req, res, next) => {
    try {
        const { habit_name, reminder_time, category, priority, target_days, subtasks, user_id } = req.body;
        const userId = parseInt(user_id, 10) || 1;
        const today = getTodayDateString();

        if (!habit_name || !habit_name.trim()) {
            return res.status(400).json({ success: false, error: 'Habit name is required.' });
        }

        const validCategories = ['Academic', 'Health', 'Productivity', 'Personal', 'General'];
        const catToSave = validCategories.includes(category) ? category : 'General';

        const validPriorities = ['High', 'Medium', 'Low'];
        const priorityToSave = validPriorities.includes(priority) ? priority : 'Medium';

        const targetDaysToSave = (target_days && target_days.trim()) ? target_days.trim() : 'All';
        const subtasksToSave = (subtasks && subtasks.trim()) ? subtasks.trim() : null;

        const validTimeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        const timeToSave = (reminder_time && validTimeRegex.test(reminder_time)) ? reminder_time : '09:00';

        const result = await dbRun(
            'INSERT INTO habits (user_id, habit_name, reminder_time, created_date, category, priority, target_days, subtasks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, habit_name.trim(), timeToSave, today, catToSave, priorityToSave, targetDaysToSave, subtasksToSave]
        );

        const newHabitId = result.lastID;

        await dbRun(
            'INSERT INTO streaks (habit_id, current_streak, longest_streak) VALUES (?, 0, 0)',
            [newHabitId]
        );

        habitAgent.addAgentLog(
            'SYSTEM',
            `New habit created: "${habit_name.trim()}" [Category: ${catToSave}, Priority: ${priorityToSave}] (ID: ${newHabitId})`,
            { habitId: newHabitId, habit_name: habit_name.trim(), category: catToSave, priority: priorityToSave, userId }
        );

        res.status(201).json({
            success: true,
            message: 'Habit created successfully',
            data: { habit_id: newHabitId, habit_name: habit_name.trim(), reminder_time: timeToSave, created_date: today, category: catToSave, priority: priorityToSave, target_days: targetDaysToSave, subtasks: subtasksToSave, user_id: userId }
        });
    } catch (err) {
        next(err);
    }
});

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

app.post('/api/habits/:id/log', async (req, res, next) => {
    try {
        const habitId = parseInt(req.params.id, 10);
        const { date, status, notes } = req.body;
        const logDate = date || getTodayDateString();

        if (!status || !['completed', 'incomplete', 'unmarked'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status. Must be "completed", "incomplete", or "unmarked".'
            });
        }

        const existingLog = await dbGet('SELECT status FROM habit_log WHERE habit_id = ? AND date = ?', [habitId, logDate]);
        const habit = await dbGet('SELECT user_id, habit_name FROM habits WHERE habit_id = ?', [habitId]);

        if (status === 'unmarked') {
            await dbRun('DELETE FROM habit_log WHERE habit_id = ? AND date = ?', [habitId, logDate]);
        } else {
            await dbRun(
                `INSERT INTO habit_log (habit_id, date, status, notes) 
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(habit_id, date) 
                 DO UPDATE SET status = excluded.status, notes = excluded.notes`,
                [habitId, logDate, status, notes || null]
            );
        }

        if (status === 'completed' && (!existingLog || existingLog.status !== 'completed') && habit) {
            await dbRun('UPDATE users SET points = COALESCE(points, 0) + 10 WHERE user_id = ?', [habit.user_id]);
            habitAgent.addAgentLog(
                'SYSTEM',
                `+10 XP awarded to user #${habit.user_id} for completing "${habit.habit_name}"`,
                { userId: habit.user_id, pointsAwarded: 10 }
            );
        }

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

app.get('/api/export/csv', async (req, res, next) => {
    try {
        const userId = parseInt(req.query.user_id, 10) || 1;
        const user = await dbGet('SELECT name, email FROM users WHERE user_id = ?', [userId]);

        const rows = await dbQuery(
            `SELECT 
                h.habit_id,
                h.habit_name,
                COALESCE(h.category, 'General') AS category,
                COALESCE(h.priority, 'Medium') AS priority,
                COALESCE(h.target_days, 'All') AS target_days,
                COALESCE(h.subtasks, '') AS subtasks,
                h.reminder_time,
                h.created_date,
                COALESCE(s.current_streak, 0) AS current_streak,
                COALESCE(s.longest_streak, 0) AS longest_streak,
                l.date AS log_date,
                l.status AS log_status,
                COALESCE(l.notes, '') AS log_notes
             FROM habits h
             LEFT JOIN streaks s ON h.habit_id = s.habit_id
             LEFT JOIN habit_log l ON h.habit_id = l.habit_id
             WHERE h.user_id = ?
             ORDER BY h.habit_id ASC, l.date DESC`,
            [userId]
        );

        let csvContent = 'Habit ID,Habit Name,Category,Priority,Target Days,Sub-tasks,Reminder Time,Created Date,Current Streak,Longest Streak,Log Date,Status,Notes\n';

        rows.forEach(r => {
            const nameEscaped = `"${(r.habit_name || '').replace(/"/g, '""')}"`;
            const subtasksEscaped = `"${(r.subtasks || '').replace(/"/g, '""')}"`;
            const notesEscaped = `"${(r.log_notes || '').replace(/"/g, '""')}"`;
            csvContent += `${r.habit_id},${nameEscaped},${r.category},${r.priority},${r.target_days},${subtasksEscaped},${r.reminder_time},${r.created_date},${r.current_streak},${r.longest_streak},${r.log_date || 'N/A'},${r.log_status || 'unmarked'},${notesEscaped}\n`;
        });

        const filename = `habit_report_${(user ? user.name : 'user').replace(/\s+/g, '_').toLowerCase()}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.status(200).send(csvContent);
    } catch (err) {
        next(err);
    }
});

app.get('/api/agent/logs', (req, res) => {
    res.json({
        success: true,
        data: habitAgent.getAgentLogs()
    });
});

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

initDb()
    .then(async () => {
        await habitAgent.recalculateAllStreaks();
        
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
