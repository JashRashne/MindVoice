import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("mindvoice.db");
  await initializeSchema();
  return db;
}

async function initializeSchema() {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      name TEXT DEFAULT 'New Chat',
      created_at INTEGER NOT NULL,
      last_message_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      text TEXT NOT NULL,
      sender TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id)
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      chunk_text TEXT NOT NULL,
      vector TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id)
    );
  `);
}

// ─── Chats ────────────────────────────────────────────────────

export async function createChat(): Promise<string> {
  const db = await getDatabase();
  const id = Date.now().toString();
  const now = Date.now();
  await db.runAsync(
    "INSERT INTO chats (id, name, created_at, last_message_at) VALUES (?, ?, ?, ?)",
    [id, "New Chat", now, now],
  );
  return id;
}

export async function getAllChats() {
  const db = await getDatabase();
  return await db.getAllAsync<{
    id: string;
    name: string;
    created_at: number;
    last_message_at: number;
  }>("SELECT * FROM chats ORDER BY last_message_at DESC");
}

export async function updateChatName(chatId: string, name: string) {
  const db = await getDatabase();
  await db.runAsync("UPDATE chats SET name = ? WHERE id = ?", [name, chatId]);
}

export async function deleteChat(chatId: string) {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM messages WHERE chat_id = ?", [chatId]);
  await db.runAsync("DELETE FROM embeddings WHERE chat_id = ?", [chatId]);
  await db.runAsync("DELETE FROM chats WHERE id = ?", [chatId]);
}

// ─── Messages ─────────────────────────────────────────────────

export async function saveMessage(
  chatId: string,
  text: string,
  sender: "user" | "ai",
) {
  const db = await getDatabase();
  const id = Date.now().toString() + Math.random().toString(36).slice(2);
  const now = Date.now();
  await db.runAsync(
    "INSERT INTO messages (id, chat_id, text, sender, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, chatId, text, sender, now],
  );
  await db.runAsync("UPDATE chats SET last_message_at = ? WHERE id = ?", [
    now,
    chatId,
  ]);
  return id;
}

export async function getMessages(chatId: string) {
  const db = await getDatabase();
  return await db.getAllAsync<{
    id: string;
    chat_id: string;
    text: string;
    sender: string;
    created_at: number;
  }>("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC", [
    chatId,
  ]);
}

// ─── Embeddings ───────────────────────────────────────────────

export async function saveEmbedding(
  chatId: string,
  chunkText: string,
  vector: number[],
) {
  const db = await getDatabase();
  const id = Date.now().toString() + Math.random().toString(36).slice(2);
  await db.runAsync(
    "INSERT INTO embeddings (id, chat_id, chunk_text, vector, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, chatId, chunkText, JSON.stringify(vector), Date.now()],
  );
}

export async function getEmbeddings(chatId: string) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    chat_id: string;
    chunk_text: string;
    vector: string;
  }>("SELECT * FROM embeddings WHERE chat_id = ?", [chatId]);
  return rows.map((row) => ({
    ...row,
    vector: JSON.parse(row.vector) as number[],
  }));
}
