/** Nirapod Assistant chat history: IndexedDB on this phone only. */
import { getDb, type ChatMessage } from './db';

const MAX_MESSAGES = 200;

export async function loadChat(): Promise<ChatMessage[]> {
  return getDb().chat.orderBy('at').toArray();
}

export async function addChatMessage(m: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
  const db = getDb();
  const id = await db.chat.add(m as ChatMessage);
  const count = await db.chat.count();
  if (count > MAX_MESSAGES) {
    const old = await db.chat.orderBy('at').limit(count - MAX_MESSAGES).primaryKeys();
    await db.chat.bulkDelete(old);
  }
  return { ...m, id };
}

export async function updateChatMessage(id: number, patch: Partial<ChatMessage>): Promise<void> {
  await getDb().chat.update(id, patch);
}

export async function clearChat(): Promise<void> {
  await getDb().chat.clear();
}
