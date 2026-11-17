'use client';

import { useCallback, useRef, useState } from 'react';
import { locationLink, type Coords } from '@/lib/emergency/location';

export type LocationState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; coords: Coords; link: string }
  | { kind: 'error' };

export interface LocationApi {
  state: LocationState;
  /** Asks the browser for the current position. Resolves to null on failure. */
  request: () => Promise<Coords | null>;
}

/** One-shot Geolocation API wrapper. The position stays on the phone unless the user shares it. */
export function useLocation(): LocationApi {
  const [state, setState] = useState<LocationState>({ kind: 'idle' });
  const pending = useRef<Promise<Coords | null> | null>(null);

  const request = useCallback(() => {
    if (pending.current) return pending.current;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({ kind: 'error' });
      return Promise.resolve(null);
    }
    setState({ kind: 'loading' });
    pending.current = new Promise<Coords | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const c = { latitude: coords.latitude, longitude: coords.longitude };
          setState({ kind: 'ready', coords: c, link: locationLink(c) });
          resolve(c);
        },
        () => {
          setState({ kind: 'error' });
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
      );
    }).finally(() => {
      pending.current = null;
    });
    return pending.current;
  }, []);

  return { state, request };
}
