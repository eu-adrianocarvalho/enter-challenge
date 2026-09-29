/* Extrai o texto dos PDFs de entrada (extrato e relatório macro) com o pdf.js que vem no pacote pdf-parse.
   Agrupa os pedaços de texto pela altura na página e os ordena da esquerda para a direita, juntando letras
   coladas: assim cada linha de tabela sai numa linha só, como o LLM precisa para transcrever sem erro.
   Recebe o loader de projectRequire() e precisa do executor Node do Rivet. */

function joinRow(items) {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let text = '';
  let end = null;
  for (const item of sorted) {
    const gap = end === null ? 0 : item.x - end;
    text += (end !== null && gap > item.size * 0.18 ? ' ' : '') + item.text;
    end = item.x + item.width;
  }
  return text.replace(/\s+/g, ' ').trim();
}

async function pageRows(page) {
  const content = await page.getTextContent({ normalizeWhitespace: true });
  const rows = [];
  for (const item of content.items) {
    const y = item.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x: item.transform[4], width: item.width, size: Math.hypot(item.transform[0], item.transform[1]) || 10, text: item.str });
  }
  return rows.sort((a, b) => b.y - a.y).map((r) => joinRow(r.items)).filter(Boolean).join('\n');
}

async function pdfToText(load, repo, relativePath) {
  const path = load('path');
  const fs = load('fs');
  const pdfjs = load('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
  pdfjs.disableWorker = true;
  pdfjs.verbosity = 0;
  const doc = await pdfjs.getDocument(new Uint8Array(fs.readFileSync(path.join(repo, relativePath))));
  const pages = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    pages.push(`--- page ${number} ---\n${await pageRows(await doc.getPage(number))}`);
  }
  return pages.join('\n\n');
}
