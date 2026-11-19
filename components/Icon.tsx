/**
 * Inline SVG icons (no emoji: some phones show emoji as empty boxes). Drawn for this app on a 24×24 grid, stroked
 * with currentColor so they follow text colour. Decorative by default (aria-hidden); pass `label` to make one
 * meaningful to screen readers.
 */
export const ICON_PATHS = {
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  image: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z M3 16l5-5 4 4 3-3 6 6 M15.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z',
  back: 'M19 12H5 M11 6l-6 6 6 6',
  check: 'M4 12.5l5 5L20 7',
  alert: 'M12 3l10 18H2z M12 10v5 M12 18h.01',
  mapPin: 'M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  hospital: 'M4 21V6l8-3 8 3v15z M12 8v6 M9 11h6 M10 21v-4h4v4',
  pencil: 'M4 20l1-4L16 5l3 3L8 19z M14 7l3 3',
  close: 'M6 6l12 12 M18 6L6 18',
  plate: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  skin: 'M7 11V6a1.5 1.5 0 0 1 3 0v4 M10 10V4.5a1.5 1.5 0 0 1 3 0V10 M13 10V5.5a1.5 1.5 0 0 1 3 0V11 M16 11V8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L4 15a1.5 1.5 0 0 1 2.4-1.8L7 14',
  pill: 'M10.5 20.5a5 5 0 0 1-7-7l7-7a5 5 0 0 1 7 7z M7 10l7 7',
  ambulance: 'M3 17V7h11v10 M14 10h4l3 3v4h-7 M7 9v4 M5 11h4 M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  walk: 'M13 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M10 21l2-6 3 3v3 M8 12l2-5 4 1 2 4 M12 15l-1-4',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 20a2 2 0 0 0 4 0',
  chart: 'M4 20V4 M4 20h16 M8 16v-5 M12 16V8 M16 16v-3',
  calendar: 'M4 6h16v15H4z M4 10h16 M8 3v4 M16 3v4',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M3 20a6 6 0 0 1 12 0 M16 11a3 3 0 1 0 0-6 M18 20a5 5 0 0 0-3-4.5',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  printer: 'M7 9V3h10v6 M5 9h14a1 1 0 0 1 1 1v6h-3 M7 16H4v-6 M7 14h10v7H7z',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v6 M12 7.5h.01',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export default function Icon({ name, size = 20, className = '', label }: { name: IconName; size?: number; className?: string; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
