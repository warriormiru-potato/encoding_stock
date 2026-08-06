/* ==============================
   GAME LOGIC — packaging_simulator (HARD MODE)
   반도체 불량품 검사 시뮬레이터
   ============================== */

// ── Particle background ──────────────────────────────────
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

function spawnParticle() {
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    r: Math.random() * 1.5 + 0.3,
    alpha: Math.random() * 0.4 + 0.1,
    color: Math.random() < 0.5 ? '0,200,255' : '0,255,200',
  };
}
for (let i = 0; i < 80; i++) particles.push(spawnParticle());

function drawParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${p.color},${p.alpha})`;
    ctx.fill();
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
      Object.assign(p, spawnParticle());
    }
  });
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 100) {
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = `rgba(0,200,255,${0.06 * (1 - dist / 100)})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }
  requestAnimationFrame(drawParticles);
}
drawParticles();

// ── Difficulty config per round ───────────────────────────
const ROUND_CONFIG = [
  // round 1: easy-ish entry
  { defectMin: 1, defectMax: 2, timeLimit: 4.5, decoys: 1 },
  // round 2
  { defectMin: 1, defectMax: 2, timeLimit: 4.0, decoys: 1 },
  // round 3
  { defectMin: 2, defectMax: 3, timeLimit: 3.5, decoys: 2 },
  // round 4
  { defectMin: 2, defectMax: 3, timeLimit: 3.0, decoys: 2 },
  // round 5: hardest
  { defectMin: 2, defectMax: 3, timeLimit: 2.5, decoys: 3 },
];

// ── Game State ──────────────────────────────────────────
const TOTAL_ROUNDS = 5;
const CHIP_COUNT   = 12; // 4×3 grid

let state = {
  round:       1,
  score:       0,
  combo:       0,
  timeLimit:   4.5,
  defectCount: 0,
  defectIds:   [],
  decoyIds:    [],   // look suspicious but are normal
  foundIds:    [],
  missedNormal: 0,
  roundScores: [],
  timerInterval: null,
  timerVal:    4.5,
  phase:       'start',
  totalDefects: 0,
  totalFound:   0,
};

// ── DOM refs ────────────────────────────────────────────
const screens = {
  start:  document.getElementById('startScreen'),
  game:   document.getElementById('gameScreen'),
  result: document.getElementById('resultScreen'),
  final:  document.getElementById('finalScreen'),
};
const roundDisplay  = document.getElementById('roundDisplay');
const scoreDisplay  = document.getElementById('scoreDisplay');
const timerText     = document.getElementById('timerText');
const timerCircle   = document.getElementById('timerCircle');
const chipGrid      = document.getElementById('chipGrid');
const statusMsg     = document.getElementById('statusMsg');
const comboDisplay  = document.getElementById('comboDisplay');

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('nextRoundBtn').addEventListener('click', nextRound);
document.getElementById('restartBtn').addEventListener('click', restartGame);

// ── Screen transitions ──────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ── Preview chip (start screen) ─────────────────────────
function buildPreviewChips() {
  document.querySelectorAll('.preview-chip').forEach((el, i) => {
    el.innerHTML = buildChipHTML(i === 1 ? 'crack' : null, i, false);
    el.classList.remove('normal', 'defect', 'crack');
  });
}
buildPreviewChips();

