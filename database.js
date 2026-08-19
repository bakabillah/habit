const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// On Vercel serverless environment, local filesystem is read-only, use /tmp for SQLite
const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
const DB_PATH = isVercel ? '/tmp/habits.db' : path.join(__dirname, 'habits.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Initialize database instance
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('[DATABASE ERROR] Failed to connect to SQLite database:', err.message);
    } else {
        console.log('[DATABASE] Connected to SQLite database at:', DB_PATH);
        db.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
            if (pragmaErr) {
                console.error('[DATABASE ERROR] Failed to enable PRAGMA foreign_keys:', pragmaErr.message);
            }
        });
    }
});

/**
 * Execute SQL schema file and run column migrations if needed.
 */
function initDb() {
    return new Promise(async (resolve, reject) => {
        if (!fs.existsSync(SCHEMA_PATH)) {
            return reject(new Error(`Schema file not found at ${SCHEMA_PATH}`));
        }

        try {
            // Run column migrations first on existing tables
            await runMigrations();

            const sql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
            db.exec(sql, (err) => {
                if (err) {
                    console.error('[DATABASE ERROR] Failed to initialize database schema:', err.message);
                    return reject(err);
                }
                console.log('[DATABASE] Database schema, migrations, and seed data ready.');
                resolve();
            });
        } catch (migErr) {
            console.error('[DATABASE ERROR] Initialization failed:', migErr.message);
            reject(migErr);
        }
    });
}

/**
 * Helper: Run ALTER TABLE migrations safely on existing tables
 */
async function runMigrations() {
    // 1. Add points & streak_freezes to users table if missing
    try { await dbRun("ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0"); } catch (e) {}
    try { await dbRun("ALTER TABLE users ADD COLUMN streak_freezes INTEGER DEFAULT 2"); } catch (e) {}

    // 2. Add category, priority, target_days, subtasks, target_quantity to habits
    try { await dbRun("ALTER TABLE habits ADD COLUMN category TEXT DEFAULT 'General'"); } catch (e) {}
    try { await dbRun("ALTER TABLE habits ADD COLUMN priority TEXT DEFAULT 'Medium'"); } catch (e) {}
    try { await dbRun("ALTER TABLE habits ADD COLUMN target_days TEXT DEFAULT 'All'"); } catch (e) {}
    try { await dbRun("ALTER TABLE habits ADD COLUMN subtasks TEXT DEFAULT NULL"); } catch (e) {}
    try { await dbRun("ALTER TABLE habits ADD COLUMN target_quantity INTEGER DEFAULT 1"); } catch (e) {}

    // 3. Add notes, current_quantity, photo_url to habit_log
    try { await dbRun("ALTER TABLE habit_log ADD COLUMN notes TEXT DEFAULT NULL"); } catch (e) {}
    try { await dbRun("ALTER TABLE habit_log ADD COLUMN current_quantity INTEGER DEFAULT 1"); } catch (e) {}
    try { await dbRun("ALTER TABLE habit_log ADD COLUMN photo_url TEXT DEFAULT NULL"); } catch (e) {}
}

function dbQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function dbExec(sql) {
    return new Promise((resolve, reject) => {
        db.exec(sql, (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

module.exports = {
    db,
    initDb,
    dbQuery,
    dbGet,
    dbRun,
    dbExec
};
