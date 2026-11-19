'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import Icon, { type IconName } from '@/components/Icon';
import SignalBadge from '@/components/SignalBadge';
import type { FamilyFeatureId } from '@/lib/premium/family';

/**
 * Drawn mock-ups for the Family Plan preview: sample data only, nothing is interactive, sent or stored.
 * "Buttons" inside a phone are plain boxes styled like the app's real buttons, so nothing looks like it works.
 */

function Phone({ who, children }: { who: 'parent' | 'child'; children: ReactNode }) {
  const t = useTranslations('family.preview');
  return (
    <figure className="min-w-0 flex-1" data-testid={`phone-${who}`}>
      <figcaption className="mb-1 text-center text-sm font-bold text-slate-800">{t(who)}</figcaption>
      <div className="rounded-[2rem] border-4 border-slate-800 bg-slate-800 p-1 shadow-md">
        <div className="mx-auto mb-1 h-1.5 w-12 rounded-full bg-slate-600" aria-hidden />
        <div className="relative min-h-64 space-y-2 overflow-hidden rounded-[1.5rem] bg-slate-50 p-3 text-sm text-slate-900">
          <p className="rounded-md bg-amber-100 px-2 py-0.5 text-center text-xs font-bold text-amber-950">{t('label')}</p>
          {children}
        </div>
      </div>
    </figure>
  );
}

/** Looks like an app button but is not one (no click handler, not focusable). */
function FakeButton({ children, tone = 'primary', big = false }: { children: ReactNode; tone?: 'primary' | 'outline' | 'muted'; big?: boolean }) {
  const tones = {
    primary: 'bg-teal-800 text-white',
    outline: 'border-2 border-teal-800 text-teal-900',
    muted: 'bg-slate-300 text-slate-700',
  } as const;
  return (
    <div aria-hidden className={`flex items-center justify-center gap-2 rounded-xl px-2 text-center font-bold ${tones[tone]} ${big ? 'min-h-20 text-lg' : 'min-h-11'}`}>
      {children}
    </div>
  );
}

