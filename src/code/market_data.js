/* Node "Code: Market Data (CVM, BCB, Yahoo)": lê os preços das ações (CSV do desafio), calcula o retorno
   dos fundos a partir das cotas diárias da CVM (data/market/cvm_inf_diario_subset.csv) e busca ao vivo
   CDI e IPCA no Banco Central e o Ibovespa no Yahoo Finance, para o mesmo período da carteira. Sem
   internet, usa o arquivo salvo em data/market/ e registra a origem. Precisa do executor Node (fetch). */

const setup = input(inputs, 'context');
const { settings, repo, registry } = setup;
const load = await projectRequire(repo);
const path = load('path');
const fs = load('fs');
const start = parseIsoDate(settings.period.start);
const end = parseIsoDate(settings.period.end);
const marketDir = path.join(repo, settings.paths.data_dir, 'market');
const snapshot = path.join(marketDir, `benchmarks_${settings.period.start}_${settings.period.end}.json`);

let benchmarks = null;
let benchmarkOrigin = 'ao vivo (BCB e Yahoo Finance)';
try {
  benchmarks = await fetchBenchmarks(fetch, start, end);
} catch (error) {
  benchmarks = fs.existsSync(snapshot) ? JSON.parse(fs.readFileSync(snapshot, 'utf8')) : null;
  benchmarkOrigin = `arquivo salvo em data/market (falha ao buscar ao vivo: ${error.message})`;
}
const cvmCsv = fs.readFileSync(path.join(marketDir, 'cvm_inf_diario_subset.csv'), 'utf8');

return typed({
  market: {
    prices: pricesFromCsv(fs.readFileSync(path.join(repo, settings.research.prices_csv), 'utf8')),
    fundReturns: fundReturnsFromCvm(cvmCsv, registry, settings.period.start, settings.period.end),
    benchmarks,
    benchmarkOrigin,
  },
});
