import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/store/db';
import { deleteAllData, getSettings, updateSettings } from '@/lib/store/settings';

describe('on-device store', () => {
  it('saves settings and "Delete all my data" wipes everything', async () => {
    await updateSettings({ glucoseUnit: 'mgdl', demoMode: true });
    await getDb().glucose.add({ takenAt: Date.now(), mmol: 6.1 });
    expect((await getSettings()).glucoseUnit).toBe('mgdl');
    expect(await getDb().glucose.count()).toBe(1);

    await deleteAllData();

    expect(await getDb().glucose.count()).toBe(0);
    expect(await getSettings()).toMatchObject({ glucoseUnit: 'mmol', demoMode: false });
  });
});
