import Database from "better-sqlite3";

const db = new Database("bot.db");

// جدول لتخزين حالة كل رقم
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    phone TEXT PRIMARY KEY,
    stage TEXT DEFAULT 'start',
    updated_at INTEGER
  );
`);

export function getStage(phone) {
  const row = db.prepare("SELECT stage FROM users WHERE phone = ?").get(phone);
  return row?.stage || "start";
}

export function setStage(phone, stage) {
  db.prepare(`
    INSERT INTO users (phone, stage, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      stage = excluded.stage,
      updated_at = excluded.updated_at
  `).run(phone, stage, Date.now());
}

export function resetStage(phone) {
  db.prepare("DELETE FROM users WHERE phone = ?").run(phone);
}
