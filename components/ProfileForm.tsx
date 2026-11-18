'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { getHealthProfile, parseAllergies, saveHealthProfile } from '@/lib/store/profile';

export default function ProfileForm() {
  const t = useTranslations('settings.profile');
  const [allergies, setAllergies] = useState('');
  const [pregnant, setPregnant] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getHealthProfile()
      .then((p) => {
        setAllergies(p.allergies.join(', '));
        setPregnant(p.pregnant);
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    await saveHealthProfile({ allergies: parseAllergies(allergies), pregnant });
    setSaved(true);
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm" data-testid="profile-form">
      <h2 className="text-lg font-bold">{t('title')}</h2>
      <p className="text-sm text-slate-700">{t('hint')}</p>
      <label className="block space-y-1">
        <span className="font-semibold">{t('allergies')}</span>
        <input
          value={allergies}
          onChange={(e) => {
            setAllergies(e.target.value);
            setSaved(false);
          }}
          placeholder={t('allergiesHint')}
          data-testid="profile-allergies"
          className="min-h-12 w-full rounded-xl border-2 border-slate-400 px-3"
        />
        <span className="block text-xs text-slate-600">{t('allergiesHint')}</span>
      </label>
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="font-semibold">{t('pregnant')}</span>
        <input
          type="checkbox"
          role="switch"
          checked={pregnant}
          data-testid="profile-pregnant"
          onChange={(e) => {
            setPregnant(e.target.checked);
            setSaved(false);
          }}
          className="size-7 shrink-0 accent-teal-800"
        />
      </label>
      <button type="button" onClick={save} data-testid="profile-save" className="min-h-12 w-full rounded-xl bg-teal-800 px-4 font-bold text-white">
        {t('save')}
      </button>
      {saved && (
        <p role="status" className="text-green-800">
          {t('saved')}
        </p>
      )}
    </section>
  );
}