function Row({ icon, children, tone = 'plain' }: { icon?: IconName; children: ReactNode; tone?: 'plain' | 'green' | 'amber' | 'red' }) {
  const tones = {
    plain: 'border-slate-200 bg-white',
    green: 'border-green-700 bg-green-50 text-green-950',
    amber: 'border-amber-600 bg-amber-50 text-amber-950',
    red: 'border-red-700 bg-red-50 text-red-950',
  } as const;
  return (
    <div className={`flex items-start gap-2 rounded-xl border-2 p-2 ${tones[tone]}`}>
      {icon && <Icon name={icon} size={18} className="mt-0.5 shrink-0" />}
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export default function FamilyPreview({ id }: { id: FamilyFeatureId }) {
  const t = useTranslations('family.sample');
  const s = (k: string) => t(`${id}.${k}`);
  let parent: ReactNode;
  let child: ReactNode;
  switch (id) {
    case 'checkin':
      parent = (
        <>
          <FakeButton big>
            <Icon name="check" size={28} />
            {s('button')}
          </FakeButton>
          <Row icon="heart" tone="green">{s('done')}</Row>
        </>
      );
      child = (
        <>
          <Row icon="check" tone="green">{s('amma')}</Row>
          <Row icon="bell" tone="amber">
            <p>{s('abba')}</p>
            <p className="text-xs">{s('gentle')}</p>
          </Row>
        </>
      );
      break;
    case 'voice':
      parent = (
        <>
          <Row icon="bell">
            <p className="font-bold">{s('reminder')}</p>
            <p className="text-xs">{s('from')}</p>
          </Row>
          <FakeButton big>
            <Icon name="play" size={24} />
            {s('play')}
          </FakeButton>
        </>
      );
      child = (
        <>
          <div className="flex flex-col items-center gap-1 py-2">
            <span className="flex size-16 items-center justify-center rounded-full bg-red-700 text-white" aria-hidden>
              <Icon name="mic" size={32} />
            </span>
            <p className="font-semibold">{s('record')}</p>
            <p className="text-center italic">{s('phrase')}</p>
            <p className="text-xs text-slate-600">{s('length')}</p>
          </div>
          <FakeButton tone="outline">{s('save')}</FakeButton>
        </>
      );
      break;
    case 'remote':
      parent = (
        <>
          <p className="text-base font-semibold">{s('next')}</p>
          <p className="text-2xl font-bold">{s('nextLine')}</p>
          <div className="grid grid-cols-1 gap-2">
            <div aria-hidden className="flex min-h-14 items-center justify-center rounded-lg border-2 border-green-700 bg-green-700 text-lg font-semibold text-white">
              {s('taken')}
            </div>
            <FakeButton tone="outline">
              <Icon name="play" size={20} />
              {s('readAloud')}
            </FakeButton>
          </div>
        </>
      );
      child = (
        <>
          <p className="font-bold">{s('setting')}</p>
          {/* Same look as a dose in the real medicine schedule */}
          <div className="space-y-1 rounded-xl border-2 border-slate-200 bg-white p-2">
            <p className="flex items-center gap-2 font-semibold">
              <Icon name="pill" size={18} />
              {s('line')}
            </p>
            <p className="text-xs text-slate-700">{s('asWritten')}</p>
          </div>
          <FakeButton>
            <Icon name="plus" size={18} />
            {s('addReminder')}
          </FakeButton>
        </>
      );
      break;
    case 'refill':
      parent = <Row icon="pill" tone="amber">{s('parent')}</Row>;
      child = (
        <>
          <Row icon="pill" tone="amber">
            <p className="font-bold">{s('left')}</p>
          </Row>
          <FakeButton tone="muted">{s('order')}</FakeButton>
          <p className="text-xs text-slate-700">{s('notYet')}</p>
        </>
      );
      break;
    case 'emergency':
      parent = (
        <>
          <div aria-hidden className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-red-700 text-lg font-bold text-white">
            <Icon name="phone" size={24} />
            {s('calling')}
          </div>
          <Row icon="alert" tone="red">
            <p className="font-bold">{s('low')}</p>
            <p>{s('lowHelp')}</p>
          </Row>
        </>
      );
      child = (
        <>
          <Row icon="alert" tone="red">
            <p className="font-bold">{s('alert')}</p>
          </Row>
          <Row icon="mapPin">{s('where')}</Row>
          <Row icon="hospital">{s('hospitals')}</Row>
          <FakeButton>
            <Icon name="phone" size={18} />
            {s('call')}
          </FakeButton>
        </>
      );
      break;
    case 'plate':
      parent = (
        <>
          <Row icon="plate">{s('meal')}</Row>
          <div aria-hidden>
            <SignalBadge signal="green" label={s('green')} />
          </div>
        </>
      );
      child = (
        <>
          <p className="font-bold">{s('child')}</p>
          <div aria-hidden>
            <SignalBadge signal="green" label={s('green')} />
          </div>
          <div className="grid grid-cols-1 gap-2">
            <FakeButton tone="outline">
              <Icon name="heart" size={18} />
              {s('cheer1')}
            </FakeButton>
            <FakeButton tone="outline">{s('cheer2')}</FakeButton>
          </div>
          <p className="text-xs text-slate-600">{s('sent')}</p>
        </>
      );
      break;
    case 'visit':
      parent = <Row icon="doc" tone="green">{s('parent')}</Row>;
      child = (
        <>
          <p className="font-bold">{s('new')}</p>
          <Row icon="plus" tone="green">
            <p className="text-xs font-semibold">{s('added')}</p>
            <p>{s('addedLine')}</p>
          </Row>
          <Row icon="minus" tone="amber">
            <p className="text-xs font-semibold">{s('removed')}</p>
            <p>{s('removedLine')}</p>
          </Row>
          <p className="text-xs">{s('same')}</p>
          <p className="text-xs text-slate-700">{s('ask')}</p>
        </>
      );
      break;
    case 'story':
      parent = <Row icon="heart" tone="green">{s('parent')}</Row>;
      child = (
        <>
          <p className="font-bold">{s('month')}</p>
          <dl className="grid grid-cols-1 gap-1">
            {(
              [
                ['doses', 'dosesValue', 'border-green-700'],
                ['plates', 'platesValue', 'border-green-700'],
                ['lows', 'lowsValue', 'border-amber-600'],
              ] as const
            ).map(([k, v, tone]) => (
              <div key={k} className={`flex items-center justify-between gap-2 rounded-xl border-l-4 bg-white p-2 ${tone}`}>
                <dt>{s(k)}</dt>
                <dd className="font-bold">{s(v)}</dd>
              </div>
            ))}
          </dl>
          <Row icon="doc">
            <p className="text-xs font-semibold">{s('nutritionist')}</p>
            <p>{s('nutritionistNote')}</p>
          </Row>
        </>
      );
      break;
  }
  return (
    <div className="flex flex-col gap-4 min-[560px]:flex-row" data-testid={`preview-${id}`}>
      <Phone who="parent">{parent}</Phone>
      <Phone who="child">{child}</Phone>
    </div>
  );
}
