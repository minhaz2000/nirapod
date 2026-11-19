'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/Icon';
import { FAMILY_FEATURES, type FamilyFeatureId } from '@/lib/premium/family';
import FamilyPreview from './FamilyPreviews';

const BADGE = {
  progress: 'bg-sky-100 text-sky-950 border-sky-700',
  soon: 'bg-slate-100 text-slate-800 border-slate-500',
} as const;

/** Family Plan preview (Premium idea). UI only: no server, no sync, no payment, no sign-ups. */
export default function FamilyPlan() {
  const t = useTranslations('family');
  const [open, setOpen] = useState<FamilyFeatureId | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      openerRef.current?.focus();
    };
  }, [open]);

  return (
    <div className="space-y-5" data-testid="family-plan">
      <section className="space-y-2 rounded-2xl bg-teal-900 p-4 text-white shadow-sm">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
          <Icon name="star" size={16} />
          {t('premium')}
        </span>
        <p className="text-xl font-bold" data-testid="family-headline">
          {t('headline')}
        </p>
        <p className="text-teal-50">{t('intro')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t('featuresTitle')}</h2>
        <ul className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2">
          {FAMILY_FEATURES.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                data-testid={`family-card-${f.id}`}
                data-status={f.status}
                onClick={(e) => {
                  openerRef.current = e.currentTarget;
                  setOpen(f.id);
                }}
                className="flex h-full min-h-28 w-full flex-col gap-2 rounded-2xl bg-white p-4 text-left shadow-sm hover:shadow-md focus-visible:outline-4 focus-visible:outline-teal-800"
              >
                <span className="flex w-full items-start justify-between gap-2">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-900">
                    <Icon name={f.icon} size={26} />
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${BADGE[f.status]}`} data-testid="family-status">
                    {t(`status.${f.status}`)}
                  </span>
                </span>
                <span className="font-bold">{t(`features.${f.id}.title`)}</span>
                <span className="text-sm text-slate-700">{t(`features.${f.id}.desc`)}</span>
                <span className="mt-auto text-sm font-semibold text-teal-800 underline underline-offset-4">{t('open')}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-1 rounded-2xl border-l-4 border-teal-700 bg-teal-50 p-4 text-teal-950" data-testid="family-privacy">
        <h2 className="flex items-center gap-2 font-bold">
          <Icon name="lock" size={18} />
          {t('privacy.title')}
        </h2>
        <p>{t('privacy.body')}</p>
      </section>

      <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm" data-testid="family-price">
        <p className="font-bold">{t('price.line')}</p>
        <p className="inline-block rounded-full bg-slate-200 px-3 py-1 text-sm font-semibold">{t('price.notYet')}</p>
        <button type="button" disabled data-testid="family-coming-soon" className="min-h-12 w-full cursor-not-allowed rounded-xl bg-slate-300 px-4 font-bold text-slate-700">
          {t('price.button')}
        </button>
        <p className="text-sm text-slate-700">{t('free')}</p>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 min-[560px]:items-center" onClick={() => setOpen(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="family-sheet-title"
            data-testid="family-sheet"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-3xl space-y-3 overflow-y-auto overflow-x-hidden rounded-t-3xl bg-white p-4 pb-28 shadow-xl min-[560px]:rounded-3xl"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 id="family-sheet-title" className="text-lg font-bold">
                {t(`features.${open}.title`)}
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(null)}
                data-testid="family-sheet-close"
                aria-label={t('preview.close')}
                className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-slate-300"
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            <p className="rounded-xl border-2 border-amber-600 bg-amber-50 p-2 text-center font-bold text-amber-950" data-testid="not-live-label">
              {t('preview.label')}
            </p>
            <FamilyPreview id={open} />
            <p className="text-sm text-slate-700">{t('preview.note')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