// ── Build chip HTML ─────────────────────────────────────
// noiseAmt: 0–1, adds subtle random tint variation to ALL chips
function buildChipHTML(defectType, id, addNoise = true) {
  const pinsHTML = `
    <div class="chip-pins">
      <div class="pin h"></div><div class="pin h"></div><div class="pin h"></div>
      <div class="pin h b"></div><div class="pin h b"></div><div class="pin h b"></div>
      <div class="pin v"></div><div class="pin v"></div><div class="pin v"></div>
      <div class="pin v r"></div><div class="pin v r"></div><div class="pin v r"></div>
    </div>`;

  // Subtle per-chip color noise so all chips look slightly different
  let noiseStyle = '';
  if (addNoise) {
    const hShift = (Math.random() - 0.5) * 8;  // ±4° hue
    const bShift = (Math.random() - 0.5) * 6;  // ±3% brightness
    noiseStyle = `filter: hue-rotate(${hShift}deg) brightness(${1 + bShift / 100});`;
  }

  let extra = '';

  if (defectType === 'crack') {
    // Thinner, subtler crack — harder to see
    const sx = 15 + Math.random() * 30;
    const sy = 10 + Math.random() * 20;
    const mx = sx + 8 + Math.random() * 20;
    const my = sy + 10 + Math.random() * 15;
    const ex = mx + 5 + Math.random() * 20;
    const ey = my + 8 + Math.random() * 20;
    // branch fork
    const bx = mx + (Math.random() - 0.5) * 10;
    const by = my + 8 + Math.random() * 12;
    extra = `<div class="crack-line">
      <svg class="crack-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path class="crack-path" d="M${sx},${sy} L${mx},${my} L${ex},${ey}"/>
        <path class="crack-path" d="M${mx},${my} L${bx},${by}"/>
        <path class="crack-path-light" d="M${sx-0.5},${sy-0.5} L${mx-0.5},${my-0.5} L${ex-0.5},${ey-0.5}"/>
      </svg></div>`;
  } else if (defectType === 'burn') {
    // Smaller burn spot — harder to see
    const bx = 20 + Math.random() * 60;
    const by = 20 + Math.random() * 60;
    const bs = 8 + Math.random() * 8;   // was 15–30, now 8–16
    extra = `<div class="burn-mark" style="width:${bs}px;height:${bs * 0.85}px;left:${bx}%;top:${by}%;transform:translate(-50%,-50%)"></div>`;
  } else if (defectType === 'scratch') {
    // New defect: fine scratch line
    const angle = Math.random() * 60 - 30;
    const cx = 20 + Math.random() * 60;
    const cy = 20 + Math.random() * 60;
    const len = 12 + Math.random() * 18;
    const rad = (angle * Math.PI) / 180;
    const x1 = cx - Math.cos(rad) * len / 2;
    const y1 = cy - Math.sin(rad) * len / 2;
    const x2 = cx + Math.cos(rad) * len / 2;
    const y2 = cy + Math.sin(rad) * len / 2;
    extra = `<div class="crack-line">
      <svg class="crack-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path class="scratch-path" d="M${x1},${y1} L${x2},${y2}"/>
      </svg></div>`;
  } else if (defectType === 'void') {
    // New defect: tiny dark void / pit in die
    const vx = 35 + Math.random() * 30;
    const vy = 35 + Math.random() * 30;
    const vs = 4 + Math.random() * 5;
    extra = `<div class="void-mark" style="width:${vs}px;height:${vs}px;left:${vx}%;top:${vy}%;transform:translate(-50%,-50%)"></div>`;
  }

  // DECOY: very faint discoloration only, less than actual defect-discolor
  // handled via class in CSS, no extra HTML needed

  return `<div class="chip-body" style="${noiseStyle}">
    ${pinsHTML}
    <div class="chip-die"></div>
    ${extra}
    <span class="chip-label">IC-${String(id+1).padStart(2,'0')}</span>
  </div>`;
}

// ── Generate round config ────────────────────────────────
function generateRound() {
  const cfg = ROUND_CONFIG[state.round - 1];
  const defectCount = cfg.defectMin + Math.floor(Math.random() * (cfg.defectMax - cfg.defectMin + 1));

  state.defectCount = defectCount;
  state.timeLimit   = cfg.timeLimit;
  state.defectIds   = [];
  state.decoyIds    = [];
  state.foundIds    = [];
  state.missedNormal = 0;

  // Pick positions
  const indices = Array.from({ length: CHIP_COUNT }, (_, i) => i);
  shuffleArray(indices);
  state.defectIds = indices.slice(0, defectCount);
  // Decoys come from remaining non-defect chips
  const remaining = indices.slice(defectCount);
  state.decoyIds  = remaining.slice(0, cfg.decoys);
}

// ── Defect types (expanded) ───────────────────────────────
const DEFECT_TYPES = ['crack', 'discolor', 'burn', 'scratch', 'void'];

// ── Render chips ─────────────────────────────────────────
function renderChips() {
  chipGrid.innerHTML = '';
  const defectTypeMap = {};

  state.defectIds.forEach(id => {
    defectTypeMap[id] = DEFECT_TYPES[Math.floor(Math.random() * DEFECT_TYPES.length)];
  });

  const ids = Array.from({ length: CHIP_COUNT }, (_, i) => i);
  shuffleArray(ids);

  for (let pos = 0; pos < CHIP_COUNT; pos++) {
    const chipId   = ids[pos];
    const isDefect = state.defectIds.includes(chipId);
    const isDecoy  = state.decoyIds.includes(chipId);
    const defType  = isDefect ? defectTypeMap[chipId] : null;

    const el = document.createElement('div');
    let cls = 'chip';
    if (isDefect) cls += ` defect-${defType}`;
    if (isDecoy)  cls += ' decoy';
    el.className = cls;
    el.style.animationDelay = `${pos * 0.035}s`;
    el.innerHTML = buildChipHTML(defType, chipId, true);
    el.dataset.chipId = chipId;
    el.dataset.defect = isDefect ? '1' : '0';
    el.dataset.decoy  = isDecoy  ? '1' : '0';

    el.addEventListener('click', () => onChipClick(el, chipId, isDefect));
    chipGrid.appendChild(el);
  }
}

