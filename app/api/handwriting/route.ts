import { NextResponse, type NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { aiAvailable, getAnthropic } from '@/lib/server/anthropic';
import { redact } from '@/lib/privacy/redact';

/**
 * POST /api/handwriting — reads a handwritten prescription photo with the Anthropic API.
 *
 * - The client crops the header (name, phone, address) off the photo before sending (rule 9); text that comes back
 *   is redacted again here. Nothing is stored or logged.
 * - The result is a list for the USER TO CONFIRM OR EDIT line by line before anything uses it (rule 7).
 * - Without ANTHROPIC_API_KEY / ANTHROPIC_MODEL it returns 503 { error: 'not_available' } and the app falls back
 *   to typing or picking medicines from the database.
 * GET /api/handwriting → { available } so the UI can say up front whether reading is possible.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BASE64 = 6_000_000; // ~4.5 MB image
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

export interface HandwritingItem {
  medicine: string;
  strength: string;
  frequency: string;
  duration: string;
  diagnosis_if_written: string;
  /** 0–1: how sure the reader is about this line. */
  confidence: number;
}

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          medicine: { type: 'string', description: 'Medicine name exactly as written (brand or generic). Empty if unreadable.' },
          strength: { type: 'string', description: 'Strength as written, e.g. "500 mg". Empty if not written.' },
          frequency: { type: 'string', description: 'How often, as written, e.g. "1+0+1" or "twice daily". Empty if not written.' },
          duration: { type: 'string', description: 'For how long, as written, e.g. "7 days". Empty if not written.' },
          diagnosis_if_written: { type: 'string', description: 'Diagnosis the doctor wrote that this line belongs to. Empty if none.' },
          confidence: { type: 'number', description: 'From 0 to 1: how legible this line is.' },
        },
        required: ['medicine', 'strength', 'frequency', 'duration', 'diagnosis_if_written', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

const SYSTEM = `You transcribe handwritten medical prescriptions from Bangladesh. Output only what is written.
Rules:
- Transcribe each prescribed medicine line. Do not add, guess, correct or complete medicine names, strengths, frequencies or durations.
- If a field is not written or cannot be read, use an empty string and lower the confidence.
- Copy the doctor's written diagnosis into diagnosis_if_written only if it is written on the prescription; never infer a diagnosis.
- Do not include patient or doctor names, phone numbers, addresses or ID numbers anywhere.
- confidence is your estimate (0 to 1) that the line is transcribed correctly.`;

function clean(item: HandwritingItem): HandwritingItem {
  const s = (v: unknown) => (typeof v === 'string' ? redact(v).trim().slice(0, 120) : '');
  const c = Number(item.confidence);
  return {
    medicine: s(item.medicine),
    strength: s(item.strength),
    frequency: s(item.frequency),
    duration: s(item.duration),
    diagnosis_if_written: s(item.diagnosis_if_written),
    confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0,
  };
}

export async function GET() {
  return NextResponse.json({ available: aiAvailable() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const ai = getAnthropic();
  if (!ai) return NextResponse.json({ error: 'not_available' }, { status: 503 });

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

  try {
    const response = await ai.client.messages.parse({
      model: ai.model,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: 'Transcribe the medicines on this prescription.' },
          ],
        },
      ],
      output_config: { format: jsonSchemaOutputFormat(SCHEMA) },
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return NextResponse.json({ error: 'failed' }, { status: 502 });
    }
    const items = (response.parsed_output.items as HandwritingItem[]).slice(0, 25).map(clean).filter((i) => i.medicine || i.strength);
    return NextResponse.json({ status: 'ok', items }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const status = err instanceof Anthropic.RateLimitError ? 429 : 502;
    return NextResponse.json({ error: status === 429 ? 'busy' : 'failed' }, { status });
  }
}
