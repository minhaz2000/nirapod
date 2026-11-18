'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { checkupStatus } from '@/lib/care/checkups';
import { notificationState, requestNotifications, type NotificationState } from '@/lib/care/notify';
import type { Checkup, ReminderSettings } from '@/lib/store/db';
import { getReminders, listCheckups, saveCheckup, saveReminders } from '@/lib/store/care';

/** Reminder settings and check-ups (intervals from config/checkups.ts, editable). */
export default function CarePanel({ personId }: { personId: string }) {
  const t = useTranslations('diabetes.care');
  const tc = useTranslations('diabetes.checkups');
  const format = useFormatter();
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [checkups, setCheckups] = useState<Checkup[]>([]);
  const [perm, setPerm] = useState<NotificationState>('unsupported');

  useEffect(() => {
    let alive = true;
    Promise.all([getReminders(personId), listCheckups(personId)]).then(([s, c]) => {
      if (!alive) return;
      setSettings(s);
      setCheckups(c);
      setPerm(notificationState());
    });
    return () => {
      alive = false;
    };
  }, [personId]);

  async function update(patch: Partial<ReminderSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveReminders(next);
  }

  async function updateCheckup(c: Checkup) {
    setCheckups((list) => list.map((x) => (x.id === c.id ? c : x)));
    await saveCheckup(c);
  }

  if (!settings) return null;
  const card = 'space-y-3 rounded-2xl bg-white p-4 shadow-sm';
  const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void, testId: string) => (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} data-testid={testId} onChange={(e) => onChange(e.target.checked)} className="size-7 shrink-0 accent-teal-800" />
    </label>
  );
  const date = (ms: number) => format.dateTime(new Date(ms), { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <section className="space-y-4" data-testid="care-panel">
      <div className={card}>
        <h2 className="text-xl font-bold">{t('remindersTitle')}</h2>
        <p className="text-sm text-slate-700">{t('remindersNote')}</p>
        <p className="text-sm" data-testid="notify-state">
          {perm === 'granted' ? t('notifyOn') : perm === 'denied' ? t('notifyBlocked') : t('notifyOff')}
        </p>
        {perm === 'default' && (
          <button type="button" onClick={async () => setPerm(await requestNotifications())} className="min-h-11 rounded-lg border-2 border-teal-800 px-3 font-semibold text-teal-900">
            {t('notifyAsk')}
          </button>
        )}
        {toggle(t('mealReminders'), settings.meals.enabled, (v) => update({ meals: { ...settings.meals, enabled: v } }), 'remind-meals')}
        {settings.meals.enabled && (
          <div className="grid grid-cols-3 gap-2">
            {(['breakfast', 'lunch', 'dinner'] as const).map((m) => (
              <label key={m} className="block text-sm">
                {t(m)}
                <input
                  type="time"
                  value={settings.meals[m]}
                  onChange={(e) => update({ meals: { ...settings.meals, [m]: e.target.value } })}
                  className="min-h-11 w-full rounded-lg border-2 border-slate-300 px-1"
                />
              </label>
            ))}
          </div>
        )}
        {toggle(t('walk'), settings.walkAfterMeals, (v) => update({ walkAfterMeals: v }), 'remind-walk')}
        {toggle(t('medicineReminders'), settings.medicines, (v) => update({ medicines: v }), 'remind-medicines')}
        {toggle(t('checkupReminders'), settings.checkups, (v) => update({ checkups: v }), 'remind-checkups')}
      </div>

      <div className={card}>
        <h2 className="text-xl font-bold">{t('checkupsTitle')}</h2>
        <p className="text-sm text-slate-700">{t('checkupsNote')}</p>
        <ul className="space-y-3">
          {checkups.map((c) => {
            const s = checkupStatus(c);
            return (
              <li key={c.id} className="space-y-2 rounded-xl border-2 border-slate-200 p-3" data-testid="checkup" data-due={String(s.due)}>
                <p className="font-bold">{tc(c.type)}</p>
                <label className="flex items-center gap-2 text-sm">
                  {t('every')}
                  <select
                    value={c.intervalMonths}
                    onChange={(e) => updateCheckup({ ...c, intervalMonths: Number(e.target.value) })}
                    data-testid="checkup-interval"
                    className="min-h-11 rounded-lg border-2 border-slate-300 px-2"
                  >
                    {[1, 2, 3, 4, 6, 9, 12, 18, 24].map((n) => (
                      <option key={n} value={n}>
                        {t('months', { n })}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-sm">
                  {t('lastDone')}: {c.lastDone ? date(c.lastDone) : t('never')}
                </p>
                <p className={`text-sm font-semibold ${s.due ? 'text-amber-900' : 'text-green-800'}`}>{s.nextDue && !s.due ? t('nextDue', { date: date(s.nextDue) }) : t('dueNow')}</p>
                <button
                  type="button"
                  onClick={() => updateCheckup({ ...c, lastDone: Date.now() })}
                  data-testid="checkup-done"
                  className="min-h-11 rounded-lg border-2 border-teal-800 px-3 text-sm font-semibold text-teal-900"
                >
                  {t('markDone')}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
