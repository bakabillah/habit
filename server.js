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

function getTodayDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

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

/**
 * Helper: Ensure userId exists in users table to prevent Foreign Key Constraint errors
 */
async function ensureValidUserId(reqUserId) {
    let userId = parseInt(reqUserId, 10) || 1;
    const existingUser = await dbGet('SELECT user_id FROM users WHERE user_id = ?', [userId]);
    if (existingUser) return userId;

    const firstUser = await dbGet('SELECT user_id FROM users ORDER BY user_id ASC LIMIT 1');
    if (firstUser) return firstUser.user_id;

    const newUserResult = await dbRun(
        'INSERT INTO users (name, email, password, points, streak_freezes) VALUES (?, ?, ?, 0, 2)',
        ['Default Student', 'student@university.edu', 'academic2026']
    );
    return newUserResult.lastID;
}

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
        { id: 'first_step', title: 'First Step', icon: '🌱', description: 'Completed your first habit', unlocked: points >= 10 },
        { id: 'streak_7', title: '7-Day Streak Master', icon: '🔥', description: 'Maintained a 7-day streak', unlocked: maxStreak >= 7 },
        { id: 'streak_30', title: '30-Day Legend', icon: '🏆', description: 'Achieved a 30-day streak milestone', unlocked: maxStreak >= 30 },
        { id: 'habit_architect', title: 'Habit Architect', icon: '📋', description: 'Created 5 or more active habits', unlocked: totalHabitsCount >= 5 },
        { id: 'level_3', title: 'Level 3 Achiever', icon: '⚡', description: 'Reached User Level 3', unlocked: level >= 3 },
        { id: 'perfect_day', title: 'Perfect Day', icon: '💯', description: '100% completion rate on habits today', unlocked: completionRate === 100 && totalHabitsCount > 0 }
    ];

    return { points, level, xpCurrent, xpNeeded, badges };
}

// AI Habit Coach Advisor Engine
function generateAICoachAdvice(userName, completionRate, totalHabits, bestStreak) {
    if (totalHabits === 0) {
        return `Hello ${userName}! Welcome to your Smart Habit Tracker. You can ask the AI Assistant below to auto-create habits for you! 🚀`;
    }
    if (completionRate === 100) {
        return `Outstanding work today, ${userName}! You've hit a 100% completion rate! 🔥 Keep this incredible momentum going!`;
    }
    if (completionRate >= 50) {
        return `Great progress today, ${userName}! You are at ${completionRate}% completion. Just a few more habits left to achieve a Perfect Day! 💪`;
    }
    return `Stay focused, ${userName}! Building consistency takes small daily steps. Ask the AI Assistant below for tips or auto-creating habits! ⚡`;
}

// ==========================================
// AUTHENTICATION & USER PROFILE APIs
// ==========================================

app.post('/api/auth/register', async (req, res, next) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !name.trim() || !email || !email.trim() || !password) {
            return res.status(400).json({ success: false, error: 'All fields (name, email, password) are required.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existing = await dbGet('SELECT user_id FROM users WHERE email = ?', [normalizedEmail]);
        if (existing) {
            return res.status(409).json({ success: false, error: 'An account with this email address already exists.' });
        }

        const result = await dbRun(
            'INSERT INTO users (name, email, password, points, streak_freezes) VALUES (?, ?, ?, 0, 2)',
            [name.trim(), normalizedEmail, password]
        );

        const newUser = { user_id: result.lastID, name: name.trim(), email: normalizedEmail, points: 0, streak_freezes: 2 };
        res.status(201).json({ success: true, message: 'User registered successfully.', user: newUser });
    } catch (err) { next(err); }
});

app.post('/api/auth/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const user = await dbGet('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

        if (!user || user.password !== password) {
            return res.status(401).json({ success: false, error: 'Invalid email or password.' });
        }

        const userData = { user_id: user.user_id, name: user.name, email: user.email, points: user.points || 0, streak_freezes: user.streak_freezes || 2 };
        res.json({ success: true, message: 'Login successful.', user: userData });
    } catch (err) { next(err); }
});

