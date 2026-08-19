const { dbQuery, dbGet, dbRun } = require('./database');

// In-memory ring buffer for live Agent Activity Feed
const agentLogs = [];
const MAX_LOGS = 100;

/**
 * Add a structured event log to the Agent Activity Log
 */
function addAgentLog(type, message, metadata = {}) {
    const logEntry = {
        id: Date.now() + Math.random().toString(36).substr(2, 4),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        type: type.toUpperCase(),
        message,
        metadata
    };

    agentLogs.unshift(logEntry);
    if (agentLogs.length > MAX_LOGS) {
        agentLogs.pop();
    }

    console.log(`[HABIT-AGENT ${logEntry.type}] [${logEntry.timestamp}] ${message}`);
    return logEntry;
}

/**
 * Helper: Format Date object to YYYY-MM-DD in local time
 */
function formatDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Helper: Add/subtract days from YYYY-MM-DD string
 */
function getOffsetDate(dateStr, offsetDays) {
    const parts = dateStr.split('-');
    const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    dt.setDate(dt.getDate() + offsetDays);
    return formatDate(dt);
}

/**
 * Core Automation Logic 1: Recalculate Streaks for a single Habit
 */
async function recalculateStreak(habitId) {
    try {
        const habit = await dbGet('SELECT habit_name FROM habits WHERE habit_id = ?', [habitId]);
        if (!habit) {
            console.warn(`[HABIT-AGENT] Habit ID ${habitId} not found for streak calculation.`);
            return null;
        }

        const logs = await dbQuery(
            'SELECT date, status FROM habit_log WHERE habit_id = ? ORDER BY date ASC',
            [habitId]
        );

        const completedDates = new Set(
            logs.filter(l => l.status === 'completed').map(l => l.date)
        );

        const sortedCompletedDates = Array.from(completedDates).sort();

        // 1. Calculate Longest Consecutive Streak in log history
        let longestStreak = 0;
        let runningStreak = 0;
        let prevDateStr = null;

        for (const dateStr of sortedCompletedDates) {
            if (!prevDateStr) {
                runningStreak = 1;
            } else {
                const expectedNext = getOffsetDate(prevDateStr, 1);
                if (dateStr === expectedNext) {
                    runningStreak++;
                } else {
                    runningStreak = 1;
                }
            }
            if (runningStreak > longestStreak) {
                longestStreak = runningStreak;
            }
            prevDateStr = dateStr;
        }

        // 2. Calculate Current Active Streak
        const today = formatDate(new Date());
        const yesterday = getOffsetDate(today, -1);

        let currentStreak = 0;
        let checkDate = null;

        if (completedDates.has(today)) {
            checkDate = today;
        } else if (completedDates.has(yesterday)) {
            checkDate = yesterday;
        } else if (sortedCompletedDates.length > 0) {
            const latestCompleted = sortedCompletedDates[sortedCompletedDates.length - 1];
            checkDate = latestCompleted;
        }

        if (checkDate) {
            while (completedDates.has(checkDate)) {
                currentStreak++;
                checkDate = getOffsetDate(checkDate, -1);
            }
        }

        if (currentStreak > longestStreak) {
            longestStreak = currentStreak;
        }

        // Update streaks table
        const existingStreak = await dbGet('SELECT * FROM streaks WHERE habit_id = ?', [habitId]);
        if (existingStreak) {
            if (existingStreak.longest_streak > longestStreak) {
                longestStreak = existingStreak.longest_streak;
            }
            await dbRun(
                'UPDATE streaks SET current_streak = ?, longest_streak = ? WHERE habit_id = ?',
                [currentStreak, longestStreak, habitId]
            );
        } else {
            await dbRun(
                'INSERT INTO streaks (habit_id, current_streak, longest_streak) VALUES (?, ?, ?)',
                [habitId, currentStreak, longestStreak]
            );
        }

        addAgentLog(
            'STREAK',
            `Recalculated streak for "${habit.habit_name}" (ID: ${habitId}) -> Current: ${currentStreak} day(s), Longest: ${longestStreak} day(s)`,
            { habitId, habitName: habit.habit_name, currentStreak, longestStreak }
        );

        return { habitId, currentStreak, longestStreak };
    } catch (err) {
        console.error(`[HABIT-AGENT ERROR] Streak calculation failed for habit ${habitId}:`, err.message);
        throw err;
    }
}

/**
 * Recalculate streaks for all existing habits in database.
 */
async function recalculateAllStreaks() {
    const habits = await dbQuery('SELECT habit_id FROM habits');
    for (const h of habits) {
        await recalculateStreak(h.habit_id);
    }
}

/**
 * Core Automation Logic 2: Scheduled Reminders Worker
 */
async function checkScheduledReminders() {
    try {
        const now = new Date();
        const currentHours = String(now.getHours()).padStart(2, '0');
        const currentMinutes = String(now.getMinutes()).padStart(2, '0');
        const currentTimeHHMM = `${currentHours}:${currentMinutes}`;

        const matchingHabits = await dbQuery(
            `SELECT h.habit_id, h.habit_name, h.reminder_time, u.name as user_name, u.email
             FROM habits h
             JOIN users u ON h.user_id = u.user_id
             WHERE h.reminder_time = ?`,
            [currentTimeHHMM]
        );

        if (matchingHabits.length > 0) {
            for (const h of matchingHabits) {
                const message = `🔔 PUSH NOTIFICATION SIMULATION -> To: ${h.user_name} (${h.email}) | Habit: "${h.habit_name}" scheduled for ${h.reminder_time}`;
                addAgentLog('REMINDER', message, {
                    habitId: h.habit_id,
                    habitName: h.habit_name,
                    reminderTime: h.reminder_time,
                    recipient: h.email
                });
            }
        }
    } catch (err) {
        console.error('[HABIT-AGENT ERROR] Reminder worker error:', err.message);
    }
}

let workerIntervalId = null;

function startBackgroundWorker() {
    if (workerIntervalId) return;

    addAgentLog('SYSTEM', 'Habit Automation Agent background reminder worker started [Interval: 60s].');

    checkScheduledReminders();

    workerIntervalId = setInterval(() => {
        checkScheduledReminders();
    }, 60000);
}

function getAgentLogs() {
    return agentLogs;
}

module.exports = {
    addAgentLog,
    recalculateStreak,
    recalculateAllStreaks,
    checkScheduledReminders,
    startBackgroundWorker,
    getAgentLogs
};
