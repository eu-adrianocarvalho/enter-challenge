Select and explain the recommendations for this client.

## Rules
1. Build 2 or 3 recommendations. Each one bundles one or more candidate ids that share a purpose (for example, the fixed-income legs of a reinvestment, or a sale together with the purchase it funds). Use only ids from CANDIDATES.
2. Order them by priority (1 = most important). Moves that put idle money to work or fix a mismatch with the profile come first.
3. rationale_pt: Brazilian Portuguese, at most 45 words, explaining why the move fits the client's profile and the current scenario. Mention assets by name. Do not write amounts or percentages; the letter shows them in a table.
4. macro_evidence_ids: the ids from MACRO_BRIEF (P…, T…, R…, I…) that support the rationale. Every recommendation cites at least one.
5. title_pt: at most 8 words, in Portuguese.
6. advisor_notes_pt: short notes for the advisor only (for example, candidates you left out and why, or what to confirm with the client). Up to 4 notes.

<client_profile>
{{profile_json}}
</client_profile>

<current_allocation>
{{allocation_json}}
</current_allocation>

<candidates>
{{candidates_json}}
</candidates>

<macro_brief>
{{macro_json}}
</macro_brief>
