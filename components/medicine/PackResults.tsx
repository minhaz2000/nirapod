'use client';

import { useFormatter, useTranslations } from 'next-intl';
import type { AlternativesResponse } from '@/lib/medicine/client';
import type { PackUnit } from '@/lib/medicine/normalise';
import type { Product } from '@/lib/medicine/repo';
import { formatPackDate } from '@/lib/ocr/expiry';
import type { PackReading } from '@/lib/ocr/pack';
import { printedUnitPrice } from '@/lib/ocr/price';
import { findSuspiciousSigns, type SuspiciousSign } from '@/lib/rules/medicine';
import ExpiryCard from './ExpiryCard';

interface Props {
  product: Product;
  reading: PackReading | null;
  alternatives: AlternativesResponse;
  today?: Date;
  onRestart: () => void;
}

const card = 'space-y-2 rounded-2xl bg-white p-4 shadow-sm';

export default function PackResults({ product, reading, alternatives, today = new Date(), onRestart }: Props) {
  const t = useTranslations('medicine.scan.result');
  const format = useFormatter();

  const money = (v: number) =>
    format.number(v, { style: 'currency', currency: 'BDT', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const priceEach = (v: number, unit: PackUnit | null) => t('priceEach', { price: money(v), unit: unit ?? 'other' });
  const [y, m] = alternatives.data.lastUpdated.split('-').map(Number);
  const dataDate = y && m ? format.dateTime(new Date(y, m - 1, 1), { year: 'numeric', month: 'long' }) : '';

  const signs: SuspiciousSign[] = reading
    ? findSuspiciousSigns({
        text: reading.text,
        batch: reading.batch,
        dates: reading.dates,
        printedUnitPrice: printedUnitPrice(reading.price),
        product,
        today,
      })
    : [];

  const signText = (s: SuspiciousSign) => {
    switch (s.code) {
      case 'brandSpelling':
      case 'manufacturerSpelling':
        return t(`signs.${s.code}`, { printed: s.printed, expected: s.expected });
      case 'expiryBeforeManufacture':
        return t('signs.expiryBeforeManufacture', { mfg: s.mfg, exp: s.exp });
      case 'expired':
        return t('signs.expired', { exp: s.exp });
      case 'priceFarBelow':
        return t('signs.priceFarBelow', { printed: money(s.printedUnitPrice), usual: money(s.databaseUnitPrice) });
      default:
        return t(`signs.${s.code}`);
    }
  };

  const cheaper = alternatives.status === 'ok' ? alternatives.alternatives.filter((a) => a.cheaper).slice(0, 5) : [];

  return (
    <div className="space-y-4" data-testid="pack-results">
      <section className={card}>
        <h3 className="text-lg font-bold">{t('whatItIs')}</h3>
        <p className="text-2xl font-bold text-teal-900" data-testid="result-brand">
          {product.brand}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base">
          <dt className="text-slate-600">{t('generic')}</dt>
          <dd data-testid="result-generic">{product.generic ?? '—'}</dd>
          <dt className="text-slate-600">{t('strengthForm')}</dt>
          <dd>
            {product.strength || '—'} · {product.form}
          </dd>
          <dt className="text-slate-600">{t('manufacturer')}</dt>
          <dd>{product.manufacturer ?? '—'}</dd>
          {product.drugClass && (
            <>
              <dt className="text-slate-600">{t('drugClass')}</dt>
              <dd lang="en">{product.drugClass}</dd>
            </>
          )}
        </dl>
        {product.indication && (
          <div>
            <p className="font-semibold">{t('usedFor')}</p>
            <p lang="en" data-testid="result-indication">
              {product.indication.length > 220 ? `${product.indication.slice(0, 220)}…` : product.indication}
            </p>
            <p className="text-xs text-slate-600">{t('usedForNote')}</p>
          </div>
        )}
      </section>

      {reading && <ExpiryCard dates={reading.dates} today={today} />}

      {reading && (
        <section className={card} data-testid="result-signs" data-count={signs.length}>
          <h3 className="text-lg font-bold">{t('signsTitle')}</h3>
          {signs.length === 0 ? (
            <p className="font-semibold text-green-800">{t('noSigns')}</p>
          ) : (
            <>
              <p className="font-semibold text-amber-900">{t('signsFound', { count: signs.length })}</p>
              <ul className="list-disc space-y-1 pl-5">
                {signs.map((s) => (
                  <li key={s.code} data-sign={s.code}>
                    {signText(s)}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-sm text-slate-700">{t('signsNote')}</p>
        </section>
      )}

      <section className={card} data-testid="result-alternatives">
        <h3 className="text-lg font-bold">{t('alternativesTitle')}</h3>
        <p className="text-sm text-slate-700">{t('alternativesHint')}</p>
        {alternatives.status === 'not_comparable' && <p>{t(`notComparable.${alternatives.reason}`)}</p>}
        {alternatives.status === 'ok' && (
          <>
            {product.unitPrice !== null && (
              <p>
                {product.brand}: <strong>{priceEach(product.unitPrice, product.unit)}</strong>
              </p>
            )}
            {cheaper.length === 0 ? (
              <p>{t('noCheaper')}</p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {cheaper.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2" data-testid="alternative">
                    <span>
                      <span className="block font-semibold">
                        {a.brand} {a.strength}
                      </span>
                      <span className="block text-sm text-slate-700">{a.manufacturer}</span>
                    </span>
                    <span className="shrink-0 font-semibold text-green-800">{priceEach(a.unitPrice!, a.unit)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <p className="font-semibold text-teal-900" data-testid="pharmacist-note">
          {t('pharmacist')}
        </p>
        <p className="text-sm text-slate-600" data-testid="prices-note">
          {t('pricesNote', { date: dataDate })}
        </p>
      </section>

      {reading && (
        <section className={card}>
          <h3 className="text-lg font-bold">{t('readTitle')}</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" data-testid="result-read">
            <dt className="text-slate-600">{t('batch')}</dt>
            <dd>{reading.batch ?? t('notFound')}</dd>
            <dt className="text-slate-600">{t('mfg')}</dt>
            <dd>{reading.dates.mfg ? formatPackDate(reading.dates.mfg) : t('notFound')}</dd>
            <dt className="text-slate-600">{t('exp')}</dt>
            <dd>{reading.dates.exp ? formatPackDate(reading.dates.exp) : t('notFound')}</dd>
            <dt className="text-slate-600">{t('printedPrice')}</dt>
            <dd>{reading.price ? money(reading.price.amount) : t('notFound')}</dd>
            <dt className="text-slate-600">{t('registration')}</dt>
            <dd>{reading.registration ?? t('notFound')}</dd>
          </dl>
        </section>
      )}

      <button
        type="button"
        onClick={onRestart}
        className="min-h-12 w-full rounded-xl border-2 border-teal-800 px-4 font-bold text-teal-900"
      >
        {t('scanAnother')}
      </button>
    </div>
  );
}
