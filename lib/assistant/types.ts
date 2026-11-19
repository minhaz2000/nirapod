/** Nirapod Assistant: message, card and response shapes shared by the server and the chat UI. */
import type { CheckedValue } from '@/lib/rules/report-ranges';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface MedicineSummary {
  id: number;
  brand: string;
  generic: string | null;
  strength: string;
  form: string;
  manufacturer: string | null;
  indication: string | null;
  genericOnly?: boolean;
}

export interface Source {
  title: string;
  uri: string;
}

export type ExpiryCardStatus = 'expired' | 'expiresSoon' | 'ok' | 'unknown';

export type AssistantCard =
  /** Danger signs or low sugar: always first (rule 6, rule 11). */
  | { type: 'emergency'; lowGlucose: boolean }
  /** Dose / start / stop / change questions, diagnosis requests, "is it fake": refused with a safe pointer. */
  | { type: 'refusal'; reason: 'dose' | 'diagnosis' | 'authenticity' | 'skin' }
  | { type: 'medicine'; medicine: MedicineSummary; matchedAs: string }
  | { type: 'alternatives'; medicine: MedicineSummary; alternatives: Array<MedicineSummary & { unitPrice: number | null; cheaper: boolean }>; status: 'ok' | 'not_comparable' }
  | { type: 'duplicates'; groups: Array<{ ingredient: string; brands: string[] }>; checked: string[] }
  | { type: 'expiry'; status: ExpiryCardStatus; exp: string | null }
  | { type: 'notFound'; query: string }
  | { type: 'report'; values: CheckedValue[]; explanation: string; explanationSource: 'ai' | 'template' }
  | { type: 'sources'; sources: Source[] }
  | { type: 'unsure' };

/** What the chat already knows from verified photo results (sent with each question; nothing is stored). */
export interface AssistantContext {
  /** The medicine identified from a pack photo (verified against the database), with its expiry. */
  pack?: { medicine: MedicineSummary | null; expiry: ExpiryCardStatus; exp: string | null };
  /** Prescription lines the user CONFIRMED (rule 7). */
  prescription?: Array<{ medicine: string; strength: string; frequency: string; duration: string }>;
  /** Report values read on the phone, checked against their ranges. */
  report?: CheckedValue[];
}

export interface AssistantRequest {
  locale: 'bn' | 'en';
  messages: ChatTurn[];
  context?: AssistantContext;
}

export interface AssistantResponse {
  answer: string;
  /** ai = written by the language model from tool results (validated); template = deterministic; safety = rule. */
  source: 'ai' | 'template' | 'safety';
  cards: AssistantCard[];
  sources: Source[];
  aiAvailable: boolean;
  /** Why the language model was not used, when it was configured (e.g. invalid_model). */
  aiError?: string;
}
