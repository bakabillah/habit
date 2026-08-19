const { dbQuery, dbGet, dbRun, initDb } = require('./database');
const habitAgent = require('./habitAgent');

async function seedBillah() {
    console.log('Seeding user Billah and dummy habits...');

    // 1. Ensure User Billah exists
    let user = await dbGet('SELECT * FROM users WHERE email = ? OR name LIKE ?', ['billah@university.edu', '%billah%']);
    
    if (!user) {
        const result = await dbRun(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            ['Billah Khan (Student)', 'billah@university.edu', 'billah2026']
        );
        user = { user_id: result.lastID, name: 'Billah Khan (Student)', email: 'billah@university.edu' };
        console.log(`Created user Billah with ID: ${user.user_id}`);
    } else {
        console.log(`Found existing user Billah with ID: ${user.user_id}`);
    }

    const userId = user.user_id;

    // 2. Define dummy habits for Billah
    const habitsToSeed = [
        { name: 'Deep Work: 2 Hours Coding Practice', time: '10:00', logs: ['2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'] },
        { name: 'Read Machine Learning Papers', time: '16:30', logs: ['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'] },
        { name: 'Evening Gym & Cardio Workout', time: '19:00', logs: ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'] },
        { name: 'Drink 3 Liters Water Daily', time: '09:00', logs: ['2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'] },
        { name: 'Daily 15-Min Journaling & Planning', time: '22:00', logs: ['2026-08-11', '2026-08-12', '2026-08-13'] }
    ];

    for (const item of habitsToSeed) {
        // Check if habit already exists
        let habit = await dbGet('SELECT habit_id FROM habits WHERE user_id = ? AND habit_name = ?', [userId, item.name]);
        let habitId;

        if (!habit) {
            const hRes = await dbRun(
                'INSERT INTO habits (user_id, habit_name, reminder_time, created_date) VALUES (?, ?, ?, ?)',
                [userId, item.name, item.time, '2026-08-01']
            );
            habitId = hRes.lastID;

            // Initialize streak row
            await dbRun(
                'INSERT INTO streaks (habit_id, current_streak, longest_streak) VALUES (?, 0, 0)',
                [habitId]
            );
            console.log(`Inserted habit "${item.name}" (ID: ${habitId}) for user Billah.`);
        } else {
            habitId = habit.habit_id;
        }

        // Insert log completion dates
        for (const logDate of item.logs) {
            await dbRun(
                `INSERT INTO habit_log (habit_id, date, status) 
                 VALUES (?, ?, 'completed')
                 ON CONFLICT(habit_id, date) DO UPDATE SET status = 'completed'`,
                [habitId, logDate]
            );
        }

        // Recalculate streak for this habit
        const streakInfo = await habitAgent.recalculateStreak(habitId);
        console.log(`Recalculated streak for "${item.name}": Current = ${streakInfo.currentStreak}d, Max = ${streakInfo.longestStreak}d`);
    }

    console.log(`\nAll dummy habits seeded successfully for user Billah (${user.email})!`);
}

seedBillah().catch(err => {
    console.error('Failed to seed habits for user Billah:', err);
    process.exit(1);
});
