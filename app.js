'use strict';

const search = document.getElementById('search');
const companyList = document.getElementById('company-list');
const allCompanies = document.getElementById('all-companies');
const companyGroups = document.getElementById('company-groups');
const catalogueTitle = document.getElementById('catalogue-title');
const resultCount = document.getElementById('result-count');
const empty = document.getElementById('empty');
const reset = document.getElementById('reset');

const companies = new Map();
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

function makeReferences(sources) {
  const references = element('div', 'references');
  for (const { label, url } of sources) {
    const link = element('a', '', label);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    references.append(link);
  }
  return references;
}

function makeQuestionContent({ table: exampleTable, tree, text, code }) {
  const content = element('div', 'question-detail-content');
  if (tree) content.append(element('pre', 'tree-example', tree));
  if (exampleTable) {
    const table = element('table', 'example-table');
    table.append(element('caption', '', exampleTable.caption));
    const header = table.createTHead().insertRow();
    for (const title of exampleTable.columns) {
      const cell = element('th', '', title);
      cell.scope = 'col';
      header.append(cell);
    }
    const body = table.createTBody();
    for (const [label, ...values] of exampleTable.rows) {
      const row = body.insertRow();
      const heading = element('th', '', label);
      heading.scope = 'row';
      row.append(heading);
      for (const value of values) row.append(element('td', '', value));
    }
    content.append(table);
  }
  for (const paragraph of text.split('\n\n')) {
    content.append(element('p', '', paragraph));
  }
  if (code) {
    const figure = element('figure', 'answer-code');
    const block = element('pre');
    block.append(element('code', '', code.text));
    figure.append(element('figcaption', '', code.caption), block);
    content.append(figure);
  }
  return content;
}

function makeQuestionList(questions, heading, firstNumber) {
  const list = element('ol', 'questions');
  if (firstNumber !== 1) list.start = firstNumber;
  for (const { question, answer, example, note, sources } of questions) {
    const item = element('li');
    const questionCard = element('details', 'question');
    const prompt = element('summary');
    const title = element(heading);
    const toggle = element('span', 'question-toggle');
    toggle.setAttribute('aria-hidden', 'true');
    title.append(element('span', '', question), toggle);
    prompt.append(title);

    const answerBody = element('div', 'question-answer');
    for (const paragraph of answer.split('\n\n')) answerBody.append(element('p', '', paragraph));
    if (example) answerBody.append(makeQuestionContent(example));
    if (note) {
      const details = element('details', 'question-details');
      details.append(element('summary', '', '项目补充'), makeQuestionContent(note));
      answerBody.append(details);
    }
    if (sources?.length) answerBody.append(makeReferences(sources));
    questionCard.append(prompt, answerBody);
    item.append(questionCard);
    list.append(item);
  }
  return list;
}

function makeRound(round, sections, questionCount) {
  const card = element('details', 'round');
  card.id = round.id;
  const summary = element('summary');
  const tile = element('span', 'round-tile');
  tile.append(icon('note'));
  const copy = element('span', 'round-copy');
  const titleLine = element('span', 'round-title-line');
  titleLine.append(element('span', 'round-title', round.title));
  const keywords = round.keywords ?? round.tags ?? [];
  if (keywords.length) {
    const badges = element('span', 'round-keywords');
    for (const keyword of keywords) badges.append(element('span', 'round-keyword', keyword));
    titleLine.append(badges);
  }
  copy.append(titleLine);

  const meta = element('span', 'round-meta');
  if (round.round && round.round !== round.title) meta.append(element('span', '', round.round));
  if (round.date) {
    const date = element('time', '', round.date);
    date.dateTime = round.date;
    const datePart = element('span');
    datePart.append(date);
    meta.append(datePart);
  }
  if (meta.childElementCount) copy.append(meta);

  const side = element('span', 'round-side');
  const chevron = element('span', 'chevron');
  chevron.setAttribute('aria-hidden', 'true');
  side.append(element('span', 'question-count', questionCount + ' 题'), chevron);
  summary.append(tile, copy, side);

  const body = element('div', 'round-body');
  let firstNumber = 1;
  for (const { title, questions } of sections) {
    if (title) body.append(element('h4', 'question-section-title', title));
    body.append(makeQuestionList(questions, title ? 'h5' : 'h4', firstNumber));
    firstNumber += questions.length;
  }
  if (round.sources?.length) body.append(makeReferences(round.sources));
  card.append(summary, body);
  return card;
}

for (const round of interviewRounds) {
  if (!companies.has(round.company)) companies.set(round.company, { records: [] });
  const sections = round.sections ?? [{ questions: round.questions }];
  const questions = sections.flatMap((section) => section.questions);
  const questionCount = questions.length;
  questionTotal += questionCount;

  const searchableText = normalize([
    round.company,
    round.title,
    round.round,
    round.date,
    ...(round.keywords ?? round.tags ?? []),
    ...sections.map(({ title }) => title),
    ...questions.flatMap(({ question, answer, example, note }) => [question, answer, example?.text, note?.text]),
  ].join(' '));
  const card = makeRound(round, sections, questionCount);
  companies.get(round.company).records.push({ card, searchableText, questionCount });
}

const stats = document.getElementById('stats');
for (const [label, value] of [
  ['公司', companies.size],
  ['面试场次', interviewRounds.length],
  ['题目', questionTotal],
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

  let companyCount = 0;
  let rounds = 0;
  let questions = 0;
  for (const [name, { records, section, heading }] of companies) {
    const companyMatches = !selectedCompany || name === selectedCompany;
    let visibleRounds = 0;
    for (const { card, searchableText, questionCount } of records) {
      const matches = companyMatches && terms.every((term) => searchableText.includes(term));
      card.hidden = !matches;
      if (matches) {
        visibleRounds += 1;
        questions += questionCount;
      }
    }
    heading.hidden = Boolean(selectedCompany);
    section.hidden = !visibleRounds;
    companyCount += Number(visibleRounds > 0);
    rounds += visibleRounds;
  }
  catalogueTitle.textContent = selectedCompany || '全部公司';
  const count = rounds + ' 场面经 · ' + questions + ' 道题';
  resultCount.textContent = selectedCompany ? count : companyCount + ' 家公司 · ' + count;
  empty.hidden = rounds > 0;
}

document.getElementById('nav-total').textContent = companies.size;
allCompanies.addEventListener('click', () => {
  selectedCompany = '';
  updateLibrary();
});
const sortedCompanies = [...companies].sort(([nameA], [nameB]) => nameA.localeCompare(nameB, 'zh-CN'));
for (const [name, company] of sortedCompanies) {
  const button = element('button', 'nav-item');
  button.type = 'button';
  button.value = name;
  button.append(icon('company'), element('span', '', name), element('span', 'nav-count', company.records.length));
  button.addEventListener('click', () => {
    selectedCompany = name;
    updateLibrary();
  });
  companyList.append(button);

  company.section = element('section', 'company-group');
  company.section.setAttribute('aria-label', name);
  company.heading = element('h3', 'company-heading');
  company.heading.append(icon('company'), name);
  const list = element('div', 'round-list');
  list.append(...company.records.map(({ card }) => card));
  company.section.append(company.heading, list);
  companyGroups.append(company.section);
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
  search.value = '';
  search.focus();
  updateLibrary();
});
if (!interviewRounds.length) {
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
