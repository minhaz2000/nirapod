'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import LanguageSwitch from './LanguageSwitch';
import { DEFAULT_SETTINGS, deleteAllData, getSettings, updateSettings } from '@/lib/store/settings';
import type { Settings } from '@/lib/store/db';
import type { GlucoseUnit } from '@/lib/rules/glucose';

const card = 'space-y-3 rounded-2xl bg-white p-4 shadow-sm';

export default function SettingsForm() {
  const t = useTranslations('settings');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [deleted, setDeleted] = useState(false);
  // Inputs stay disabled until stored settings are loaded, so a stale default never overwrites them.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  async function save(patch: Partial<Omit<Settings, 'id'>>) {
    setSettings((s) => ({ ...s, ...patch }));
    setDeleted(false);
    await updateSettings(patch);
  }

  async function onDelete() {
    if (!window.confirm(t('deleteConfirm'))) return;
    await deleteAllData();
    setSettings(DEFAULT_SETTINGS);
    setDeleted(true);
  }

  return (
    <div className="space-y-4" data-ready={ready}>
      <section className={card}>
        <h2 className="text-lg font-bold">{t('language')}</h2>
        <LanguageSwitch />
      </section>

      <fieldset className={card} disabled={!ready}>
        <legend className="sr-only">{t('glucoseUnit')}</legend>
        <h2 className="text-lg font-bold" aria-hidden="true">
          {t('glucoseUnit')}
        </h2>
        <div className="flex gap-3">
          {(['mmol', 'mgdl'] as GlucoseUnit[]).map((u) => (
            <label
              key={u}
              className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-slate-300 px-3 has-[:checked]:border-teal-800 has-[:checked]:bg-teal-50"
            >
              <input
                type="radio"
                name="glucoseUnit"
                value={u}
                checked={settings.glucoseUnit === u}
                onChange={() => save({ glucoseUnit: u })}
                className="size-5 accent-teal-800"
              />
              {t(u)}
            </label>
          ))}
        </div>
      </fieldset>

      <section className={card}>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
          <span>
            <span className="block text-lg font-bold">{t('demoMode')}</span>
            <span className="block text-sm text-slate-700">{t('demoModeHint')}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            data-testid="demo-mode"
            disabled={!ready}
            checked={settings.demoMode}
            onChange={(e) => save({ demoMode: e.target.checked })}
            className="size-7 shrink-0 accent-teal-800"
          />
        </label>
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold">{t('dataTitle')}</h2>
        <p className="text-sm text-slate-700">{t('dataHint')}</p>
        <button
          type="button"
          onClick={onDelete}
          data-testid="delete-all"
          disabled={!ready}
          className="min-h-12 w-full rounded-xl border-2 border-red-700 bg-white px-4 font-bold text-red-800 hover:bg-red-50"
        >
          {t('deleteAll')}
        </button>
        {deleted && (
          <p role="status" className="text-green-800">
            {t('deleteDone')}
          </p>
        )}
      </section>
    </div>
  );
}
