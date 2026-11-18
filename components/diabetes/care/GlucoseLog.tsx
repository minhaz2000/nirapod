'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { chartGeometry } from '@/lib/care/chart';
import { summariseGlucose } from '@/lib/care/report';
import { formatGlucose, type GlucoseUnit } from '@/lib/rules/glucose';
import type { GlucoseReading } from '@/lib/store/db';
import { glucoseSince } from '@/lib/store/diabetes';

const DAY = 86_400_000;
const COLOURS = { low: '#b91c1c', high: '#d97706', ok: '#0f766e' } as const;

/** Weekly / monthly chart. Low readings are big red points, high readings amber; the target band is shaded. */
export default function GlucoseLog({ personId, unit, refresh }: { personId: string; unit: GlucoseUnit; refresh: number }) {
  const t = useTranslations('diabetes.chart');
  const ts = useTranslations('settings');
  const format = useFormatter();
  const [days, setDays] = useState<7 | 30>(7);
  const [readings, setReadings] = useState<GlucoseReading[]>([]);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    glucoseSince(personId, now - 30 * DAY).then((r) => alive && setReadings(r));
    return () => {
      alive = false;
    };
  }, [personId, refresh, now]);

  const from = now - days * DAY;
  const inPeriod = useMemo(() => readings.filter((r) => r.takenAt >= from), [readings, from]);
  const g = useMemo(() => chartGeometry(inPeriod, from, now), [inPeriod, from, now]);
  const s = summariseGlucose(inPeriod);
  const fmt = (mmol: number) => `${formatGlucose(mmol, unit)}`;

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm" data-testid="glucose-log">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">{t('title')}</h3>
        <div className="flex gap-1" role="group">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              data-testid={`chart-${d}`}
              onClick={() => setDays(d)}
              className={`min-h-11 rounded-lg border-2 px-3 text-sm font-semibold ${days === d ? 'border-teal-800 bg-teal-800 text-white' : 'border-slate-300'}`}
            >
              {t(d === 7 ? 'week' : 'month')}
            </button>
          ))}
        </div>
      </div>
      {inPeriod.length === 0 ? (
        <p className="text-slate-700">{t('empty')}</p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${g.width} ${g.height}`}
            className="h-auto w-full"
            role="img"
            aria-label={t('label', { days, count: s.count, lows: s.lows, highs: s.highs })}
            data-testid="glucose-chart"
          >
            <rect x={g.pad.left} y={g.band.top} width={g.width - g.pad.left - g.pad.right} height={g.band.bottom - g.band.top} fill="#dcfce7" />
            <line x1={g.pad.left} x2={g.width - g.pad.right} y1={g.lowLineY} y2={g.lowLineY} stroke="#b91c1c" strokeDasharray="4 3" />
            {g.ticks.map((tk) => (
              <g key={tk.mmol}>
                <line x1={g.pad.left} x2={g.width - g.pad.right} y1={tk.y} y2={tk.y} stroke="#e2e8f0" />
                <text x={g.pad.left - 4} y={tk.y + 3} fontSize="9" textAnchor="end" fill="#475569">
                  {fmt(tk.mmol)}
                </text>
              </g>
            ))}
            {g.days.map((d, i) =>
              days === 7 || i % 5 === 4 ? (
                <text key={d.at} x={d.x} y={g.height - 8} fontSize="9" textAnchor="middle" fill="#475569">
                  {format.dateTime(new Date(d.at), { day: 'numeric', month: 'short' })}
                </text>
              ) : null,
            )}
            <polyline points={g.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#94a3b8" strokeWidth="1" />
            {g.points.map((p) => (
              <circle key={p.at} cx={p.x} cy={p.y} r={p.level === 'ok' ? 2.5 : 4.5} fill={COLOURS[p.level]} data-level={p.level}>
                <title>{`${format.dateTime(new Date(p.at), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}: ${fmt(p.mmol)} ${ts(unit)}`}</title>
              </circle>
            ))}
          </svg>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
            <span className="flex items-center gap-1">
              <span className="inline-block size-3 bg-green-100" /> {t('range')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-3 rounded-full bg-red-700" /> {t('low')}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-3 rounded-full bg-amber-600" /> {t('high')}
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-2 text-sm" data-testid="glucose-stats">
            <li className="rounded-lg bg-slate-100 p-2">{t('average', { value: `${fmt(s.average!)} ${ts(unit)}` })}</li>
            <li className="rounded-lg bg-slate-100 p-2">{t('inRange', { percent: s.inRangePercent ?? 0 })}</li>
            <li className={`rounded-lg p-2 ${s.lows ? 'bg-red-100 font-bold text-red-900' : 'bg-slate-100'}`} data-testid="stat-lows">
              {t('lows', { count: s.lows })}
            </li>
            <li className={`rounded-lg p-2 ${s.highs ? 'bg-amber-100 font-semibold text-amber-900' : 'bg-slate-100'}`}>{t('highs', { count: s.highs })}</li>
          </ul>
        </>
      )}
    </section>
  );
}
