import { use } from 'react';
import { setRequestLocale } from 'next-intl/server';
import DoctorReport from '@/components/diabetes/care/DoctorReport';

export default function DoctorReportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  return <DoctorReport />;
}
