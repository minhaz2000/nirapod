'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import CameraCapture from '@/components/CameraCapture';
import Icon from '@/components/Icon';
import Notice from '@/components/Notice';
import { readPackPhoto, readPrescriptionPhoto, readReportPhoto, type PhotoKind, type RxLineDraft } from '@/lib/assistant/photos';
import type { AssistantContext, AssistantResponse, MedicineSummary } from '@/lib/assistant/types';
import { redact } from '@/lib/privacy/redact';
import type { ChatMessage } from '@/lib/store/db';
import { addChatMessage, clearChat, loadChat, updateChatMessage } from '@/lib/store/chat';
import ChatCard, { type AnyCard, type LocalCard } from './ChatCards';

type Busy = null | 'thinking' | 'photo';
/** Message time (module level: only called from event handlers). */
const now = () => Date.now();
const STARTERS = ['what', 'expiry', 'report', 'cheaper'] as const;

/** Latest verified photo results in the conversation (pack, confirmed prescription lines, report). */
function contextOf(msgs: ChatMessage[]): AssistantContext {
  const ctx: AssistantContext = {};
  for (const m of msgs) Object.assign(ctx, (m.context as AssistantContext | undefined) ?? {});
  return ctx;
}

/**
 * Nirapod Assistant chat. Answers come from the server's checked tools (medicine database, rules, report explainer)
 * with web sources; photos go through the same pipelines as the scan screens, after the same consent note.
 * History stays in IndexedDB on this phone, with a Clear button. Every answer ends with "Information only, not
 * medical advice". Emergency stays one tap away (bottom bar) and danger signs show the 999 card first.
 */
