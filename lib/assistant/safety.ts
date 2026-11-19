/**
 * Deterministic safety checks for the Nirapod Assistant, run BEFORE any language model (pure, unit-tested).
 * Danger signs / low sugar → the Emergency 999 card first. Dose, start / stop / change → refused. "Is it fake?" →
 * no verdict (rule 2). "Do I have …?" → no diagnosis (rule 1). Wording in messages under assistant.*.
 */
import { DANGER_SIGN_IDS } from '@/config/danger-signs';
import { GLUCOSE_CONFIG } from '@/config/glucose';
import { toMmol } from '@/lib/rules/glucose';
import { toAsciiDigits } from '@/lib/ocr/text';

type DangerSignId = (typeof DANGER_SIGN_IDS)[number];

/** Phrases for each danger sign (English and Bangla). Needs clinician review together with config/danger-signs.ts. */
const DANGER_PATTERNS: Array<[DangerSignId, RegExp]> = [
  ['chestPain', /chest\s*(?:pain|tight|pressure)|heart\s*attack|বুকে\s*(?:ব্যথা|চাপ)|বুক\s*ব্যথা|হার্ট\s*অ্যাটাক/i],
  ['strokeFace', /face\s*(?:droop|drooping|is\s*drooping|fell|crooked)|মুখ\s*(?:বেঁকে|বাঁকা|ঝুলে)/i],
  ['strokeArm', /(?:arm|leg|one\s*side)\s*(?:weak|numb|can'?t\s*move|cannot\s*move)|হাত\s*(?:অবশ|দুর্বল)|এক\s*পাশ\s*অবশ/i],
  ['strokeSpeech', /slurred\s*speech|can'?t\s*speak|cannot\s*speak|speech\s*(?:slurred|problem)|কথা\s*(?:জড়িয়ে|বলতে\s*পারছে\s*না|বলতে\s*পারছেন\s*না)/i],
  ['breathing', /can'?t\s*breathe|cannot\s*breathe|difficulty\s*breathing|short(?:ness)?\s*of\s*breath|শ্বাস\s*(?:নিতে\s*কষ্ট|কষ্ট|নিতে\s*পারছে\s*না)/i],
  ['unconscious', /unconscious|not\s*waking|fainted|passed\s*out|collapsed|অজ্ঞান|জ্ঞান\s*নেই|জ্ঞান\s*হারিয়ে/i],
  ['bleeding', /heavy\s*bleeding|bleeding\s*(?:a\s*lot|heavily|won'?t\s*stop)|রক্ত\s*(?:পড়া\s*থামছে\s*না|বন্ধ\s*হচ্ছে\s*না)|প্রচুর\s*রক্ত/i],
  ['lowGlucose', /\bhypo(?:glyc(?:a)?emia)?\b|(?:sugar|glucose)\s*(?:is\s*)?(?:very\s*)?low|low\s*(?:blood\s*)?(?:sugar|glucose)|সুগার\s*(?:অনেক\s*)?(?:কম|কমে\s*গেছে|নেমে\s*গেছে)|হাইপো/i],
];

/** A glucose number in the message, in mmol/L ("sugar 3.1", "glucose 55 mg/dl", "সুগার ৩.২"). */
export function glucoseInText(text: string): number | null {
  const t = toAsciiDigits(text).toLowerCase();
  if (!/(sugar|glucose|সুগার|গ্লুকোজ|ডায়াবেটিস|rbs|fbs)/i.test(t)) return null;
  const m = t.match(/(\d{1,3}(?:\.\d)?)\s*(mmol(?:\/l)?|mg\/?dl|mg)?/);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2]?.startsWith('mg') || (!m[2] && value >= 30) ? 'mgdl' : 'mmol';
  const mmol = toMmol(value, unit);
  return mmol > 0.5 && mmol < 40 ? mmol : null;
}

export interface SafetyCheck {
  emergency: boolean;
  lowGlucose: boolean;
  signs: DangerSignId[];
  refuse: 'dose' | 'diagnosis' | 'authenticity' | null;
}

const DOSE = [
  /\b(?:how\s*(?:much|many)|what\s*dose|which\s*dose|dosage|dose)\b.*\b(?:take|give|have|use|for|of)\b/i,
  /\bhow\s*(?:much|many)\s*(?:mg|tablets?|pills?|units?|ml)\b/i,
  /\b(?:can|should|may)\s*i\s*(?:stop|start|skip|double|increase|reduce|decrease|lower|raise|change|cut|split|take\s*(?:more|less|extra|another|two|2))\b/i,
  /\b(?:increase|reduce|decrease|double|change|adjust)\s*(?:my|the)?\s*(?:dose|insulin|dosage|units?)\b/i,
  /\b(?:insulin)\s*(?:units?|dose)\b/i,
  /ডোজ|মাত্রা|কয়টা\s*(?:খাব|খাবো|খেতে)|কতটা\s*(?:খাব|খাবো|নেব)|কত\s*(?:মিগ্রা|এমজি|ইউনিট)|বাড়া(?:ব|বো|তে)|কমা(?:ব|বো|তে)|বন্ধ\s*(?:করব|করবো|করতে\s*পারি)|খাওয়া\s*(?:ছেড়ে|বাদ)|দুটো\s*খাব/i,
];
const DIAGNOSE = [/\bdo\s*i\s*(?:have|got)\s+(?!to\b)(?:an?\s+)?[a-z]{3,}/i, /\bhave\s*i\s*got\s+(?:an?\s+)?[a-z]{3,}/i, /\bwhat\s*(?:disease|illness)\s*do\s*i\b/i, /\bdiagnose\b/i, /আমার\s*কি\s*.{0,20}(?:হয়েছে|আছে)\s*\?*$/i];
const AUTHENTICITY = [/\b(?:fake|genuine|counterfeit|original|real\s*or\s*fake|authentic)\b/i, /নকল|আসল\s*(?:না|কি)|ভেজাল/i];

export function checkMessage(text: string): SafetyCheck {
  const signs = DANGER_PATTERNS.filter(([, re]) => re.test(text)).map(([id]) => id);
  const mmol = glucoseInText(text);
  const lowByNumber = mmol !== null && mmol < GLUCOSE_CONFIG.hypoglycaemiaBelowMmol;
  if (lowByNumber && !signs.includes('lowGlucose')) signs.push('lowGlucose');
  const emergency = signs.length > 0;
  const refuse = DOSE.some((re) => re.test(text)) ? 'dose' : AUTHENTICITY.some((re) => re.test(text)) ? 'authenticity' : DIAGNOSE.some((re) => re.test(text)) ? 'diagnosis' : null;
  return { emergency, lowGlucose: signs.includes('lowGlucose'), signs, refuse };
}

/** Words never allowed in an answer (rule 2), in any language. */
export const AUTHENTICITY_WORDS = /\b(?:fake|genuine|counterfeit|authentic)\b|নকল|ভেজাল/i;
