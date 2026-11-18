/** Geometry for the glucose chart (pure, SVG coordinates). Low and high readings are marked so they stand out. */
import { GLUCOSE_TARGETS } from '@/config/glucose-targets';
import { isLowGlucose } from '@/lib/rules/glucose';

export interface ChartPoint {
  x: number;
  y: number;
  mmol: number;
  at: number;
  level: 'low' | 'high' | 'ok';
}

export interface ChartGeometry {
  width: number;
  height: number;
  pad: { left: number; right: number; top: number; bottom: number };
  yMin: number;
  yMax: number;
  points: ChartPoint[];
  /** Target band (3.9 – 10.0 mmol/L) as y coordinates. */
  band: { top: number; bottom: number };
  lowLineY: number;
  /** y-axis ticks in mmol/L. */
  ticks: Array<{ mmol: number; y: number }>;
  /** One tick per day boundary. */
  days: Array<{ at: number; x: number }>;
}

export function chartGeometry(readings: ReadonlyArray<{ takenAt: number; mmol: number }>, from: number, to: number, width = 340, height = 200): ChartGeometry {
  const pad = { left: 34, right: 8, top: 8, bottom: 24 };
  const yMin = 2;
  const yMax = Math.max(16, Math.ceil(Math.max(0, ...readings.map((r) => r.mmol)) + 1));
  const x = (t: number) => pad.left + ((t - from) / Math.max(1, to - from)) * (width - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - (Math.min(yMax, Math.max(yMin, v)) - yMin) / (yMax - yMin)) * (height - pad.top - pad.bottom);
  const high = GLUCOSE_TARGETS.twoHour.target;
  const points = readings
    .filter((r) => r.takenAt >= from && r.takenAt <= to)
    .sort((a, b) => a.takenAt - b.takenAt)
    .map((r) => ({ x: x(r.takenAt), y: y(r.mmol), mmol: r.mmol, at: r.takenAt, level: isLowGlucose(r.mmol) ? ('low' as const) : r.mmol >= high ? ('high' as const) : ('ok' as const) }));
  const ticks = [4, 7, 10, 13, 16, 20, 25, 30].filter((v) => v <= yMax).map((mmol) => ({ mmol, y: y(mmol) }));
  const days: ChartGeometry['days'] = [];
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  for (let t = d.getTime() + 86_400_000; t < to; t += 86_400_000) days.push({ at: t, x: x(t) });
  return { width, height, pad, yMin, yMax, points, band: { top: y(high), bottom: y(3.9) }, lowLineY: y(3.9), ticks, days };
}
