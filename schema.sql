-- System Analysis & Design (SAD) - Smart Habit Tracking System
-- Database DDL & Seed Script

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    points INTEGER DEFAULT 0
);

-- 2. Habits Table
CREATE TABLE IF NOT EXISTS habits (
    habit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    habit_name TEXT NOT NULL,
    reminder_time TEXT NOT NULL, -- HH:MM (24h format)
    created_date TEXT NOT NULL,  -- YYYY-MM-DD
    category TEXT DEFAULT 'General',
    priority TEXT DEFAULT 'Medium',
    target_days TEXT DEFAULT 'All',
    subtasks TEXT DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 3. Habit Log Table
CREATE TABLE IF NOT EXISTS habit_log (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    date TEXT NOT NULL,         -- YYYY-MM-DD
    status TEXT CHECK(status IN ('completed', 'incomplete')),
    notes TEXT DEFAULT NULL,
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
INSERT OR IGNORE INTO users (user_id, name, email, password, points) VALUES 
(1, 'Alex Mercer (Student)', 'alex.mercer@university.edu', 'academic2026', 150),
(3, 'Billah Khan (Student)', 'billah@gmail.com', '123', 240);

-- Seed Habits for User #1
INSERT OR IGNORE INTO habits (habit_id, user_id, habit_name, reminder_time, created_date, category, priority, target_days) VALUES 
(1, 1, 'Morning Meditation & Mindfulness', '08:00', '2026-08-01', 'Health', 'High', 'All'),
(2, 1, 'Read 20 Pages of SAD Textbook', '20:30', '2026-08-01', 'Academic', 'High', 'All'),
(3, 1, 'Daily 30-Min Algorithm Practice', '15:00', '2026-08-01', 'Productivity', 'Medium', 'All'),
(4, 1, 'Drink 2.5L Water Daily', '09:30', '2026-08-01', 'Health', 'Medium', 'All'),
(5, 1, 'Evening 45-Min Workout & Stretching', '18:30', '2026-08-01', 'Health', 'High', 'All'),
(6, 1, 'Review System Architecture Lecture Notes', '14:00', '2026-08-01', 'Academic', 'Medium', 'All'),
(7, 1, 'No Social Media Before 10 AM', '07:30', '2026-08-01', 'Personal', 'Low', 'All');

-- Seed Habits for User #3 (Billah)
INSERT OR IGNORE INTO habits (habit_id, user_id, habit_name, reminder_time, created_date, category, priority, target_days) VALUES 
(9, 3, 'Deep Work: 2 Hours Coding Practice', '10:00', '2026-08-01', 'Productivity', 'High', 'All'),
(10, 3, 'Read Machine Learning Papers', '16:30', '2026-08-01', 'Academic', 'High', 'All'),
(11, 3, 'Evening Gym & Cardio Workout', '19:00', '2026-08-01', 'Health', 'Medium', 'All'),
(12, 3, 'Drink 3 Liters Water Daily', '09:00', '2026-08-01', 'Health', 'Medium', 'All'),
(13, 3, 'Daily 15-Min Journaling & Planning', '22:00', '2026-08-01', 'Personal', 'Low', 'All');

-- Initial Streak Metrics
INSERT OR IGNORE INTO streaks (habit_id, current_streak, longest_streak) VALUES 
(1, 5, 5),
(2, 1, 2),
(3, 3, 3),
(4, 5, 5),
(5, 4, 4),
(6, 3, 3),
(7, 6, 6),
(9, 6, 6),
(10, 5, 5),
(11, 4, 4),
(12, 7, 7),
(13, 3, 3);
