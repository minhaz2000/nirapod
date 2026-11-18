'use client';

import { useEffect, useId, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { DangerAssessment } from '@/lib/rules/danger-signs';
import Call999Button from './Call999Button';
import LocationActions from './LocationActions';
import type { LocationApi } from './useLocation';
import { useSignLabel } from './useSignLabel';
import Icon from '@/components/Icon';

interface Props {
  assessment: DangerAssessment;
  location: LocationApi;
  onClose: () => void;
}

/** Full-screen alert shown as soon as any danger sign is selected. */
export default function EmergencyAlert({ assessment, location, onClose }: Props) {
  const t = useTranslations('emergency');
  const label = useSignLabel();
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="emergency-alert"
      className="fixed inset-0 z-[60] overflow-y-auto bg-red-700 text-white"
    >
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className="text-3xl leading-tight font-bold outline-none">
          <Icon name="alert" size={30} className="mr-2 align-[-4px]" />
          {t('alert.title')}
        </h2>

        <Call999Button variant="alert" />
        <p className="text-base text-red-50">{t('about999')}</p>

        <section>
          <h3 className="font-semibold">{t('alert.youSelected')}</h3>
          <ul className="list-disc pl-5" data-testid="alert-signs">
            {assessment.triggered.map((id) => (
              <li key={id}>{label(id)}</li>
            ))}
          </ul>
        </section>

        {assessment.advice.length > 0 && (
          <ul className="space-y-2" data-testid="alert-advice">
            {assessment.advice.map((a) => (
              <li key={a} className="rounded-xl bg-white p-3 font-semibold text-red-900">
                {t(`advice.${a}`)}
              </li>
            ))}
          </ul>
        )}

        <LocationActions location={location} variant="alert" />

        <p className="text-sm text-red-50">{t('cost')}</p>

        <button
          type="button"
          onClick={onClose}
          data-testid="alert-close"
          className="mt-auto min-h-12 w-full rounded-xl border-2 border-white/70 px-4 font-semibold text-white hover:bg-red-800"
        >
          {t('alert.close')}
        </button>
      </div>
    </div>
  );
}
