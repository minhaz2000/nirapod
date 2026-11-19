import { describe, expect, it } from 'vitest';
import { checkMessage, glucoseInText } from '@/lib/assistant/safety';

describe('danger signs and low sugar → emergency first', () => {
  it.each([
    'My father has chest pain and is sweating',
    'her face is drooping and she has slurred speech',
    'He cannot breathe properly',
    'my mother fainted and is unconscious',
    'আব্বার বুকে ব্যথা হচ্ছে',
    'মা অজ্ঞান হয়ে গেছেন',
    'শ্বাস নিতে কষ্ট হচ্ছে',
    'sugar is very low, feeling shaky',
    'my sugar is 3.1 now',
    'glucose 55 mg/dl after insulin',
    'সুগার ৩.২',
  ])('%s', (text) => {
    expect(checkMessage(text).emergency).toBe(true);
  });

  it('low sugar is marked so the card says "take something sweet"', () => {
    expect(checkMessage('my sugar is 3.1 now').lowGlucose).toBe(true);
    expect(checkMessage('chest pain').lowGlucose).toBe(false);
  });

  it('normal readings and ordinary questions are not emergencies', () => {
    expect(checkMessage('my sugar is 6.2 after breakfast').emergency).toBe(false);
    expect(checkMessage('glucose 110 mg/dl').emergency).toBe(false);
    expect(checkMessage('What is Napa used for?').emergency).toBe(false);
    expect(checkMessage('Is there a cheaper alternative to Seclo?').emergency).toBe(false);
  });

  it('reads glucose numbers in both units and Bangla digits', () => {
    expect(glucoseInText('sugar 3.1')).toBeCloseTo(3.1);
    expect(glucoseInText('glucose 54 mg/dL')).toBeCloseTo(3.0, 1);
    expect(glucoseInText('সুগার ৪.৫')).toBeCloseTo(4.5);
    expect(glucoseInText('Napa 500 mg')).toBeNull();
  });
});

describe('dose, diagnosis and fake/genuine questions are refused', () => {
  it.each([
    ['How many Napa can I take a day?', 'dose'],
    ['What dose of metformin should I take?', 'dose'],
    ['Can I stop taking Seclo?', 'dose'],
    ['Should I increase my insulin?', 'dose'],
    ['How much insulin units for 15 mmol?', 'dose'],
    ['Napa কয়টা খাব?', 'dose'],
    ['ইনসুলিনের ডোজ বাড়াব?', 'dose'],
    ['ওষুধ বন্ধ করব?', 'dose'],
    ['Is this Napa fake?', 'authenticity'],
    ['এই ওষুধটি কি নকল?', 'authenticity'],
    ['Do I have diabetes?', 'diagnosis'],
  ])('%s → %s', (text, reason) => {
    expect(checkMessage(text).refuse).toBe(reason);
  });

  it('ordinary questions are answered', () => {
    for (const q of ['What is Napa?', 'Do I have to take Seclo before food?', 'When does it expire?', 'Napa কী কাজে লাগে?', 'Cheaper alternative to Napa?']) {
      expect(checkMessage(q).refuse, q).toBeNull();
    }
  });
});
