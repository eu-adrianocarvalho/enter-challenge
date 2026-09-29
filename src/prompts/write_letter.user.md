Write this month's letter from FACTS. Each JSON field is one part of the letter; the layout (header, KPI boxes, chart, recommendation table, signature and disclaimer) is added by code.

## Fields
- subject: one line, at most 12 words, naming the month's result and the main suggestion.
- greeting: exactly "Prezado {first_name}," using client.first_name.
- performance: how the portfolio did in the period. Give the period return and result in reais, compare with CDI and Ibovespa, name the main positive and negative drivers, and add one sentence of longer-term context using the since-start figures. Say which part of the portfolio the monthly figure covers.
- outlook: XP's macro view from FACTS.macro and what it means for this portfolio. Attribute projections, themes and risks to XP ("a XP projeta…"). FACTS.macro.implications are the advisor's own reading of the report, not statements by XP Research: write them as the advisor's view, opened only by "entendemos que…" or "na nossa leitura…", and keep each one's hedges ("pode", "tende a") as they are. Never write "a XP considera", "a XP recomenda", "esperamos" or "prevemos" for them.
- recommendations: present each item of FACTS.recommendations in order, using its rationale and naming the assets, and say the amounts are in the table below; do not repeat the amounts in the text. Frame everything as suggestions to discuss, subject to the client's confirmation. Operational notes (for example about a matured bond) are printed under the table by code, so do not write about them.
- closing: one or two sentences offering a conversation, with no new information.

## Rules
1. Figures: use only figures that appear in FACTS, copied character by character ("+3,30%", "R$ 40.000,00", "15,50%"). Never round, recompute, convert ("R$ 40 mil") or combine figures. If an idea needs a number that is not in FACTS, express it without a number. When a word already carries the direction ("queda de", "alta de"), drop the figure's sign ("queda de 16,38%").
2. Keep "no período" (the monthly window) and "desde a aplicação" (since purchase) clearly separate; never present a since-start figure as monthly. Refer to the window as FACTS.period.label, never by a month name, because it does not match a calendar month.
3. Do not state any action, event or data that is not in FACTS. No guarantees or promises of return.
4. When you paraphrase FACTS.macro, keep the direction and the conditions of each statement exactly: a rate that may "stop rising" must not become a rate that "falls", and a risk must not become a forecast.
5. Plain paragraphs only: no bullet points, headings or markdown. Use transitions between parts (for example "Nesse contexto…", "Diante desse cenário…").
6. The text across all fields must not exceed {{word_budget}} words. Suggested split: performance 35%, outlook 30%, recommendations 30%, closing 5%.
7. If CORRECTIONS is not empty, the previous draft broke these rules; fix every item listed.

<facts>
{{facts_json}}
</facts>

<corrections>
{{corrections}}
</corrections>