app.post('/api/auth/profile', async (req, res, next) => {
    try {
        const { user_id, name, email, password } = req.body;
        if (!user_id || !name || !name.trim() || !email || !email.trim()) {
            return res.status(400).json({ success: false, error: 'User ID, name, and email are required.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existing = await dbGet('SELECT user_id FROM users WHERE email = ? AND user_id != ?', [normalizedEmail, user_id]);
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email is already in use by another user.' });
        }

        if (password && password.trim()) {
            await dbRun('UPDATE users SET name = ?, email = ?, password = ? WHERE user_id = ?', [name.trim(), normalizedEmail, password.trim(), user_id]);
        } else {
            await dbRun('UPDATE users SET name = ?, email = ? WHERE user_id = ?', [name.trim(), normalizedEmail, user_id]);
        }

        const updatedUser = await dbGet('SELECT user_id, name, email, points, streak_freezes FROM users WHERE user_id = ?', [user_id]);
        res.json({ success: true, message: 'Profile updated successfully.', user: updatedUser });
    } catch (err) { next(err); }
});

// ==========================================
// REAL AI ASSISTANT API (AUTO-CREATE & SUGGESTIONS)
// ==========================================

app.post('/api/ai/assistant', async (req, res, next) => {
    try {
        const { prompt, user_id } = req.body;
        const userId = await ensureValidUserId(user_id);
        const today = getTodayDateString();

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ success: false, error: 'Prompt text is required.' });
        }

        const text = prompt.trim().toLowerCase();

        // 1. Check if user wants to create/add a habit
        if (text.includes('create') || text.includes('add') || text.includes('make') || text.includes('new habit') || text.includes('kor') || text.includes('বানাও') || text.includes('করো')) {
            let habitName = 'Daily Focus Habit';
            let category = 'General';
            let priority = 'Medium';
            let time = '08:00';
            let subtasks = null;

            if (text.includes('read') || text.includes('study') || text.includes('book') || text.includes('read 30 mins')) {
                habitName = 'Read 30 Minutes Daily';
                category = 'Academic';
                priority = 'High';
                time = '20:00';
                subtasks = 'Read Chapter 1, Highlight key points';
            } else if (text.includes('water') || text.includes('drink')) {
                habitName = 'Drink 3 Liters Water Daily';
                category = 'Health';
                priority = 'High';
                time = '09:00';
                subtasks = '1L Morning, 1L Afternoon, 1L Evening';
            } else if (text.includes('exercise') || text.includes('workout') || text.includes('gym')) {
                habitName = '30-Min Workout & Stretching';
                category = 'Health';
                priority = 'High';
                time = '18:00';
                subtasks = '15-min Cardio, 15-min Core Workout';
            } else if (text.includes('code') || text.includes('programming') || text.includes('algorithm')) {
                habitName = '2 Hours Coding & Problem Solving';
                category = 'Productivity';
                priority = 'High';
                time = '15:00';
                subtasks = 'Solve 1 LeetCode problem, Review code';
            } else if (text.includes('meditate') || text.includes('mindfulness')) {
                habitName = '10-Min Morning Meditation';
                category = 'Health';
                priority = 'Medium';
                time = '07:30';
            } else {
                const cleaned = prompt.replace(/(create|add|make|habit|new habit|for me|a|an)/gi, '').trim();
                if (cleaned.length > 2) {
                    habitName = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
                }
            }

            const result = await dbRun(
                'INSERT INTO habits (user_id, habit_name, reminder_time, created_date, category, priority, target_days, target_quantity, subtasks) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [userId, habitName, time, today, category, priority, 'All', subtasks]
            );

            await dbRun('INSERT INTO streaks (habit_id, current_streak, longest_streak) VALUES (?, 0, 0)', [result.lastID]);

            return res.json({
                success: true,
                created: true,
                habit: { habit_id: result.lastID, habit_name: habitName },
                reply: `🎉 **AI Assistant**: I have automatically created the habit **"${habitName}"** in your workspace under category **"${category}"** (Priority: ${priority}, Time: ${time})!`
            });
        }

        // 2. Suggestions intent
        if (text.includes('suggest') || text.includes('recommend') || text.includes('idea') || text.includes('cs') || text.includes('student')) {
            return res.json({
                success: true,
                created: false,
                reply: `🤖 **AI Assistant Suggestions for You**:\n1. 💻 **2 Hours LeetCode/Coding**: Practice algorithms daily.\n2. 📚 **Read SAD & Architecture Notes**: 30 mins before sleep.\n3. 💧 **Drink 3L Water**: Stay hydrated while studying.\n4. 🏋️ **45-Min Gym/Cardio**: Maintain physical health.\n\n👉 *Say "Create coding habit" or "Create water habit" and I will auto-add it for you!*`
            });
        }

        // 3. General AI Chat Response
        res.json({
            success: true,
            created: false,
            reply: `🤖 **AI Assistant**: I can automatically create habits for you or give personalized suggestions! Try saying: *"Create a habit to read 30 mins every day"* or *"Suggest computer science habits"*`
        });

    } catch (err) { next(err); }
});

