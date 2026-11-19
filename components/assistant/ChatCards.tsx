'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Icon from '@/components/Icon';
import Call999Button from '@/components/emergency/Call999Button';
import type { PackOutcome, RxLineDraft } from '@/lib/assistant/photos';
import type { AssistantCard, ExpiryCardStatus, MedicineSummary } from '@/lib/assistant/types';
import type { CheckedValue } from '@/lib/rules/report-ranges';

/** Cards made on the phone from photo results (not from the server). */
export type LocalCard =
  | { type: 'pack'; outcome: PackOutcome; chosen?: MedicineSummary | null }
  | { type: 'rx'; lines: RxLineDraft[] }
  | { type: 'aiReading'; reason: string }
  | { type: 'unreadable' };

export type AnyCard = AssistantCard | LocalCard;

const card = 'space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm';

const EXPIRY_TONE: Record<ExpiryCardStatus, string> = {
  expired: 'border-red-700 bg-red-50 text-red-900',
  expiresSoon: 'border-amber-600 bg-amber-50 text-amber-950',
  ok: 'border-green-700 bg-green-50 text-green-900',
  unknown: 'border-slate-500 bg-slate-50 text-slate-900',
};

function Medicine({ m }: { m: MedicineSummary }) {
  const t = useTranslations('assistant.cards');
  return (
    <div className="space-y-1">
      <p className="text-xl font-bold text-teal-900" data-testid="chat-medicine-name">
        {m.genericOnly ? m.generic : m.brand}
      </p>
      {m.genericOnly ? (
        <p className="text-sm text-slate-700">{t('genericOnly')}</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
          <dt className="text-slate-600">{t('generic')}</dt>
          <dd data-testid="chat-medicine-generic">{m.generic ?? '—'}</dd>
          <dt className="text-slate-600">{t('strengthForm')}</dt>
          <dd>
            {m.strength || '—'} · {m.form}
          </dd>
          <dt className="text-slate-600">{t('manufacturer')}</dt>
          <dd>{m.manufacturer ?? '—'}</dd>
        </dl>
      )}
      {m.indication && (
        <p className="text-sm">
          <span className="font-semibold">{t('usedFor')}: </span>
          <span lang="en">{m.indication}</span>
        </p>
      )}
    </div>
  );
}

function Expiry({ status, exp }: { status: ExpiryCardStatus; exp: string | null }) {
  const t = useTranslations('assistant');
  return (
    <div className={`rounded-xl border-l-8 p-3 ${EXPIRY_TONE[status]}`} data-testid="chat-expiry" data-status={status}>
      <p className="text-xs font-semibold uppercase">{t('cards.expiryTitle')}</p>
      <p className="font-bold">{status === 'unknown' ? t('answers.expiryUnknown') : t(`answers.expiry.${status}`, { date: exp ?? '' })}</p>
    </div>
  );
}

const statusStyle: Record<CheckedValue['status'], string> = {
  high: 'bg-red-100 text-red-900',
  low: 'bg-amber-100 text-amber-900',
  normal: 'bg-green-100 text-green-900',
  unknown: 'bg-slate-100 text-slate-800',
};

