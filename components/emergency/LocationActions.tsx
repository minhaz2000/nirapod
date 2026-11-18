'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { hospitalsSearchUrl, locationLink } from '@/lib/emergency/location';
import type { LocationApi } from './useLocation';
import Icon from '@/components/Icon';

interface Props {
  location: LocationApi;
  variant?: 'page' | 'alert';
}

/** "Share my location" (share sheet, or copy link) and "Nearby hospitals" (maps search near the user). */
export default function LocationActions({ location, variant = 'page' }: Props) {
  const t = useTranslations('emergency');
  const [copied, setCopied] = useState(false);
  const { state } = location;
  const onAlert = variant === 'alert';
  const id = (name: string) => (onAlert ? `alert-${name}` : name);

  async function shareOrCopy(link: string) {
    setCopied(false);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: t('title'), text: t('shareText'), url: link });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // user closed the sheet
      }
    }
    await copy(link);
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(`${t('shareText')} ${link}`);
      setCopied(true);
    } catch {
      /* the link stays visible on screen */
    }
  }

  async function onShare() {
    if (state.kind === 'ready') return shareOrCopy(state.link);
    const coords = await location.request();
    if (coords) await shareOrCopy(locationLink(coords));
  }

  const btn =
    'flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 px-4 text-lg font-bold focus-visible:outline-4 focus-visible:outline-offset-2';
  const outline = onAlert
    ? 'border-white bg-red-800 text-white hover:bg-red-900 focus-visible:outline-white'
    : 'border-red-700 bg-white text-red-800 hover:bg-red-50 focus-visible:outline-red-900';
  const small = `inline-flex min-h-11 items-center rounded-xl border-2 px-3 font-semibold ${
    onAlert ? 'border-white text-white' : 'border-slate-700 text-slate-900'
  }`;
  const coords = state.kind === 'ready' ? state.coords : null;

  return (
    <div className="space-y-3">
      <button type="button" onClick={onShare} data-testid={id('share-location')} className={`${btn} ${outline}`}>
        <Icon name="mapPin" size={22} /> {t('shareLocation')}
      </button>

      <div role="status" data-testid={id('location-status')} className={onAlert ? 'text-white' : 'text-slate-800'}>
        {state.kind === 'loading' && <p>{t('locationSharing')}</p>}
        {state.kind === 'error' && <p>{t('locationError')}</p>}
        {state.kind === 'ready' && (
          <div className="space-y-2">
            <p>
              {t('locationReady')}{' '}
              <a
                href={state.link}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={id('location-link')}
                className="break-all underline"
              >
                {state.link}
              </a>
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={small} onClick={() => shareOrCopy(state.link)}>
                {t('shareAgain')}
              </button>
              <button type="button" className={small} onClick={() => copy(state.link)}>
                {t('copyLink')}
              </button>
            </div>
          </div>
        )}
        {copied && <p data-testid={id('link-copied')}>{t('linkCopied')}</p>}
      </div>

      <a
        href={hospitalsSearchUrl(coords)}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={id('nearby-hospitals')}
        className={`${btn} ${onAlert ? outline : 'border-slate-700 bg-white text-slate-900 hover:bg-slate-50'}`}
      >
        <Icon name="hospital" size={22} /> {t('nearbyHospitals')}
      </a>
      {!coords && <p className={`text-sm ${onAlert ? 'text-red-50' : 'text-slate-700'}`}>{t('nearbyHospitalsHint')}</p>}
    </div>
  );
}
