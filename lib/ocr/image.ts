/** Pure image helpers on 8-bit grey arrays (row-major, width × height). No DOM — unit-testable. */

/** RGBA → grey (ITU-R BT.601 luma). */
export function toGrayscale(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = Math.round(0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!);
  }
  return out;
}

/**
 * Contrast boost: linear stretch so the `low` percentile maps to 0 and the `high` percentile to 255.
 * Robust to a few very dark/bright pixels (glare on foil packs).
 */
export function stretchContrast(gray: Uint8Array, low = 0.02, high = 0.98): Uint8Array {
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v]!++;
  const n = gray.length;
  const pick = (q: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v]!;
      if (acc >= q * n) return v;
    }
    return 255;
  };
  const lo = pick(low);
  const hi = pick(high);
  if (hi - lo < 8) return gray.slice(); // flat image: nothing to stretch
  const scale = 255 / (hi - lo);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(0, Math.min(255, Math.round((gray[i]! - lo) * scale)));
  return out;
}

/** Otsu threshold for a grey image: values <= threshold form the dark class. */
export function otsuThreshold(gray: Uint8Array): number {
  const hist = new Float64Array(256);
  for (const v of gray) hist[v]!++;
  const total = gray.length;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Estimates text skew in degrees with a projection profile: for each candidate angle, dark (text) pixels are
 * projected onto lines at that angle; straight text lines give the sharpest profile.
 * Positive = text slopes down to the right (y grows downward). Rotate the image by −angle to straighten it.
 */
export function estimateSkewAngle(
  gray: Uint8Array,
  width: number,
  height: number,
  { maxAngle = 15, step = 1, maxPoints = 20_000 } = {},
): number {
  const t = otsuThreshold(gray);
  let dark = 0;
  for (const v of gray) if (v <= t) dark++;
  // Text is the minority: if most pixels are "dark", the image is light text on a dark background.
  const inverted = dark > gray.length / 2;
  const xs: number[] = [];
  const ys: number[] = [];
  const stride = Math.max(1, Math.floor((inverted ? gray.length - dark : dark) / maxPoints));
  let k = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isInk = inverted ? gray[y * width + x]! > t : gray[y * width + x]! <= t;
      if (isInk && k++ % stride === 0) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length < 50) return 0;

  const diag = Math.ceil(Math.hypot(width, height));
  const score = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    const sin = Math.sin(a);
    const cos = Math.cos(a);
    const bins = new Float64Array(2 * diag + 1);
    for (let i = 0; i < xs.length; i++) bins[Math.round(ys[i]! * cos - xs[i]! * sin) + diag]!++;
    let s = 0;
    for (const b of bins) s += b * b;
    return s;
  };
  const search = (from: number, to: number, by: number) => {
    let bestAngle = 0;
    let bestScore = -1;
    for (let d = from; d <= to + 1e-9; d += by) {
      const s = score(d);
      if (s > bestScore + 1e-6 || (Math.abs(s - bestScore) <= 1e-6 && Math.abs(d) < Math.abs(bestAngle))) {
        bestScore = s;
        bestAngle = d;
      }
    }
    return bestAngle;
  };
  const coarse = search(-maxAngle, maxAngle, step);
  const fine = search(coarse - step, coarse + step, step / 4);
  return Math.round(fine * 100) / 100;
}

/** Mean brightness 0–255. */
export function meanBrightness(gray: Uint8Array): number {
  let s = 0;
  for (const v of gray) s += v;
  return gray.length ? s / gray.length : 0;
}

/** Variance of the 4-neighbour Laplacian — a standard sharpness measure (low = blurred). */
export function laplacianVariance(gray: Uint8Array, width: number, height: number): number {
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const l = gray[i - width]! + gray[i + width]! + gray[i - 1]! + gray[i + 1]! - 4 * gray[i]!;
      sum += l;
      sumSq += l * l;
      n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}
