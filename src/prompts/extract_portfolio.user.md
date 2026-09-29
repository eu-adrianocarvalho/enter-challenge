Transcribe the portfolio statement below into the JSON schema.

## How the statement is laid out
- It is a wide table printed across pages. Pages 1–3 list each position with its market value ("Posição"), allocation ("% Alocação") and return since purchase ("Rentabilidade").
- Pages 4–6 continue the SAME rows with the remaining columns (investment date, average price, last price, quantity, invested amount, net value, quote date, rate, maturity). Rows appear in the same order as on pages 1–3, section by section: stocks, then funds (in their sub-tables), then fixed income. Match rows by order within each section.
- Section subtotals appear as standalone amounts at the top of each continuation section.

## Field rules
1. Numbers are plain JSON numbers: dot as decimal separator, no thousands separator. The statement mixes two formats: "R$386,858.82" (comma = thousands) and "R$ 83.267,36" (dot = thousands). "15,51%" means 15.51. Keep the minus sign of negative returns.
2. Percentages are output as printed (8.91 for "8.91%"), never as fractions.
3. Dates stay exactly as printed, DD/MM/YYYY.
4. asset_class: "stock" for Ações, "fund" for Fundos de Investimentos, "fixed_income" for Renda Fixa. class_totals has one row per section with its subtotal and allocation.
5. Stocks: name and ticker are the ticker symbol; start_date is "Data do investimento"; average_price is "Preço médio"; last_price is "Último preço"; quantity is "Qtd. total".
6. Funds: ticker is null; start_date is "Data do investimento"; invested_amount is "Valor aplicado"; net_value is "Valor líquido"; quote_date is "Data da cota".
7. Fixed income: ticker is null; value is "Posição a mercado"; invested_amount is "Valor aplicado"; start_date is "Data aplicação"; rate is "Taxa a mercado" as printed; maturity_date is "Data vencimento". return_since_start_pct is null when no return is printed.
8. net_worth is the headline amount next to "este é o seu patrimônio"; invested is "Total investido"; cash is "Saldo Disponível". statement_date is the date next to the account number.
9. Output null for anything not printed. Never fill a field by calculation.
10. If CORRECTIONS lists consistency checks that failed on your previous transcription, find the values involved and copy them again, digit by digit, from the statement. Never change a number just to make a check pass.

<statement>
{{statement_text}}
</statement>

<corrections>
{{corrections}}
</corrections>
