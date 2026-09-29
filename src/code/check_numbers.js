/* Node "Code: Fact-check Figures" (dentro do loop Letter Attempt): confere se todo percentual, valor em R$ e
   p.p. da carta existe nos FACTS, se a saudação usa o nome do cliente e se não há listas nem palavras
   duplicadas. Devolve o resultado e a carta em JSON para o Subgraph: Review Letter. */

const letter = input(inputs, 'letter');
const facts = JSON.parse(input(inputs, 'facts_json'));

return typed({
  factcheck: checkLetter(letter, facts, facts.client.first_name),
  letter_json: JSON.stringify(letter, null, 2),
});
