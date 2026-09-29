/* Formatação no padrão brasileiro: reais (R$ 1.234,56), percentuais (+3,30%), pontos percentuais
   (+1,51 p.p.) e datas (07/05/2025, 7 de maio de 2025). Todo número mostrado ao cliente passa por
   aqui; o fact-check compara a carta com essas mesmas strings, por isso cada número tem um único formato.
   Arquivo incluído no início dos nodes de código do Rivet que precisam formatar valores. */

const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.sign(value) * Math.round(Math.abs(value) * factor + 1e-9) / factor;
}

function groupThousands(value, decimals) {
  const [integer, fraction] = Math.abs(value).toFixed(decimals).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return fraction ? `${grouped},${fraction}` : grouped;
}

function signOf(value, signed) {
  if (value < 0) return '-';
  return signed && value > 0 ? '+' : '';
}

function brl(value, signed = false) {
  const rounded = roundTo(value, 2);
  return `${signOf(rounded, signed)}R$ ${groupThousands(rounded, 2)}`;
}

function pct(value, decimals = 2, signed = false) {
  const rounded = roundTo(value, decimals);
  return `${signOf(rounded, signed)}${groupThousands(rounded, decimals)}%`;
}

function pp(value, decimals = 2) {
  const rounded = roundTo(value, decimals);
  return `${signOf(rounded, true)}${groupThousands(rounded, decimals)} p.p.`;
}

function parseBrDate(text) {
  if (!text) return null;
  const [day, month, year] = String(text).trim().split('/').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function parseIsoDate(text) {
  const [year, month, day] = String(text).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function dateBr(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

function longDatePt(date) {
  return `${date.getUTCDate()} de ${MONTHS_PT[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}

function monthYearPt(date) {
  return `${MONTHS_PT[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}

function daysBetween(later, earlier) {
  return Math.round((later - earlier) / 86400000);
}