export default function Assistant() {
  const t = useTranslations('assistant');
  const locale = useLocale() as 'bn' | 'en';
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [ai, setAi] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<'unavailable' | 'offline' | null>(null);
  const [attach, setAttach] = useState<PhotoKind | 'choose' | null>(null);
  const [consentFor, setConsentFor] = useState<{ kind: PhotoKind; bitmap: ImageBitmap } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadChat()
      .then(setMsgs)
      .catch(() => undefined);
    fetch('/api/assistant')
      .then((r) => r.json())
      .then((j: { available: boolean }) => setAi(Boolean(j.available)))
      .catch(() => setAi(false));
  }, []);
  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, and an effect must not return one.
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length, busy]);

  const context = useMemo(() => contextOf(msgs), [msgs]);

  async function push(m: Omit<ChatMessage, 'id'>) {
    const saved = await addChatMessage(m).catch(() => m as ChatMessage);
    setMsgs((prev) => [...prev, saved]);
    return saved;
  }

  async function ask(text: string, extra?: AssistantContext) {
    const q = redact(text.trim()); // names and phone numbers removed before anything is saved or sent (rule 9)
    if (!q) return;
    setFailure(null);
    setHint(null);
    await push({ at: now(), role: 'user', text: q });
    setBusy('thinking');
    try {
      const history = [...msgs, { role: 'user', text: q } as ChatMessage].slice(-10).map((m) => ({ role: m.role, text: m.text }));
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, messages: history, context: { ...context, ...extra } }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as AssistantResponse;
      if (r.aiError) console.warn(`[nirapod] assistant AI unavailable: ${r.aiError}`);
      await push({ at: now(), role: 'assistant', text: r.answer, cards: r.cards, sources: r.sources, source: r.source });
    } catch {
      setFailure(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'unavailable');
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input;
    setInput('');
    void ask(text);
  }

  function starter(s: (typeof STARTERS)[number]) {
    if (s === 'report') {
      if (context.report?.length) return void ask(t('starters.report'));
      setHint(t('starterHint.report'));
      return setAttach('report');
    }
    if (context.pack?.medicine) return void ask(t(`starters.${s}`));
    setHint(t(s === 'cheaper' ? 'starterHint.cheaper' : 'starterHint.photo'));
    setAttach('pack');
  }

  async function onPhoto(file: File, kind: PhotoKind) {
    const { loadPhoto } = await import('@/lib/image/photo');
    const { bitmap } = await loadPhoto(file); // PhotoError → CameraCapture shows the JPG / PNG message
    setAttach(null);
    if (kind !== 'report' && ai) return setConsentFor({ kind, bitmap });
    await processPhoto(kind, bitmap, false);
  }

  async function processPhoto(kind: PhotoKind, bitmap: ImageBitmap, useAi: boolean) {
    setConsentFor(null);
    setFailure(null);
    await push({ at: now(), role: 'user', text: t('photoSent', { kind: t(`attachKind.${kind}`) }) });
    setBusy('photo');
    try {
      if (kind === 'pack') {
        const outcome = await readPackPhoto(bitmap, useAi);
        const cards: LocalCard[] = [];
        if (outcome.aiReason) cards.push({ type: 'aiReading', reason: outcome.aiReason });
        cards.push(outcome.verdict === 'unreadable' ? { type: 'unreadable' } : { type: 'pack', outcome });
        const ctx: AssistantContext | undefined = outcome.medicine ? { pack: { medicine: outcome.medicine, expiry: outcome.expiry, exp: outcome.exp } } : undefined;
        const text = outcome.medicine
          ? t('answers.medicine', { brand: outcome.medicine.brand, generic: outcome.medicine.generic ?? '—', strength: outcome.medicine.strength || '—', form: outcome.medicine.form })
          : outcome.verdict === 'weak'
            ? t('cards.pickTitle')
            : outcome.verdict === 'none'
              ? t('cards.notFoundTitle')
              : t('unreadable');
        await push({ at: now(), role: 'assistant', text, cards, context: ctx, source: 'local' });
      } else if (kind === 'prescription') {
        const r = await readPrescriptionPhoto(bitmap, useAi);
        const cards: LocalCard[] = [];
        if (r.aiReason) cards.push({ type: 'aiReading', reason: r.aiReason });
        cards.push(r.lines.length ? { type: 'rx', lines: r.lines } : { type: 'unreadable' });
        await push({ at: now(), role: 'assistant', text: r.lines.length ? t('cards.rxNote') : t('unreadable'), cards, source: 'local' });
      } else {
        const values = await readReportPhoto(bitmap);
        if (!values.length) await push({ at: now(), role: 'assistant', text: t('unreadable'), cards: [{ type: 'unreadable' }], source: 'local' });
        else {
          setBusy(null);
          await push({ at: now(), role: 'assistant', text: '', cards: [], context: { report: values }, source: 'local' });
          await ask(t('starters.report'), { report: values });
        }
      }
    } catch {
      setFailure('unavailable');
    } finally {
      setBusy(null);
    }
  }

  async function pick(msg: ChatMessage, m: MedicineSummary) {
    const cards = (msg.cards as AnyCard[]).map((c) => (c.type === 'pack' ? { ...c, chosen: m } : c));
    const pack = (cards.find((c) => c.type === 'pack') as Extract<LocalCard, { type: 'pack' }>).outcome;
    const patch = { cards, context: { pack: { medicine: m, expiry: pack.expiry, exp: pack.exp } } };
    if (msg.id) await updateChatMessage(msg.id, patch).catch(() => undefined);
    setMsgs((prev) => prev.map((x) => (x === msg ? { ...x, ...patch } : x)));
  }

  async function setLine(msg: ChatMessage, index: number, state: RxLineDraft['state']) {
    const cards = (msg.cards as AnyCard[]).map((c) => (c.type === 'rx' ? { ...c, lines: c.lines.map((l, i) => (i === index ? { ...l, state } : l)) } : c));
    const rx = cards.find((c) => c.type === 'rx') as Extract<LocalCard, { type: 'rx' }>;
    // Rule 7: only lines the user confirmed are used.
    const confirmed = rx.lines.filter((l) => l.state === 'confirmed').map(({ medicine, strength, frequency, duration }) => ({ medicine, strength, frequency, duration }));
    const patch = { cards, context: { prescription: confirmed } };
    if (msg.id) await updateChatMessage(msg.id, patch).catch(() => undefined);
    setMsgs((prev) => prev.map((x) => (x === msg ? { ...x, ...patch } : x)));
  }

  async function clear() {
    await clearChat().catch(() => undefined);
    setMsgs([]);
    setFailure(null);
  }

  const links = (
    <ul className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2" data-testid="assistant-links">
      {(
        [
          ['scan', '/medicine', 'pill'],
          ['explain', '/medicine', 'doc'],
          ['skin', '/skin', 'skin'],
          ['emergency', '/emergency', 'ambulance'],
        ] as const
      ).map(([k, href, icon]) => (
        <li key={k}>
          <Link href={href} className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-teal-800 bg-white px-3 font-semibold text-teal-900">
            <Icon name={icon} size={20} />
            {t(`links.${k}`)}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4" data-testid="assistant" data-ai={ai === null ? 'unknown' : String(ai)}>
      <p>{t('intro')}</p>
      {ai === false && (
        <div className="space-y-2" data-testid="assistant-ai-off">
          <Notice tone="warning">{t('aiOff')}</Notice>
          {links}
        </div>
      )}

      <ol className="space-y-3" aria-live="polite" data-testid="chat-messages">
        {msgs.map((m, i) => (
          <li key={m.id ?? `m${i}`} className={m.role === 'user' ? 'flex justify-end' : ''} data-testid={`chat-${m.role}`}>
            {m.role === 'user' ? (
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-teal-800 px-3 py-2 text-white">{m.text}</p>
            ) : (
              <div className="space-y-2">
                {((m.cards as AnyCard[] | undefined) ?? [])
                  .filter((c) => c.type === 'emergency')
                  .map((c, k) => (
                    <ChatCard key={`e${k}`} c={c} />
                  ))}
                {m.text && <p className="whitespace-pre-line rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-sm" data-testid="chat-answer">{m.text}</p>}
                {((m.cards as AnyCard[] | undefined) ?? [])
                  .filter((c) => c.type !== 'emergency')
                  .map((c, k) => (
                    <ChatCard key={k} c={c} onPick={(x) => pick(m, x)} onLine={(idx, s) => setLine(m, idx, s)} />
                  ))}
                {(m.text || m.cards?.length) && (
                  <p className="text-xs font-semibold text-slate-600" data-testid="chat-disclaimer">
                    {t('disclaimer')}
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div ref={endRef} />

      {busy && (
        <p role="status" className="flex items-center gap-2 text-slate-700" data-testid="chat-busy">
          <Icon name="clock" size={18} />
          {busy === 'photo' ? t('readingPhoto') : t('thinking')}
        </p>
      )}
      {failure && (
        <div className="space-y-2" data-testid="assistant-unavailable">
          <Notice tone="warning">{failure === 'offline' ? t('offline') : t('aiUnavailable')}</Notice>
          {links}
        </div>
      )}

      {consentFor && (
        <div role="alertdialog" aria-labelledby="chat-consent" className="space-y-2 rounded-2xl border-2 border-amber-600 bg-amber-50 p-3" data-testid="chat-consent">
          <p id="chat-consent" className="font-semibold text-amber-950">
            {t('consent')}
          </p>
          <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            <button type="button" data-testid="chat-consent-continue" onClick={() => processPhoto(consentFor.kind, consentFor.bitmap, true)} className="min-h-12 rounded-xl bg-teal-800 px-3 font-bold text-white">
              {t('consentContinue')}
            </button>
            <button type="button" data-testid="chat-consent-local" onClick={() => processPhoto(consentFor.kind, consentFor.bitmap, false)} className="min-h-12 rounded-xl border-2 border-teal-800 px-3 font-bold text-teal-900">
              {t('consentLocal')}
            </button>
          </div>
        </div>
      )}

      {msgs.length === 0 && (
        <div className="grid grid-cols-2 gap-2" data-testid="chat-starters">
          {STARTERS.map((s) => (
            <button key={s} type="button" data-testid={`starter-${s}`} onClick={() => starter(s)} className="min-h-14 rounded-2xl border-2 border-teal-800 bg-white px-2 text-sm font-semibold text-teal-900">
              {t(`starters.${s}`)}
            </button>
          ))}
        </div>
      )}
      {hint && <p className="text-sm text-slate-700" data-testid="chat-hint">{hint}</p>}

      {attach && (
        <section className="space-y-2 rounded-2xl bg-white p-3 shadow-sm" data-testid="chat-attach">
          <p className="font-semibold">{t('attachTitle')}</p>
          <div className="grid grid-cols-3 gap-2">
            {(['pack', 'prescription', 'report'] as const).map((k) => (
              <button
                key={k}
                type="button"
                data-testid={`attach-${k}`}
                aria-pressed={attach === k}
                onClick={() => setAttach(k)}
                className={`min-h-12 rounded-xl border-2 px-1 text-sm font-semibold ${attach === k ? 'border-teal-800 bg-teal-800 text-white' : 'border-slate-300'}`}
              >
                {t(`attachKind.${k}`)}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-700">{t('skinNote')}</p>
          {attach !== 'choose' && (
            <>
              {attach === 'report' && <p className="text-xs text-slate-700">{t('reportLocal')}</p>}
              <CameraCapture label={t(`attachKind.${attach}`)} onCapture={(f) => onPhoto(f, attach)} />
            </>
          )}
          <button type="button" onClick={() => setAttach(null)} className="min-h-11 w-full rounded-xl border-2 border-slate-300 font-semibold">
            {t('cancel')}
          </button>
        </section>
      )}

      <form onSubmit={onSubmit} className="flex items-end gap-2" data-testid="chat-form">
        <button
          type="button"
          aria-label={t('attach')}
          data-testid="chat-attach-button"
          onClick={() => setAttach(attach ? null : 'choose')}
          className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-teal-800 text-teal-900"
        >
          <Icon name="camera" size={22} />
        </button>
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t('placeholder')}</span>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            placeholder={t('placeholder')}
            data-testid="chat-input"
            className="block min-h-12 w-full resize-none rounded-xl border-2 border-slate-400 px-3 py-2"
          />
        </label>
        <button type="submit" disabled={!input.trim() || busy !== null} data-testid="chat-send" className="min-h-12 shrink-0 rounded-xl bg-teal-800 px-4 font-bold text-white disabled:opacity-50">
          {t('send')}
        </button>
      </form>

      <div className="flex items-center justify-between gap-2 text-sm text-slate-700">
        <span>{t('historyNote')}</span>
        {msgs.length > 0 && (
          <button type="button" onClick={clear} data-testid="chat-clear" className="min-h-11 shrink-0 rounded-xl border-2 border-slate-400 px-3 font-semibold">
            {t('clear')}
          </button>
        )}
      </div>
    </div>
  );
}
