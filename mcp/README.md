# Nirapod MCP servers

Three read-only MCP servers ship with Nirapod. All use the official TypeScript MCP SDK, the app's own tested rule code, no user data and no logging:

| Server | stdio | Streamable HTTP | Purpose |
|---|---|---|---|
| **Nirapod MCP** | `npm run --silent mcp` | `/api/mcp` | medicines, alternatives, duplicate generics, food carbs, expiry |
| **Nirapod Emergency MCP** | `npm run --silent mcp:emergency` | `/api/mcp/emergency` | danger signs, low blood sugar first, nearby hospitals |
| **Nirapod Lab Report MCP** | `npm run --silent mcp:lab` | `/api/mcp/lab` | lab values against reference ranges, in plain words |

Every answer of the Emergency and Lab Report servers passes an output check (`lib/mcp/output-safety.ts`) that
bans "you have …", "fake", "genuine", dose-change wording and any advice to eat less.

---

## 1. Nirapod MCP (reference data)

A **read-only [Model Context Protocol](https://modelcontextprotocol.io) server** that lets any AI assistant use
Nirapod's verified Bangladeshi health reference data: the medicine list (brands, generics, strengths, forms, makers,
prices), same-generic alternatives, the duplicate-generic rule, FoodNetBD carbohydrates and the medicine-pack expiry
parser.

- **No user data.** It only reads the two read-only SQLite files built from public datasets
  (`data/build/medicines.sqlite`, `data/build/nutrition.sqlite`). Nothing is written, stored or logged — not even
  the question.
- **Same code as the app.** Every tool calls the app's own `lib/` code (medicine matcher, alternatives rule,
  prescription duplicate rule, FoodNetBD lookups, pack expiry parser); nothing is reimplemented. See
  `lib/mcp/server.ts` and `lib/mcp/tools.ts`.
- **Safety rules built in.** Answers never call a medicine fake or genuine, never advise starting, stopping or
  changing a medicine or dose, and never diagnose; alternatives match generic, strength and dosage form exactly and say
  "Confirm with your pharmacist before switching". Every tool response is checked against these rules before it is sent.
- **Input limits.** Names up to 60 characters, at most 20 results or medicines, HTTP bodies up to 32 KB.

## Tools

| Tool | Input | Returns |
|---|---|---|
| `search_medicine` | `query` (brand or generic, English or Bangla, e.g. `Napa`, `paracetamol`, `নাপা`), `limit` (1–20, default 5) | brand, generic, strength, dosage form, manufacturer, unit and pack prices — with "Prices are from the dataset snapshot and may be out of date" |
| `find_cheaper_alternatives` | `brand`, optional `strength`, `dosage_form` | other brands with the **same generic, strength and dosage form only**, cheapest first — always "Confirm with your pharmacist before switching" |
| `check_duplicate_generics` | `medicines` (2–20 names) | brands that share a generic (e.g. two metformin brands; Napa + Ace = paracetamol twice) — with "Ask your doctor or pharmacist; do not stop on your own" |
| `get_food_carbs` | `food` (English or Bangla, e.g. `rice`, `ruti`, `রুটি`), `limit` | carbohydrates (and sugars, fibre, energy) per 100 g from FoodNetBD, with source and licence (CC BY 4.0) |
| `check_expiry` | `date_text` (`EXP 08/2027`, `EXP: AUG 27`, `31.08.2027`, Bangla digits, `MFG 03/2025 EXP 02/2027`) | `expired` / `expiring_soon` (within 3 months, `config/expiry.ts`) / `ok` / `not_readable`; an MFG date is never used as the expiry |

**Resource:** `nirapod://safety-rules` — the 12 Nirapod safety rules (Markdown).

All tools are annotated `readOnlyHint: true`.

## Run it locally (stdio)

```bash
npm install
npm run build:data      # builds data/build/*.sqlite once
npm run --silent mcp    # MCP over stdio (use --silent: npm's own banner would corrupt stdout)
```

### Claude Desktop

Add to `claude_desktop_config.json` (Settings → Developer → Edit Config), with the absolute path to this repository:

```json
{
  "mcpServers": {
    "nirapod": {
      "command": "npm",
      "args": ["--prefix", "/absolute/path/to/nirapod", "run", "--silent", "mcp"]
    }
  }
}
```

