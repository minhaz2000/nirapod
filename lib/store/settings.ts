import { getDb, type Settings } from './db';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  glucoseUnit: 'mmol',
  demoMode: false,
};

export async function getSettings(): Promise<Settings> {
  return (await getDb().settings.get('settings')) ?? DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  const next: Settings = { ...(await getSettings()), ...patch, id: 'settings' };
  await getDb().settings.put(next);
  return next;
}

/** "Delete all my data": wipes the whole IndexedDB database. */
export async function deleteAllData(): Promise<void> {
  const db = getDb();
  await db.delete();
  await db.open();
}
