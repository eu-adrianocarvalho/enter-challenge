/* Node "Publicar": grava a carta em HTML em Output/, gera o PDF com um navegador headless (Edge ou Chrome,
   ou o caminho em BROWSER_PATH), conta as páginas, define o status (pronta ou bloqueada), escreve o brief
   do assessor, os FACTS e o log de tokens e custo de cada chamada ao LLM. Devolve o caminho do PDF, o
   status e o brief. Precisa do executor Node (require e process). */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const BROWSERS = [
  process.env.BROWSER_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const READY = 'PRONTA PARA REVISÃO DO ASSESSOR';
const BLOCKED = 'BLOQUEADA: resolver os itens que falharam antes de enviar';

const setup = input(inputs, 'context');
const analysis = input(inputs, 'analysis');
const facts = input(inputs, 'facts');
const letter = input(inputs, 'letter');
const statement = statementFromExtraction(analysis.extraction);
const outputDir = path.join(setup.repo, setup.settings.paths.output_dir);
const stem = `${setup.settings.client.id}_${isoDate(statement.statementDate)}`;
const target = (prefix, extension) => path.join(outputDir, `${prefix}_${stem}.${extension}`);
fs.mkdirSync(outputDir, { recursive: true });

const htmlPath = target('carta', 'html');
fs.writeFileSync(htmlPath, input(inputs, 'html'), 'utf8');
const pdfPath = target('carta', 'pdf');
const browser = BROWSERS.find((candidate) => fs.existsSync(candidate));
let pages = null;
if (browser) {
  execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`, `file:///${htmlPath.replace(/\\/g, '/')}`], { stdio: 'ignore', timeout: 120000 });
  pages = (fs.readFileSync(pdfPath).toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
}

const factcheck = input(inputs, 'factcheck');
const review = input(inputs, 'review');
const letterDone = input(inputs, 'letter_done') === 'true';
const status = letterDone && (pages === null || pages <= setup.settings.letter.max_pages) ? READY : BLOCKED;
const pricing = setup.settings.pricing_usd_per_million_tokens;
const single = (graph, model, usage) => ({ graph, model, usage: usage || {} });
const calls = [
  ...JSON.parse(input(inputs, 'extraction_log') || '[]'),
  single('extract_profile', setup.settings.models.extraction, input(inputs, 'profile_usage')),
  single('macro_outlook', setup.settings.models.writing, input(inputs, 'macro_usage')),
  single('advise', setup.settings.models.writing, input(inputs, 'advise_usage')),
  ...JSON.parse(input(inputs, 'letter_log') || '[]'),
];
const runs = calls.map((c) => usageEntry(c.graph, c.model, c.usage, pricing));
const recommendations = input(inputs, 'recommendations');
const files = [htmlPath, browser ? pdfPath : null, target('brief_assessor', 'md'), target('facts', 'json'), target('run_log', 'json')]
  .filter(Boolean).map((f) => path.basename(f));

const brief = renderBrief({
  statement, status, checks: analysis.checks, extractionAttempts: input(inputs, 'extraction_iterations'),
  grounding: input(inputs, 'grounding'), factcheck, reviewIssues: review.majors, letterAttempts: input(inputs, 'letter_iterations'),
  pages, flags: analysis.flags, monthly: analysis.monthly, allocation: analysis.allocation, recommendations: recommendations.list,
  candidates: analysis.candidates, tax: analysis.tax, advisorNotes: recommendations.advisorNotes, macro: input(inputs, 'macro'),
  runs, files,
});
fs.writeFileSync(target('brief_assessor', 'md'), brief, 'utf8');
fs.writeFileSync(target('facts', 'json'), JSON.stringify({ facts, letter }, null, 2), 'utf8');
fs.writeFileSync(target('run_log', 'json'), JSON.stringify(runs, null, 2), 'utf8');

return typed({
  pdf_path: browser ? pdfPath : 'PDF não gerado: nenhum navegador encontrado (defina BROWSER_PATH)',
  status,
  brief,
  pages: pages === null ? 0 : pages,
});
