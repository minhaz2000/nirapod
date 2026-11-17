import type { ReactNode } from 'react';

const TONES = {
  info: 'border-teal-700 bg-teal-50 text-teal-950',
  warning: 'border-amber-600 bg-amber-50 text-amber-950',
  danger: 'border-red-700 bg-red-50 text-red-950',
} as const;

export default function Notice({ tone = 'info', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <div className={`rounded-xl border-l-4 p-3 text-base ${TONES[tone]}`}>{children}</div>;
}
