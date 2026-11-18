import Dexie, { type EntityTable } from 'dexie';
import type { GlucoseUnit } from '@/lib/rules/glucose';

/** All user data lives on the device only. No accounts, nothing on the server. */

export interface Profile {
  id: 'me';
  name?: string;
  createdAt: number;
  /** Allergy names as typed by the user (ingredient, brand or group such as "penicillin"). */
  allergies?: string[];
  pregnant?: boolean;
}

export interface Meal {
  id?: number;
  takenAt: number;
  foods: Array<{ label: string; grams?: number; confidence: number }>;
  signal?: 'green' | 'amber' | 'red';
}

export interface GlucoseReading {
  id?: number;
  takenAt: number;
  /** Always stored in mmol/L. */
  mmol: number;
  mealId?: number;
}

export interface SavedPrescription {
  id?: number;
  savedAt: number;
  /** Confirmed by the user (handwriting must be confirmed — safety rule 7). */
  confirmed: boolean;
  items: Array<{ brand: string; generic?: string; dose?: string }>;
  doctorDiagnosis?: string;
}

export interface Settings {
  id: 'settings';
  glucoseUnit: GlucoseUnit;
  demoMode: boolean;
  /** Diabetes Companion trial start (ms since epoch). */
  trialStart?: number;
}

export class NirapodDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>;
  meals!: EntityTable<Meal, 'id'>;
  glucose!: EntityTable<GlucoseReading, 'id'>;
  prescriptions!: EntityTable<SavedPrescription, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor(name = 'nirapod') {
    super(name);
    this.version(1).stores({
      profile: 'id',
      meals: '++id, takenAt',
      glucose: '++id, takenAt, mealId',
      prescriptions: '++id, savedAt',
      settings: 'id',
    });
  }
}

let instance: NirapodDB | null = null;

export function getDb(): NirapodDB {
  instance ??= new NirapodDB();
  return instance;
}
