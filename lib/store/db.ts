import Dexie, { type EntityTable } from 'dexie';
import type { GlucoseUnit } from '@/lib/rules/glucose';

/**
 * All user data lives on the device only (IndexedDB). No accounts, nothing on the server.
 * "Delete all my data" (Settings) deletes this whole database.
 * Family mode: every record carries a personId; 'me' is the phone's owner.
 */

export const ME = 'me';

export interface Profile {
  /** Person id: 'me' or a family member's id. */
  id: string;
  name?: string;
  relation?: string;
  createdAt: number;
  /** Allergy names as typed by the user (ingredient, brand or group such as "penicillin"). */
  allergies?: string[];
  pregnant?: boolean;
}

export interface MealFood {
  modelClass: string;
  grams: number;
  carbs: number;
  source: 'model' | 'added';
  confidence: number | null;
  correction: 'less' | 'right' | 'more';
}

export interface Meal {
  id?: number;
  personId: string;
  takenAt: number;
  foods: MealFood[];
  carbs: number;
  signal: 'green' | 'amber' | 'red';
  baseSignal: 'green' | 'amber' | 'red';
  adjusted: 'stricter' | 'relaxed' | null;
  mainFood: string | null;
  suggestion: string;
  demo?: boolean;
}

export type GlucoseKind = 'fasting' | 'twoHour' | 'beforeMeal' | 'random';

export interface GlucoseReading {
  id?: number;
  personId: string;
  takenAt: number;
  /** Always stored in mmol/L. */
  mmol: number;
  kind: GlucoseKind;
  mealId?: number;
  demo?: boolean;
}

export interface SavedPrescription {
  id?: number;
  savedAt: number;
  /** Confirmed by the user (handwriting must be confirmed — safety rule 7). */
  confirmed: boolean;
  items: Array<{ brand: string; generic?: string; dose?: string }>;
  doctorDiagnosis?: string;
}

export interface DiabetesProfile {
  /** Person id. */
  id: string;
  onboardedAt: number;
  /** Photo of the prescription as proof of diagnosis; never leaves the phone. */
  proofPhoto?: Blob;
  fastingMmol: number;
  fastingAt: number;
  hba1c?: number | null;
  plateDiameterCm: number;
}

export interface MedicinePlan {
  id?: number;
  personId: string;
  brand: string;
  generic: string | null;
  strength: string;
  /** As written on the prescription, e.g. "1+0+1". Shown, never changed by the app. */
  instructions: string;
  /** Dose times, "HH:MM". */
  times: string[];
  startDate: number;
  /** Optional last day (ms). */
  endDate?: number | null;
  source: 'prescription' | 'manual';
  active: boolean;
  demo?: boolean;
}

export interface DoseLog {
  id?: number;
  personId: string;
  medicineId: number;
  /** Scheduled time (ms). */
  dueAt: number;
  status: 'taken' | 'missed';
  recordedAt: number;
  demo?: boolean;
}

export interface Checkup {
  /** `${personId}:${type}` */
  id: string;
  personId: string;
  type: string;
  intervalMonths: number;
  lastDone?: number | null;
}

export interface ReminderSettings {
  /** Person id. */
  id: string;
  meals: { enabled: boolean; breakfast: string; lunch: string; dinner: string };
  walkAfterMeals: boolean;
  medicines: boolean;
  checkups: boolean;
}

export interface Settings {
  id: 'settings';
  glucoseUnit: GlucoseUnit;
  demoMode: boolean;
  /** Diabetes Companion trial start (ms since epoch), set at first use. */
  trialStart?: number;
  /** Family mode: whose data is shown. */
  activePersonId?: string;
}

export class NirapodDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>;
  meals!: EntityTable<Meal, 'id'>;
  glucose!: EntityTable<GlucoseReading, 'id'>;
  prescriptions!: EntityTable<SavedPrescription, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  diabetes!: EntityTable<DiabetesProfile, 'id'>;
  medicines!: EntityTable<MedicinePlan, 'id'>;
  doses!: EntityTable<DoseLog, 'id'>;
  checkups!: EntityTable<Checkup, 'id'>;
  reminders!: EntityTable<ReminderSettings, 'id'>;

  constructor(name = 'nirapod') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      meals: '++id, takenAt',
      glucose: '++id, takenAt, mealId',
      prescriptions: '++id, savedAt',
      settings: 'id',
    });
    this.version(2)
      .stores({
        profile: 'id',
        meals: '++id, takenAt, personId, [personId+takenAt]',
        glucose: '++id, takenAt, mealId, personId, [personId+takenAt]',
        prescriptions: '++id, savedAt',
        settings: 'id',
        diabetes: 'id',
        medicines: '++id, personId',
        doses: '++id, personId, medicineId, [medicineId+dueAt], [personId+dueAt]',
        checkups: 'id, personId',
        reminders: 'id',
      })
      .upgrade(async (tx) => {
        // Records from version 1 belong to the phone's owner.
        await tx.table('meals').toCollection().modify((m: Partial<Meal>) => {
          m.personId ??= ME;
        });
        await tx.table('glucose').toCollection().modify((g: Partial<GlucoseReading>) => {
          g.personId ??= ME;
          g.kind ??= 'random';
        });
      });
  }
}

let instance: NirapodDB | null = null;

export function getDb(): NirapodDB {
  instance ??= new NirapodDB();
  return instance;
}