export default function ChatCard({
  c,
  onPick,
  onLine,
}: {
  c: AnyCard;
  onPick?: (m: MedicineSummary) => void;
  onLine?: (index: number, state: RxLineDraft['state']) => void;
}) {
  const t = useTranslations('assistant');
  switch (c.type) {
    case 'emergency':
      return (
        <section className="space-y-2 rounded-2xl bg-red-700 p-4 text-white shadow-md" data-testid="chat-emergency">
          <p className="flex items-center gap-2 text-xl font-bold">
            <Icon name="alert" size={24} />
            {t('cards.emergencyTitle')}
          </p>
          {c.lowGlucose && <p className="font-semibold">{t('cards.emergencyLow')}</p>}
          <Call999Button variant="alert" />
          <Link href="/emergency" className="flex min-h-11 items-center justify-center rounded-xl border-2 border-white font-semibold">
            {t('cards.emergencyOpen')}
          </Link>
        </section>
      );
    case 'refusal':
      return (
        <section className={`${card} border-l-8 border-l-amber-600`} data-testid="chat-refusal" data-reason={c.reason}>
          <p className="font-bold">{t('cards.refusalTitle')}</p>
          <p>{t(`answers.refuse.${c.reason}`)}</p>
        </section>
      );
    case 'medicine':
      return (
        <section className={card} data-testid="chat-card-medicine">
          <p className="text-xs font-semibold uppercase text-slate-600">{t('cards.medicineTitle')}</p>
          <Medicine m={c.medicine} />
        </section>
      );
    case 'alternatives':
      return (
        <section className={card} data-testid="chat-card-alternatives">
          <p className="font-bold">{t('cards.alternativesTitle')}</p>
          {c.status !== 'ok' ? (
            <p>{t('cards.notComparable')}</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {c.alternatives.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    <span className="block font-semibold">
                      {a.brand} {a.strength}
                    </span>
                    <span className="block text-xs text-slate-700">{a.manufacturer}</span>
                  </span>
                  {a.cheaper && <span className="shrink-0 rounded-full bg-green-100 px-2 text-xs font-semibold text-green-900">{t('cards.cheaper')}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="font-semibold text-teal-900" data-testid="chat-pharmacist">
            {t('cards.pharmacist')}
          </p>
        </section>
      );
    case 'duplicates':
      return (
        <section className={card} data-testid="chat-card-duplicates">
          <p className="font-bold">{t('cards.duplicatesTitle')}</p>
          {c.groups.length ? (
            <ul className="list-disc pl-5">
              {c.groups.map((g) => (
                <li key={g.ingredient}>
                  {g.ingredient}: {g.brands.join(' + ')}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('cards.duplicatesNone', { list: c.checked.join(', ') })}</p>
          )}
        </section>
      );
    case 'expiry':
      return <Expiry status={c.status} exp={c.exp} />;
    case 'notFound':
      return (
        <section className={`${card} border-l-8 border-l-amber-600`} data-testid="chat-card-notfound">
          <p className="font-bold">{t('cards.notFoundTitle')}</p>
          <p>{t('answers.notFound', { query: c.query })}</p>
        </section>
      );
    case 'report':
      return (
        <section className={card} data-testid="chat-card-report">
          <p className="font-bold">{t('cards.reportTitle')}</p>
          <ul className="space-y-1">
            {c.values.map((v, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {v.name}: <strong>{v.value}</strong> {v.unit}
                </span>
                <span className={`rounded-full px-2 text-xs font-semibold ${statusStyle[v.status]}`}>{v.status}</span>
              </li>
            ))}
          </ul>
          <p className="whitespace-pre-line text-sm">{c.explanation}</p>
        </section>
      );
    case 'sources':
      return (
        <section className={card} data-testid="chat-sources">
          <p className="font-bold">{t('cards.sourcesTitle')}</p>
          <ul className="space-y-1">
            {c.sources.map((s) => (
              <li key={s.uri}>
                <a href={s.uri} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center break-all text-teal-800 underline underline-offset-4">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-700">{t('cards.sourcesNote')}</p>
        </section>
      );
    case 'unsure':
      return null;
    case 'aiReading':
      return (
        <p className="rounded-xl border-l-4 border-amber-600 bg-amber-50 p-2 text-sm" data-testid="chat-ai-reading" data-reason={c.reason}>
          {t('aiReading')}
        </p>
      );
    case 'unreadable':
      return (
        <p className="rounded-xl border-l-4 border-amber-600 bg-amber-50 p-2" data-testid="chat-unreadable">
          {t('unreadable')}
        </p>
      );
    case 'pack': {
      const m = c.chosen ?? c.outcome.medicine;
      return (
        <section className={card} data-testid="chat-card-pack" data-verdict={c.outcome.verdict}>
          <p className="text-xs font-semibold uppercase text-slate-600">{t('cards.packTitle')}</p>
          {m ? (
            <Medicine m={m} />
          ) : c.outcome.verdict === 'weak' ? (
            <div className="space-y-2">
              <p className="font-bold">{t('cards.pickTitle')}</p>
              {c.outcome.candidates.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  data-testid="chat-candidate"
                  onClick={() => onPick?.(x)}
                  className="flex min-h-12 w-full flex-col items-start rounded-xl border-2 border-slate-300 p-2 text-left"
                >
                  <span className="font-semibold">
                    {x.brand} {x.strength} · {x.form}
                  </span>
                  <span className="text-xs text-slate-700">{x.generic}</span>
                </button>
              ))}
            </div>
          ) : c.outcome.verdict === 'none' ? (
            <p className="font-bold">{t('cards.notFoundTitle')}</p>
          ) : null}
          {c.outcome.verdict !== 'unreadable' && (c.outcome.verdict !== 'weak' || m) && <Expiry status={c.outcome.expiry} exp={c.outcome.exp} />}
        </section>
      );
    }
    case 'rx':
      return (
        <section className={card} data-testid="chat-card-rx">
          <p className="font-bold">{t('cards.prescriptionTitle')}</p>
          <p className="text-sm text-amber-900">{t('cards.rxNote')}</p>
          <ul className="space-y-2">
            {c.lines.map((l, i) =>
              l.state === 'removed' ? null : (
                <li key={i} className={`rounded-xl border-2 p-2 ${l.state === 'confirmed' ? 'border-green-700 bg-green-50' : 'border-slate-300'}`} data-testid="chat-rx-line" data-state={l.state}>
                  <p className="font-semibold">{[l.medicine, l.strength, l.frequency, l.duration].filter(Boolean).join(' · ')}</p>
                  {l.state === 'pending' ? (
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <button type="button" data-testid="chat-rx-confirm" onClick={() => onLine?.(i, 'confirmed')} className="min-h-11 rounded-lg bg-teal-800 font-semibold text-white">
                        {t('cards.confirmLine')}
                      </button>
                      <button type="button" onClick={() => onLine?.(i, 'removed')} className="min-h-11 rounded-lg border-2 border-slate-400 font-semibold">
                        {t('cards.removeLine')}
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-green-800">{t('cards.confirmed')}</p>
                  )}
                </li>
              ),
            )}
          </ul>
        </section>
      );
  }
}
