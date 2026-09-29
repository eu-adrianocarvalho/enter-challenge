/* Ponte entre o código e o Rivet: lê o valor de uma porta de entrada e empacota as saídas no formato
   tipado que o Rivet espera ({ type, value }). Objetos trafegam entre nodes só como JSON simples
   (datas em texto ISO), para não perder nada ao passar por subgrafos e loops. */

function input(inputs, name) {
  const port = inputs[name];
  return port === undefined || port === null ? undefined : port.value;
}

function typed(outputs) {
  return Object.fromEntries(Object.entries(outputs).map(([name, value]) => {
    if (typeof value === 'string') return [name, { type: 'string', value }];
    if (typeof value === 'number') return [name, { type: 'number', value }];
    if (typeof value === 'boolean') return [name, { type: 'boolean', value }];
    return [name, { type: 'object', value: JSON.parse(JSON.stringify(value)) }];
  }));
}

function usageEntry(graph, model, usage, pricing) {
  const prompt = (usage && usage.prompt_tokens) || 0;
  const completion = (usage && usage.completion_tokens) || 0;
  const prices = pricing[model];
  const cost = prices ? (prompt * prices.input + completion * prices.output) / 1e6 : 0;
  return { graph, model, prompt_tokens: prompt, completion_tokens: completion, cost_usd: cost };
}
