import { describe, expect, it } from 'vitest';
import bn from '@/messages/bn.json';
import en from '@/messages/en.json';
import { FREE_AFTER_TRIAL, TRIAL_DAYS, tabLocked, trialDaysLeft, trialEnded, type DiabetesTab } from '@/lib/diabetes/trial';
import { FAMILY_FEATURES, FAMILY_PLAN_LIVE } from '@/lib/premium/family';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 11, 26);

describe('Family Plan feature list', () => {
  it('has the 8 features in order', () => {
    expect(FAMILY_FEATURES.map((f) => f.id)).toEqual(['checkin', 'voice', 'remote', 'refill', 'emergency', 'plate', 'visit', 'story']);
  });

  it('1, 2, 3 and 5 are "in progress"; 4, 6, 7 and 8 are "coming soon"', () => {
    const byNumber = (status: string) => FAMILY_FEATURES.flatMap((f, i) => (f.status === status ? [i + 1] : []));
    expect(byNumber('progress')).toEqual([1, 2, 3, 5]);
    expect(byNumber('soon')).toEqual([4, 6, 7, 8]);
  });

  it('nothing is live, and no status says so', () => {
    expect(FAMILY_PLAN_LIVE).toBe(false);
    expect(new Set(FAMILY_FEATURES.map((f) => f.status))).toEqual(new Set(['progress', 'soon']));
  });

  it('every feature has a title and a one-line description in Bangla and English', () => {
    for (const m of [en, bn]) {
      for (const f of FAMILY_FEATURES) {
        const entry = m.family.features[f.id];
        expect(entry.title.length, f.id).toBeGreaterThan(0);
        expect(entry.desc, f.id).not.toMatch(/\n/);
      }
    }
  });

  it('labels and prices are honest in both languages', () => {
    expect(en.family.status).toEqual({ progress: 'In progress', soon: 'Coming soon' });
    expect(bn.family.status).toEqual({ progress: 'কাজ চলছে', soon: 'শীঘ্রই আসছে' });
    expect(en.family.title).toBe('Family Plan');
    expect(bn.family.title).toBe('পরিবার প্ল্যান');
    expect(en.family.preview.label).toBe('Preview — sample, not live yet');
    expect(en.family.price.line).toBe('Planned price: about BDT 99–149 per month');
    expect(en.family.price.notYet).toBe('Not available yet');
    expect(en.diabetes.premium.subscribe).toBe('Coming soon');
    // No message offers a working subscription or sign-up.
    const values = (o: unknown): string[] => (typeof o === 'string' ? [o] : Object.values(o as object).flatMap(values));
    for (const v of values(en)) expect(v).not.toMatch(/\b(subscribe|sign up|buy now)\b/i);
  });

  it('the after-visit summary only shows changes and never advises (rule 3)', () => {
    for (const m of [en, bn]) {
      const all = Object.values(m.family.sample.visit).join(' ');
      expect(all).not.toMatch(/\b(stop|start|increase|reduce|switch)\b/i);
    }
  });
});

describe('trial gating', () => {
  const tabs: DiabetesTab[] = ['meal', 'glucose', 'patterns', 'medicines', 'care', 'more'];

  it('lasts 7 weeks', () => {
    expect(TRIAL_DAYS).toBe(49);
    expect(trialDaysLeft(NOW - 10 * DAY, NOW)).toBe(39);
    expect(trialDaysLeft(undefined, NOW)).toBeNull();
    expect(trialEnded(NOW - 48 * DAY, NOW)).toBe(false);
    expect(trialEnded(NOW - 49 * DAY, NOW)).toBe(true);
  });

  it('during the trial nothing is locked', () => {
    for (const tab of tabs) expect(tabLocked(tab, NOW - 5 * DAY, NOW), tab).toBe(false);
    for (const tab of tabs) expect(tabLocked(tab, undefined, NOW), tab).toBe(false);
  });

  it('after the trial the plate signal and sugar entry (with low-sugar help) stay free', () => {
    expect(FREE_AFTER_TRIAL).toEqual(['meal', 'glucose']);
    const start = NOW - 60 * DAY;
    expect(tabLocked('meal', start, NOW)).toBe(false);
    expect(tabLocked('glucose', start, NOW)).toBe(false);
    for (const tab of ['patterns', 'medicines', 'care', 'more'] as const) expect(tabLocked(tab, start, NOW), tab).toBe(true);
  });
});
