'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import Icon, { type IconName } from '@/components/Icon';
import Notice from '@/components/Notice';
import { controlLevel } from '@/lib/rules/meal-signal';
import type { GlucoseUnit } from '@/lib/rules/glucose';
import { trialDaysLeft } from '@/lib/diabetes/trial';
import type { DiabetesProfile, Meal } from '@/lib/store/db';
import { activePersonId, getDiabetesProfile, pendingTwoHour } from '@/lib/store/diabetes';
import { getSettings } from '@/lib/store/settings';
import GlucosePanel from './GlucosePanel';
import MealCheck from './MealCheck';
import Onboarding from './Onboarding';
import Patterns from './Patterns';

type Tab = 'meal' | 'glucose' | 'patterns';
const TABS: Array<{ id: Tab; icon: IconName }> = [
  { id: 'meal', icon: 'plate' },
  { id: 'glucose', icon: 'drop' },
  { id: 'patterns', icon: 'chart' },
];

/** Diabetes Companion: onboarding once, then meals, sugar readings and personal patterns. All data on the phone. */
export default function DiabetesApp() {
  const t = useTranslations('diabetes');
  const format = useFormatter();
  const [personId, setPersonId] = useState<string | null>(null);
  const [profile, setProfile] = useState<DiabetesProfile | null | undefined>(undefined);
  const [unit, setUnit] = useState<GlucoseUnit>('mmol');
  const [demo, setDemo] = useState(false);
  const [trialStart, setTrialStart] = useState<number | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('meal');
  const [refresh, setRefresh] = useState(0);
  const [due, setDue] = useState<Meal[]>([]);
  const [forMeal, setForMeal] = useState<{ id: number; takenAt: number } | null>(null);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setUnit(s.glucoseUnit);
      setDemo(s.demoMode);
      setTrialStart(s.trialStart);
      const id = await activePersonId();
      setPersonId(id);
      setProfile((await getDiabetesProfile(id)) ?? null);
    })().catch(() => setProfile(null));
  }, []);

  useEffect(() => {
    if (!personId || !profile) return;
    let alive = true;
    const check = () => pendingTwoHour(personId).then((m) => alive && setDue(m));
    void check();
    const timer = setInterval(check, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [personId, profile, refresh]);

  const bump = useCallback(() => setRefresh((r) => r + 1), []);

  if (profile === undefined || !personId) return <p className="text-slate-600">…</p>;
  if (profile === null) {
    return (
      <Onboarding
        personId={personId}
        unit={unit}
        onUnit={setUnit}
        demo={demo}
        onDone={async (p) => {
          setProfile(p);
          setTrialStart((await getSettings()).trialStart);
        }}
      />
    );
  }

  const level = controlLevel({ fastingMmol: profile.fastingMmol, hba1c: profile.hba1c });
  const days = trialDaysLeft(trialStart);
  return (
    <div className="space-y-4" data-testid="diabetes-app">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-teal-100 px-3 py-1 text-sm font-semibold text-teal-900" data-testid="control-level" data-level={level}>
          {t(`level.${level}`)}
        </span>
        {days !== null && (
          <span className="rounded-full bg-slate-200 px-3 py-1 text-sm" data-testid="trial-left">
            {t('trialLeft', { days })}
          </span>
        )}
      </div>

      {due.map((m) => (
        <div key={m.id} data-testid="two-hour-due">
          <Notice tone="info">
            <p className="flex items-center gap-2">
              <Icon name="clock" size={18} />
              {t('glucose.due', { time: format.dateTime(new Date(m.takenAt), { hour: 'numeric', minute: '2-digit' }) })}
            </p>
            <button
              type="button"
              onClick={() => {
                setForMeal({ id: m.id!, takenAt: m.takenAt });
                setTab('glucose');
              }}
              className="mt-2 min-h-11 rounded-lg bg-teal-800 px-4 font-semibold text-white"
            >
              {t('glucose.enterNow')}
            </button>
          </Notice>
        </div>
      ))}

      <nav className="grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 shadow-sm" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            data-testid={`tab-${x.id}`}
            onClick={() => setTab(x.id)}
            className={`flex min-h-12 flex-col items-center justify-center rounded-xl text-sm font-semibold ${tab === x.id ? 'bg-teal-800 text-white' : 'text-slate-800'}`}
          >
            <Icon name={x.icon} size={20} />
            {t(`tabs.${x.id}`)}
          </button>
        ))}
      </nav>

      {tab === 'meal' && <MealCheck personId={personId} profile={profile} demo={demo} onSaved={bump} />}
      {tab === 'glucose' && (
        <GlucosePanel
          personId={personId}
          unit={unit}
          forMeal={forMeal}
          refresh={refresh}
          onSaved={() => {
            setForMeal(null);
            bump();
          }}
        />
      )}
      {tab === 'patterns' && <Patterns personId={personId} unit={unit} fasting={profile.fastingMmol} refresh={refresh} />}

      <p className="text-xs text-slate-600">{t('credit')}</p>
    </div>
  );
}
