/* 화면 로직. 사용자에게 보이는 문장은 여기서 짓지 않고 copy.js에서 가져다 쓴다.
   (예외는 작품명·작가명처럼 data.js의 고유명사뿐이다.) */

import { COPY, bandFor } from './copy.js';
import { ROUND_SIZE, buildRound } from './data.js';

const $ = (sel) => document.querySelector(sel);

/* 대사를 따옴표로 감싼다. 닫는 따옴표 앞에 word joiner(U+2060)를 넣는 이유는,
   break-keep이 한국어 단어는 붙여줘도 문장부호까지는 못 붙잡아서
   마지막 글자와 ”가 갈라져 따옴표만 다음 줄에 혼자 남는 일이 생기기 때문이다. */
const quote = (line) => `“${line}⁠”`;
const screens = {
  start: $('#screen-start'),
  quiz: $('#screen-quiz'),
  result: $('#screen-result'),
};

/* 첫 유입의 UTM은 주소가 /quiz와 /result/*로 바뀌기 전에 세션에 고정한다.
   같은 탭에서 퀴즈를 다시 풀어도 최초 유입 채널이 중간 경로로 덮이지 않아야 한다. */
const INBOUND_UTM_KEY = 'lineQuizInboundUtm';

function readInboundUtm() {
  const current = {};
  new URLSearchParams(location.search).forEach((value, key) => {
    if (key.startsWith('utm_')) current[key] = value;
  });

  try {
    const saved = sessionStorage.getItem(INBOUND_UTM_KEY);
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    }
    sessionStorage.setItem(INBOUND_UTM_KEY, JSON.stringify(current));
  } catch { /* 저장소가 막혀도 현재 주소의 UTM으로 계속 진행한다 */ }

  return current;
}

const inboundUtm = readInboundUtm();
const upstream = (
  typeof inboundUtm.utm_source === 'string' && inboundUtm.utm_source.trim()
) || 'direct';

/* ── 문구 주입 ────────────────────────────────────────────────
   data-copy="a.b" 자리에 copy.js의 문장을 텍스트로 넣는다.
   태그를 살려 넣는 경로(innerHTML)는 두지 않는다 — 줄바꿈은 마크업에서 처리하고,
   문자열을 HTML로 해석하는 자리를 아예 만들지 않는 편이 안전하다. */
function get(path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), COPY);
}

function applyCopy(root = document) {
  root.querySelectorAll('[data-copy]').forEach((el) => {
    const value = get(el.dataset.copy);
    if (typeof value === 'string') el.textContent = value;
  });
  root.querySelectorAll('[data-copy-aria-label]').forEach((el) => {
    const value = get(el.dataset.copyAriaLabel);
    if (typeof value === 'string') el.setAttribute('aria-label', value);
  });
}

/* 동작을 줄여달라고 설정한 사람에게는 부드러운 스크롤도 동작이다.
   CSS의 prefers-reduced-motion은 JS가 만드는 스크롤까지 막아주지 않으므로 여기서 직접 본다. */
const motionOK = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function show(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

/* 보기 한 칸. 번호 원 + 작품명 + (정답일 때만 보이는) 체크로 이뤄진다.
   체크를 두는 이유는 장식이 아니라, 초록색만으로 정답을 알리면
   색을 구분하지 못하는 사람에게는 아무 표시도 없는 화면이 되기 때문이다. */
function choiceButton(label, order) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'choice';

  const num = document.createElement('span');
  num.className = 'choice-num';
  num.setAttribute('aria-hidden', 'true');
  num.textContent = String(order);

  const text = document.createElement('span');
  text.className = 'choice-label';
  text.textContent = label;

  const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  check.setAttribute('class', 'choice-check');
  check.setAttribute('viewBox', '0 0 24 24');
  check.setAttribute('fill', 'none');
  check.setAttribute('stroke', 'currentColor');
  check.setAttribute('stroke-width', '2.5');
  check.setAttribute('stroke-linecap', 'round');
  check.setAttribute('stroke-linejoin', 'round');
  check.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M20 6 9 17l-5-5');
  check.append(path);

  btn.append(num, text, check);
  return btn;
}

/* 시작 화면의 미리보기. 실제로 눌리는 물건이 아니라 "이런 문제가 나온다"는 그림이라
   버튼이 아닌 칸으로 만들고 스크린리더에서도 빼둔다(마크업에서 aria-hidden). */
