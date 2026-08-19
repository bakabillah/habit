const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'habits.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Initialize database instance
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('[DATABASE ERROR] Failed to connect to SQLite database:', err.message);
    } else {
        console.log('[DATABASE] Connected to SQLite database at:', DB_PATH);
        // Enable Foreign Keys in SQLite
        db.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
            if (pragmaErr) {
                console.error('[DATABASE ERROR] Failed to enable PRAGMA foreign_keys:', pragmaErr.message);
            }
        });
    }
});

/**
 * Execute SQL schema file to setup tables & initial seed data.
 */
function initDb() {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(SCHEMA_PATH)) {
            return reject(new Error(`Schema file not found at ${SCHEMA_PATH}`));
        }

        const sql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
        db.exec(sql, (err) => {
            if (err) {
                console.error('[DATABASE ERROR] Failed to initialize database schema:', err.message);
                return reject(err);
            }
            console.log('[DATABASE] Database schema and seed data initialized successfully.');
            resolve();
        });
    });
}

/**
 * Helper: Query multiple rows (SELECT ...)
 */
function dbQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

/**
 * Helper: Query single row (SELECT ... LIMIT 1)
 */
function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

/**
 * Helper: Run INSERT, UPDATE, DELETE statements
 * Returns object containing lastID and changes count
 */
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

/**
 * Helper: Raw multi-statement execution
 */
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
