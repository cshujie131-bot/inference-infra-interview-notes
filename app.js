'use strict';

const search = document.getElementById('search');
const companyList = document.getElementById('company-list');
const allCompanies = document.getElementById('all-companies');
const filterList = document.getElementById('filter-list');
const roundList = document.getElementById('round-list');
const catalogueTitle = document.getElementById('catalogue-title');
const resultCount = document.getElementById('result-count');
const empty = document.getElementById('empty');
const reset = document.getElementById('reset');

const tagSet = new Set();
const companies = new Map();
const selectedTags = new Set();
let selectedCompany = '';
let questionTotal = 0;

function element(type, className, content) {
  const node = document.createElement(type);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function icon(name) {
  const node = element('span', 'icon icon-' + name);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function normalize(text) {
  return text.normalize('NFKC').toLowerCase();
}

function makeRound(round) {
  const card = element('details', 'round');
  card.id = round.id;
  let glyph = 'note';
  if (round.tags.includes('投机解码')) {
    glyph = 'flash';
  } else if (round.tags.includes('并行')) {
    glyph = 'stack';
    card.dataset.tone = 'parallel';
  } else if (round.tags.includes('算子')) {
    glyph = 'chip';
    card.dataset.tone = 'kernel';
  } else if (round.tags.includes('请求调度')) {
    glyph = 'bars';
    card.dataset.tone = 'schedule';
  }
  const summary = element('summary');
  const tile = element('span', 'round-tile');
  tile.append(icon(glyph));
  const copy = element('span', 'round-copy');
  const meta = element('span', 'round-meta');
  meta.append(element('span', '', round.company));
  if (round.round && round.round !== round.title) meta.append(element('span', '', round.round));
  if (round.date) {
    const date = element('time', '', round.date);
    date.dateTime = round.date;
    const datePart = element('span');
    datePart.append(date);
    meta.append(datePart);
  }
  copy.append(element('span', 'round-title', round.title), meta);

  const tags = element('span', 'round-tags');
  for (const tag of round.tags) tags.append(element('span', 'round-tag', tag));
  const side = element('span', 'round-side');
  const chevron = element('span', 'chevron');
  chevron.setAttribute('aria-hidden', 'true');
  side.append(element('span', 'question-count', round.questions.length + ' 题'), chevron);
  summary.append(tile, copy, tags, side);

  const body = element('div', 'round-body');
  const list = element('ol', 'questions');
  for (const { question, answer } of round.questions) {
    const item = element('li');
    item.append(element('h3', '', question), element('p', '', answer));
    list.append(item);
  }
  body.append(list);
  if (round.sources?.length) {
    const references = element('div', 'references');
    references.append(element('span', '', '参考资料'));
    for (const { label, url } of round.sources) {
      const link = element('a', '', label);
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      references.append(link);
    }
    body.append(references);
  }
  card.append(summary, body);
  return card;
}

const records = interviewRounds.map((round) => {
  const previous = companies.get(round.company);
  companies.set(round.company, {
    count: (previous?.count ?? 0) + 1,
    example: (previous?.example ?? true) && Boolean(round.example),
  });
  for (const tag of round.tags) tagSet.add(tag);
  questionTotal += round.questions.length;

  const card = makeRound(round);
  roundList.append(card);
  const searchableText = normalize([
    round.company,
    round.title,
    round.round,
    round.date,
    ...round.tags,
    ...round.questions.flatMap(({ question, answer }) => [question, answer]),
  ].join(' '));
  return { round, card, searchableText };
});

const stats = document.getElementById('stats');
for (const [label, value] of [
  ['题目', questionTotal],
  ['面经条目', records.length],
  ['技术标签', tagSet.size],
]) {
  const stat = element('div', 'stat');
  stat.append(element('dt', '', label), element('dd', '', value));
  stats.append(stat);
}

function updateLibrary() {
  const terms = normalize(search.value).trim().split(/\s+/).filter(Boolean);
  allCompanies.setAttribute('aria-pressed', String(!selectedCompany));
  for (const button of companyList.children) {
    button.setAttribute('aria-pressed', String(button.value === selectedCompany));
  }
  for (const button of filterList.children) {
    button.setAttribute('aria-pressed', String(button.value ? selectedTags.has(button.value) : !selectedTags.size));
  }

  let rounds = 0;
  let questions = 0;
  for (const { round, card, searchableText } of records) {
    const matches = (!selectedCompany || round.company === selectedCompany)
      && [...selectedTags].every((tag) => round.tags.includes(tag))
      && terms.every((term) => searchableText.includes(term));
    card.hidden = !matches;
    if (matches) {
      rounds += 1;
      questions += round.questions.length;
    }
  }
  catalogueTitle.textContent = selectedCompany || '全部面经';
  resultCount.textContent = rounds + ' 条面经 · ' + questions + ' 道题';
  empty.hidden = rounds > 0;
}

document.getElementById('nav-total').textContent = records.length;
allCompanies.addEventListener('click', () => {
  selectedCompany = '';
  updateLibrary();
});
const sortedCompanies = [...companies].sort(([nameA, companyA], [nameB, companyB]) => (
  Number(companyA.example) - Number(companyB.example) || nameA.localeCompare(nameB, 'zh-CN')
));
for (const [name, { count }] of sortedCompanies) {
  const button = element('button', 'nav-item');
  button.type = 'button';
  button.value = name;
  button.append(icon('company'), element('span', '', name), element('span', 'nav-count', count));
  button.addEventListener('click', () => {
    selectedCompany = name;
    updateLibrary();
  });
  companyList.append(button);
}

for (const tag of ['', ...tagSet]) {
  const button = element('button', 'filter-button', tag || '全部');
  button.type = 'button';
  button.value = tag;
  button.addEventListener('click', () => {
    if (!tag) selectedTags.clear();
    else if (selectedTags.has(tag)) selectedTags.delete(tag);
    else selectedTags.add(tag);
    updateLibrary();
  });
  filterList.append(button);
}

document.getElementById('search-form').addEventListener('submit', (event) => event.preventDefault());
search.addEventListener('input', updateLibrary);
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
document.getElementById('search-shortcut').textContent = isMac ? '⌘ K' : 'Ctrl K';
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    search.focus();
    search.select();
  }
});
search.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && search.value) {
    event.preventDefault();
    search.value = '';
    updateLibrary();
  }
});
reset.addEventListener('click', () => {
  selectedCompany = '';
  selectedTags.clear();
  search.value = '';
  search.focus();
  updateLibrary();
});
if (!records.length) {
  document.getElementById('empty-title').textContent = '题库还没有题目';
  document.getElementById('empty-message').hidden = true;
  reset.hidden = true;
}
updateLibrary();