On Windows use `"command": "npm.cmd"`. Without npm on the path, the equivalent is
`"command": "/absolute/path/to/nirapod/node_modules/.bin/tsx"` with
`"args": ["--tsconfig", "/absolute/path/to/nirapod/tsconfig.json", "/absolute/path/to/nirapod/mcp/stdio.ts"]`.
Restart Claude Desktop; "nirapod" appears in the tools menu.

## Use it remotely (Streamable HTTP)

The deployed app serves the same server, stateless, at:

```
https://<your-deployment>/api/mcp
```

- **Claude (claude.ai / Claude Desktop):** Settings → Connectors → *Add custom connector* → name `Nirapod`, URL
  `https://<your-deployment>/api/mcp`. No authentication is needed (the data is public reference data).
- **Any MCP client** that supports Streamable HTTP: point it at the same URL. Only `POST` is used; `GET` and `DELETE`
  return 405 because the server keeps no sessions. Responses are JSON.

Quick check from a terminal:

```bash
curl -s -X POST https://<your-deployment>/api/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Example conversation

(Illustrative — the numbers come from the dataset snapshot.)

> **User:** My mother takes Comet and Daomin for diabetes, and Seclo for gastric. Is anything doubled? And is there a cheaper Seclo?
>
> *The assistant calls* `check_duplicate_generics({"medicines": ["Comet", "Daomin", "Seclo"]})` *and*
> `find_cheaper_alternatives({"brand": "Seclo"})`.
>
> **Assistant:** Comet and Daomin both contain **metformin**, so the same medicine may be in the list twice. Ask her
> doctor or pharmacist; do not stop either on your own. Seclo 20 mg capsules are omeprazole 20 mg; brands with exactly
> the same generic, strength and form cost less, for example Omirex 20 mg (about Tk 0.74 per capsule in the dataset vs
> Tk 5 for Seclo). Prices are from the dataset snapshot and may be out of date. Confirm with your pharmacist before
> switching.
>
> **User:** The box says "MFG 03/2025 EXP 02/2027". Is it still OK?
>
> *The assistant calls* `check_expiry({"date_text": "MFG 03/2025 EXP 02/2027"})`.
>
> **Assistant:** The expiry date is February 2027, so it is OK until then (03/2025 is the manufacturing date).

## Tests

- `tests/unit/mcp-tools.test.ts` — every tool on the real datasets (Napa / paracetamol, Seclo / omeprazole,
  metformin, নাপা, rice / রুটি, expiry formats, MFG vs EXP), safety checks, and the server through an in-memory MCP
  client.
- `tests/e2e/mcp.spec.ts` — the official MCP TypeScript client over **stdio** (`npm run --silent mcp`) and
  **Streamable HTTP** (`POST /api/mcp` on the production build): list tools and resources, call every tool, limits.

## Data and licences

- Medicines: `medicinedb` (WSAyan), prices as of the dataset snapshot (2021-09) — see `data/raw/README.md`.
- Foods: FoodNetBD, CC BY 4.0 — https://data.mendeley.com/datasets/23f7yxnvy7/1

---

## 2. Nirapod Emergency MCP

Danger signs and low blood sugar with Nirapod's fixed emergency rules (`lib/rules/danger-signs.ts`,
`config/danger-signs.ts`, `config/glucose.ts`), in English or Bangla.

| Tool | Input | Returns |
|---|---|---|
| `check_danger_signs` | `signs[]` (checklist ids such as `chestPain`, `strokeFace`, or short descriptions) and/or `text` (free text, English or Bangla), optional `language` | `possible_emergency`, the matched signs and the app's advice. If any sign matches, the **first line** is "Possible emergency — call 999 now" (Bangla: "সম্ভাব্য জরুরি অবস্থা — এখনই ৯৯৯-এ ফোন করুন") |
| `check_glucose_level` | `value`, `unit` (`mmol/L` or `mg/dL`), optional `when` (`fasting`, `random`, `after_meal`), `language` | Below 3.9 mmol/L (70 mg/dL) the answer **starts with** "Take something sweet now (juice, sugar or glucose). If you feel confused or faint, call 999." and never suggests eating less (rule 6); otherwise the value against the usual range |
| `nearby_hospitals_link` | `lat`, `lon` | a Google Maps search link for hospitals near the point; the location is not stored or logged |

**Resource:** `nirapod://emergency-rules` — the danger-sign list, advice, the low-sugar rule and the 999 note
(999 connects to police, fire service and ambulance providers).

Claude Desktop:

```json
{
  "mcpServers": {
    "nirapod-emergency": {
      "command": "npm",
      "args": ["--prefix", "/absolute/path/to/nirapod", "run", "--silent", "mcp:emergency"]
    }
  }
}
```

