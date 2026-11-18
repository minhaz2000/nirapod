/** Loads everything the doctor report and weekly summary need for one person (all on the phone). */
import { getDb } from '@/lib/store/db';
import { listCheckups } from '@/lib/store/care';
import { getDiabetesProfile, glucoseSince, mealsSince } from '@/lib/store/diabetes';
import { buildDoctorReport, type DoctorReport } from './report';

export async function loadReport(personId: string, days: number, now = Date.now()): Promise<DoctorReport> {
  const since = now - days * 86_400_000;
  const db = getDb();
  const [profile, readings, meals, plans, doses, checkups] = await Promise.all([
    getDiabetesProfile(personId),
    glucoseSince(personId, since),
    mealsSince(personId, since),
    db.medicines.where('personId').equals(personId).toArray(),
    db.doses.where('[personId+dueAt]').between([personId, since], [personId, Infinity]).toArray(),
    listCheckups(personId),
  ]);
  return buildDoctorReport({ now, days, profile: profile ?? null, readings, meals, plans, doses, checkups });
}
