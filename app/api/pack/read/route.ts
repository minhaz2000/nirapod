import { NextResponse, type NextRequest } from 'next/server';
import { llmAvailable, llmJson, llmProvider } from '@/lib/server/llm';

/**
 * POST /api/pack/read { image, mediaType } — reads a medicine-pack photo with the configured vision model
 * (Gemini or Anthropic). Sent only after the user agrees in the consent note. Medicine packs carry no patient data.
 * The answer is never trusted on its own: the client verifies it against the medicine database
 * (/api/medicines/identify) and parses dates itself. Nothing is stored or logged.
 * GET → { available, provider } (provider name only).
 * Without a key → 503 { error: 'not_available' }, and the app reads the pack on the phone instead.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BASE64 = 6_000_000;
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

export interface PackFields {
  brand: string;
  generic: string;
  strength: string;
  dosage_form: string;
  manufacturer: string;
  expiry_date: string;
  manufacturing_date: string;
  batch_number: string;
  dar_number: string;
  /** Every piece of printed text, exactly as seen, one line per printed line. */
  visible_text: string;
}

const FIELDS: Array<[keyof PackFields, string]> = [
  ['brand', 'Brand (trade) name exactly as printed, usually the largest text. Empty if not visible.'],
  ['generic', 'Generic (active ingredient) name with salt as printed, e.g. "Diclofenac Potassium BP". Empty if not visible.'],
  ['strength', 'Strength as printed, e.g. "50 mg" or "120 mg/5 ml". Empty if not visible.'],
  ['dosage_form', 'Dosage form as printed, e.g. "Tablet", "Capsule", "Syrup", "Eye Drops". Empty if not visible.'],
  ['manufacturer', 'Manufacturer company as printed. Empty if not visible.'],
  ['expiry_date', 'The date printed next to an EXPIRY label (EXP, Exp. Date, Use before, মেয়াদ). Copy exactly. Empty if no expiry label is visible or the date is unreadable.'],
  ['manufacturing_date', 'The date printed next to a MANUFACTURING label (MFG, Mfd, Mfg. Date, উৎপাদন). Copy exactly. Empty if not visible.'],
  ['batch_number', 'Batch / Lot number as printed. Empty if not visible.'],
  ['dar_number', 'DAR / registration number as printed. Empty if not visible.'],
  ['visible_text', 'All printed text on the pack, exactly as seen, one printed line per line (use \\n).'],
];

const SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(FIELDS.map(([k, description]) => [k, { type: 'string', description }])),
  required: FIELDS.map(([k]) => k),
  additionalProperties: false,
} as const;

const SYSTEM = `You read the printing on medicine packs from Bangladesh (English and Bangla). Output JSON only.
Rules:
- Copy only what is printed and readable. Never guess, complete, correct or infer a value; use an empty string instead.
- Do not judge whether the medicine is genuine or fake, and give no medical advice.
- Keep expiry and manufacturing dates apart: expiry_date only from an expiry label, manufacturing_date only from a manufacturing label.
- visible_text: transcribe every printed line exactly as seen.`;

const MAX: Record<keyof PackFields, number> = {
  brand: 80, generic: 160, strength: 60, dosage_form: 60, manufacturer: 120, expiry_date: 40, manufacturing_date: 40,
  batch_number: 40, dar_number: 40, visible_text: 4000,
};

function clean(raw: Record<string, unknown>): PackFields {
  const out = {} as PackFields;
  for (const [k] of FIELDS) out[k] = typeof raw[k] === 'string' ? (raw[k] as string).trim().slice(0, MAX[k]) : '';
  return out;
}

export async function GET() {
  return NextResponse.json({ available: llmAvailable(), provider: llmProvider() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  if (!llmAvailable()) {
    console.error('[llm] pack-read failed: missing_key (no provider configured)');
    return NextResponse.json({ error: 'not_available', reason: 'missing_key' }, { status: 503 });
  }
  let body: { image?: unknown; mediaType?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const image = typeof body.image === 'string' ? body.image : '';
  const mediaType = MEDIA_TYPES.includes(body.mediaType as MediaType) ? (body.mediaType as MediaType) : null;
  if (!image || !mediaType || image.length > MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return NextResponse.json({ error: 'invalid_image' }, { status: 400 });
  }
  const result = await llmJson<Record<string, unknown>>({
    op: 'pack-read',
    system: SYSTEM,
    text: 'Read this medicine pack.',
    image: { base64: image, mediaType },
    schema: SCHEMA,
    maxTokens: 3000,
  });
  if (!result.ok) {
    // The reason (e.g. invalid_model, quota) is shown to the user as "AI reading unavailable" and logged above.
    return result.error === 'quota'
      ? NextResponse.json({ error: 'busy', reason: result.error }, { status: 429 })
      : NextResponse.json({ error: 'failed', reason: result.error }, { status: 502 });
  }
  if (!result.value || typeof result.value !== 'object') return NextResponse.json({ error: 'failed' }, { status: 502 });
  return NextResponse.json({ status: 'ok', fields: clean(result.value) }, { headers: { 'Cache-Control': 'no-store' } });
}
