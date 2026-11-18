'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import Icon from '@/components/Icon';
import Notice from '@/components/Notice';
import { adherence, doseTimes, parseFrequency, planFromLine, startOfDay } from '@/lib/care/schedule';
import type { DoseLog, MedicinePlan } from '@/lib/store/db';
import { addPlan, doseLogsSince, listPlans, markDose, stopPlan } from '@/lib/store/care';

const DAY = 86_400_000;

/**
 * Medicine reminders built from the prescription as written. The user marks each dose taken or missed.
 * Never suggests changing, skipping or doubling a dose: a missed dose says "Ask your doctor or pharmacist" (rule 3).
 */
export default function MedicinesPanel({ personId, refresh, onChange }: { personId: string; refresh: number; onChange: () => void }) {
  const t = useTranslations('diabetes.medicines');
  const format = useFormatter();
  const [plans, setPlans] = useState<MedicinePlan[]>([]);
  const [logs, setLogs] = useState<DoseLog[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [p, l] = await Promise.all([listPlans(personId), doseLogsSince(personId, Date.now() - 31 * DAY)]);
    setPlans(p);
    setLogs(l);
    setNow(Date.now());
  }, [personId]);

  useEffect(() => {
    let alive = true;
    Promise.all([listPlans(personId), doseLogsSince(personId, Date.now() - 31 * DAY)]).then(([p, l]) => {
      if (!alive) return;
      setPlans(p);
      setLogs(l);
    });
    return () => {
      alive = false;
    };
  }, [personId, refresh]);

  const today = startOfDay(now);
  const doses = useMemo(
    () => plans.flatMap((p) => doseTimes(p, today, today + DAY).map((at) => ({ plan: p, at, log: logs.find((l) => l.medicineId === p.id && l.dueAt === at) }))).sort((a, b) => a.at - b.at),
    [plans, logs, today],
  );

  async function mark(plan: MedicinePlan, at: number, status: DoseLog['status']) {
    await markDose(plan, at, status);
    await load();
    onChange();
  }

  const time = (ms: number) => format.dateTime(new Date(ms), { hour: 'numeric', minute: '2-digit' });

  return (
    <section className="space-y-4" data-testid="medicines-panel">
      <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-xl font-bold">{t('title')}</h2>
        <p className="text-sm text-slate-700">{t('intro')}</p>
        {plans.length === 0 && <p data-testid="medicines-none">{t('none')}</p>}
      </div>

      {plans.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
          <h3 className="font-bold">{t('today')}</h3>
          {doses.length === 0 && <p className="text-slate-700">{t('noDosesToday')}</p>}
          <ul className="space-y-2">
            {doses.map(({ plan, at, log }) => (
              <li key={`${plan.id}-${at}`} className="space-y-2 rounded-xl border-2 border-slate-200 p-3" data-testid="dose" data-status={log?.status ?? 'open'}>
                <p className="flex items-center gap-2 font-semibold">
                  <Icon name="clock" size={18} />
                  {time(at)} · {plan.brand} {plan.strength}
                </p>
                <p className="text-sm text-slate-700">{plan.instructions}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={log?.status === 'taken'}
                    onClick={() => mark(plan, at, 'taken')}
                    data-testid="dose-taken"
                    className={`min-h-11 rounded-lg border-2 font-semibold ${log?.status === 'taken' ? 'border-green-700 bg-green-700 text-white' : 'border-green-700 text-green-800'}`}
                  >
                    {t('taken')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={log?.status === 'missed'}
                    onClick={() => mark(plan, at, 'missed')}
                    data-testid="dose-missed"
                    className={`min-h-11 rounded-lg border-2 font-semibold ${log?.status === 'missed' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-500 text-slate-800'}`}
                  >
                    {t('missed')}
                  </button>
                </div>
                {log?.status === 'missed' && (
                  <div data-testid="missed-advice">
                    <Notice tone="warning">{t('missedAdvice')}</Notice>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plans.map((p) => {
        const a = adherence(p, logs, Math.max(p.startDate, now - 7 * DAY), now);
        return (
          <div key={p.id} className="space-y-1 rounded-2xl bg-white p-4 shadow-sm" data-testid="medicine">
            <p className="flex items-center gap-2 font-bold">
              <Icon name="pill" size={18} />
              {p.brand} {p.strength}
            </p>
            {p.generic && <p className="text-sm text-slate-700">{p.generic}</p>}
            <p className="text-sm">{p.instructions}</p>
            <p className="text-sm">{p.times.length ? `${t('times')}: ${p.times.join(', ')}` : t('asNeeded')}</p>
            <p className="text-sm font-semibold" data-testid="adherence">
              {a.percent === null ? t('adherenceNone') : t('adherence', { days: 7, taken: a.taken, scheduled: a.scheduled, percent: a.percent })}
            </p>
            <p className="text-xs text-slate-600">{p.source === 'prescription' ? t('fromPrescription') : t('manual')}</p>
            <button
              type="button"
              onClick={async () => {
                await stopPlan(p.id!);
                await load();
              }}
              className="min-h-11 text-sm text-slate-700 underline"
            >
              {t('stop')}
            </button>
          </div>
        );
      })}

      <AddMedicine
        personId={personId}
        onSaved={async () => {
          await load();
          onChange();
        }}
      />
    </section>
  );
}

function AddMedicine({ personId, onSaved }: { personId: string; onSaved: () => void }) {
  const t = useTranslations('diabetes.medicines');
  const [brand, setBrand] = useState('');
  const [strength, setStrength] = useState('');
  const [frequency, setFrequency] = useState('');
  const [duration, setDuration] = useState('');
  const [times, setTimes] = useState<string[]>([]);
  const parsed = parseFrequency(frequency);
  const shownTimes = parsed.recognised ? parsed.times : times;

  async function save() {
    if (!brand.trim()) return;
    const plan = planFromLine({ brand: brand.trim(), generic: null, strength: strength.trim(), frequency: frequency.trim(), duration: duration.trim() }, personId, 'manual');
    const { asNeeded: _a, recognised: _r, ...rest } = plan;
    void _a;
    void _r;
    await addPlan({ ...rest, times: shownTimes });
    setBrand('');
    setStrength('');
    setFrequency('');
    setDuration('');
    setTimes([]);
    onSaved();
  }

  const input = 'min-h-11 w-full rounded-lg border-2 border-slate-300 px-2';
  return (
    <details className="rounded-2xl bg-white p-4 shadow-sm" data-testid="add-medicine">
      <summary className="min-h-11 cursor-pointer font-bold">{t('addTitle')}</summary>
      <div className="mt-3 space-y-2">
        <label className="block text-sm">
          {t('brand')}
          <input value={brand} onChange={(e) => setBrand(e.target.value)} data-testid="med-brand" className={input} />
        </label>
        <label className="block text-sm">
          {t('strength')}
          <input value={strength} onChange={(e) => setStrength(e.target.value)} className={input} />
        </label>
        <label className="block text-sm">
          {t('frequency')}
          <input value={frequency} onChange={(e) => setFrequency(e.target.value)} data-testid="med-frequency" className={input} />
        </label>
        <label className="block text-sm">
          {t('duration')}
          <input value={duration} onChange={(e) => setDuration(e.target.value)} className={input} />
        </label>
        {frequency && parsed.asNeeded && <p className="text-sm">{t('asNeeded')}</p>}
        {frequency && !parsed.recognised && (
          <div className="space-y-2">
            <p className="text-sm text-amber-900">{t('notRecognised')}</p>
            {times.map((tm, i) => (
              <input
                key={i}
                type="time"
                value={tm}
                onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))}
                className={input}
              />
            ))}
            <button type="button" onClick={() => setTimes([...times, '08:00'])} className="min-h-11 text-sm underline">
              {t('addTime')}
            </button>
          </div>
        )}
        {shownTimes.length > 0 && <p className="text-sm" data-testid="med-times">{`${t('times')}: ${shownTimes.join(', ')}`}</p>}
        <button type="button" disabled={!brand.trim()} onClick={save} data-testid="med-save" className="min-h-12 w-full rounded-xl bg-teal-800 font-bold text-white disabled:opacity-50">
          {t('save')}
        </button>
      </div>
    </details>
  );
}
