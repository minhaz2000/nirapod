/** Full care data on the phone (IndexedDB): medicine plans, dose logs, check-ups, reminders, family profiles. */
import { defaultCheckups } from '@/lib/care/checkups';
import { DEFAULT_REMINDERS } from '@/lib/care/reminders';
import { getDb, ME, type Checkup, type DoseLog, type MedicinePlan, type Profile, type ReminderSettings } from './db';
import { updateSettings } from './settings';

// --- medicines -----------------------------------------------------------------------------------------------------

export const listPlans = (personId: string) => getDb().medicines.where('personId').equals(personId).filter((p) => p.active).toArray();

export async function addPlan(plan: Omit<MedicinePlan, 'id'>): Promise<number> {
  return (await getDb().medicines.add(plan as MedicinePlan)) as number;
}

export const updatePlan = (id: number, patch: Partial<MedicinePlan>) => getDb().medicines.update(id, patch);

/** Stops reminders for a plan (kept for the adherence history). */
export const stopPlan = (id: number) => getDb().medicines.update(id, { active: false });

export const doseLogsSince = (personId: string, since: number) =>
  getDb().doses.where('[personId+dueAt]').between([personId, since], [personId, Infinity]).toArray();

/** Marks one scheduled dose as taken or missed (replaces an earlier mark for the same dose). */
export async function markDose(plan: MedicinePlan, dueAt: number, status: DoseLog['status']): Promise<void> {
  const db = getDb();
  const existing = await db.doses.where('[medicineId+dueAt]').equals([plan.id!, dueAt]).first();
  if (existing?.id !== undefined) await db.doses.update(existing.id, { status, recordedAt: Date.now() });
  else await db.doses.add({ personId: plan.personId, medicineId: plan.id!, dueAt, status, recordedAt: Date.now() } as DoseLog);
}

// --- check-ups -----------------------------------------------------------------------------------------------------

export async function listCheckups(personId: string): Promise<Checkup[]> {
  const db = getDb();
  const existing = await db.checkups.where('personId').equals(personId).toArray();
  const missing = defaultCheckups(personId).filter((d) => !existing.some((e) => e.id === d.id));
  if (missing.length) await db.checkups.bulkPut(missing);
  return [...existing, ...missing].sort((a, b) => defaultCheckups(personId).findIndex((d) => d.id === a.id) - defaultCheckups(personId).findIndex((d) => d.id === b.id));
}

export const saveCheckup = (c: Checkup) => getDb().checkups.put(c);

// --- reminders -----------------------------------------------------------------------------------------------------

export async function getReminders(personId: string): Promise<ReminderSettings> {
  return (await getDb().reminders.get(personId)) ?? DEFAULT_REMINDERS(personId);
}

export const saveReminders = (s: ReminderSettings) => getDb().reminders.put(s);

// --- family mode ---------------------------------------------------------------------------------------------------

export async function listPeople(): Promise<Profile[]> {
  const db = getDb();
  if (!(await db.profile.get(ME))) await db.profile.put({ id: ME, createdAt: Date.now() });
  return (await db.profile.toArray()).sort((a, b) => (a.id === ME ? -1 : b.id === ME ? 1 : a.createdAt - b.createdAt));
}

export async function addPerson(name: string, relation: string): Promise<string> {
  const id = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await getDb().profile.put({ id, name: name.trim().slice(0, 40), relation: relation.trim().slice(0, 40), createdAt: Date.now() });
  return id;
}

export const setActivePerson = (id: string) => updateSettings({ activePersonId: id });