Remote connector URL: `https://<your-deployment>/api/mcp/emergency`

Example (illustrative):

> **User:** আমার বাবার বুকে ব্যথা হচ্ছে আর ঘামছেন। কী করব?
>
> *The assistant calls* `check_danger_signs({"text": "আমার বাবার বুকে ব্যথা হচ্ছে আর ঘামছেন"})`.
>
> **Assistant:** সম্ভাব্য জরুরি অবস্থা — এখনই ৯৯৯-এ ফোন করুন। বুকে ব্যথা একটি বিপদ-চিহ্ন। ৯৯৯ আপনাকে পুলিশ, ফায়ার সার্ভিস ও অ্যাম্বুলেন্স সেবাদাতার সঙ্গে যুক্ত করে।
>
> **User:** My mother's sugar meter shows 60 mg/dL.
>
> *The assistant calls* `check_glucose_level({"value": 60, "unit": "mg/dL"})`.
>
> **Assistant:** Take something sweet now (juice, sugar or glucose). If she feels confused or faint, call 999.
> 60 mg/dL (3.3 mmol/L) is below the low-sugar level (70 mg/dL). Do not give food or drink to someone who is unconscious.

---

## 3. Nirapod Lab Report MCP

Explains a lab value against Nirapod's reference ranges (`lib/rules/report-ranges.ts`, `config/report-ranges.ts`,
**needs clinician review**). Accepts common Bangladeshi report names (HbA1c, FBS, RBS, 2 hrs ABF, cholesterol, LDL,
HDL, triglycerides, creatinine, SGPT, SGOT, TSH, uric acid, Hb, platelets, WBC …) and Bangla names
(`config/lab-test-names-bn.ts`, e.g. হিমোগ্লোবিন, ক্রিয়েটিনিন, এসজিপিটি, খালি পেটে সুগার).

| Tool | Input | Returns |
|---|---|---|
| `explain_lab_value` | `test_name`, `value`, `unit`, optional `language` | `low` / `normal` / `high`, the range used and its source, and a plain explanation that says "may" / "possible" — never a diagnosis (rule 1), never advice to change a medicine (rule 3). A glucose value below 3.9 mmol/L (70 mg/dL) gives the low-sugar guidance first |
| `list_supported_tests` | — | every test, its English and Bangla names, units, ranges and the source of each range |

**Resource:** `nirapod://lab-ranges` — the reference ranges, marked "needs clinician review".

Claude Desktop:

```json
{
  "mcpServers": {
    "nirapod-lab": {
      "command": "npm",
      "args": ["--prefix", "/absolute/path/to/nirapod", "run", "--silent", "mcp:lab"]
    }
  }
}
```

Remote connector URL: `https://<your-deployment>/api/mcp/lab`

Example (illustrative):

> **User:** My report says HbA1c 7.6%. Is that bad?
>
> *The assistant calls* `explain_lab_value({"test_name": "HbA1c", "value": 7.6, "unit": "%"})`.
>
> **Assistant:** 7.6 % is above the usual range (4.0–5.6 %). HbA1c shows average blood sugar over about 2 to 3 months,
> so a high value may mean blood sugar has often been high. If your report prints its own range, that range wins.
> This is general information, not a diagnosis — please discuss it with your doctor, and do not stop or change any
> medicine on your own.

### All three in Claude Desktop

```json
{
  "mcpServers": {
    "nirapod": { "command": "npm", "args": ["--prefix", "/absolute/path/to/nirapod", "run", "--silent", "mcp"] },
    "nirapod-emergency": { "command": "npm", "args": ["--prefix", "/absolute/path/to/nirapod", "run", "--silent", "mcp:emergency"] },
    "nirapod-lab": { "command": "npm", "args": ["--prefix", "/absolute/path/to/nirapod", "run", "--silent", "mcp:lab"] }
  }
}
```

### Tests for the Emergency and Lab Report servers

- `tests/unit/mcp-emergency-lab.test.ts` — chest pain, FAST stroke signs, Bangla input, glucose 3.2 mmol/L and
  60 mg/dL, normal glucose, HbA1c 7.6 %, Bangla test names, the output check, and both servers through in-memory
  MCP clients.
- `tests/e2e/mcp-emergency-lab.spec.ts` — the official MCP client against each server over **stdio** and
  **Streamable HTTP**: list tools, call each one, read the resource; GET / DELETE 405 and the 32 KB limit.
