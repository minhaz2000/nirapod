import { describe, expect, it } from 'vitest';
import { cropRows, DEFAULT_HEADER_FRACTION, headerCropRow, redact } from '@/lib/privacy/redact';

describe('redact — text', () => {
  it('removes Bangladeshi phone numbers, English or Bangla digits', () => {
    expect(redact('Call 01712345678 or +880 1812-345678')).toBe('Call [PHONE] or [PHONE]');
    expect(redact('মোবাইল ০১৭১২৩৪৫৬৭৮')).not.toMatch(/[০-৯]{6}/);
    expect(redact('Ph 01912 345 678 today')).toBe('Ph [PHONE] today');
  });

  it('removes e-mails and NID numbers', () => {
    expect(redact('a.b@example.com NID 1234567890123')).toBe('[EMAIL] NID [ID]');
  });

  it('removes labelled names, addresses and phone fields but keeps medicine lines', () => {
    const out = redact('Patient name: Rahim Uddin\nঠিকানা: মিরপুর ১০, ঢাকা\nMobile No: 01711-000000\nTab. Napa 500 mg 1+0+1');
    expect(out).not.toMatch(/Rahim|মিরপুর|01711/);
    expect(out).toContain('Tab. Napa 500 mg 1+0+1');
  });

  it('removes titled personal names (English and Bangla)', () => {
    expect(redact('Mrs. Rahima Begum, 52 y')).toBe('[NAME], 52 y');
    expect(redact('Ref: Dr. A. Karim')).not.toMatch(/Karim/);
    expect(redact('মোসাঃ রহিমা বেগম')).toBe('[NAME]');
  });

  it('leaves prescription content intact', () => {
    const rx = 'Tab. Comet 500 mg 1+0+1 x 30 days\nCap. Seclo 20 mg 1+0+1 before meal\nDx: Type 2 DM';
    expect(redact(rx)).toBe(rx);
  });
});

describe('redact — prescription image header', () => {
  it('crop row is a clamped fraction of the height', () => {
    expect(headerCropRow(1000)).toBe(1000 * DEFAULT_HEADER_FRACTION);
    expect(headerCropRow(1000, 0.4)).toBe(400);
    expect(headerCropRow(1000, 2)).toBe(800); // keeps at least 20%
    expect(headerCropRow(1000, -1)).toBe(0);
    expect(headerCropRow(1000, Number.NaN)).toBe(250);
  });

  it('cropRows removes the header pixels entirely (nothing of them is sent)', () => {
    const w = 2;
    const h = 4;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < h; row++) rgba.fill(row + 1, row * w * 4, (row + 1) * w * 4); // row r filled with r+1
    const out = cropRows(rgba, w, h, 1);
    expect(out.height).toBe(3);
    expect(out.data.length).toBe(w * 3 * 4);
    expect([...new Set(out.data)]).toEqual([2, 3, 4]); // row 0 (value 1) is gone
  });
});
