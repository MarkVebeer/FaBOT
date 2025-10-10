const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Path to the database file
const dbPath = path.join(__dirname, 'botData.db');

// Initialize the database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');

    // Create tables if they don't exist
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS guilds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          console.error('Error creating guilds table:', err.message);
        } else {
          console.log('Guilds table is ready.');
        }
      });

      db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        guild_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (guild_id) REFERENCES guilds (id)
      )`, (err) => {
        if (err) {
          console.error('Error creating users table:', err.message);
        } else {
          console.log('Users table is ready.');
        }
      });

      db.run(`CREATE TABLE IF NOT EXISTS server_settings (
        server_id TEXT PRIMARY KEY,
        channel_id TEXT,
        welcome_enabled BOOLEAN DEFAULT false,
        farewell_enabled BOOLEAN DEFAULT false,
        welcome_message TEXT,
        farewell_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          console.error('Error creating server_settings table:', err.message);
        } else {
          console.log('Server settings table is ready.');
        }
      });
    });
  }
});

module.exports = db;