// ── Chip click handler ───────────────────────────────────
function onChipClick(el, chipId, isDefect) {
  if (state.phase !== 'playing') return;
  if (state.foundIds.includes(chipId)) return;

  if (isDefect) {
    state.foundIds.push(chipId);
    state.combo++;
    state.totalFound++;

    const timeBonus  = Math.round(state.timerVal * 40);
    const comboBonus = state.combo > 1 ? (state.combo - 1) * 60 : 0;
    const pts = 200 + timeBonus + comboBonus;
    state.score += pts;
    updateScoreDisplay();

    el.classList.add('correct-hit');
    spawnFloatScore(el, `+${pts}`, 'pos');

    if (state.combo > 1) showCombo(state.combo);

    if (state.foundIds.length >= state.defectCount) {
      clearTimer();
      setTimeout(() => endRound(true), 400);
    }
  } else {
    // Wrong click (normal OR decoy)
    state.combo = 0;
    state.missedNormal++;
    const isDecoy = el.dataset.decoy === '1';
    const penalty = isDecoy ? -150 : -150;   // heavy penalty
    state.score   = Math.max(0, state.score + penalty);
    updateScoreDisplay();

    el.classList.add('wrong-hit');
    spawnFloatScore(el, `${penalty}`, 'neg');
    showStatusMsg(isDecoy ? '함정이다!' : '오탐지!', 'fail');
    shakeGrid();
  }
}

// ── Screen shake on wrong click ──────────────────────────
function shakeGrid() {
  chipGrid.classList.remove('shake');
  void chipGrid.offsetWidth; // reflow to restart animation
  chipGrid.classList.add('shake');
}

// ── Timer ────────────────────────────────────────────────
const CIRCUMFERENCE = 2 * Math.PI * 26;

function startTimer() {
  state.timerVal = state.timeLimit;
  updateTimerUI();

  state.timerInterval = setInterval(() => {
    state.timerVal = Math.max(0, state.timerVal - 0.1);
    updateTimerUI();

    // Pulse warning at ≤1s
    if (state.timerVal <= 1.0 && !chipGrid.classList.contains('urgent')) {
      chipGrid.classList.add('urgent');
    }

    if (state.timerVal <= 0) {
      clearTimer();
      endRound(false);
    }
  }, 100);
}

function updateTimerUI() {
  const ratio  = state.timerVal / state.timeLimit;
  const offset = CIRCUMFERENCE * (1 - ratio);
  timerCircle.style.strokeDashoffset = offset;
  timerText.textContent = Math.ceil(state.timerVal);

  let hue = ratio <= 0.25 ? 0 : (ratio <= 0.55 ? 35 : 160);
  timerCircle.style.stroke = `hsl(${hue}, 100%, 55%)`;
  timerText.style.color    = `hsl(${hue}, 100%, 55%)`;
}

function clearTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  chipGrid.classList.remove('urgent');
}

// ── End round ────────────────────────────────────────────
function endRound(success) {
  state.phase = 'roundResult';
  clearTimer();

  if (!success) revealDefects();

  const missed  = state.defectCount - state.foundIds.length;
  const penalty = missed * 100;   // harsher miss penalty
  if (!success) {
    state.score = Math.max(0, state.score - penalty);
    state.combo = 0;
  }

  state.totalDefects += state.defectCount;
  state.roundScores.push({ success, found: state.foundIds.length, total: state.defectCount });
  updateScoreDisplay();

  setTimeout(() => showRoundResult(success, missed), success ? 500 : 900);
}

function revealDefects() {
  chipGrid.querySelectorAll('.chip').forEach(el => {
    const id = parseInt(el.dataset.chipId);
    if (state.defectIds.includes(id) && !state.foundIds.includes(id)) {
      el.classList.add('revealed');
    }
  });
}

// ── Round result screen ───────────────────────────────────
function showRoundResult(success, missed) {
  const icon  = document.getElementById('resultIcon');
  const title = document.getElementById('resultTitle');
  const desc  = document.getElementById('resultDesc');
  const score = document.getElementById('resultScore');
  const btn   = document.getElementById('nextRoundBtn');
  const cfg   = ROUND_CONFIG[state.round - 1];

  if (success) {
    icon.textContent  = '✅';
    title.textContent = '불량품 적발!';
    title.className   = 'result-title success';
    desc.textContent  = `불량칩 ${state.defectCount}개 전량 발견! 탁월한 검사 성과.`;
  } else {
    icon.textContent  = missed === state.defectCount ? '❌' : '⚠️';
    title.textContent = missed === state.defectCount ? '시간 초과!' : '일부 적발';
    title.className   = `result-title ${missed === state.defectCount ? 'fail' : 'success'}`;
    desc.textContent  = `${state.foundIds.length}/${state.defectCount}개 발견 · ${missed}개 미발견 (-${missed * 100}점)`;
  }

  const nextCfg = ROUND_CONFIG[state.round]; // round after this
  const nextTime = nextCfg ? nextCfg.timeLimit : null;
  let hint = '';
  if (nextTime) hint = ` ⏱️ 다음 라운드: ${nextTime}초`;

  score.textContent = `현재 총점: ${state.score.toLocaleString()}${hint}`;
  btn.textContent   = state.round >= TOTAL_ROUNDS ? '결과 보기' : '다음 라운드';

  showScreen('result');
}

