import { describe, expect, it } from 'vitest';
import bn from '@/messages/bn.json';
import en from '@/messages/en.json';

function flatten(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const bnFlat = flatten(bn);
const enFlat = flatten(en);

describe('messages', () => {
  it('bn and en have exactly the same keys', () => {
    expect(Object.keys(bnFlat).sort()).toEqual(Object.keys(enFlat).sort());
  });

  it('no message is empty', () => {
    for (const [k, v] of [...Object.entries(bnFlat), ...Object.entries(enFlat)]) {
      expect(v.trim(), k).not.toBe('');
    }
  });

  it('safety rule 1: copy never states a diagnosis ("you have …")', () => {
    for (const [k, v] of Object.entries(enFlat)) expect(v, k).not.toMatch(/\byou (?:have|are suffering)\b/i);
    for (const [k, v] of Object.entries(bnFlat)) expect(v, k).not.toMatch(/আপনার (?:\S+ ){0,2}(?:স্ক্যাবিস|ডায়াবেটিস|রোগ|অসুখ)\s*(?:হয়েছে|আছে)/);
  });

  it('safety rule 2: copy never calls a medicine fake or genuine', () => {
    for (const [k, v] of Object.entries(enFlat)) expect(v, k).not.toMatch(/\b(?:fake|genuine|counterfeit|authentic)\b/i);
    for (const [k, v] of Object.entries(bnFlat)) expect(v, k).not.toMatch(/নকল|আসল ওষুধ|ভেজাল/);
  });

  it('safety rule 6: low-sugar guidance tells the user to take something sweet, never to reduce food', () => {
    expect(enFlat['diabetes.lowSugarBody']).toMatch(/sweet/i);
    expect(enFlat['diabetes.lowSugarBody']).toMatch(/999/);
    expect(enFlat['diabetes.lowSugarBody']).not.toMatch(/reduce|less food|skip/i);
  });

  it('999 copy names police, fire service and ambulance providers', () => {
    expect(enFlat['emergency.about999']).toMatch(/police/i);
    expect(enFlat['emergency.about999']).toMatch(/fire/i);
    expect(enFlat['emergency.about999']).toMatch(/ambulance/i);
    expect(bnFlat['emergency.about999']).toMatch(/পুলিশ/);
    expect(bnFlat['emergency.about999']).toMatch(/ফায়ার/);
    expect(bnFlat['emergency.about999']).toMatch(/অ্যাম্বুলেন্স/);
  });

  it('never claims ambulances are free', () => {
    const freeAmbulance = /(ambulance[^.]*\bfree\b|\bfree\b[^.]*ambulance)/i;
    for (const [k, v] of Object.entries(enFlat)) expect(v, k).not.toMatch(freeAmbulance);
    const freeAmbulanceBn = /(অ্যাম্বুলেন্স[^।]*বিনামূল্যে|বিনামূল্যে[^।]*অ্যাম্বুলেন্স)/;
    for (const [k, v] of Object.entries(bnFlat)) expect(v, k).not.toMatch(freeAmbulanceBn);
  });
});
