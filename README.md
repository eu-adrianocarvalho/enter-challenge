<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/enter-logo-white.svg">
    <img src="docs/assets/enter-logo.svg" alt="Enter" width="280">
  </picture>
</p>

# XP monthly client letter — Enter AI Deployment challenge

**Author:** Adriano da Silva de Carvalho · **Documentation site:** [eu-adrianocarvalho.github.io/enter-challenge](https://eu-adrianocarvalho.github.io/enter-challenge/)

This repository is my solution to the take-home challenge for the **AI Deployment** role at
[Enter](https://getenter.ai). XP wants its advisors to serve three times more middle-market clients, and the idea
is a monthly letter written by an AI workflow in [Rivet](https://rivet.ironcladapp.com): how the portfolio did,
how the market may affect it, and what to adjust given the client's risk profile and XP's research. The challenge
shipped a first version (a Rivet graph and a sample letter) and asked to review it, find what is wrong, improve at
least one of three areas (profitability, buy/sell logic, automated formatting) and document the reasoning. This
solution covers the three areas.

## Quick start

You need [Node.js](https://nodejs.org) 22 or later, the [Rivet](https://rivet.ironcladapp.com) desktop app 1.25 or
later, Microsoft Edge or Google Chrome (to print the letter as PDF) and an OpenAI API key.

**1. Clone and install**

```bash
git clone https://github.com/eu-adrianocarvalho/enter-challenge.git
cd enter-challenge
npm install
npm run build
```

`npm install` brings the packages the Rivet Code nodes load (`pdf-parse`, `yaml`). `npm run build` regenerates
`enter_challenge.rivet-project` so that its `Graph Input: repo_dir` points to the folder you just cloned.

**2. Open it in Rivet**

Open `enter_challenge.rivet-project` in the Rivet app and switch the executor from **Browser** to **Node**: the
Code nodes read files, call the Banco Central and Yahoo APIs and print the PDF, which only the Node executor allows.
In the graph list, open **Main Graph: Enter Challenge**.

**3. Set the OpenAI key**

In Rivet, open **Settings → OpenAI** and paste your API key. Every model call uses it.

**4. Delete the previous outputs and press Run**

`Output/` holds the letter of the last run. Delete the generated files to watch them come back (keep
`Output/output_letter.docx`, the v1 letter the documentation compares against):

```bash
rm Output/carta_* Output/brief_assessor_* Output/facts_* Output/run_log_*
```

```powershell
Remove-Item Output\carta_*, Output\brief_assessor_*, Output\facts_*, Output\run_log_*
```

Then press **Run**. Each node lights up as it runs and the loops show every attempt. In 30 to 50 seconds (about
US$ 0.10 with gpt-4.1) `Output/` has the letter as PDF and HTML, the advisor brief, the FACTS and the cost log, and
the graph outputs show `status`, `pdf_path` and `brief`.

**Without the app.** After step 1, put the key in `.env` (`cp .env.example .env`) and run `npm run letter`: the
same graph runs through `rivet-cli` and prints `status`, `pdf_path` and `brief` as JSON.

## How it works

The rule behind the design: **the LLM reads documents and writes prose; code computes every number; nothing
reaches the client unchecked.** The v1 workflow let two chained LLM calls invent the return, the benchmark gap
and the macro forecasts. In v2 an LLM never produces a figure that the client sees. The letter comes with an
**advisor brief** listing everything the advisor should approve before it goes out.

The whole workflow is **one Rivet project, `enter_challenge.rivet-project`**, whose main graph is
**Main Graph: Enter Challenge**. It reads the PDFs, calls the LLM subgraphs, checks each answer, computes returns
and trade sizes, writes and reviews the letter, and saves the XP-branded PDF. An earlier version, with the
deterministic steps in Python, is the first commit of this repository.

Node titles follow *node type: name*, exactly as they appear in the Rivet app.

```
Main Graph: Enter Challenge
  Graph Input: repo_dir ─► Code: Load Inputs      statement and macro PDFs → text rows (pdf.js), config YAML, XP logo
     ├─► Loop Until: Extraction Attempt (max 2)    Subgraph: Extract Portfolio ─► Code: Reconcile Statement (28 checks)
     ├─► Subgraph: Extract Profile                 risk profile → constraints (profile, horizon, rating ≥ BB+ …)
     ├─► Subgraph: Macro Outlook ─► Code: Check Macro Quotes     every quote must be found in the report text
     ├─► Code: Market Data (CVM, BCB, Yahoo)       fund quotas, CDI/IPCA, Ibovespa (saved snapshot when offline)
     ├─► Code: Analyze Portfolio                   returns, allocation vs. profile bands, sized candidates, tax, flags
     ├─► Subgraph: Advise ─► Code: Build FACTS      LLM picks candidate ids; code builds the closed set of figures
     ├─► Loop Until: Letter Attempt (max 3)        Subgraph: Write Letter ─► Code: Fact-check Figures
     │                                             ─► Subgraph: Review Letter ─► Code: Decide Letter Version
     ├─► Code: Render Letter (HTML)                XP letter: two A4 sheets, KPI band, SVG chart, tables, disclaimer
     └─► Code: Publish (PDF, Brief, Log)           PDF via headless Edge/Chrome, page count, status, brief, cost log
```

Graph outputs: `status` (ready for the advisor, or blocked with the reason), `pdf_path` and `brief` (Markdown).
The project also holds **V1 Graph: Original Challenge (unchanged)**, the graph that came with the challenge, with
its nodes untouched, for comparison. It is not part of the run.

## Commands

```bash
npm run letter           # runs the main graph with rivet-cli and prints status, pdf_path and brief as JSON
npm test                 # 8 tests, no API key: runs each Code node the way Rivet's Node executor does
npm run build            # regenerates enter_challenge.rivet-project from src/prompts, src/schemas and src/code
npm run docs             # rebuilds docs/index.html from docs/*.md and the latest letter in Output/
```

`npm run letter` loads `.env` with `node --env-file`, because `rivet-cli` reads `OPENAI_API_KEY` only from the
environment. Set `BROWSER_PATH` if Edge or Chrome is not in its default location, or edit `pdf.browsers` in
`config/settings.yaml`.

## Where things are

`config/`, `data/`, `docs/` and `src/` each have a README (in Portuguese) explaining what the folder holds and
what it is for.

| Path | What |
|---|---|
| `enter_challenge.rivet-project` | The Rivet project: the main graph, two loop bodies, six LLM subgraphs and the original v1 graph |
| `src/build.mjs` | Writes the project from the files below; keeps the graphs it does not generate (the v1 graph) and the node positions arranged in the app |
| `src/code/*.js` | Body of each Code node |
| `src/code/lib/*.js` | Shared functions, pasted in front of each node body at build time |
| `src/code/nodes.mjs` | Title, libraries, inputs, outputs and permissions of each Code node |
| `src/prompts/*.md`, `src/schemas/*.json` | Prompts (English) and strict JSON schemas of the LLM subgraphs |
| `src/tests/` | `node:test` suite; `fixtures/` holds the hand-transcribed statement and the FACTS of the Python version |
| `config/settings.yaml` | Input files, reference period, models, prices per token, thresholds, logo path, PDF browsers |
| `config/allocation_moderate.yaml`, `research_shelf.yaml` | Target bands and products the engine may recommend (illustrative) |
| `config/fund_registry.yaml` | Statement fund name → CNPJ and allocation bucket, verified by hand |
| `data/market/` | CVM daily quotas used for fund returns, and the benchmark snapshot used offline |
| `data/rivet_inputs/` | Defaults of the LLM subgraphs, so each one also runs on its own in the app |
| `data/evidence/` | Real LLM failures that motivated each guard |
| `Input/` | The challenge files, untouched, and the XP logo used in the letter header (`brand.logo`) |
| `Output/` | `carta_*.html` and `.pdf`, `brief_assessor_*.md`, `facts_*.json`, `run_log_*.json`; `output_letter.docx` is the v1 letter |
| `docs/` | Documentation in Portuguese (`0*.md`, the sources of the site), the delivery site `index.html` and the Enter logo of this README (`assets/`) |
| `docs/site/` | Site generator (`npm run docs`), the shared page layout, CSS and browser scripts |
| `index.html`, `.nojekyll` | GitHub Pages entry point: the root page redirects to `docs/`, and `.nojekyll` serves files as they are |

## Guards

1. **Reconciliation.** The extracted statement must add up: invested + cash = net worth, positions = class
   subtotals, quantity × last price = position, allocation % = position / invested. Failed checks go back to the
   LLM once as corrections; a second failure stops the run.
2. **Grounded macro brief.** Each projection, theme and risk carries a quote that must be found in the report
   text (words in order within a short window). Ungrounded items are dropped and listed in the brief.
3. **Closed set of figures.** The writer receives FACTS, with every figure pre-formatted in pt-BR. The fact-check
   rejects any percentage, amount or p.p. value not in FACTS, including roundings like "R$ 40 mil".
4. **Faithfulness review.** Subgraph: Review Letter compares the letter with FACTS and flags added events,
   dropped conditions and flipped forecasts. Findings from 3 and 4 go back to the writer; after three versions an
   unresolved finding blocks the letter.
5. **Sources kept apart.** Projections are attributed to XP; the model's own reading of the report is written as
   the advisor's view ("entendemos que…"), so the letter never puts an inference in XP Research's mouth.
6. **Sensitive sentences are written by code**, such as the note on the matured CDB whose settlement still has
   to be confirmed. **Trade sizes come from rules**; the LLM only selects candidate ids.

## Pitfalls worth knowing

Rivet runs a Code node as an async function whose parameters include `graphInputs` and `context`, so a
`const context` in node code fails with "Identifier 'context' has already been declared". The nodes call their
configuration `setup` for that reason.

Code nodes cannot import modules, so `src/build.mjs` pastes the needed `src/code/lib/` files in front of each node
body. Edit the files and rebuild: code edited inside the app is overwritten by the next `npm run build`.

Rivet 1.25 has no Write File node, and its OpenAI Chat node accepts images but not PDFs, so reading the PDFs and
writing the outputs are Code nodes that load Node modules. Text comes from the pdf.js build bundled in
`pdf-parse`: text items are grouped by height and sorted left to right, so each statement table row stays on one
line, as the extraction prompt expects.

Those nodes must not tick **Allow require**. The desktop app's Node executor runs the CommonJS build of Rivet on
Node 18, where `import.meta` is an empty object, so Rivet calls `createRequire(undefined)` and the node fails with
"The argument 'filename' must be a file URL object, file URL string, or absolute path string. Received undefined"
before any of its code runs. `rivet-cli` loads the ESM build and works, which hides the bug. The nodes use
`projectRequire()` from `src/code/lib/modules.js` instead: a dynamic `import('node:module')` and a
`createRequire` anchored at the project's `package.json`, which work in both executors.

A stricter faithfulness reviewer is not always a better one. Telling it to police sources made it flag
"a XP projeta" and every "deve" as errors, and two runs in four were blocked. The fix went into the writer's
prompt instead, and three runs in three came out ready.

gpt-4.1-mini transcribed the statement perfectly except one subtotal, where it swapped two digits, and repeated
the mistake when shown the failed check (see `data/evidence/`), so extraction uses gpt-4.1.

Fund names on the statement do not match CVM's registry: CVM 175 renamed most funds, and "Brave I FIC FIM CP"
became a FIDC, which has no daily quota, so its return is an estimate prorated from the monthly FIDC report and
flagged as such. The statement's dates also disagree (fund quotes from 04/04/2024, CDB matured 05/09/2024,
statement 07/05/2025, macro report 06/02/2025); the brief lists each inconsistency.
