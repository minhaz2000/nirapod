import { describe, expect, it } from 'vitest';
import { redact } from '@/lib/privacy/redact';

describe('redact', () => {
  it('removes Bangladeshi phone numbers', () => {
    expect(redact('Call 01712345678 or +880 1812-345678')).toBe('Call [PHONE] or [PHONE]');
  });

  it('removes e-mails and NID numbers', () => {
    expect(redact('a.b@example.com NID 1234567890123')).toBe('[EMAIL] NID [ID]');
  });

  it('removes labelled names and addresses but keeps medicine lines', () => {
    const out = redact('Patient name: Rahim Uddin\nঠিকানা: মিরপুর ১০, ঢাকা\nTab. Napa 500 mg 1+0+1');
    expect(out).not.toMatch(/Rahim|মিরপুর/);
    expect(out).toContain('Tab. Napa 500 mg 1+0+1');
  });
});
