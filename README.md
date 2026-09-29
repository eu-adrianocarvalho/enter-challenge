# XP monthly client letter — v2, Rivet-native

**Author:** Adriano da Silva de Carvalho · **Repository:** [github.com/eu-adrianocarvalho/enter-challenge](https://github.com/eu-adrianocarvalho/enter-challenge)

Proof of concept that writes the monthly investment letter for an XP middle-market client (Albert) and an
**advisor brief** listing everything the advisor should approve before the letter goes out.

The rule behind the design: **the LLM reads documents and writes prose; code computes every number; nothing
reaches the client unchecked.** The v1 workflow let two chained LLM calls invent the return, the benchmark gap
and the macro forecasts. In v2 an LLM never produces a figure that the client sees.

On this branch the whole workflow is **one Rivet graph, `monthly_letter`**. Press Run and it reads the PDFs,
calls the LLM graphs, checks each answer, computes returns and trade sizes, writes and reviews the letter, and
saves the XP-branded PDF. The branch `main` has the same solution with the deterministic steps in Python.

## The graph

```
monthly_letter                                    (Code = JavaScript node, LLM = subgraph with a Chat node)
  repo_dir ─► Code  load_inputs      statement and macro PDFs → text rows (pdf.js), config YAML, XP logo
     ├─► Loop  extraction_attempt ≤2   LLM extract_portfolio ─► Code reconcile (28 checks; failures go back as corrections)
     ├─► LLM   extract_profile        risk profile → constraints (profile, horizon, rating ≥ BB+ …)
     ├─► LLM   macro_outlook ─► Code ground_macro     every quote must be found in the report text
     ├─► Code  market_data            CVM fund quotas, BCB CDI/IPCA, Yahoo Ibovespa (saved snapshot when offline)
     ├─► Code  analyze                period returns, allocation vs. profile bands, sized candidates, tax, data flags
     ├─► LLM   advise ─► Code build_facts             LLM picks candidate ids; code builds the closed set of figures
     ├─► Loop  letter_attempt ≤3      LLM write_letter ─► Code check_numbers ─► LLM review_letter ─► Code decide_letter
     ├─► Code  render_letter          XP letter in HTML: two A4 sheets, KPI band, SVG chart, tables, disclaimer
     └─► Code  publish                PDF via headless Edge/Chrome, page count, status, brief, FACTS, cost log
```

Graph outputs: `status` (ready for the advisor, or blocked with the reason), `pdf_path` and `brief` (Markdown).
A run takes 30–50 s and costs about US$ 0.10 with gpt-4.1.

## Running it in the Rivet app

1. `npm install` (brings `pdf-parse` and `yaml`, which the Code nodes load from `node_modules/`).
2. Open `rivet/xp_monthly_letter.rivet-project` in Rivet 1.25 and set the OpenAI key under Settings.
3. Switch the executor from **Browser** to **Node**: the Code nodes read files, run the browser that prints
   the PDF and call the BCB and Yahoo APIs, which only the Node executor allows.
4. The `repo_dir` graph input defaults to the folder where `npm run build` last ran. After cloning somewhere
   else, run `npm run build` once or type the path into the input.
5. Open `monthly_letter` and press Run. Loops show each attempt; the PDF lands in `Output/`.

## Running it from the command line

```bash
npm install
cp .env.example .env     # then put your OPENAI_API_KEY in .env
npm run letter           # runs monthly_letter with rivet-cli and prints status, pdf_path and brief as JSON
npm test                 # 8 tests, no API key: runs each Code node the way Rivet's Node executor does
npm run build            # regenerates the .rivet-project from rivet/prompts, rivet/schemas and rivet/code
```

`npm run letter` loads `.env` with `node --env-file`, because `rivet-cli` reads `OPENAI_API_KEY` only from the
environment. Set `BROWSER_PATH` if Edge or Chrome is not in its default location.

## Where things are

| Path | What |
|---|---|
| `rivet/xp_monthly_letter.rivet-project` | The project: `monthly_letter` (main graph), two loop bodies and six LLM graphs |
| `rivet/code/*.js` | Body of each Code node |
| `rivet/code/lib/*.js` | Shared functions, pasted in front of each node body at build time |
| `rivet/code/nodes.mjs` | Which libraries, inputs, outputs and permissions each Code node has |
| `rivet/prompts/*.md`, `rivet/schemas/*.json` | Prompts (English) and strict JSON schemas of the LLM graphs |
| `rivet/build.mjs` | Writes the project file from everything above |
| `rivet/tests/` | `node:test` suite; `fixtures/` holds the hand-transcribed statement and the FACTS of the Python version |
| `config/settings.yaml` | Input files, reference period, models, prices per token, thresholds, logo |
| `config/allocation_moderate.yaml`, `research_shelf.yaml` | Target bands and products the engine may recommend (illustrative) |
| `config/fund_registry.yaml` | Statement fund name → CNPJ and allocation bucket, verified by hand |
| `data/market/` | CVM daily quotas used for fund returns, and the benchmark snapshot used offline |
| `data/rivet_inputs/` | Defaults of the LLM graphs, so each one also runs on its own in the app |
| `data/evidence/` | Real LLM failures that motivated each guard |
| `Output/` | `carta_*.html` and `.pdf`, `brief_assessor_*.md`, `facts_*.json`, `run_log_*.json` |
| `docs/` | Documentation in Portuguese and the 2-page report; they describe the Python version on `main` |
| `enter_challenge.rivet-project`, `Output/output_letter.docx` | The v1 graph and letter, untouched for comparison |

`src/` still holds the Python version from `main`. Do not run `src/run.py` on this branch: it rewrites
`rivet/xp_monthly_letter.rivet-project` with its six-graph project, which has no `monthly_letter`.

## Guards

1. **Reconciliation.** The extracted statement must add up: invested + cash = net worth, positions = class
   subtotals, quantity × last price = position, allocation % = position / invested. Failed checks go back to the
   LLM once as corrections; a second failure stops the run.
2. **Grounded macro brief.** Each projection, theme and risk carries a quote that must be found in the report
   text (words in order within a short window). Ungrounded items are dropped and listed in the brief.
3. **Closed set of figures.** The writer receives FACTS, with every figure pre-formatted in pt-BR. The fact-check
   rejects any percentage, amount or p.p. value not in FACTS, including roundings like "R$ 40 mil".
4. **Faithfulness review.** `review_letter` compares the letter with FACTS and flags added events, dropped
   conditions and flipped forecasts. Findings from 3 and 4 go back to the writer; after three versions an
   unresolved finding blocks the letter.
5. **Sources kept apart.** Projections are attributed to XP; the model's own reading of the report is written as
   the advisor's view ("entendemos que…"), so the letter never puts an inference in XP Research's mouth.
6. **Sensitive sentences are written by code**, such as the note on the matured CDB whose settlement still has
   to be confirmed. **Trade sizes come from rules**; the LLM only selects candidate ids.

## Pitfalls worth knowing

Rivet runs a Code node as an async function whose parameters include `graphInputs` and `context`, so a
`const context` in node code fails with "Identifier 'context' has already been declared". The nodes call their
configuration `setup` for that reason.

Code nodes cannot import modules, so `build.mjs` pastes the needed `rivet/code/lib/` files in front of each node
body. Edit the files and rebuild: code edited inside the app is overwritten by the next `npm run build`.

Rivet 1.25 has no Write File node, and its OpenAI Chat node accepts images but not PDFs, so reading the PDFs and
writing the outputs are Code nodes that load Node modules.

Those nodes must not tick **Allow require**. The desktop app's Node executor runs the CommonJS build of Rivet on
Node 18, where `import.meta` is an empty object, so Rivet calls `createRequire(undefined)` and the node fails with
"The argument 'filename' must be a file URL object, file URL string, or absolute path string. Received undefined"
before any of its code runs. `rivet-cli` loads the ESM build and works, which hides the bug. The nodes use
`projectRequire()` from `rivet/code/lib/modules.js` instead: a dynamic `import('node:module')` and a
`createRequire` anchored at the project's `package.json`, which work in both executors. Text comes from the pdf.js build bundled in
`pdf-parse`: text items are grouped by height and sorted left to right, so each statement table row stays on one
line, as the extraction prompt expects.

A stricter faithfulness reviewer is not always a better one. Telling it to police sources made it flag
"a XP projeta" and every "deve" as errors, and two runs in four were blocked. The fix went into the writer's
prompt instead, and three runs in three came out ready.

gpt-4.1-mini transcribed the statement perfectly except one subtotal, where it swapped two digits, and repeated
the mistake when shown the failed check (see `data/evidence/`), so extraction uses gpt-4.1.

Fund names on the statement do not match CVM's registry: CVM 175 renamed most funds, and "Brave I FIC FIM CP"
became a FIDC, which has no daily quota, so its return is an estimate prorated from the monthly FIDC report and
flagged as such. The statement's dates also disagree (fund quotes from 04/04/2024, CDB matured 05/09/2024,
statement 07/05/2025, macro report 06/02/2025); the brief lists each inconsistency.
