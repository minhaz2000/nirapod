'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DANGER_SIGN_GROUPS, type DangerSignId } from '@/config/danger-signs';
import { assessDangerSigns } from '@/lib/rules/danger-signs';
import EmergencyAlert from './EmergencyAlert';
import type { LocationApi } from './useLocation';
import { useSignLabel } from './useSignLabel';

interface Props {
  initial: readonly DangerSignId[];
  location: LocationApi;
}

/** Tap-to-select danger signs. Any selection opens the full-screen alert. */
export default function DangerChecklist({ initial, location }: Props) {
  const t = useTranslations('emergency');
  const label = useSignLabel();
  const [selected, setSelected] = useState<DangerSignId[]>([...initial]);
  const [dismissed, setDismissed] = useState(false);
  const assessment = useMemo(() => assessDangerSigns({ selected }), [selected]);

  function toggle(id: DangerSignId) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    if (!selected.includes(id)) setDismissed(false); // a newly selected sign always re-opens the alert
  }

  return (
    <section className="space-y-4" aria-labelledby="checklist-title">
      <div>
        <h2 id="checklist-title" className="text-xl font-bold text-red-800">
          {t('checklistTitle')}
        </h2>
        <p className="text-slate-700">{t('checklistHint')}</p>
      </div>

      {DANGER_SIGN_GROUPS.map((group) => (
        <fieldset key={group.id} className="space-y-2">
          <legend className="mb-1 font-semibold text-slate-900">{t(`groups.${group.id}`)}</legend>
          {group.signs.map((id) => {
            const on = selected.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                data-testid={`sign-${id}`}
                onClick={() => toggle(id)}
                className={`flex min-h-14 w-full items-start gap-3 rounded-2xl border-2 p-3 text-left focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-red-900 ${
                  on ? 'border-red-700 bg-red-50' : 'border-slate-300 bg-white hover:border-slate-500'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border-2 font-bold ${
                    on ? 'border-red-700 bg-red-700 text-white' : 'border-slate-500'
                  }`}
                >
                  {on ? '✓' : ''}
                </span>
                <span>
                  <span className="block text-lg font-semibold">{label(id)}</span>
                  <span className="block text-sm text-slate-700">{t(`signs.${id}.hint`)}</span>
                </span>
              </button>
            );
          })}
          {group.id === 'stroke' && <p className="text-sm font-semibold text-slate-800">{t('strokeTime')}</p>}
        </fieldset>
      ))}

      {assessment.emergency && dismissed && (
        <div className="sticky bottom-24 space-y-1 rounded-2xl bg-white/95 p-2 shadow-lg">
          <p className="text-center text-sm text-slate-800">{t('selectedCount', { count: assessment.triggered.length })}</p>
          <button
            type="button"
            onClick={() => setDismissed(false)}
            data-testid="alert-reopen"
            className="min-h-12 w-full rounded-xl bg-red-700 px-4 font-bold text-white"
          >
            {t('alert.reopen')}
          </button>
        </div>
      )}

      {assessment.emergency && !dismissed && (
        <EmergencyAlert assessment={assessment} location={location} onClose={() => setDismissed(true)} />
      )}
    </section>
  );
}
