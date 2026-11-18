'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Icon from '@/components/Icon';
import { loadReport } from '@/lib/care/data';
import { weeklySummaryText, type SummaryT } from '@/lib/care/report';
import { formatGlucose, type GlucoseUnit } from '@/lib/rules/glucose';
import { ME, type Profile } from '@/lib/store/db';
import { addPerson, listPeople, setActivePerson } from '@/lib/store/care';
import PremiumScreen from './PremiumScreen';

/** Doctor report, family mode, weekly summary sharing (text only) and the Premium screen. */
export default function MorePanel({ personId, unit, onPerson }: { personId: string; unit: GlucoseUnit; onPerson: (id: string) => void }) {
  const t = useTranslations('diabetes.more');
  const tSummary = useTranslations('diabetes.summary') as unknown as SummaryT;
  const ts = useTranslations('settings');
  const [people, setPeople] = useState<Profile[]>([]);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    listPeople().then((p) => alive && setPeople(p));
    return () => {
      alive = false;
    };
  }, []);

  async function switchTo(id: string) {
    await setActivePerson(id);
    onPerson(id);
  }

  async function share() {
    const report = await loadReport(personId, 7);
    const person = people.find((p) => p.id === personId);
    const text = weeklySummaryText(tSummary, report, (m) => `${formatGlucose(m, unit)} ${ts(unit)}`, person?.id === ME ? '' : person?.name);
    setCopied(false);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* nothing else to do */
    }
  }

  const card = 'space-y-3 rounded-2xl bg-white p-4 shadow-sm';
  return (
    <section className="space-y-4" data-testid="more-panel">
      <div className={card}>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Icon name="printer" size={22} />
          {t('reportTitle')}
        </h2>
        <p className="text-sm text-slate-700">{t('reportHint')}</p>
        <Link href="/diabetes/report" data-testid="open-report" className="flex min-h-12 items-center justify-center rounded-xl bg-teal-800 px-4 font-bold text-white">
          {t('openReport')}
        </Link>
      </div>

      <div className={card}>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Icon name="share" size={22} />
          {t('shareTitle')}
        </h2>
        <p className="text-sm text-slate-700">{t('shareHint')}</p>
        <button type="button" onClick={share} data-testid="share-summary" className="min-h-12 w-full rounded-xl border-2 border-teal-800 px-4 font-bold text-teal-900">
          {t('share')}
        </button>
        {copied && (
          <p role="status" data-testid="summary-copied">
            {t('copied')}
          </p>
        )}
      </div>

      <div className={card} data-testid="family">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Icon name="users" size={22} />
          {t('familyTitle')}
        </h2>
        <p className="text-sm text-slate-700">{t('familyHint')}</p>
        <ul className="space-y-2">
          {people.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl border-2 border-slate-200 p-2" data-testid="person">
              <span className="font-semibold">
                {p.id === ME ? t('me') : p.name}
                {p.relation && <span className="font-normal text-slate-600"> · {p.relation}</span>}
              </span>
              {p.id === personId ? (
                <span className="rounded-full bg-teal-100 px-3 py-1 text-sm text-teal-900">{t('active')}</span>
              ) : (
                <button type="button" onClick={() => switchTo(p.id)} data-testid="person-switch" className="min-h-11 rounded-lg border-2 border-teal-800 px-3 text-sm font-semibold text-teal-900">
                  {t('switch')}
                </button>
              )}
            </li>
          ))}
        </ul>
        <details>
          <summary className="min-h-11 cursor-pointer font-semibold">{t('addPerson')}</summary>
          <div className="mt-2 space-y-2">
            <input placeholder={t('name')} aria-label={t('name')} value={name} onChange={(e) => setName(e.target.value)} data-testid="person-name" className="min-h-11 w-full rounded-lg border-2 border-slate-300 px-2" />
            <input placeholder={t('relation')} aria-label={t('relation')} value={relation} onChange={(e) => setRelation(e.target.value)} className="min-h-11 w-full rounded-lg border-2 border-slate-300 px-2" />
            <button
              type="button"
              disabled={!name.trim()}
              data-testid="person-add"
              onClick={async () => {
                const id = await addPerson(name, relation);
                setName('');
                setRelation('');
                setPeople(await listPeople());
                await switchTo(id);
              }}
              className="min-h-11 w-full rounded-lg bg-teal-800 font-bold text-white disabled:opacity-50"
            >
              {t('add')}
            </button>
          </div>
        </details>
      </div>

      <PremiumScreen ended={false} />
    </section>
  );
}
