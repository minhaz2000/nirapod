/**
 * Splits printed / clearly written prescription text (from on-device OCR) into candidate medicine lines:
 * "Tab. Comet 500 mg — 1+0+1 — 30 days" → { name: "Comet", strength: "500 mg", frequency: "1+0+1", duration: "30 days" }.
 * Pure and unit-tested. The result is only a suggestion; names are matched to the database and every line is
 * confirmed by the user (rule 7).
 */
export interface RxTextLine {
  /** Medicine name as read (may be misspelt). */
  name: string;
  strength: string;
  frequency: string;
  duration: string;
}

const FORM = /^(?:tab|tabs|tablet|cap|caps|capsule|syr|syrup|susp|inj|injection|drop|drops|cream|oint|ointment|gel|inh|sach|sachet|supp)\.?\s+/i;
const STRENGTH = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g|gm|ml|iu|%)(?:\s*\/\s*(\d+(?:\.\d+)?)\s*(ml|g))?\b/i;
const FREQUENCY = /\b([0-2½](?:\s*\+\s*[0-2½]){2,3})\b|\b(once|twice|thrice)\s+(?:a\s+)?daily\b|\b(?:od|bd|bid|tds|tid|qid|hs|sos|prn)\b/i;
const DURATION = /\b(\d+)\s*(days?|weeks?|wks?|months?|mths?|d|w|m)\b|\b(continue|cont\.?|চলবে)\b/i;
/** Words that are never a medicine name. */
const NOT_NAME = /^(?:dx|rx|name|age|sex|date|mobile|phone|address|adv|advice|dr|mbbs|fcps|reg|bmdc|patient)\b/i;

export function parseRxText(text: string): RxTextLine[] {
  const out: RxTextLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[|—–]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (line.length < 4 || NOT_NAME.test(line)) continue;
    const hadForm = FORM.test(line);
    const body = line.replace(FORM, '');
    const strength = body.match(STRENGTH);
    const frequency = body.match(FREQUENCY);
    const duration = body.match(DURATION);
    // A medicine line has a dosage form word or a strength; plain sentences are skipped.
    if (!hadForm && !strength) continue;
    const cut = Math.min(...[strength, frequency].filter((m): m is RegExpMatchArray => !!m).map((m) => m.index!), body.length);
    const name = body
      .slice(0, cut)
      // OCR reads o / l as 0 / 1 inside words ("Secl0" → "Seclo").
      .replace(/(?<=[A-Za-z])0/g, 'o')
      .replace(/(?<=[A-Za-z])1(?=[A-Za-z])/g, 'l')
      .replace(/[^A-Za-zঀ-৿\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (name.replace(/\s/g, '').length < 3) continue;
    out.push({
      name: name.split(' ').slice(0, 3).join(' '),
      strength: strength ? strength[0].replace(/\s+/g, ' ').trim() : '',
      frequency: frequency ? frequency[0].replace(/\s+/g, '') : '',
      duration: duration && duration[1] ? `${duration[1]} ${duration[2]}` : '',
    });
  }
  return out.slice(0, 25);
}
