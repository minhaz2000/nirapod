/**
 * NEEDS CLINICIAN REVIEW — routine check-ups for adults with diabetes and default intervals (months).
 * Placeholder values based on common guidance (HbA1c about every 3 months; eyes, feet and kidneys yearly).
 * The user can edit every interval; a doctor may advise different ones.
 */
export const CHECKUPS = [
  { type: 'hba1c', intervalMonths: 3 },
  { type: 'eye', intervalMonths: 12 },
  { type: 'foot', intervalMonths: 12 },
  { type: 'kidney', intervalMonths: 12 },
] as const;

export type CheckupType = (typeof CHECKUPS)[number]['type'];
