'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

type LocState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; url: string } | { kind: 'error' };

export default function EmergencyActions() {
  const t = useTranslations('emergency');
  const [loc, setLoc] = useState<LocState>({ kind: 'idle' });

  function shareLocation() {
    if (!('geolocation' in navigator)) return setLoc({ kind: 'error' });
    setLoc({ kind: 'loading' });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const url = `https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
        setLoc({ kind: 'ready', url });
        if (navigator.share) {
          try {
            await navigator.share({ title: t('title'), url });
          } catch {
            /* user cancelled */
          }
        }
      },
      () => setLoc({ kind: 'error' }),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  const btn = 'flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-lg font-bold';
  return (
    <div className="space-y-3">
      <a href="tel:999" data-testid="call-999" className={`${btn} min-h-20 bg-red-700 text-2xl text-white hover:bg-red-800`}>
        <span aria-hidden="true">☎</span> {t('call999')}
      </a>
      <button type="button" onClick={shareLocation} className={`${btn} border-2 border-red-700 bg-white text-red-800`}>
        <span aria-hidden="true">📍</span> {t('shareLocation')}
      </button>
      <p role="status" className="text-slate-800">
        {loc.kind === 'loading' && t('locationSharing')}
        {loc.kind === 'error' && t('locationError')}
        {loc.kind === 'ready' && (
          <a href={loc.url} className="underline" target="_blank" rel="noopener noreferrer">
            {t('locationShared')}
          </a>
        )}
      </p>
      <a
        href="https://www.google.com/maps/search/?api=1&query=hospital"
        target="_blank"
        rel="noopener noreferrer"
        className={`${btn} border-2 border-slate-700 bg-white text-slate-900`}
      >
        <span aria-hidden="true">🏥</span> {t('nearbyHospitals')}
      </a>
    </div>
  );
}
