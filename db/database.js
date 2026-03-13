const { Database } = require('node-sqlite3-wasm');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'sales_trainer.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    initSchema();
  }
  return db;
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      title TEXT,
      date INTEGER,
      duration INTEGER,
      attendees TEXT,
      transcript TEXT,
      summary TEXT,
      synced_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS generated_content (
      call_id TEXT PRIMARY KEY,
      scorecard TEXT,
      ideal_script TEXT,
      scorecard_generated_at INTEGER,
      ideal_script_generated_at INTEGER,
      FOREIGN KEY (call_id) REFERENCES calls(id)
    )
  `);
}

module.exports = { getDb };
