const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

function initDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    balance REAL DEFAULT 0,
                    pending_balance REAL DEFAULT 0,
                    total_invested REAL DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS pix_transactions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    identifier TEXT UNIQUE NOT NULL,
                    sigilopay_transaction_id TEXT,
                    amount REAL NOT NULL,
                    status TEXT DEFAULT 'PENDING',
                    webhook_token TEXT,
                    pix_code TEXT,
                    qr_code_base64 TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    paid_at DATETIME
                )
            `);

            db.run(`
                CREATE TABLE IF NOT EXISTS wallet_history (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    amount REAL NOT NULL,
                    status TEXT DEFAULT 'PENDING',
                    description TEXT,
                    reference_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

module.exports = { db, initDatabase };