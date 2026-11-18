/**
 * Medicine schedule (pure). Turns the instruction AS WRITTEN on the prescription ("1+0+1", "BD", "at night") into
 * reminder times. It never changes what to take: the instruction text is shown unchanged, nothing is computed about
 * amounts, and a missed dose only ever says "Ask your doctor or pharmacist what to do" (rule 3).
 */
import { DOSE_SLOT_TIMES, type DoseSlot } from '@/config/medicine-times';
import { toAsciiDigits } from '@/lib/ocr/text';
import type { DoseLog, MedicinePlan } from '@/lib/store/db';

export interface ParsedFrequency {
  times: string[];
  /** "SOS" / "as needed": no reminders. */
  asNeeded: boolean;
  /** False when the text was not understood: the user sets the times. */
  recognised: boolean;
}

const slots = (...s: DoseSlot[]) => s.map((x) => DOSE_SLOT_TIMES[x]);

export function parseFrequency(raw: string): ParsedFrequency {
  const text = toAsciiDigits(raw).toLowerCase().replace(/½/g, '0.5').trim();
  const plus = text.match(/^(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)(?:\s*\+\s*(\d+(?:\.\d+)?))?/);
  if (plus) {
    const counts = plus.slice(1).filter((x) => x !== undefined).map(Number);
    const order: DoseSlot[] = counts.length === 4 ? ['morning', 'midday', 'evening', 'night'] : ['morning', 'midday', 'night'];
    const times = order.filter((_, i) => counts[i]! > 0).map((s) => DOSE_SLOT_TIMES[s]);
    return { times, asNeeded: false, recognised: times.length > 0 };
  }
  if (/\b(sos|prn)\b|as needed|if needed|when needed|প্রয়োজনে|দরকার হলে/.test(text)) return { times: [], asNeeded: true, recognised: true };
  if (/\b(qid|qds)\b|four times|4 times|৪ বার/.test(text)) return { times: slots('morning', 'midday', 'evening', 'night'), asNeeded: false, recognised: true };
  if (/\b(tds|tid)\b|thrice|three times|3 times|৩ বার|তিন বার/.test(text)) return { times: slots('morning', 'midday', 'night'), asNeeded: false, recognised: true };
  if (/\b(bd|bid)\b|twice|two times|2 times|১২ ঘণ্টা|দুই বার|২ বার/.test(text)) return { times: slots('morning', 'night'), asNeeded: false, recognised: true };
  if (/\b(hs|nocte)\b|at night|bedtime|রাতে/.test(text)) return { times: slots('night'), asNeeded: false, recognised: true };
  if (/\b(od|qd)\b|once|daily|every morning|সকালে|এক বার|১ বার/.test(text)) return { times: slots('morning'), asNeeded: false, recognised: true };
  return { times: [], asNeeded: false, recognised: false };
}

/** "30 days", "2 weeks", "1 month", "৭ দিন", "continue" → days (null = no end). */
export function parseDurationDays(raw: string): number | null {
  const text = toAsciiDigits(raw).toLowerCase();
  const m = text.match(/(\d+)\s*(day|days|d|দিন|week|weeks|wk|সপ্তাহ|month|months|mo|মাস)/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!;
  if (/^(week|weeks|wk|সপ্তাহ)$/.test(unit)) return n * 7;
  if (/^(month|months|mo|মাস)$/.test(unit)) return n * 30;
  return n;
}

const DAY = 86_400_000;

/** Local midnight of a timestamp. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function at(dayStart: number, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(dayStart);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.getTime();
}

/** Scheduled dose times of a plan in [from, to). */
export function doseTimes(plan: Pick<MedicinePlan, 'times' | 'startDate' | 'endDate' | 'active'>, from: number, to: number): number[] {
  if (!plan.active || !plan.times.length) return [];
  const out: number[] = [];
  const first = Math.max(startOfDay(from), startOfDay(plan.startDate));
  for (let day = first; day < to; day = startOfDay(day + DAY + 3_600_000)) {
    for (const time of plan.times) {
      const t = at(day, time);
      if (t >= from && t < to && t >= plan.startDate && (plan.endDate == null || t <= plan.endDate)) out.push(t);
    }
  }
  return out.sort((a, b) => a - b);
}

export interface Adherence {
  scheduled: number;
  taken: number;
  missed: number;
  /** Past doses the user has not marked. */
  unmarked: number;
  /** taken / scheduled, 0–100, or null when nothing was scheduled. */
  percent: number | null;
}

/** Adherence for one plan between `from` and `now` (only doses already due count). */
export function adherence(plan: MedicinePlan, logs: readonly DoseLog[], from: number, now: number): Adherence {
  const due = doseTimes(plan, from, now + 1);
  const mine = new Map(logs.filter((l) => l.medicineId === plan.id).map((l) => [l.dueAt, l.status]));
  let taken = 0;
  let missed = 0;
  for (const t of due) {
    const s = mine.get(t);
    if (s === 'taken') taken++;
    else if (s === 'missed') missed++;
  }
  const scheduled = due.length;
  return { scheduled, taken, missed, unmarked: scheduled - taken - missed, percent: scheduled ? Math.round((taken / scheduled) * 100) : null };
}

/** Builds a plan from a confirmed prescription line (Part 3) or a manual entry. */
export function planFromLine(
  line: { brand: string; generic: string | null; strength: string; frequency: string; duration: string },
  personId: string,
  source: MedicinePlan['source'],
  now = Date.now(),
): MedicinePlan & { asNeeded: boolean; recognised: boolean } {
  const f = parseFrequency(line.frequency);
  const days = parseDurationDays(line.duration);
  const startDate = startOfDay(now);
  return {
    personId,
    brand: line.brand,
    generic: line.generic,
    strength: line.strength,
    instructions: [line.frequency, line.duration].filter(Boolean).join(' · '),
    times: f.times,
    startDate,
    endDate: days ? startDate + days * DAY - 1 : null,
    source,
    active: true,
    asNeeded: f.asNeeded,
    recognised: f.recognised,
  };
}
