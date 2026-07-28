/* 화면 로직. 사용자에게 보이는 문장은 여기서 짓지 않고 copy.js에서 가져다 쓴다.
   (예외는 작품명·작가명처럼 data.js의 고유명사뿐이다.) */

import { COPY, bandFor } from './copy.js';
import { buildRound } from './data.js';

const $ = (sel) => document.querySelector(sel);
const screens = {
  start: $('#screen-start'),
  quiz: $('#screen-quiz'),
  result: $('#screen-result'),
};

/* ── 문구 주입 ────────────────────────────────────────────────
   data-copy="a.b"는 텍스트로, data-copy-html은 <br> 같은 태그를 살려서 넣는다.
   html 쪽은 copy.js에 우리가 쓴 문장만 들어가므로 외부 입력이 섞이지 않는다. */
function get(path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), COPY);
}

function applyCopy(root = document) {
  root.querySelectorAll('[data-copy]').forEach((el) => {
    const value = get(el.dataset.copy);
    if (typeof value === 'string') el.textContent = value;
  });
  root.querySelectorAll('[data-copy-html]').forEach((el) => {
    const value = get(el.dataset.copyHtml);
    if (typeof value === 'string') el.innerHTML = value;
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

/* ── 한 판의 상태 ────────────────────────────────────────────── */
let round = [];
let index = 0;
let answers = []; // { question, picked, correct }

function startRound() {
  round = buildRound();
  index = 0;
  answers = [];
  show('quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = round[index];

  $('#progress-text').textContent = COPY.quiz.progress(index + 1, round.length);
  $('#progress-bar').style.width = `${(index / round.length) * 100}%`;

  $('#quiz-line').textContent = `“${q.line}”`;

  const box = $('#choices');
  box.replaceChildren();
  q.choices.forEach((choice) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    btn.textContent = choice;
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
  $('#choices').querySelectorAll('button').forEach((btn) => {
    btn.disabled = true;
    if (btn.textContent === q.work) btn.classList.add('choice-correct');
    else if (btn.textContent === picked) btn.classList.add('choice-wrong');
    else btn.classList.add('choice-muted');
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
  const band = bandFor(s);

  $('#result-heading').textContent = COPY.result.heading(s, round.length);
  $('#result-label').textContent = band.label;
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
      line.textContent = `“${q.line}”`;
      const meta = document.createElement('div');
      meta.className = 'mt-xs text-body-sm font-semibold text-primary';
      meta.textContent = `${q.work} · ${q.author}`;
      li.append(line, meta);
      list.append(li);
    });
  }

  history.replaceState(null, '', `/result/${s}`);
  show('result');
  $('#result-label').focus({ preventScroll: true });
}

let shareResetTimer;

async function share() {
  const s = score();
  const text = COPY.result.shareText(s, round.length, bandFor(s).label);
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

/* ── 시작 ────────────────────────────────────────────────────── */
applyCopy();

$('#btn-start').addEventListener('click', startRound);
$('#btn-next').addEventListener('click', next);
$('#btn-share').addEventListener('click', share);
$('#btn-replay').addEventListener('click', () => {
  history.replaceState(null, '', '/');
  startRound();
});

// /result/7 같은 주소로 들어와도 남의 결과를 보여주지 않는다 — 본인이 풀어야 결과가 나온다.
if (location.pathname.startsWith('/result')) history.replaceState(null, '', '/');

show('start');
