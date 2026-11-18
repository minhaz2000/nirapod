'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Icon from '@/components/Icon';
import { notify } from '@/lib/care/notify';
import { dueReminders, type Reminder } from '@/lib/care/reminders';
import { getReminders, listCheckups, listPlans } from '@/lib/store/care';
import { activePersonId, getDiabetesProfile, mealsSince } from '@/lib/store/diabetes';

const KEY = 'nirapod.reminders.lastCheck';
const MAX_BACKLOG = 2 * 3_600_000;
/** On the first check after opening the app, reminders from the last 15 minutes are still shown. */
const FIRST_LOOKBACK = 15 * 60_000;

/**
 * Checks once a minute (while the app is open) whether a meal, walk, medicine or check-up reminder is due, and shows a
 * notification — or an in-app banner when notifications are off. Never suggests changing a dose.
 */
export default function ReminderRunner() {
  const t = useTranslations('diabetes');
  const [banners, setBanners] = useState<Array<{ key: string; text: string }>>([]);

  useEffect(() => {
    let alive = true;
    const text = (r: Reminder) => {
      switch (r.kind) {
        case 'meal':
          return t('reminder.meal', { meal: t(`care.${r.meal}`) });
        case 'walk':
          return t('reminder.walk');
        case 'medicine':
          return t('reminder.medicine', { brand: r.brand, instructions: r.instructions });
        case 'checkup':
          return t('reminder.checkup', { type: t(`checkups.${r.type}`) });
      }
    };
    async function tick() {
      const personId = await activePersonId();
      if (!(await getDiabetesProfile(personId))) return; // reminders belong to the Diabetes Companion
      const now = Date.now();
      const stored = Number(localStorage.getItem(KEY));
      const since = Number.isFinite(stored) && stored > 0 ? Math.max(stored, now - MAX_BACKLOG) : now - FIRST_LOOKBACK;
      localStorage.setItem(KEY, String(now));
      const [settings, plans, meals, checkups] = await Promise.all([
        getReminders(personId),
        listPlans(personId),
        mealsSince(personId, now - MAX_BACKLOG),
        listCheckups(personId),
      ]);
      for (const r of dueReminders(since, now, settings, { plans, meals, checkups })) {
        const body = text(r);
        const key = `${r.kind}-${r.at}`;
        const shown = await notify('Nirapod', body, key);
        if (!shown && alive) setBanners((b) => (b.some((x) => x.key === key) ? b : [...b, { key, text: body }].slice(-3)));
      }
    }
    const run = () => void tick().catch(() => undefined);
    run();
    const timer = setInterval(run, 60_000);
    // Background tabs get throttled timers: check again as soon as the app is visible.
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [t]);

  if (!banners.length) return null;
  return (
    <div className="fixed inset-x-0 top-16 z-40 mx-auto max-w-md space-y-2 px-3 print:hidden" role="status" data-testid="reminder-banners">
      {banners.map((b) => (
        <div key={b.key} className="flex items-start gap-2 rounded-xl border-2 border-teal-800 bg-white p-3 shadow-lg" data-testid="reminder-banner">
          <Icon name="bell" size={20} className="mt-0.5 text-teal-800" />
          <p className="flex-1 text-sm">{b.text}</p>
          <Link href="/diabetes" className="min-h-11 text-sm font-semibold text-teal-900 underline" onClick={() => setBanners((x) => x.filter((y) => y.key !== b.key))}>
            {t('reminder.open')}
          </Link>
          <button type="button" onClick={() => setBanners((x) => x.filter((y) => y.key !== b.key))} className="min-h-11 min-w-11 text-sm font-semibold">
            {t('reminder.dismiss')}
          </button>
        </div>
      ))}
    </div>
  );
}
