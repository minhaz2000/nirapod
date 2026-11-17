import { describe, expect, it } from 'vitest';
import { emergencyHref, parseSignsParam } from '@/lib/emergency/navigate';
import { hospitalsSearchUrl, locationLink } from '@/lib/emergency/location';

describe('emergencyHref (route other modules here)', () => {
  it('plain emergency page when nothing is triggered', () => {
    expect(emergencyHref()).toBe('/emergency');
    expect(emergencyHref({ glucoseMmol: 6.1 })).toBe('/emergency');
  });

  it('passes triggered signs in checklist order', () => {
    expect(emergencyHref({ selected: ['bleeding', 'strokeFace'] })).toBe('/emergency?signs=strokeFace,bleeding');
  });

  it('a low glucose reading from the Diabetes Companion pre-selects lowGlucose', () => {
    expect(emergencyHref({ glucoseMmol: 3.4 })).toBe('/emergency?signs=lowGlucose');
  });

  it('round-trips through parseSignsParam and rejects junk', () => {
    expect(parseSignsParam('strokeFace,bleeding')).toEqual(['strokeFace', 'bleeding']);
    expect(parseSignsParam('<script>,chestPain')).toEqual(['chestPain']);
    expect(parseSignsParam(null)).toEqual([]);
    expect(parseSignsParam('')).toEqual([]);
  });
});

describe('location helpers', () => {
  const dhaka = { latitude: 23.810331, longitude: 90.412521 };

  it('location link pins the coordinates', () => {
    expect(locationLink(dhaka)).toBe('https://www.google.com/maps/search/?api=1&query=23.81033,90.41252');
  });

  it('hospital search is centred on the user when coordinates are known', () => {
    expect(hospitalsSearchUrl(dhaka)).toBe('https://www.google.com/maps/search/hospitals/@23.81033,90.41252,14z');
    expect(hospitalsSearchUrl(null)).toContain('hospitals+near+me');
  });
});