function renderPreview() {
  const box = $('#preview-choices');
  if (!box) return;
  box.replaceChildren();
  COPY.start.previewChoices.forEach((label) => {
    const cell = document.createElement('div');
    cell.className = 'rounded-md bg-neutral px-md py-[12px] text-body-md text-ink-sub';
    cell.textContent = label;
    box.append(cell);
  });
}

/* ── 한 판의 상태 ────────────────────────────────────────────── */
let round = [];
let index = 0;
let answers = []; // { question, picked, correct }
let selectedRoundSize = ROUND_SIZE;

function startRound() {
  trackEvent('quiz_start');
  trackEvent(`size_${selectedRoundSize}_start`);
  round = buildRound(selectedRoundSize);
  index = 0;
  answers = [];
  history.pushState({ screen: 'quiz' }, '', '/quiz');
  show('quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = round[index];

  $('#progress-text').textContent = COPY.quiz.progress(index + 1, round.length);
  $('#progress-bar').style.width = `${(index / round.length) * 100}%`;

  $('#quiz-line').textContent = quote(q.line);

  const box = $('#choices');
  box.replaceChildren();
  q.choices.forEach((choice, i) => {
    const btn = choiceButton(choice, i + 1);
    btn.addEventListener('click', () => answer(choice), { once: true });
    box.append(btn);
  });

  $('#feedback').hidden = true;

  // 방금 누른 '다음 문제' 버튼이 숨겨지므로 포커스를 새 대사로 옮긴다.
  // 안 옮기면 포커스가 문서 맨 위로 떨어져, 키보드 사용자는 매 문제마다 처음부터 탭해야 하고
  // 화면을 못 보는 사람은 새 대사가 나온 줄 모른다. 첫 문제는 이미 위에서 시작하므로 건너뛴다.
  if (index > 0) $('#quiz-line').focus({ preventScroll: true });
}

function answer(picked) {
  const q = round[index];
  const correct = picked === q.work;
  answers.push({ question: q, picked, correct });

  // 고른 뒤에는 보기를 잠근다. 정답은 항상 표시하고, 틀린 경우 고른 것도 같이 표시한다.
  // 버튼 안에 번호 원까지 들어 있으므로 작품명은 라벨 칸에서 읽는다 —
  // 버튼 전체의 textContent를 쓰면 "1맥베스"가 되어 어떤 것도 정답과 같지 않게 된다.
  $('#choices').querySelectorAll('button').forEach((btn) => {
    btn.disabled = true;
    const label = btn.querySelector('.choice-label').textContent;
    if (label === q.work) {
      btn.classList.add('choice-correct');
      btn.setAttribute('aria-label', COPY.quiz.markCorrect(label));
    } else if (label === picked) {
      btn.classList.add('choice-wrong');
      btn.setAttribute('aria-label', COPY.quiz.markPicked(label));
    } else {
      btn.classList.add('choice-muted');
    }
  });

  // 채우기 전에 먼저 연다. aria-live 영역은 "이미 살아 있는 동안 내용이 바뀔 때" 읽히므로,
  // 다 채운 뒤에 hidden을 푸는 순서면 정답 여부가 낭독에서 통째로 빠진다.
  // (한 번의 실행 안에서는 화면이 다시 그려지지 않아 빈 칸이 깜빡이지 않는다.)
  const feedback = $('#feedback');
  feedback.hidden = false;

  const verdict = $('#verdict');
  verdict.textContent = correct ? COPY.quiz.correct : COPY.quiz.wrong;
  verdict.className = correct ? 'text-subtitle font-bold text-success' : 'text-subtitle font-bold text-ink';

  $('#answer-work').textContent = q.work;
  $('#answer-meta').textContent = `· ${q.author} · ${q.speaker}`;
  $('#answer-context').textContent = q.context;
  $('#answer-ask').textContent = q.ask;

  const last = index === round.length - 1;
  $('#btn-next').textContent = last ? COPY.quiz.last : COPY.quiz.next;

  $('#progress-bar').style.width = `${((index + 1) / round.length) * 100}%`;

  // 포커스는 펼쳐진 영역의 맨 위로 보낸다. 아래쪽 '다음 문제' 버튼에 바로 주면
  // 해설이 길 때 포커스 링이 화면 밖에 생겨 어디에 있는지 알 수 없다.
  feedback.focus({ preventScroll: true });
  feedback.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'auto', block: 'nearest' });
  if (last) {
    trackEvent('quiz_complete');
    trackEvent(`size_${round.length}_complete`);
  }
}

