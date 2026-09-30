/* Navegação do site: mostra um tópico por vez (Apresentação, O trabalho, Uso, Arquivos), expande na barra
   lateral só o tópico aberto e destaca a seção visível (scrollspy). Também alterna tema claro e escuro,
   filtra o catálogo de arquivos, carrega as prévias só quando abertas e ajusta a carta em HTML à largura. */

const pages = [...document.querySelectorAll('.page')];
const topics = [...document.querySelectorAll('.nav-topic')];
const LETTER_WIDTH = 840;

function pageOf(id) {
  const element = id && document.getElementById(id);
  if (!element) return null;
  return element.classList.contains('page') ? element : element.closest('.page');
}

function spy() {
  const page = pages.find((p) => !p.hidden);
  if (!page) return;
  const sections = [...page.querySelectorAll('[data-spy]')];
  let current = sections[0];
  sections.forEach((s) => { if (s.getBoundingClientRect().top <= 160) current = s; });
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = sections[sections.length - 1];
  document.querySelectorAll('.subnav a').forEach((a) => a.classList.toggle('active', !!current && a.dataset.target === current.id));
}

function fitLetters() {
  document.querySelectorAll('.letter-frame').forEach((box) => {
    const frame = box.querySelector('iframe');
    const scale = Math.min(1, box.clientWidth / LETTER_WIDTH);
    if (!scale) return;
    frame.style.transform = `scale(${scale})`;
    box.style.height = `${frame.offsetHeight * scale}px`;
  });
}

function show(id, scroll) {
  const page = pageOf(id) || pages[0];
  pages.forEach((p) => { p.hidden = p !== page; });
  topics.forEach((t) => t.classList.toggle('open', t.dataset.page === page.id));
  if (window.renderMermaidIn) window.renderMermaidIn(page);
  fitLetters();
  const target = document.getElementById(id);
  if (scroll && target && target !== page) target.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, 0);
  spy();
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const id = link.getAttribute('href').slice(1);
  if (!document.getElementById(id)) return;
  event.preventDefault();
  history.replaceState(null, '', `#${id}`);
  show(id, true);
});
window.addEventListener('scroll', spy, { passive: true });
window.addEventListener('resize', fitLetters);
window.addEventListener('hashchange', () => show(location.hash.slice(1), true));
show(location.hash.slice(1), !!location.hash);
window.addEventListener('load', () => requestAnimationFrame(() => show(location.hash.slice(1), !!location.hash)));

document.querySelectorAll('details.file').forEach((d) => d.addEventListener('toggle', () => {
  const frame = d.querySelector('iframe[data-src]');
  if (d.open && frame && !frame.src) frame.src = frame.dataset.src;
}));

const filter = document.getElementById('file-filter');
if (filter) {
  filter.addEventListener('input', () => {
    const query = filter.value.toLowerCase();
    document.querySelectorAll('details.file').forEach((d) => { d.style.display = d.textContent.toLowerCase().includes(query) ? '' : 'none'; });
  });
}

function savedTheme() {
  try {
    return localStorage.getItem('theme');
  } catch {
    return null;
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem('theme', theme);
    return true;
  } catch {
    return false;
  }
}

const root = document.documentElement;
if (savedTheme()) root.dataset.theme = savedTheme();
document.getElementById('theme').addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  if (saveTheme(root.dataset.theme)) location.reload();
});
