'use client';

import { useTranslations } from 'next-intl';

/** Translated food name for a model class (falls back to the class id). */
export function useFoodName() {
  const t = useTranslations('diabetes.foods');
  return (cls: string) => (t.has(cls) ? t(cls) : cls);
}
