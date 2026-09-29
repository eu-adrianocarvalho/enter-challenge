# XP monthly client letter — v2

**Author:** Adriano da Silva de Carvalho · **Repository:** [github.com/eu-adrianocarvalho/enter-challenge](https://github.com/eu-adrianocarvalho/enter-challenge)

Proof of concept that writes the monthly investment letter for an XP middle-market client (Albert) and an
**advisor brief** listing everything the advisor should approve before the letter goes out.

The rule behind the design: **the LLM reads documents and writes prose; code computes every number; nothing
reaches the client unchecked.** The v1 workflow let two chained LLM calls invent the return, the benchmark gap
and the macro forecasts. In v2 an LLM never produces a figure that the client sees.

**Full documentation (Portuguese): open `docs/index.html`**, a single page with a sidebar that explains what was
done and why, and previews every input and output file. The same content is in `docs/0*.md`.

## Pipeline

```
Inputs: statement PDF, risk profile, XP macro report PDF, price CSV
  │
  ├─ pdf_text          pdfplumber keeps each table row on one line (the supplied .txt files are scrambled)
  ├─ [Rivet] extract_portfolio   statement → JSON          ─► reconcile: subtotals, qty × price, allocation %
  ├─ [Rivet] extract_profile     risk profile → constraints (profile, horizon, rating ≥ BB+ …)
  ├─ [Rivet] macro_outlook       report → projections/themes/risks with verbatim quotes ─► grounding check
  │
  ├─ returns           period return per asset/class: stocks from the price CSV, funds from CVM daily quotas
  ├─ benchmarks        CDI and IPCA (BCB SGS), Ibovespa (Yahoo) for the same window
  ├─ data_quality      matured CDB, idle cash, stale quotes, renamed ticker, fund converted to FIDC, …
  ├─ suitability       allocation vs. profile bands → sized buy/sell candidates + tax estimate
  │
  ├─ [Rivet] advise              picks 2–3 candidates and explains them, citing macro evidence ids
  ├─ [Rivet] write_letter        pt-BR letter, allowed to use only figures present in FACTS
  ├─ factcheck         every % / R$ / p.p. in the letter must appear in FACTS
  ├─ [Rivet] review_letter       compliance reviewer: flags statements FACTS does not support
  │                    numeric and reviewer findings go back to write_letter (up to 3 versions)
  └─ render            python-docx letter (KPIs, chart, table, disclaimer) → PDF via Word → ≤ 2 pages check
                       + brief_assessor_*.md, facts_*.json, run_log_*.json
```

Deterministic code lives in `src/xp_letter/`. LLM steps are the six graphs in `rivet/xp_monthly_letter.rivet-project`,
run through `rivet-cli` and cached by a hash of prompt, schema, model and inputs, so re-runs are free and
reproducible.

## Running it

Prerequisites: Python 3.11+, Node.js 18+, an OpenAI API key, and Microsoft Word or LibreOffice for the PDF
(without either, use `--no-pdf`).

```bash
py -3.13 -m venv .venv            # or python3 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
npm install                        # installs @ironclad/rivet-cli 1.25.0
cp .env.example .env               # then put your OPENAI_API_KEY in .env
.venv/Scripts/python src/run.py        # writes Output/carta_*.docx|pdf and Output/brief_assessor_*.md
.venv/Scripts/python -m pytest         # 29 tests, no API key needed
.venv/Scripts/python src/build_docs.py # rebuilds docs/index.html (src/run.py also does it at the end)
.venv/Scripts/python src/build_report.py # rebuilds docs/relatorio.pdf, the 2-page challenge report
```

Flags: `--refresh-llm` ignores cached LLM answers; `--refresh-market` downloads CVM quotes and benchmarks
again (they are stored in `data/market/`, and LLM answers in `data/llm/`, so the run works offline and
costs nothing the second time); `--no-pdf` skips Word.

To look at a graph in the Rivet desktop app, open `rivet/xp_monthly_letter.rivet-project`, set the OpenAI key
under Settings and run `write_letter`: its graph inputs default to the last real run for Albert.

## Where things are

| Path | What |
|---|---|
| `rivet/prompts/*.md`, `rivet/schemas/*.json` | Prompts (English) and strict JSON schemas for each graph |
| `src/build_rivet.py` | Regenerates the `.rivet-project` from those files (via `src/xp_letter/rivet_project.py`) |
| `src/xp_letter/` | The Python package: one module per responsibility (see `docs/04_arquitetura_e_codigo.md`) |
| `config/settings.yaml` | Input files, reference period, models, prices per token, thresholds |
| `config/allocation_moderate.yaml` | Target bands for the moderate profile (illustrative) |
| `config/research_shelf.yaml` | Products and stock coverage the engine may recommend (illustrative) |
| `config/fund_registry.yaml` | Statement fund name → CNPJ and allocation bucket, verified by hand |
| `src/tests/fixtures/albert_statement.json` | Hand-transcribed statement: test oracle and extraction eval |
| `data/` | `llm/` stored LLM answers, `market/` CVM and benchmark data, `rivet_inputs/` demo defaults, `evidence/` real failures that motivated each guard |
| `docs/` | Documentation in Portuguese, the 2-page report and the `index.html` site |
| `assets/xp/` | Logo used in the letter header; the path is `brand.logo` in `config/settings.yaml` |
| `enter_challenge.rivet-project`, `Output/output_letter.docx` | The v1 graph and letter, untouched for comparison |

## Guards

1. **Reconciliation.** The extracted statement must add up: invested + cash = net worth, positions = class
   subtotals, quantity × last price = position, allocation % = position / invested. Any failure stops the run.
2. **Grounded macro brief.** Each projection, theme and risk carries a quote that must be found in the report
   text (words in order within a short window). Summaries may only contain figures printed in the report.
   Ungrounded items are dropped and listed in the brief.
3. **Closed set of figures.** The letter writer receives FACTS, with every figure pre-formatted in pt-BR. A
   regex fact-check rejects any percentage, amount or p.p. value not in FACTS, including roundings like
   "R$ 40 mil", and duplicated words in names.
4. **Faithfulness review.** A second LLM (`review_letter`) compares the letter with FACTS and flags statements
   that add a status, drop a condition or flip a forecast. In testing it caught "the Selic may stop rising
   earlier" rewritten as "the Selic may stabilise". Findings from 3 and 4 go back to the writer; after three
   versions an unresolved finding blocks the letter.
5. **Sensitive sentences are written by code.** Operational notes, such as the matured CDB whose settlement
   still has to be confirmed, are printed under the table by `render.py`, because paraphrasing them turned
   "after we confirm the settlement" into "already settled".
6. **Sized by rules, explained by the LLM.** Trade sizes come from `suitability.py`; the LLM can only select
   candidate ids, and unknown ids are discarded.
7. **Advisor in the loop.** The brief shows the data issues, the evidence behind each suggestion and the tax
   estimate, and the letter is saved as an editable DOCX.

## Pitfalls worth knowing

gpt-4.1-mini transcribed the statement perfectly except one subtotal, where it swapped two digits
(60.131,79 instead of 60.311,79), and repeated the mistake when shown the failed check. gpt-4.1 matches the
hand-transcribed fixture field for field, for about US$ 0.02 per statement, so extraction uses gpt-4.1. The
fixture in `src/tests/fixtures/` is what made the comparison possible; keep it as the extraction eval.

Rivet 1.25 treats only model names starting with `o1`, `o3` or `o4` as reasoning models, so it would send
`temperature` and `max_tokens` to a gpt-5 model, and the API rejects them. That is why the graphs use gpt-4.1
and gpt-4.1-mini. Rivet also only prices models it knows (gpt-4.1-mini shows cost 0), so cost is computed in
Python from the `usage` output with the prices in `settings.yaml`.

The Rivet Read File node resolves paths against the current directory under Node and needs absolute paths in
the desktop app. The v1 graph combined hard-coded absolute paths with `errorOnMissingFile: false`, so a missing
file silently became an empty prompt. v2 passes file contents as graph inputs instead.

Fund names on the statement do not match CVM's registry: CVM 175 renamed most funds, and "Brave I FIC FIM CP"
was converted into "Brave 90 FIC FIDC" in November 2024. FIDCs do not publish daily quotas, so Brave's return
is an estimate prorated from the CVM monthly FIDC report, flagged as such in the brief. Name matching found
the wrong entity (a master fund) for Riza, which is why `fund_registry.yaml` holds CNPJs checked by hand.

The statement's dates disagree: fund quotes are from 04/04/2024, the CDB matured on 05/09/2024, the statement is
dated 07/05/2025 and the macro report 06/02/2025. The period return uses the window 07/04/2025–07/05/2025 for
stocks (price CSV), funds (CVM quotas) and benchmarks alike, and the brief lists each inconsistency.

PDF conversion opens a *separate* Word process (`DispatchEx`) and quits only that one. Libraries that call
`Dispatch` can attach to the Word instance the user already has open, and quitting it closes their documents.
