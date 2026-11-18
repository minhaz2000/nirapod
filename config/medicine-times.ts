/**
 * Default clock times for dose slots when a prescription says "1+0+1" etc. The user can change every time.
 * Not a clinical threshold: it only decides WHEN a reminder appears, never how much to take.
 * Slot order follows the Bangladeshi convention: morning + midday + night (4 slots: + evening before night).
 */
export const DOSE_SLOT_TIMES = {
  morning: '08:00',
  midday: '14:00',
  evening: '18:00',
  night: '21:00',
} as const;

export type DoseSlot = keyof typeof DOSE_SLOT_TIMES;
