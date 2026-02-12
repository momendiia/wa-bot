import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

const adapter = new JSONFile("db.json");
const db = new Low(adapter, { users: {} });

export async function initDB() {
  await db.read();
  db.data ||= { users: {} };
  await db.write();
}

export async function getUser(phone) {
  await db.read();
  db.data ||= { users: {} };

  if (!db.data.users[phone]) {
    db.data.users[phone] = {
      step: "start",
      plan: null,
      email: null,
      finished: false,
      updatedAt: Date.now(),
    };
    await db.write();
  }

  return db.data.users[phone];
}

export async function updateUser(phone, updates) {
  await db.read();
  db.data ||= { users: {} };

  db.data.users[phone] = {
    ...(db.data.users[phone] || {}),
    ...updates,
    updatedAt: Date.now(),
  };

  await db.write();
  return db.data.users[phone];
}

export async function resetUser(phone) {
  await db.read();
  db.data ||= { users: {} };

  db.data.users[phone] = {
    step: "start",
    plan: null,
    email: null,
    finished: false,
    updatedAt: Date.now(),
  };

  await db.write();
  return db.data.users[phone];
}
