/** Demo mode: stores the sample Diabetes Companion data on the phone (IndexedDB). */
import { generateDemoData } from '@/lib/demo/diabetes';
import { getDb, type DoseLog } from './db';

export async function loadDemoData(personId: string, now = Date.now()): Promise<void> {
  const db = getDb();
  const data = generateDemoData(personId, now);
  await db.transaction('rw', [db.glucose, db.meals, db.medicines, db.doses, db.checkups], async () => {
    await db.glucose.bulkAdd(data.readings);
    await db.meals.bulkAdd(data.meals);
    const ids = (await db.medicines.bulkAdd(data.plans, { allKeys: true })) as number[];
    await db.doses.bulkAdd(data.doses.map(({ planIndex, ...d }) => ({ ...d, medicineId: ids[planIndex]! }) as DoseLog));
    await db.checkups.bulkPut(data.checkups);
  });
}
