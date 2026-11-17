'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseSignsParam, SIGNS_PARAM } from '@/lib/emergency/navigate';
import Call999Button from './Call999Button';
import DangerChecklist from './DangerChecklist';
import LocationActions from './LocationActions';
import { useLocation, type LocationApi } from './useLocation';

/** Pre-selects signs passed by other modules via ?signs= (see lib/emergency/navigate.ts). */
function ChecklistFromQuery({ location }: { location: LocationApi }) {
  const param = useSearchParams().get(SIGNS_PARAM);
  return <DangerChecklist key={param ?? ''} initial={parseSignsParam(param)} location={location} />;
}

export default function EmergencyCenter() {
  const location = useLocation();
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Call999Button />
        <LocationActions location={location} />
      </div>
      <Suspense fallback={<DangerChecklist initial={[]} location={location} />}>
        <ChecklistFromQuery location={location} />
      </Suspense>
    </div>
  );
}