// ── Navigation ───────────────────────────────────────────
function startGame() {
  state = {
    round: 1, score: 0, combo: 0,
    defectCount: 0, defectIds: [], decoyIds: [], foundIds: [],
    missedNormal: 0, roundScores: [],
    timerInterval: null, timerVal: 4.5,
    phase: 'playing',
    totalDefects: 0, totalFound: 0,
    timeLimit: 4.5,
  };
  updateScoreDisplay();
  showScreen('game');
  startRound();
}

function startRound() {
  state.phase = 'playing';
  roundDisplay.textContent = `${state.round} / ${TOTAL_ROUNDS}`;
  generateRound();
  renderChips();
  // Brief "countdown" before timer starts
  setTimeout(startTimer, 600);
}

function nextRound() {
  if (state.round >= TOTAL_ROUNDS) {
    showFinalScreen();
    return;
  }
  state.round++;
  showScreen('game');
  startRound();
}

function restartGame() { showScreen('start'); }

// ── Final screen ─────────────────────────────────────────
function showFinalScreen() {
  const accuracy = state.totalDefects > 0
    ? Math.round((state.totalFound / state.totalDefects) * 100)
    : 0;

  let grade, badge, comment;
  // Harder thresholds because of lower time limits
  if (state.score >= 4500) {
    grade = 'S'; badge = '🏆';
    comment = '완벽한 검사! 초고난도 환경에서도 모든 불량품을 식별한 전문가입니다.';
  } else if (state.score >= 3000) {
    grade = 'A'; badge = '🥇';
    comment = '매우 우수한 성과. 빠른 판단력과 높은 정확도를 보유하고 있습니다.';
  } else if (state.score >= 1800) {
    grade = 'B'; badge = '🥈';
    comment = '양호한 성과입니다. 조금 더 빠른 반응과 집중력이 필요합니다.';
  } else if (state.score >= 800) {
    grade = 'C'; badge = '🥉';
    comment = '기본기는 있으나 연습이 필요합니다. 불량 패턴을 더 익혀보세요.';
  } else {
    grade = 'D'; badge = '🔬';
    comment = '아직 갈 길이 멉니다! 불량칩의 미세한 차이를 주의 깊게 살펴보세요.';
  }

  document.getElementById('finalBadge').textContent   = badge;
  document.getElementById('finalScore').textContent   = state.score.toLocaleString();
  document.getElementById('finalAccuracy').textContent = `${accuracy}%`;
  const gradeEl = document.getElementById('finalGrade');
  gradeEl.textContent = grade;
  gradeEl.style.color = grade === 'S' ? '#ffd700'
                      : grade === 'A' ? '#39ff14'
                      : grade === 'B' ? '#00c8ff'
                      : grade === 'C' ? '#ff8c00' : '#ff4444';
  document.getElementById('finalComment').textContent = comment;

  showScreen('final');
}

// ── UI helpers ─────────────────────────────────────────────
function updateScoreDisplay() {
  scoreDisplay.textContent = state.score.toLocaleString();
}

let statusTimeout = null;
function showStatusMsg(text, type) {
  statusMsg.textContent = text;
  statusMsg.className   = `status-msg ${type} show`;
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => statusMsg.classList.remove('show'), 700);
}

let comboTimeout = null;
function showCombo(n) {
  comboDisplay.textContent = `${n}× COMBO!`;
  comboDisplay.classList.add('show');
  if (comboTimeout) clearTimeout(comboTimeout);
  comboTimeout = setTimeout(() => comboDisplay.classList.remove('show'), 1200);
}

function spawnFloatScore(el, text, type) {
  const rect = el.getBoundingClientRect();
  const div  = document.createElement('div');
  div.className   = `float-score ${type}`;
  div.textContent = text;
  div.style.left  = `${rect.left + rect.width / 2 - 30}px`;
  div.style.top   = `${rect.top}px`;
  document.body.appendChild(div);
  div.addEventListener('animationend', () => div.remove());
}

// ── Utility ───────────────────────────────────────────────
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
