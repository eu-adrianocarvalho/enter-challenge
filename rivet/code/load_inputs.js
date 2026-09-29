/* Node "Ler entradas": lê config/settings.yaml e os arquivos do cliente, extrai o texto dos PDFs (extrato e
   relatório macro), carrega faixas do perfil, prateleira de produtos, registro de fundos e o logo da XP.
   Entrada: repo_dir (pasta do projeto; vazio usa a pasta atual). Saídas: os textos para os grafos de LLM,
   o contexto com a configuração, os modelos e os valores iniciais dos loops. Precisa do executor Node. */

const path = require('path');
const fs = require('fs');
const repo = input(inputs, 'repo_dir') || process.cwd();
const readText = (relative) => fs.readFileSync(path.join(repo, relative), 'utf8');
const YAML = require(path.join(repo, 'node_modules', 'yaml'));
const config = (name) => YAML.parse(readText(`config/${name}.yaml`));
const settings = config('settings');
const logoPath = path.join(repo, settings.brand.logo);
const logoType = logoPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

return typed({
  statement_text: await pdfToText(require, repo, settings.client.portfolio_pdf),
  profile_text: readText(settings.client.risk_profile_txt),
  report_text: await pdfToText(require, repo, settings.research.macro_pdf),
  context: {
    repo,
    settings,
    bands: { moderado: config('allocation_moderate') },
    shelf: config('research_shelf'),
    registry: config('fund_registry').funds,
    logo: `data:${logoType};base64,${fs.readFileSync(logoPath).toString('base64')}`,
  },
  model_extraction: settings.models.extraction,
  model_writing: settings.models.writing,
  word_budget: String(settings.letter.word_budget),
  no_corrections: '(none)',
  empty_log: '[]',
});