// ==========================================
// REST API ENDPOINTS
// ==========================================

app.get('/api/leaderboard', async (req, res, next) => {
    try {
        const users = await dbQuery(
            `SELECT u.user_id, u.name, u.email, COALESCE(u.points, 0) AS points,
                    COALESCE(MAX(s.current_streak), 0) AS best_streak
             FROM users u
             LEFT JOIN habits h ON u.user_id = h.user_id
             LEFT JOIN streaks s ON h.habit_id = s.habit_id
             GROUP BY u.user_id
             ORDER BY u.points DESC, best_streak DESC`
        );

        const leaderboard = users.map((u, index) => ({
            rank: index + 1,
            user_id: u.user_id,
            name: u.name,
            points: u.points,
            level: Math.floor(u.points / 100) + 1,
            best_streak: u.best_streak
        }));

        res.json({ success: true, data: leaderboard });
    } catch (err) { next(err); }
});

app.get('/api/dashboard', async (req, res, next) => {
    try {
        const userId = await ensureValidUserId(req.query.user_id);
        const offset = parseInt(req.query.offset, 10) || 0;
        const today = getTodayDateString();
        const past7Days = getPastNDays(7, offset);

        const user = await dbGet('SELECT user_id, name, email, points, streak_freezes FROM users WHERE user_id = ?', [userId]);

        const habitsWithStreaks = await dbQuery(
            `SELECT 
                h.habit_id, h.habit_name, h.reminder_time, h.created_date,
                COALESCE(h.category, 'General') AS category,
                COALESCE(h.priority, 'Medium') AS priority,
                COALESCE(h.target_days, 'All') AS target_days,
                COALESCE(h.target_quantity, 1) AS target_quantity,
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
                `SELECT habit_id, date, status, notes, current_quantity, photo_url 
                 FROM habit_log 
                 WHERE habit_id IN (${habitPlaceholders}) AND date IN (${datePlaceholders})`,
                [...habitIds, ...past7Days]
            );
        }

        const logsMap = {};
        logs.forEach(l => {
            logsMap[`${l.habit_id}_${l.date}`] = { 
                status: l.status, 
                notes: l.notes || '', 
                current_quantity: l.current_quantity || 1,
                photo_url: l.photo_url || null 
            };
        });

        let totalHabits = habitsWithStreaks.length;
        let todayCompletedCount = 0;
        let bestActiveStreakHabit = null;
        let maxStreakValue = -1;

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
            return { date: dateStr, dayName, completedCount: completedOnDate, totalHabits, completionRate: rate };
        });

        const detailedHabits = habitsWithStreaks.map(h => {
            const todayLog = logsMap[`${h.habit_id}_${today}`] || { status: 'unmarked', notes: '', current_quantity: 0, photo_url: null };
            if (todayLog.status === 'completed') {
                todayCompletedCount++;
            }

            if (h.current_streak > maxStreakValue) {
                maxStreakValue = h.current_streak;
                bestActiveStreakHabit = { habit_id: h.habit_id, habit_name: h.habit_name, current_streak: h.current_streak };
            }

            const weeklyLogs = past7Days.map(date => {
                const logInfo = logsMap[`${h.habit_id}_${date}`] || { status: 'unmarked', notes: '', current_quantity: 0, photo_url: null };
                return { date, status: logInfo.status, notes: logInfo.notes, current_quantity: logInfo.current_quantity, photo_url: logInfo.photo_url };
            });

            return { ...h, today_status: todayLog.status, today_notes: todayLog.notes, weekly_logs: weeklyLogs };
        });

        const completionRate = totalHabits > 0 ? Math.round((todayCompletedCount / totalHabits) * 100) : 0;
        const gamification = getGamificationData(user, habitsWithStreaks, completionRate);
        const aiAdvice = generateAICoachAdvice(user ? user.name : 'User', completionRate, totalHabits, maxStreakValue);

        res.json({
            success: true,
            data: {
                user: user || { user_id: userId, name: 'User', email: '', points: 0, streak_freezes: 2 },
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
                gamification,
                aiAdvice,
                habits: detailedHabits
            }
        });
    } catch (err) { next(err); }
});

app.post('/api/habits', async (req, res, next) => {
    try {
        const { habit_name, reminder_time, category, priority, target_days, target_quantity, subtasks, user_id } = req.body;
        const userId = await ensureValidUserId(user_id);
        const today = getTodayDateString();

        if (!habit_name || !habit_name.trim()) {
            return res.status(400).json({ success: false, error: 'Habit name is required.' });
        }

        const catToSave = category || 'General';
        const priorityToSave = priority || 'Medium';
        const targetDaysToSave = target_days || 'All';
        const targetQtyToSave = parseInt(target_quantity, 10) || 1;
        const timeToSave = reminder_time || '09:00';

        const result = await dbRun(
            'INSERT INTO habits (user_id, habit_name, reminder_time, created_date, category, priority, target_days, target_quantity, subtasks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, habit_name.trim(), timeToSave, today, catToSave, priorityToSave, targetDaysToSave, targetQtyToSave, subtasks || null]
        );

        const newHabitId = result.lastID;
        await dbRun('INSERT INTO streaks (habit_id, current_streak, longest_streak) VALUES (?, 0, 0)', [newHabitId]);

        res.status(201).json({
            success: true,
            message: 'Habit created successfully',
            data: { habit_id: newHabitId, habit_name: habit_name.trim(), reminder_time: timeToSave, created_date: today, category: catToSave, priority: priorityToSave, target_days: targetDaysToSave, target_quantity: targetQtyToSave, user_id: userId }
        });
    } catch (err) { next(err); }
});

app.delete('/api/habits/:id', async (req, res, next) => {
    try {
        const habitId = req.params.id;
        await dbRun('DELETE FROM habits WHERE habit_id = ?', [habitId]);
        res.json({ success: true, message: `Habit ${habitId} deleted successfully.` });
    } catch (err) { next(err); }
});

app.post('/api/habits/:id/log', async (req, res, next) => {
    try {
        const habitId = parseInt(req.params.id, 10);
        const { date, status, notes, current_quantity } = req.body;
        const logDate = date || getTodayDateString();
        const qty = parseInt(current_quantity, 10) || 1;

        if (status === 'unmarked') {
            await dbRun('DELETE FROM habit_log WHERE habit_id = ? AND date = ?', [habitId, logDate]);
        } else {
            await dbRun(
                `INSERT INTO habit_log (habit_id, date, status, notes, current_quantity) 
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(habit_id, date) 
                 DO UPDATE SET status = excluded.status, notes = excluded.notes, current_quantity = excluded.current_quantity`,
                [habitId, logDate, status, notes || null, qty]
            );
        }

        const habit = await dbGet('SELECT user_id, habit_name FROM habits WHERE habit_id = ?', [habitId]);
        if (status === 'completed' && habit) {
            await dbRun('UPDATE users SET points = COALESCE(points, 0) + 10 WHERE user_id = ?', [habit.user_id]);
        }

        const streakResult = await habitAgent.recalculateStreak(habitId);
        res.json({ success: true, message: `Habit updated`, data: streakResult });
    } catch (err) { next(err); }
});

app.get('/api/export/pdf', async (req, res, next) => {
    try {
        const userId = await ensureValidUserId(req.query.user_id);
        const user = await dbGet('SELECT name, email, points FROM users WHERE user_id = ?', [userId]);

        const habits = await dbQuery(
            `SELECT h.habit_name, COALESCE(h.category, 'General') as category, h.reminder_time,
                    COALESCE(s.current_streak, 0) as current_streak, COALESCE(s.longest_streak, 0) as longest_streak
             FROM habits h
             LEFT JOIN streaks s ON h.habit_id = s.habit_id
             WHERE h.user_id = ?`,
            [userId]
        );

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Habit Tracking Summary Report - ${user ? user.name : 'User'}</title>
                <style>
                    body { font-family: sans-serif; padding: 2rem; color: #0f172a; }
                    h1 { color: #2563eb; font-size: 1.8rem; }
                    .header-box { border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem; margin-bottom: 1.5rem; }
                    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
                    th, td { border: 1px solid #cbd5e1; padding: 0.6rem; text-align: left; }
                    th { background-color: #f8fafc; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="header-box">
                    <h1>Smart Habit Tracking System - Summary Report</h1>
                    <p><strong>Student Name:</strong> ${user ? user.name : 'User'} | <strong>Email:</strong> ${user ? user.email : ''}</p>
                    <p><strong>Generated Date:</strong> ${new Date().toLocaleDateString()} | <strong>Total XP Points:</strong> ${user ? user.points : 0}</p>
                </div>
                <h3>Active Habits & Streak Progress Summary</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Habit Name</th>
                            <th>Category</th>
                            <th>Reminder</th>
                            <th>Current Streak</th>
                            <th>Longest Streak</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${habits.map(h => `
                            <tr>
                                <td>${h.habit_name}</td>
                                <td>${h.category}</td>
                                <td>${h.reminder_time}</td>
                                <td>${h.current_streak} days</td>
                                <td>${h.longest_streak} days</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <script>window.onload = function() { window.print(); };</script>
            </body>
            </html>
        `;

        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(htmlContent);
    } catch (err) { next(err); }
});

app.get('/api/export/csv', async (req, res, next) => {
    try {
        const userId = await ensureValidUserId(req.query.user_id);
        const user = await dbGet('SELECT name FROM users WHERE user_id = ?', [userId]);

        const rows = await dbQuery(
            `SELECT h.habit_id, h.habit_name, COALESCE(h.category, 'General') AS category, h.reminder_time,
                    COALESCE(s.current_streak, 0) AS current_streak, COALESCE(s.longest_streak, 0) AS longest_streak,
                    l.date AS log_date, l.status AS log_status, COALESCE(l.notes, '') AS log_notes
             FROM habits h
             LEFT JOIN streaks s ON h.habit_id = s.habit_id
             LEFT JOIN habit_log l ON h.habit_id = l.habit_id
             WHERE h.user_id = ?`,
            [userId]
        );

        let csvContent = 'Habit ID,Habit Name,Category,Reminder Time,Current Streak,Longest Streak,Log Date,Status,Notes\n';
        rows.forEach(r => {
            csvContent += `${r.habit_id},"${(r.habit_name||'').replace(/"/g,'""')}",${r.category},${r.reminder_time},${r.current_streak},${r.longest_streak},${r.log_date||'N/A'},${r.log_status||'unmarked'},"${(r.log_notes||'').replace(/"/g,'""')}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="habit_report_${(user?user.name:'user').replace(/\s+/g,'_')}.csv"`);
        res.send(csvContent);
    } catch (err) { next(err); }
});

app.use((err, req, res, next) => {
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

initDb().then(async () => {
    await habitAgent.recalculateAllStreaks();
    if (!process.env.VERCEL) {
        habitAgent.startBackgroundWorker();
        app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
    }
});

module.exports = app;