function next() {
  if (index === round.length - 1) {
    renderResult();
    return;
  }
  index += 1;
  renderQuestion();
}

/* ── 결과 ────────────────────────────────────────────────────── */
function score() {
  return answers.filter((a) => a.correct).length;
}

function renderResult() {
  const s = score();
  const band = bandFor(s, round.length);

  $('#result-total').textContent = COPY.result.total(round.length);
  $('#result-score').textContent = String(s);
  $('#result-label').textContent = band.label;
  // 포커스는 이름표로 가는데, 점수는 그 앞의 다른 요소라 낭독에서 빠진다.
  // 이름표에 점수까지 담은 이름을 붙여서 결과가 한 번에 들리게 한다.
  $('#result-label').setAttribute('aria-label', `${COPY.result.heading(s, round.length)}, ${band.label}`);
  $('#result-line').textContent = band.line;

  const missed = answers.filter((a) => !a.correct);
  const list = $('#missed-list');
  list.replaceChildren();

  if (missed.length === 0) {
    const li = document.createElement('li');
    li.className = 'text-body-md text-ink-sub';
    li.textContent = COPY.result.missedEmpty;
    list.append(li);
  } else {
    missed.forEach(({ question: q }) => {
      const li = document.createElement('li');
      li.className = 'border-l-2 border-line pl-md';
      const line = document.createElement('div');
      line.className = 'text-body-md break-keep';
      line.textContent = quote(q.line);
      const meta = document.createElement('div');
      meta.className = 'mt-xs text-body-sm font-semibold text-primary';
      meta.textContent = `${q.work} · ${q.author}`;
      li.append(line, meta);
      list.append(li);
    });
  }

  history.pushState({ screen: 'result' }, '', `/result/${s}`);
  show('result');
  $('#result-label').focus({ preventScroll: true });
  // popstate 복원은 renderResult()를 다시 부르지 않고 기존 화면만 여므로,
  // 새로 완주해 결과를 만든 경우에만 퍼널 분모를 남긴다.
  trackEvent('result_view');
  trackEvent(band.event);
}

let shareResetTimer;

