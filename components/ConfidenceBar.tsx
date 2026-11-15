import { useTranslations } from 'next-intl';

/** Every model output carries a visible confidence value (safety rule 5). */
export default function ConfidenceBar({ value }: { value: number }) {
  const t = useTranslations('model');
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <p className="text-sm text-slate-800">{t('confidence', { value: pct })}</p>
      <div className="h-3 w-full rounded-full bg-slate-200" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-3 rounded-full bg-teal-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
