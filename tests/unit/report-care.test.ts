import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import bn from '@/messages/bn.json';
import en from '@/messages/en.json';
import { chartGeometry } from '@/lib/care/chart';
import { buildDoctorReport, summariseGlucose, summariseMeals, weeklySummaryText, type SummaryT } from '@/lib/care/report';
import { doseTimes } from '@/lib/care/schedule';
import type { DiabetesProfile, DoseLog, GlucoseReading, Meal, MedicinePlan } from '@/lib/store/db';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 18, 12, 0).getTime();
const reading = (daysAgo: number, mmol: number, kind: GlucoseReading['kind'] = 'random'): GlucoseReading => ({ personId: 'me', takenAt: NOW - daysAgo * DAY, mmol, kind });
const meal = (daysAgo: number, signal: Meal['signal'], carbs: number): Meal => ({
  personId: 'me',
  takenAt: NOW - daysAgo * DAY,
  foods: [],
  carbs,
  signal,
  baseSignal: signal,
  adjusted: null,
  mainFood: 'rice',
  suggestion: 'walkAfter',
});
const profile: DiabetesProfile = { id: 'me', onboardedAt: NOW - 40 * DAY, fastingMmol: 8.4, fastingAt: NOW - 40 * DAY, hba1c: 7.6, plateDiameterCm: 26 };
const plan: MedicinePlan = { id: 1, personId: 'me', brand: 'Comet', generic: 'Metformin Hydrochloride', strength: '500mg', instructions: '1+0+1 · 30 days', times: ['08:00', '21:00'], startDate: NOW - 10 * DAY, source: 'prescription', active: true };

describe('glucose and meal summaries', () => {
  it('counts lows (< 3.9) and highs (≥ 10.0) separately, and time in range', () => {
    const s = summariseGlucose([reading(1, 3.2), reading(2, 6.5, 'fasting'), reading(3, 11.4, 'twoHour'), reading(4, 7.8, 'twoHour')]);
    expect(s).toMatchObject({ count: 4, lows: 1, highs: 1, inRangePercent: 50, lowest: 3.2, highest: 11.4, average: 7.2 });
    expect(s.averageByKind).toEqual({ fasting: 6.5, twoHour: 9.6, random: 3.2 });
    expect(summariseGlucose([]).average).toBeNull();
  });
  it('meal signal counts', () => {
    expect(summariseMeals([meal(1, 'green', 40), meal(2, 'red', 90), meal(3, 'amber', 65)])).toEqual({ count: 3, green: 1, amber: 1, red: 1, averageCarbs: 65 });
  });
});

describe('doctor visit report (last 30 days)', () => {
  const due = doseTimes(plan, NOW - 30 * DAY, NOW);
  const doses: DoseLog[] = due.map((d, i) => ({ personId: 'me', medicineId: 1, dueAt: d, status: i % 5 === 4 ? 'missed' : 'taken', recordedAt: d }));
  const report = buildDoctorReport({
    now: NOW,
    profile,
    readings: [reading(45, 9.9), reading(20, 6.1, 'fasting'), reading(5, 3.5), reading(2, 12.2, 'twoHour')],
    meals: [meal(3, 'red', 92), meal(1, 'green', 45), meal(40, 'red', 100)],
    plans: [plan],
    doses,
    checkups: [{ id: 'me:hba1c', personId: 'me', type: 'hba1c', intervalMonths: 3, lastDone: NOW - 100 * DAY }],
  });

  it('covers exactly the last 30 days', () => {
    expect(report.to - report.from).toBe(30 * DAY);
    expect(report.readings).toHaveLength(3); // the 45-day-old reading is out
    expect(report.readings.map((r) => r.mmol)).toEqual([6.1, 3.5, 12.2]); // oldest first
    expect(report.meals).toMatchObject({ count: 2, red: 1, green: 1 });
  });
  it('baseline, lows/highs, adherence and check-ups', () => {
    expect(report.baseline).toEqual({ fastingMmol: 8.4, hba1c: 7.6, level: 'fair' }); // 8.4 and 7.6 % are both 'fair'
    expect(report.glucose).toMatchObject({ lows: 1, highs: 1 });
    expect(report.medicines[0]).toMatchObject({ brand: 'Comet', instructions: '1+0+1 · 30 days' });
    const a = report.medicines[0]!.adherence;
    expect(a.scheduled).toBe(due.length);
    expect(a.taken + a.missed + a.unmarked).toBe(a.scheduled);
    expect(a.missed).toBe(Math.floor(due.length / 5));
    expect(report.checkups[0]).toMatchObject({ type: 'hba1c', due: true });
  });
  it('contains no advice about medicine', () => {
    expect(JSON.stringify(report)).not.toMatch(/stop|increase|reduce|double|skip/i);
  });
});

describe('weekly summary text (share sheet, text only)', () => {
  const r = buildDoctorReport({
    now: NOW,
    days: 7,
    profile,
    readings: [reading(1, 3.6), reading(2, 7.2), reading(3, 10.8)],
    meals: [meal(1, 'green', 40)],
    plans: [plan],
    doses: [],
    checkups: [],
  });
  const t = (locale: 'en' | 'bn') => createTranslator({ locale, messages: locale === 'en' ? en : bn, namespace: 'diabetes.summary' }) as unknown as SummaryT;

  it('English', () => {
    const text = weeklySummaryText(t('en'), r, (m) => `${m.toFixed(1)} mmol/L`, 'Amma');
    expect(text.split('\n')[0]).toBe('Nirapod weekly summary Amma');
    expect(text).toContain('Blood sugar: 3 readings, average 7.2 mmol/L, 33% in range.');
    expect(text).toContain('Low readings: 1.');
    expect(text).toContain('Meals checked: 1 (green 1, amber 0, red 0).');
    expect(text).toMatch(/Comet: taken 0 of \d+ doses\./);
    expect(text).not.toMatch(/https?:|data:image|\.jpg|\.png/);
  });
  it('Bangla', () => {
    expect(weeklySummaryText(t('bn'), r, (m) => m.toFixed(1))).toContain('নিরাপদ সাপ্তাহিক সারাংশ');
  });
});

describe('chart geometry', () => {
  const g = chartGeometry([{ takenAt: NOW - 2 * DAY, mmol: 3.2 }, { takenAt: NOW - DAY, mmol: 12 }, { takenAt: NOW, mmol: 6 }], NOW - 7 * DAY, NOW);
  it('marks low and high readings', () => {
    expect(g.points.map((p) => p.level)).toEqual(['low', 'high', 'ok']);
  });
  it('higher sugar is drawn higher; the target band sits between 3.9 and 10', () => {
    expect(g.points[1]!.y).toBeLessThan(g.points[2]!.y);
    expect(g.band.top).toBeLessThan(g.band.bottom);
    expect(g.lowLineY).toBe(g.band.bottom);
    expect(g.points[2]!.x).toBeCloseTo(g.width - g.pad.right);
  });
  it('a day tick per day', () => {
    expect(g.days).toHaveLength(7);
  });
});