async function share() {
  trackEvent('share_click');
  const s = score();
  const text = COPY.result.shareText(s, round.length, bandFor(s, round.length).label);
  const url = `${location.origin}/`;

  if (navigator.share) {
    try {
      await navigator.share({ title: COPY.start.title, text, url });
      return;
    } catch (err) {
      // 사용자가 공유 시트를 닫은 경우다. 실패로 다루지 않고 조용히 복사로 넘어간다.
      if (err && err.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    const btn = $('#btn-share');
    // 원래 문구를 그때그때 읽어두면, 연타했을 때 두 번째 호출이 "복사했어요"를 원문으로 기억해
    // 버튼이 그 문구로 굳는다. 정본에서 가져오고 타이머는 하나만 돌린다.
    clearTimeout(shareResetTimer);
    btn.textContent = COPY.result.shareCopied;
    shareResetTimer = setTimeout(() => { btn.textContent = COPY.result.shareButton; }, 1600);
  } catch {
    // 클립보드도 막힌 브라우저(인앱 등)가 있다. 아무 일도 일어나지 않은 것처럼 두지 않는다.
    window.prompt(COPY.result.shareButton, `${text}\n${url}`);
  }
}

/* 코어(acttub.com)로 나가는 클릭을 구글 시트에 남긴다.
   acttub.com은 소스 저장소가 특정되지 않아 우리가 계측을 못 붙인다. 여기서 세지 않으면
   "이 퀴즈를 풀고 코어로 넘어간 사람"이 어디에도 안 남는다. 시트는 link.acttub.com/go 가
   쓰는 것과 같은 곳이라 채널이 한 표에 모인다.
   리다이렉트를 끼우지 않는 이유: 중간에 페이지를 한 장 태우면 그만큼 사람이 샌다. */
const CORE_TRACK = 'https://script.google.com/macros/s/AKfycbxmvQWyu-kslgIbVshJolG2KXV_omgT_vcUpmwJljvvYE8MkwUug-WGEhZmWUdU2ErK/exec';

function sendToSheet(payload) {
  if (!/(^|\.)acttub\.com$/.test(location.hostname)) return;
  try {
    const body = JSON.stringify(payload);
    const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
    if (!(navigator.sendBeacon && navigator.sendBeacon(CORE_TRACK, blob))) {
      fetch(CORE_TRACK, { method: 'POST', mode: 'no-cors', keepalive: true, body }).catch(() => {});
    }
  } catch { /* 기록이 실패해도 사람의 흐름은 계속되어야 한다 */ }
}

function trackEvent(name) {
  if (!/(^|\.)acttub\.com$/.test(location.hostname)) return;
  sendToSheet({ type: 'event', app: 'line-quiz', name, at: new Date().toISOString() });
}

function trackCore(from, href) {
  // 로컬·프리뷰에서 눌러본 것이 실서비스 기록에 섞이면 그때부터 숫자를 못 믿는다.
  if (!/(^|\.)acttub\.com$/.test(location.hostname)) return;
  try {
    const upstream = new URL(href).searchParams.get('utm_term') || 'direct';
    const q = href.indexOf('?');
    const body = JSON.stringify({
      type: 'click',
      at: new Date().toISOString(),
      from,
      upstream,
      src: q < 0 ? '' : href.slice(q),
      ref: location.origin,
      click_id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    });
    // 곧 페이지를 떠나므로 beacon을 쓴다. 평범한 fetch는 이동하는 순간 취소돼 절반쯤 사라진다.
    // text/plain 이어야 preflight 없이 Apps Script가 받는다.
    // beacon이 false를 내면 "큐에 못 넣었다"는 뜻이라 keepalive fetch로 한 번 더 시도한다.
    const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
    if (!(navigator.sendBeacon && navigator.sendBeacon(CORE_TRACK, blob))) {
      fetch(CORE_TRACK, { method: 'POST', mode: 'no-cors', keepalive: true, body }).catch(() => {});
    }
    // 시트와 나란히 GA로도 보낸다. 시트는 클릭 수를 세고, GA는 도착 이후까지 세션으로 잇는다.
    // ⚠️ 잇는 건 acttub.com에도 같은 GA가 붙은 뒤부터다 — 2026-07-29 현재 코어는 미계측이라
    // 지금 이 이벤트는 "여기서 눌렀다"까지만 남는다(팀에 계측 요청 대기 중).
    // gtag는 프로덕션 호스트에서만 정의된다(index.html의 가드).
    if (window.gtag) window.gtag('event', 'acttub_cta', { from });
  } catch { /* 기록이 실패해도 사람은 도착해야 한다 */ }
}

/* ── 시작 ────────────────────────────────────────────────────── */
applyCopy();
renderPreview();

const roundSizeButtons = [...document.querySelectorAll('[data-round-size]')];

function selectRoundSize(size, moveFocus = false) {
  selectedRoundSize = size;
  roundSizeButtons.forEach((button) => {
    const selected = Number(button.dataset.roundSize) === size;
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && moveFocus) button.focus();
  });
}

roundSizeButtons.forEach((button) => {
  button.addEventListener('click', () => selectRoundSize(Number(button.dataset.roundSize)));
});

$('#round-size-group').addEventListener('keydown', (event) => {
  const current = roundSizeButtons.indexOf(event.target);
  if (current < 0) return;

  let next = current;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + roundSizeButtons.length) % roundSizeButtons.length;
  else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % roundSizeButtons.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = roundSizeButtons.length - 1;
  else return;

  event.preventDefault();
  selectRoundSize(Number(roundSizeButtons[next].dataset.roundSize), true);
});

selectRoundSize(selectedRoundSize);

const coreButton = $('#btn-core');
const coreUrl = new URL(coreButton.href);
coreUrl.searchParams.set('utm_term', upstream);
coreButton.href = coreUrl.href;

$('#btn-start').addEventListener('click', startRound);
$('#btn-next').addEventListener('click', next);
$('#btn-share').addEventListener('click', share);
coreButton.addEventListener('click', (e) => trackCore('stage', e.currentTarget.href));
$('#btn-replay').addEventListener('click', () => {
  trackEvent('replay');
  history.replaceState(null, '', '/');
  startRound();
});
coreButton.addEventListener('click', () => trackEvent('cta_click'));

// /result/7 같은 주소로 들어와도 남의 결과를 보여주지 않는다 — 본인이 풀어야 결과가 나온다.
if (location.pathname.startsWith('/result')) history.replaceState(null, '', '/');

window.addEventListener('popstate', (event) => {
  if (event.state?.screen === 'result' && round.length > 0 && answers.length === round.length) {
    show('result');
  } else if (event.state?.screen === 'quiz' && round.length > 0) {
    show('quiz');
  } else {
    show('start');
  }
});

trackEvent('landing_view');
show('start');
