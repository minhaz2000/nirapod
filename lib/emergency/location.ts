/** Pure helpers for location sharing and hospital search. Location leaves the phone only when the user shares it. */
export interface Coords {
  latitude: number;
  longitude: number;
}

const fmt = (n: number) => n.toFixed(5);

/** A maps link that opens a pin at the user's position. */
export function locationLink({ latitude, longitude }: Coords): string {
  return `https://www.google.com/maps/search/?api=1&query=${fmt(latitude)},${fmt(longitude)}`;
}

/** A maps search for hospitals, centred on the user's position when known. */
export function hospitalsSearchUrl(coords?: Coords | null): string {
  return coords
    ? `https://www.google.com/maps/search/hospitals/@${fmt(coords.latitude)},${fmt(coords.longitude)},14z`
    : 'https://www.google.com/maps/search/?api=1&query=hospitals+near+me';
}
