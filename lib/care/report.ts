/**
 * Doctor visit report and weekly summary (pure). Built only from data on the phone; printed from the browser or shared
 * as text. Contains no photos and no advice about medicine (rules 3 and 9).
 */
import { GLUCOSE_TARGETS, type ControlLevel } from '@/config/glucose-targets';
import { isLowGlucose } from '@/lib/rules/glucose';
import { controlLevel } from '@/lib/rules/meal-signal';
import type { Checkup, DiabetesProfile, DoseLog, GlucoseKind, GlucoseReading, Meal, MedicinePlan } from '@/lib/store/db';
import { checkupStatus, type CheckupStatus } from './checkups';
import { adherence, type Adherence } from './schedule';

const DAY = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface GlucoseSummary {
  count: number;
  average: number | null;
  lowest: number | null;
  highest: number | null;
  /** Readings below 3.9 mmol/L. */
  lows: number;
  /** Readings at or above the 2-hour target (10.0 mmol/L). */
  highs: number;
  /** Share of readings in 3.9–10.0 mmol/L (0–100). */
  inRangePercent: number | null;
  averageByKind: Partial<Record<GlucoseKind, number>>;
}

export function summariseGlucose(readings: readonly GlucoseReading[]): GlucoseSummary {
  const values = readings.map((r) => r.mmol);
  const high = GLUCOSE_TARGETS.twoHour.target;
  const lows = values.filter((v) => isLowGlucose(v)).length;
  const highs = values.filter((v) => v >= high).length;
  const byKind: Partial<Record<GlucoseKind, number>> = {};
  for (const kind of ['fasting', 'beforeMeal', 'twoHour', 'random'] as const) {
    const v = readings.filter((r) => r.kind === kind).map((r) => r.mmol);
    if (v.length) byKind[kind] = round1(v.reduce((a, b) => a + b, 0) / v.length);
  }
  return {
    count: values.length,
    average: values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null,
    lowest: values.length ? Math.min(...values) : null,
    highest: values.length ? Math.max(...values) : null,
    lows,
    highs,
    inRangePercent: values.length ? Math.round(((values.length - lows - highs) / values.length) * 100) : null,
    averageByKind: byKind,
  };
}

export interface MealSummary {
  count: number;
  green: number;
  amber: number;
  red: number;
  averageCarbs: number | null;
}

export function summariseMeals(meals: readonly Meal[]): MealSummary {
  return {
    count: meals.length,
    green: meals.filter((m) => m.signal === 'green').length,
    amber: meals.filter((m) => m.signal === 'amber').length,
    red: meals.filter((m) => m.signal === 'red').length,
    averageCarbs: meals.length ? Math.round(meals.reduce((s, m) => s + m.carbs, 0) / meals.length) : null,
  };
}

export interface DoctorReport {
  from: number;
  to: number;
  baseline: { fastingMmol: number; hba1c: number | null; level: ControlLevel } | null;
  glucose: GlucoseSummary;
  /** All readings in the period, oldest first. */
  readings: GlucoseReading[];
  meals: MealSummary;
  medicines: Array<{ brand: string; generic: string | null; strength: string; instructions: string; adherence: Adherence }>;
  checkups: CheckupStatus[];
}

export function buildDoctorReport(input: {
  now: number;
  days?: number;
  profile: DiabetesProfile | null;
  readings: readonly GlucoseReading[];
  meals: readonly Meal[];
  plans: readonly MedicinePlan[];
  doses: readonly DoseLog[];
  checkups: readonly Checkup[];
}): DoctorReport {
  const to = input.now;
  const from = to - (input.days ?? 30) * DAY;
  const readings = input.readings.filter((r) => r.takenAt >= from && r.takenAt <= to).sort((a, b) => a.takenAt - b.takenAt);
  const meals = input.meals.filter((m) => m.takenAt >= from && m.takenAt <= to);
  return {
    from,
    to,
    baseline: input.profile
      ? {
          fastingMmol: input.profile.fastingMmol,
          hba1c: input.profile.hba1c ?? null,
          level: controlLevel({ fastingMmol: input.profile.fastingMmol, hba1c: input.profile.hba1c }),
        }
      : null,
    glucose: summariseGlucose(readings),
    readings,
    meals: summariseMeals(meals),
    medicines: input.plans
      .filter((p) => p.id !== undefined)
      .map((p) => ({ brand: p.brand, generic: p.generic, strength: p.strength, instructions: p.instructions, adherence: adherence(p, input.doses, Math.max(from, p.startDate), to) })),
    checkups: input.checkups.map((c) => checkupStatus(c, to)),
  };
}

/** Translator for 'diabetes.summary' messages. */
export type SummaryT = (key: string, values?: Record<string, string | number>) => string;

/** Weekly summary as plain text for the share sheet (WhatsApp etc.). Text only, no photos. */
export function weeklySummaryText(t: SummaryT, r: DoctorReport, formatGlucose: (mmol: number) => string, name?: string): string {
  const lines = [t('heading', { name: name ?? '' }).trim()];
  if (r.glucose.count) {
    lines.push(t('glucose', { count: r.glucose.count, average: formatGlucose(r.glucose.average!), inRange: r.glucose.inRangePercent ?? 0 }));
    if (r.glucose.lows) lines.push(t('lows', { count: r.glucose.lows }));
    if (r.glucose.highs) lines.push(t('highs', { count: r.glucose.highs }));
  } else lines.push(t('noGlucose'));
  if (r.meals.count) lines.push(t('meals', { count: r.meals.count, green: r.meals.green, amber: r.meals.amber, red: r.meals.red }));
  for (const m of r.medicines) {
    if (m.adherence.scheduled) lines.push(t('medicine', { brand: m.brand, taken: m.adherence.taken, scheduled: m.adherence.scheduled }));
  }
  lines.push(t('footer'));
  return lines.join('\n');
}
