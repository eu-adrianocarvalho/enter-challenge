Read the risk-profile statement below and fill the JSON schema.

Rules:
- profile, horizon and volatility_tolerance must reflect what the statement says, not a generic reading of the label.
- eligible_products lists every product family the statement calls compatible, with its stated requirement in Portuguese (for example a minimum credit rating or a dividend track record).
- min_credit_rating is the minimum rating the statement requires for fixed income, exactly as written, or null if none is stated.
- guidance_pt lists the behavioural guidance the statement gives (diversification, periodic review, avoiding abrupt moves), one short Portuguese sentence each.
- summary_pt is one paragraph in Portuguese, at most 60 words, in the voice of a private-banking advisor.
- Write every *_pt field in Brazilian Portuguese. Do not add requirements that the statement does not contain.

<risk_profile>
{{profile_text}}
</risk_profile>
