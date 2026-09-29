/* Gera docs/relatorio.pdf, o relatório curto do desafio (até 2 páginas), a partir de docs/relatorio.md:
   converte o Markdown em HTML com o estilo de docs/site/report.css e imprime em PDF com o mesmo navegador
   headless que gera a carta (BROWSER_PATH ou a lista pdf.browsers do settings.yaml). Sai com erro se
   passar de 2 páginas. Rode depois de editar o relatório: npm run report. */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import YAML from 'yaml';

import { renderMarkdown } from './markdown.mjs';

const SITE = dirname(fileURLToPath(import.meta.url));
const REPO = join(SITE, '..', '..');
const SOURCE = join(REPO, 'docs', 'relatorio.md');
const TARGET = join(REPO, 'docs', 'relatorio.pdf');
const MAX_PAGES = 2;

function browser() {
  const settings = YAML.parse(readFileSync(join(REPO, 'config', 'settings.yaml'), 'utf8'));
  const found = [process.env.BROWSER_PATH, ...settings.pdf.browsers].filter(Boolean).find((candidate) => existsSync(candidate));
  if (!found) throw new Error('Nenhum navegador encontrado para gerar o PDF: defina BROWSER_PATH.');
  return found;
}

function printToPdf(html, target) {
  const staging = join(tmpdir(), `relatorio_${process.pid}.html`);
  writeFileSync(staging, html, 'utf8');
  try {
    execFileSync(browser(), ['--headless=new', '--disable-gpu', '--no-first-run', '--no-pdf-header-footer',
      `--print-to-pdf=${target}`, pathToFileURL(staging).href], { stdio: 'ignore', timeout: 120000 });
  } finally {
    rmSync(staging, { force: true });
  }
}

const css = readFileSync(join(SITE, 'report.css'), 'utf8');
const body = renderMarkdown(readFileSync(SOURCE, 'utf8'));
printToPdf(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`, TARGET);
const pages = (readFileSync(TARGET).toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
console.log(`${TARGET} · ${pages} página(s)`);
if (pages > MAX_PAGES) {
  console.error(`O relatório passou de ${MAX_PAGES} páginas: encurte docs/relatorio.md.`);
  process.exit(1);
}
