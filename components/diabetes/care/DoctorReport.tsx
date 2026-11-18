'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Icon from '@/components/Icon';
import { loadReport } from '@/lib/care/data';
import type { DoctorReport as Report } from '@/lib/care/report';
import { formatGlucose, type GlucoseUnit } from '@/lib/rules/glucose';
import { ME, type Profile } from '@/lib/store/db';
import { listPeople } from '@/lib/store/care';
import { activePersonId } from '@/lib/store/diabetes';
import { getSettings } from '@/lib/store/settings';
import { isLowGlucose } from '@/lib/rules/glucose';
import { GLUCOSE_TARGETS } from '@/config/glucose-targets';

/** One printable page for the doctor: last 30 days of readings, meal signals, adherence and check-ups. */
export default function DoctorReport() {
  const t = useTranslations('diabetes.report');
  const tk = useTranslations('diabetes.glucose.kinds');
  const tl = useTranslations('diabetes.level');
  const tc = useTranslations('diabetes.checkups');
  const ts = useTranslations('settings');
  const format = useFormatter();
  const [data, setData] = useState<{ report: Report; unit: GlucoseUnit; person: Profile | undefined } | null>(null);

  useEffect(() => {
    (async () => {
      const [s, id, people] = await Promise.all([getSettings(), activePersonId(), listPeople()]);
      setData({ report: await loadReport(id, 30), unit: s.glucoseUnit, person: people.find((p) => p.id === id) });
    })().catch(() => undefined);
  }, []);

  if (!data) return <p>…</p>;
  const { report: r, unit } = data;
  const g = (mmol: number | null) => (mmol === null ? '—' : `${formatGlucose(mmol, unit)} ${ts(unit)}`);
  const date = (ms: number) => format.dateTime(new Date(ms), { day: 'numeric', month: 'short', year: 'numeric' });
  const dateTime = (ms: number) => format.dateTime(new Date(ms), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const th = 'border-b border-slate-400 px-1 py-0.5 text-left';
  const td = 'border-b border-slate-200 px-1 py-0.5';
  const high = GLUCOSE_TARGETS.twoHour.target;

  return (
    <article className="space-y-3 bg-white p-2 text-[13px] leading-snug text-black print:p-0" data-testid="doctor-report">
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={() => window.print()} data-testid="report-print" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-teal-800 px-4 font-bold text-white">
          <Icon name="printer" size={20} />
          {t('print')}
        </button>
        <Link href="/diabetes" className="inline-flex min-h-12 items-center rounded-xl border-2 border-slate-400 px-4 font-semibold">
          {t('back')}
        </Link>
      </div>

      <header>
        <h1 className="text-xl font-bold">{t('title')}</h1>
        <p>
          {data.person && data.person.id !== ME && data.person.name && `${t('person')}: ${data.person.name} · `}
          {t('period', { from: date(r.from), to: date(r.to) })}
        </p>
        {r.baseline && (
          <p data-testid="report-baseline">
            {t('baseline')}: {t('fasting', { value: g(r.baseline.fastingMmol) })}
            {r.baseline.hba1c != null && ` · ${t('hba1c', { value: r.baseline.hba1c })}`} · {tl(r.baseline.level)}
          </p>
        )}
      </header>

      <section>
        <h2 className="font-bold">{t('glucose')}</h2>
        <p data-testid="report-glucose">
          {t('readings')}: {r.glucose.count} · {t('average')}: {g(r.glucose.average)} · {t('lowest')}: {g(r.glucose.lowest)} · {t('highest')}: {g(r.glucose.highest)} ·{' '}
          {t('inRange')}: {r.glucose.inRangePercent ?? '—'}%
        </p>
        <p className={r.glucose.lows ? 'font-bold' : ''} data-testid="report-lows">
          {t('lowsHighs', { lows: r.glucose.lows, highs: r.glucose.highs })}
        </p>
        {Object.keys(r.glucose.averageByKind).length > 0 && (
          <p>
            {t('byKind')}:{' '}
            {Object.entries(r.glucose.averageByKind)
              .map(([k, v]) => `${tk(k)} ${g(v)}`)
              .join(' · ')}
          </p>
        )}
        {r.readings.length > 0 && (
          <table className="mt-1 w-full border-collapse text-[11px]" data-testid="report-readings">
            <thead>
              <tr>
                <th className={th}>{t('date')}</th>
                <th className={th}>{t('when')}</th>
                <th className={th}>{t('value')}</th>
              </tr>
            </thead>
            <tbody>
              {r.readings.map((x) => (
                <tr key={x.id ?? x.takenAt} className={isLowGlucose(x.mmol) ? 'font-bold' : ''}>
                  <td className={td}>{dateTime(x.takenAt)}</td>
                  <td className={td}>{tk(x.kind)}</td>
                  <td className={td}>
                    {g(x.mmol)}
                    {isLowGlucose(x.mmol) ? ' ▼' : x.mmol >= high ? ' ▲' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="font-bold">{t('meals')}</h2>
        <p data-testid="report-meals">
          {r.meals.count ? t('mealCounts', { count: r.meals.count, green: r.meals.green, amber: r.meals.amber, red: r.meals.red, carbs: r.meals.averageCarbs ?? 0 }) : t('none')}
        </p>
      </section>

      <section>
        <h2 className="font-bold">{t('medicines')}</h2>
        {r.medicines.length === 0 ? (
          <p>{t('none')}</p>
        ) : (
          <table className="w-full border-collapse text-[11px]" data-testid="report-medicines">
            <thead>
              <tr>
                <th className={th}>{t('medicine')}</th>
                <th className={th}>{t('instructions')}</th>
                <th className={th}>{t('taken')}</th>
                <th className={th}>{t('missed')}</th>
                <th className={th}>{t('unmarked')}</th>
              </tr>
            </thead>
            <tbody>
              {r.medicines.map((m, i) => (
                <tr key={i}>
                  <td className={td}>
                    {m.brand} {m.strength}
                    {m.generic && <span className="text-slate-600"> ({m.generic})</span>}
                  </td>
                  <td className={td}>{m.instructions}</td>
                  <td className={td}>
                    {m.adherence.taken}/{m.adherence.scheduled}
                    {m.adherence.percent !== null && ` (${m.adherence.percent}%)`}
                  </td>
                  <td className={td}>{m.adherence.missed}</td>
                  <td className={td}>{m.adherence.unmarked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="font-bold">{t('checkups')}</h2>
        <table className="w-full border-collapse text-[11px]" data-testid="report-checkups">
          <thead>
            <tr>
              <th className={th}>{t('checkup')}</th>
              <th className={th}>{t('lastDone')}</th>
              <th className={th}>{t('nextDue')}</th>
            </tr>
          </thead>
          <tbody>
            {r.checkups.map((c) => (
              <tr key={c.id}>
                <td className={td}>{tc(c.type)}</td>
                <td className={td}>{c.lastDone ? date(c.lastDone) : '—'}</td>
                <td className={td}>{c.nextDue ? date(c.nextDue) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-[10px] text-slate-600">{t('footer')}</p>
    </article>
  );
}
