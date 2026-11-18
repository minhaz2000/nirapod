'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Icon from '@/components/Icon';
import { emergencyHref } from '@/lib/emergency/navigate';

/** Rule 6: shown for ANY glucose below 3.9 mmol/L (70 mg/dL), before anything else. Routes to Part 4. */
export default function LowGlucoseAlert({ mmol }: { mmol: number }) {
  const t = useTranslations('diabetes.glucose');
  return (
    <div role="alert" data-testid="low-glucose-alert" className="space-y-3 rounded-2xl border-l-8 border-red-700 bg-red-50 p-4 text-red-950">
      <p className="flex items-center gap-2 text-xl font-bold">
        <Icon name="alert" size={26} />
        {t('lowTitle')}
      </p>
      <p className="text-lg">{t('lowBody')}</p>
      <Link
        href={emergencyHref({ glucoseMmol: mmol })}
        data-testid="low-glucose-emergency"
        className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-lg font-bold text-white"
      >
        <Icon name="phone" size={22} />
        {t('lowLink')}
      </Link>
    </div>
  );
}