const canvas = document.getElementById('hero-art');
const context = canvas.getContext('2d');

function drawHero() {
  const { width, height } = canvas.getBoundingClientRect();
  const density = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * density);
  canvas.height = Math.round(height * density);
  const scale = Math.max(width / 495, height / 245) * density;
  context.setTransform(scale, 0, 0, scale, canvas.width - 495 * scale, (canvas.height - 245 * scale) / 2);

  function path(points, stroke, fill) {
    context.beginPath();
    context.moveTo(...points[0]);
    for (const point of points.slice(1)) context.lineTo(...point);
    if (fill) {
      context.closePath();
      context.fillStyle = fill;
      context.fill();
    }
    if (stroke) {
      context.strokeStyle = stroke;
      context.stroke();
    }
  }

  function dot(x, y, size, color) {
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
  }

  function layer(x, y, w, h, depth, face, left, right, border) {
    const top = [x, y - h];
    const east = [x + w, y];
    const south = [x, y + h];
    const west = [x - w, y];
    const base = [x, y + h + depth];
    path([west, south, base, [x - w, y + depth]], border, left);
    path([south, east, [x + w, y + depth], base], border, right);
    path([top, east, south, west], border, face);
  }

  context.lineWidth = .85;
  for (let row = 13; row < 245; row += 14) {
    for (let col = 24; col < 495; col += 14) {
      dot(col, row, .95, 'rgba(111,77,200,' + Math.max(0, (col - 50) / 2600) + ')');
    }
  }
  const glow = context.createRadialGradient(305, 121, 15, 305, 122, 160);
  glow.addColorStop(0, 'rgba(124,79,236,.22)');
  glow.addColorStop(1, 'rgba(136,91,244,0)');
  context.fillStyle = glow;
  context.fillRect(105, 0, 390, 245);

  const traces = [
    [[319, 132], [393, 79], [432, 79], [464, 57]],
    [[318, 140], [398, 103], [448, 103]],
    [[342, 152], [402, 170], [427, 153], [472, 153]],
    [[318, 168], [377, 199], [415, 199], [447, 214]],
    [[265, 139], [215, 105], [181, 105], [146, 81]],
    [[256, 156], [206, 169], [170, 169]],
    [[288, 174], [253, 201], [212, 201], [187, 219]],
    [[305, 102], [279, 68], [250, 68], [221, 46]],
    [[331, 95], [368, 57], [401, 57], [428, 37]],
  ];
  for (const points of traces) {
    path(points, '#ad96e866');
    dot(...points.at(-1), 3.2, '#a383e6a0');
    dot(...points.at(-1), 1.3, '#eee4ff');
  }

  path([[306, 102], [418, 153], [306, 210], [194, 153], [306, 102]], '#ae93e379');
  layer(306, 145, 79, 40, 12, '#ccb7f7', '#a383e8', '#8965d8', '#ac8ce6');
  layer(306, 126, 73, 37, 12, '#e8dcff', '#ba9df3', '#a181e1', '#bd9fee');
  layer(306, 103, 65, 33, 13, '#8057df', '#7047d3', '#5e36c1', '#976ce9');
  path([[306, 79], [353, 103], [306, 127], [259, 103]], '#c6aefe', '#986ff0');
  path([[306, 90], [331, 103], [306, 116], [281, 103]], '#dac7ff', '#ad8af6');
  path([[306, 94], [323, 103], [306, 112], [289, 103], [306, 94]], '#ebdeff');
  dot(399, 122, 2, '#a383e6');
  dot(229, 63, 2, '#a383e6');
}

if (context) {
  drawHero();
  new ResizeObserver(drawHero).observe(canvas);
}
