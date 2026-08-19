-- System Analysis & Design (SAD) - Smart Habit Tracking System
-- Database DDL & Seed Script

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
);

-- 2. Habits Table
CREATE TABLE IF NOT EXISTS habits (
    habit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    habit_name TEXT NOT NULL,
    reminder_time TEXT NOT NULL, -- HH:MM (24h format)
    created_date TEXT NOT NULL,  -- YYYY-MM-DD
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 3. Habit Log Table
CREATE TABLE IF NOT EXISTS habit_log (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    date TEXT NOT NULL,         -- YYYY-MM-DD
    status TEXT CHECK(status IN ('completed', 'incomplete')),
    UNIQUE(habit_id, date),
    FOREIGN KEY (habit_id) REFERENCES habits(habit_id) ON DELETE CASCADE
);

-- 4. Streaks Table
CREATE TABLE IF NOT EXISTS streaks (
    streak_id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER UNIQUE NOT NULL,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    FOREIGN KEY (habit_id) REFERENCES habits(habit_id) ON DELETE CASCADE
);

-- Initial Seed Users
INSERT OR IGNORE INTO users (user_id, name, email, password) VALUES 
(1, 'Alex Mercer (Student)', 'alex.mercer@university.edu', 'academic2026');

-- Seed Habits for User #1
INSERT OR IGNORE INTO habits (habit_id, user_id, habit_name, reminder_time, created_date) VALUES 
(1, 1, 'Morning Meditation & Mindfulness', '08:00', '2026-08-01'),
(2, 1, 'Read 20 Pages of SAD Textbook', '20:30', '2026-08-01'),
(3, 1, 'Daily 30-Min Algorithm Practice', '15:00', '2026-08-01'),
(4, 1, 'Drink 2.5L Water Daily', '09:30', '2026-08-01'),
(5, 1, 'Evening 45-Min Workout & Stretching', '18:30', '2026-08-01'),
(6, 1, 'Review System Architecture Lecture Notes', '14:00', '2026-08-01'),
(7, 1, 'No Social Media Before 10 AM', '07:30', '2026-08-01');

-- Sample Log Data for past days
INSERT OR IGNORE INTO habit_log (habit_id, date, status) VALUES 
(1, '2026-08-09', 'completed'),
(1, '2026-08-10', 'completed'),
(1, '2026-08-11', 'completed'),
(1, '2026-08-12', 'completed'),
(1, '2026-08-13', 'completed'),

(2, '2026-08-10', 'completed'),
(2, '2026-08-11', 'completed'),
(2, '2026-08-12', 'incomplete'),
(2, '2026-08-13', 'completed'),

(3, '2026-08-11', 'completed'),
(3, '2026-08-12', 'completed'),
(3, '2026-08-13', 'completed'),

(4, '2026-08-09', 'completed'),
(4, '2026-08-10', 'completed'),
(4, '2026-08-11', 'completed'),
(4, '2026-08-12', 'completed'),
(4, '2026-08-13', 'completed'),

(5, '2026-08-10', 'completed'),
(5, '2026-08-11', 'completed'),
(5, '2026-08-12', 'completed'),
(5, '2026-08-13', 'completed'),

(6, '2026-08-11', 'completed'),
(6, '2026-08-12', 'completed'),
(6, '2026-08-13', 'completed'),

(7, '2026-08-08', 'completed'),
(7, '2026-08-09', 'completed'),
(7, '2026-08-10', 'completed'),
(7, '2026-08-11', 'completed'),
(7, '2026-08-12', 'completed'),
(7, '2026-08-13', 'completed');

-- Initial Streak Metrics
INSERT OR IGNORE INTO streaks (habit_id, current_streak, longest_streak) VALUES 
(1, 5, 5),
(2, 1, 2),
(3, 3, 3),
(4, 5, 5),
(5, 4, 4),
(6, 3, 3),
(7, 6, 6);
