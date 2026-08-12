// game.js - 반도체 모의투자 멀티플레이어 클라이언트

// 로컬 개발 환경인 경우 빈 문자열(동일 origin), 배포 환경인 경우 실제 백엔드 서버 URL 설정
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? ''
  : 'https://encoding-stock.onrender.com'; // 백엔드 배포 후 이 주소를 실제 배포한 서버 주소로 변경하세요.

const socket = io(BACKEND_URL);

// 전역 상태
let me = null;
let currentRoom = null;
let isHost = false;
let myPlayerId = localStorage.getItem('playerId');
if (!myPlayerId) {
  myPlayerId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  localStorage.setItem('playerId', myPlayerId);
}

// DOM 요소
const loginScreen = document.getElementById('login-screen');
const roomScreen = document.getElementById('room-screen');
const gameScreen = document.getElementById('game-screen');
const resultScreen = document.getElementById('result-screen');
const liveRoomList = document.getElementById('live-room-list');
const viewHintBtn = document.getElementById('view-hint-btn');
const skipRoundBtn = document.getElementById('skip-round-btn');
let skipCountdownInterval = null;

// Login
const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code-input');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const connectionStatus = document.getElementById('connection-status');
const adminPasswordInput = document.getElementById('admin-password-input');

// Room
const displayRoomCode = document.getElementById('display-room-code');
const lobbyPlayers = document.getElementById('lobby-players');
const playerCount = document.getElementById('player-count');
const hostControls = document.getElementById('host-controls');
const guestWaiting = document.getElementById('guest-waiting');
const startGameBtn = document.getElementById('start-game-btn');

// Game
const scenarioTitle = document.getElementById('scenario-title');
const roundIndicator = document.getElementById('round-indicator');
const timerDisplay = document.getElementById('timer-display');
const myNameEl = document.getElementById('my-name');
const myCashEl = document.getElementById('my-cash');
const myTotalAssetEl = document.getElementById('my-total-asset');
const liveRanking = document.getElementById('live-ranking');
const stocksPanel = document.getElementById('stocks-panel');

// Quiz
const quizModal = document.getElementById('quiz-modal');
const quizQuestion = document.getElementById('quiz-question');
const quizOptions = document.getElementById('quiz-options');
const quizResult = document.getElementById('quiz-result');
const quizExplain = document.getElementById('quiz-explain');
const quizHintBox = document.getElementById('quiz-hint-box');
const closeQuizBtn = document.getElementById('close-quiz-btn');

// 유틸리티
function formatMoney(num) {
  return new Intl.NumberFormat('ko-KR').format(num) + '원';
}

// 화면 활성화 감지 (탭 전환 시 타이머 동기화)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentRoom) {
    socket.emit('requestSync', { roomId: currentRoom });
  }
});

socket.on('connect', () => {
  connectionStatus.textContent = '서버 연결 완료!';
  connectionStatus.style.color = 'var(--success)';

  // 방 목록 요청
  socket.emit('getRoomList');

  // 세션 복구 시도
  const savedRoom = localStorage.getItem('roomId');
  if (savedRoom) {
    socket.emit('rejoinRoom', { roomId: savedRoom, playerId: myPlayerId });
  }
});

// 방 생성
createRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || 'Player';
  const password = adminPasswordInput.value.trim();
  if (!password) {
    alert('방을 생성하려면 관리자 비밀번호를 입력해주세요.');
    return;
  }
  socket.emit('createRoom', { playerName: name, adminPassword: password, playerId: myPlayerId });
});

// 방 참가
joinRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || 'Player';
  const code = roomCodeInput.value.trim().toUpperCase();
  if (code.length === 4) {
    socket.emit('joinRoom', { roomId: code, playerName: name, playerId: myPlayerId });
  } else {
    alert('4자리 방 코드를 입력하세요.');
  }
});

// 방 생성 완료
socket.on('roomCreated', ({ roomId, player }) => {
  me = player;
  currentRoom = roomId;
  isHost = true;
  localStorage.setItem('roomId', roomId);
  showRoomScreen();
  hostControls.style.display = 'block';
});

// 방 참가 완료
socket.on('joinedRoom', ({ roomId, player }) => {
  me = player;
  currentRoom = roomId;
  isHost = false;
  localStorage.setItem('roomId', roomId);
  showRoomScreen();
  guestWaiting.style.display = 'block';
});

socket.on('errorMsg', (msg) => {
  alert(msg);
});

socket.on('rejoinFailed', (msg) => {
  console.log('Rejoin failed:', msg);
  localStorage.removeItem('roomId');
  alert('📢 업데이트됨! (서버 재설정으로 인해 페이지를 새로고침합니다.)');
  window.location.reload();
});

socket.on('disconnect', (reason) => {
  connectionStatus.textContent = '서버와 연결이 끊어졌습니다. 재연결 중...';
  connectionStatus.style.color = 'var(--danger)';
});

// 재접속 완료
socket.on('rejoinedRoom', ({ roomId, player, room }) => {
  me = player;
  currentRoom = roomId;
  isHost = (room.host === myPlayerId);
  localStorage.setItem('roomId', roomId);

  if (room.status === 'lobby') {
    showRoomScreen();
    if (isHost) {
      hostControls.style.display = 'block';
      guestWaiting.style.display = 'none';
    } else {
      hostControls.style.display = 'none';
      guestWaiting.style.display = 'block';
    }
  } else if (room.status === 'playing') {
    setupRound({ scenario: room.scenario, companies: room.companies, players: room.players, round: room.round }, true);
  } else if (room.status === 'result') {
    alert('게임 결과 대기 화면으로 복구되었습니다.');
    // 간소화: 다음 라운드 대기 상태로 바로 이동
    loginScreen.style.display = 'none';
    roomScreen.style.display = 'none';
    gameScreen.style.display = 'none';
    resultScreen.style.display = 'block';
    if (isHost) {
      document.getElementById('host-next-round-controls').style.display = 'block';
    } else {
      document.getElementById('guest-next-round-waiting').style.display = 'block';
    }
  }
});

// 방 목록 업데이트
socket.on('roomListUpdate', (rooms) => {
  liveRoomList.innerHTML = '';
  if (rooms.length === 0) {
    liveRoomList.innerHTML = '<li style="color: var(--text-muted); font-size: 0.9rem;">대기 중인 방이 없습니다.</li>';
    return;
  }
  rooms.forEach(r => {
    const li = document.createElement('li');
    li.style.padding = '10px';
    li.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
    li.style.cursor = 'pointer';
    // 방 코드 대신 방장 이름 표시
    li.innerHTML = `<strong>${r.hostName}님의 서버</strong> <span style="font-size:0.8rem; color:#aaa;">(${r.playerCount}/${r.maxPlayers}명)</span>`;
    li.addEventListener('click', () => {
      roomCodeInput.value = r.id; // 클릭하면 여전히 내부적으로는 코드가 입력됨
    });
    liveRoomList.appendChild(li);
  });
});

// 로비 업데이트
socket.on('updateLobby', (players) => {
  playerCount.textContent = players.length;
  lobbyPlayers.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p.name + (p.id === myPlayerId ? ' (나)' : '');
    lobbyPlayers.appendChild(li);
  });
});

function showRoomScreen() {
  loginScreen.style.display = 'none';
  roomScreen.style.display = 'block';
  displayRoomCode.textContent = currentRoom;
}

// 게임 시작 클릭 (호스트)
startGameBtn.addEventListener('click', () => {
  const randomScenario = window.SCENARIOS[Math.floor(Math.random() * window.SCENARIOS.length)];
  socket.emit('startGame', { roomId: currentRoom, scenarioId: randomScenario.id });
});

// 게임 시작됨
socket.on('gameStarted', (data) => {
  setupRound(data);
});

socket.on('roundStarted', (data) => {
  setupRound(data);
});

let skipVotedStatus = { votedCount: 0, totalCount: 0 };
let hasVotedCurrentRound = false;

function setupRound(data, isReconnect = false) {
  loginScreen.style.display = 'none';
  roomScreen.style.display = 'none';
  resultScreen.style.display = 'none';
  gameScreen.style.display = 'block';
  viewHintBtn.style.display = 'none'; // 매 라운드 시작 시 숨김

  // 스킵 버튼 및 카운트다운 초기화
  hasVotedCurrentRound = false;
  skipRoundBtn.disabled = true;
  skipRoundBtn.classList.remove('voted');
  skipRoundBtn.textContent = `⏳ 60초 후 스킵 가능 (${skipVotedStatus.votedCount}/${skipVotedStatus.totalCount})`;
  document.getElementById('auto-next-round-notice').style.display = 'none';
  if (skipCountdownInterval) {
    clearInterval(skipCountdownInterval);
    skipCountdownInterval = null;
  }

  if (data.scenario) scenarioTitle.textContent = data.scenario.title;
  roundIndicator.textContent = `Round ${data.round} / 3`;

  renderPlayers(data.players);
  renderStocks(data.companies, data.players);

  if (!isReconnect) {
    showQuizModal(data);
  } else {
    // 재접속 시 이미 퀴즈를 풀었다면 힌트 버튼 표시
    const myData = data.players.find(p => p.id === myPlayerId);
    if (myData && myData.quizSolved) {
      if (data.scenario) currentRoundDataForQuiz = data.scenario.rounds.find(r => r.round === data.round);
      currentHint1Text = currentRoundDataForQuiz ? (currentRoundDataForQuiz.hint1 || currentRoundDataForQuiz.hint || "") : "";
      currentHint2Text = currentRoundDataForQuiz ? (currentRoundDataForQuiz.hint2 || currentRoundDataForQuiz.hint || "") : "";
      viewHintBtn.style.display = 'inline-block';
    }
  }
}

socket.on('timerUpdate', (time) => {
  const m = Math.floor(time / 60).toString().padStart(2, '0');
  const s = (time % 60).toString().padStart(2, '0');
  timerDisplay.textContent = `${m}:${s}`;
  if (time <= 30) {
    timerDisplay.classList.add('timer-urgent');
  } else {
    timerDisplay.classList.remove('timer-urgent');
  }

  // 라운드 60초 경과 체크 (기본 라운드 시간 180초 중 남은 시간이 120초 초과 시 60초 미만 경과)
  const roundTime = (typeof GAME_CONFIG !== 'undefined' && GAME_CONFIG.SYSTEM) ? GAME_CONFIG.SYSTEM.ROUND_TIME : 180;
  const elapsedTime = roundTime - time;

  if (isHost) {
    // 호스트(방장)는 시간제한이나 타인 투표 여부에 상관없이 즉시 스킵 가능
    if (hasVotedCurrentRound) {
      skipRoundBtn.disabled = true;
      skipRoundBtn.classList.add('voted');
      skipRoundBtn.textContent = `⏩ 즉시 스킵 진행 중...`;
    } else {
      skipRoundBtn.disabled = false;
      skipRoundBtn.classList.remove('voted');
      skipRoundBtn.textContent = `⏩ 라운드 즉시 스킵 (방장)`;
    }
  } else {
    if (elapsedTime < 60) {
      const remainSec = 60 - elapsedTime;
      skipRoundBtn.disabled = true;
      skipRoundBtn.classList.remove('voted');
      skipRoundBtn.textContent = `⏳ ${remainSec}초 후 스킵 가능 (${skipVotedStatus.votedCount}/${skipVotedStatus.totalCount})`;
    } else {
      if (hasVotedCurrentRound) {
        skipRoundBtn.disabled = true;
        skipRoundBtn.classList.add('voted');
        skipRoundBtn.textContent = `⏩ 라운드 스킵 (${skipVotedStatus.votedCount}/${skipVotedStatus.totalCount})`;
      } else {
        skipRoundBtn.disabled = false;
        skipRoundBtn.classList.remove('voted');
        skipRoundBtn.textContent = `⏩ 라운드 스킵 (${skipVotedStatus.votedCount}/${skipVotedStatus.totalCount})`;
      }
    }
  }
});

socket.on('updatePlayers', (players) => {
  renderPlayers(players);
  // 주식 패널 내 보유량 업데이트
  const myData = players.find(p => p.id === myPlayerId);
  if (myData) {
    window.COMPANIES.forEach(c => {
      const shareEl = document.getElementById(`share-${c.id}`);
      if (shareEl) {
        // 기존의 innerHTML 구조에 맞춰서 수량만 업데이트하거나, 텍스트 업데이트
        const countEl = shareEl.querySelector('.shares-count');
        if (countEl) {
          countEl.textContent = `${myData.shares[c.id]}주`;
        } else {
          shareEl.textContent = `보유량: ${myData.shares[c.id]}주`;
        }
      }
    });
  }
});

socket.on('updateCompanies', (companies) => {
  // window.COMPANIES 가격 갱신 및 화면 재렌더링
  companies.forEach(c => {
    const target = window.COMPANIES.find(orig => orig.id === c.id);
    if (target) {
      target.basePrice = c.basePrice;
    }
  });
  // 주식 패널 렌더링 시 플레이어 목록(자산 상태)도 필요하므로 me 상태 기반으로 재랜더링
  if (currentRoom) {
    renderStocks(companies, [me]);
  }
});

function renderPlayers(players) {
  const myData = players.find(p => p.id === myPlayerId);
  if (myData) {
    me = myData;
    myNameEl.textContent = me.name;
    myCashEl.textContent = formatMoney(me.cash);
    myTotalAssetEl.textContent = formatMoney(me.totalAsset);
  }

  const sorted = [...players].sort((a, b) => b.totalAsset - a.totalAsset);
  liveRanking.innerHTML = '';
  sorted.forEach((p, idx) => {
    const li = document.createElement('li');
    li.className = 'ranking-item';
    li.innerHTML = `<span>${idx + 1}위: ${p.name}</span> <span>${formatMoney(p.totalAsset)}</span>`;
    liveRanking.appendChild(li);
  });
}

function renderStocks(companies, players) {
  stocksPanel.innerHTML = '';
  const myData = players.find(p => p.id === myPlayerId) || me;

  companies.forEach(c => {
    const div = document.createElement('div');
    div.className = 'stock-card glass';
    div.innerHTML = `
      <div>
        <div class="stock-name">${c.name}</div>
        <div class="stock-desc">${c.desc}</div>
      </div>
      <div class="stock-price">${formatMoney(c.basePrice)}</div>
      <div class="my-shares-badge" id="share-${c.id}">
        <span class="shares-label">보유 수량</span>
        <span class="shares-count">${myData.shares[c.id]}주</span>
      </div>
      <div class="trade-controls">
        <span class="qty-label">주문수량</span>
        <input type="number" id="trade-qty-${c.id}" value="1" min="1" class="qty-input" />
        <button class="btn-buy" data-id="${c.id}">매수</button>
        <button class="btn-danger btn-sell" data-id="${c.id}">매도</button>
      </div>
    `;
    stocksPanel.appendChild(div);
  });

  document.querySelectorAll('.btn-buy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const cid = e.target.getAttribute('data-id');
      const qty = parseInt(document.getElementById(`trade-qty-${cid}`).value) || 0;
      socket.emit('tradeStock', { roomId: currentRoom, companyId: cid, qty: qty, isBuy: true });
    });
  });

  document.querySelectorAll('.btn-sell').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const cid = e.target.getAttribute('data-id');
      const qty = parseInt(document.getElementById(`trade-qty-${cid}`).value) || 0;
      socket.emit('tradeStock', { roomId: currentRoom, companyId: cid, qty: qty, isBuy: false });
    });
  });
}

// 2단계 연속 퀴즈 및 2개 힌트(hint1, hint2) 해금 시스템
let currentRoundDataForQuiz = null;
let currentHint1Text = "";
let currentHint2Text = "";
let currentQuizStage = 1; // 1차 퀴즈 or 2차 퀴즈
let correctQuizCount = 0; // 0개, 1개, 2개 정답
let currentQuizObj = null;

const quizHint1Box = document.getElementById('quiz-hint1-box');
const quizHint2Box = document.getElementById('quiz-hint2-box');

function updateHintDisplay() {
  if (!quizHint1Box || !quizHint2Box) return;

  // 기본 공통 스타일 적용 (텍스트 정렬, 패딩 등)
  [quizHint1Box, quizHint2Box].forEach(box => {
    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    box.style.justifyContent = 'center';
    box.style.padding = '18px';
    box.style.borderRadius = '12px';
    box.style.border = '2px solid';
    box.style.textAlign = 'left';
    box.style.lineHeight = '1.5';
    box.style.transition = 'all 0.3s ease';
  });

  if (correctQuizCount === 0) {
    // 0개 정답 (둘 다 잠김)
    quizHint1Box.style.background = '#f8fafc';
    quizHint1Box.style.borderColor = '#e2e8f0';
    quizHint1Box.style.color = '#94a3b8';
    quizHint1Box.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; text-align:center; gap:6px; width:100%;">
        <span style="font-size:1.8rem; filter: grayscale(1);">🔒</span>
        <strong style="font-size:1.05rem; color:#64748b;">독점 힌트 1 잠김</strong>
        <span style="font-size:0.85rem; color:#94a3b8;">오답으로 힌트를 얻지 못했습니다.</span>
      </div>
    `;

    quizHint2Box.style.background = '#f8fafc';
    quizHint2Box.style.borderColor = '#e2e8f0';
    quizHint2Box.style.color = '#94a3b8';
    quizHint2Box.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; text-align:center; gap:6px; width:100%;">
        <span style="font-size:1.8rem; filter: grayscale(1);">🔒</span>
        <strong style="font-size:1.05rem; color:#64748b;">독점 힌트 2 잠김</strong>
        <span style="font-size:0.85rem; color:#94a3b8;">오답으로 힌트를 얻지 못했습니다.</span>
      </div>
    `;
  } else if (correctQuizCount === 1) {
    // 1개 정답 (힌트 1 해금, 힌트 2 잠김)
    quizHint1Box.style.background = '#eff6ff';
    quizHint1Box.style.borderColor = '#3b82f6';
    quizHint1Box.style.color = '#1e3a8a';
    quizHint1Box.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:6px;">
        <span style="font-size:0.8rem; background:#3b82f6; color:#ffffff; padding:2px 8px; border-radius:20px; width:fit-content; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">💡 힌트 1 해금</span>
        <strong style="font-size:1.05rem; color:#1d4ed8; margin-top:2px;">애매한 독점 정보</strong>
        <p style="font-size:0.9rem; font-weight:600; line-height:1.6; color:#1e40af; margin-top:4px;">${currentHint1Text || "정보가 없습니다."}</p>
      </div>
    `;

    quizHint2Box.style.background = '#fffbeb';
    quizHint2Box.style.borderColor = '#fcd34d';
    quizHint2Box.style.color = '#78350f';
    quizHint2Box.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; text-align:center; gap:6px; width:100%;">
        <span style="font-size:1.8rem;">🔒</span>
        <strong style="font-size:1.05rem; color:#b45309;">독점 힌트 2 잠김</strong>
        <span style="font-size:0.85rem; color:#d97706; font-weight:600;">2차 퀴즈까지 맞춰야<br>고급 정보가 열립니다!</span>
      </div>
    `;
  } else if (correctQuizCount >= 2) {
    // 2개 정답 (둘 다 해금)
    quizHint1Box.style.background = '#eff6ff';
    quizHint1Box.style.borderColor = '#3b82f6';
    quizHint1Box.style.color = '#1e3a8a';
    quizHint1Box.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:6px;">
        <span style="font-size:0.8rem; background:#3b82f6; color:#ffffff; padding:2px 8px; border-radius:20px; width:fit-content; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">💡 힌트 1 해금</span>
        <strong style="font-size:1.05rem; color:#1d4ed8; margin-top:2px;">애매한 독점 정보</strong>
        <p style="font-size:0.9rem; font-weight:600; line-height:1.6; color:#1e40af; margin-top:4px;">${currentHint1Text || "정보가 없습니다."}</p>
      </div>
    `;

    quizHint2Box.style.background = '#ecfdf5';
    quizHint2Box.style.borderColor = '#10b981';
    quizHint2Box.style.color = '#064e3b';
    quizHint2Box.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:6px;">
        <span style="font-size:0.8rem; background:#10b981; color:#ffffff; padding:2px 8px; border-radius:20px; width:fit-content; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">🔥 힌트 2 해금</span>
        <strong style="font-size:1.05rem; color:#047857; margin-top:2px;">분명한 독점 정보</strong>
        <p style="font-size:0.9rem; font-weight:600; line-height:1.6; color:#065f46; margin-top:4px;">${currentHint2Text || "정보가 없습니다."}</p>
      </div>
    `;
  }
}

viewHintBtn.addEventListener('click', () => {
  document.getElementById('quiz-modal-title').textContent = '💡 입수한 독점 힌트 다시 보기';
  document.getElementById('quiz-modal-desc').style.display = 'none';
  document.getElementById('quiz-question-container').style.display = 'none';

  quizResult.style.display = 'block';
  quizExplain.innerHTML = '';
  updateHintDisplay();

  closeQuizBtn.style.display = 'inline-block';
  closeQuizBtn.textContent = '닫기';
  quizModal.style.display = 'flex';
});

const minigameModal = document.getElementById('minigame-modal');
const minigameIframe = document.getElementById('minigame-iframe');

function showMiniGameModal(data) {
  if (data.scenario) currentRoundDataForQuiz = data.scenario.rounds.find(r => r.round === data.round);
  currentHint1Text = currentRoundDataForQuiz ? (currentRoundDataForQuiz.hint1 || currentRoundDataForQuiz.hint || "") : "";
  currentHint2Text = currentRoundDataForQuiz ? (currentRoundDataForQuiz.hint2 || currentRoundDataForQuiz.hint || "") : "";

  correctQuizCount = 0;
  minigameIframe.src = 'yindex.html';
  minigameModal.style.display = 'flex';
}

// 미니게임 iframe 메시지 리스너
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'MINIGAME_COMPLETE') {
    const score = e.data.score;
    // 1500점 이상 3000점 미만 힌트 1, 3000점 이상 힌트 2 해금
    if (score >= 3000) {
      correctQuizCount = 2;
    } else if (score >= 1500) {
      correctQuizCount = 1;
    } else {
      correctQuizCount = 0;
    }

    if (correctQuizCount >= 1) {
      socket.emit('quizSolved', { roomId: currentRoom });
    }
  } else if (e.data && e.data.type === 'MINIGAME_EXIT') {
    minigameModal.style.display = 'none';
    minigameIframe.src = ''; // 리소스 해제

    if (correctQuizCount >= 1) {
      viewHintBtn.style.display = 'inline-block';
    }

    const earnedHintsCount = correctQuizCount;
    let resultMsg = `반도체 불량 검사 결과: ${e.data.score.toLocaleString()}점 (등급 ${e.data.grade})을 획득하였습니다!\n`;
    if (earnedHintsCount === 2) {
      resultMsg += `🎉 최고 점수로 독점 힌트 1 & 2가 모두 해금되었습니다!`;
    } else if (earnedHintsCount === 1) {
      resultMsg += `💡 힌트 1(애매한 힌트)이 해금되었습니다!\n(힌트 2를 얻으려면 3,000점 이상 필요)`;
    } else {
      resultMsg += `❌ 점수 미달(1500점 미만)로 힌트를 획득하지 못했습니다.`;
    }
    alert(resultMsg);
  }
});

function showQuizModal(data) {
  if (data.scenario) currentRoundDataForQuiz = data.scenario.rounds.find(r => r.round === data.round);
  currentHint1Text = currentRoundDataForQuiz ? (currentRoundDataForQuiz.hint1 || currentRoundDataForQuiz.hint || "") : "";
  currentHint2Text = currentRoundDataForQuiz ? (currentRoundDataForQuiz.hint2 || currentRoundDataForQuiz.hint || "") : "";

  currentQuizStage = 1;
  correctQuizCount = 0;

  if (data.round === 2) {
    showMiniGameModal(data);
  } else {
    renderQuizStage(1);
    quizModal.style.display = 'flex';
  }
}

let firstQuizId = null;

function renderQuizStage(stage) {
  currentQuizStage = stage;
  
  // 1차 퀴즈 문제와 2차 퀴즈 문제가 중복되지 않도록 무작위 추출
  let qCandidates = window.QUIZ_BANK;
  if (stage === 2 && firstQuizId !== null) {
    qCandidates = window.QUIZ_BANK.filter(q => q.id !== firstQuizId);
  }

  const qIdx = Math.floor(Math.random() * qCandidates.length);
  currentQuizObj = qCandidates[qIdx];
  if (stage === 1) firstQuizId = currentQuizObj.id;

  const stageBadgeText = stage === 1 ? '📝 [퀴즈 1/2] 반도체 상식 (1차 도전)' : '🔥 [퀴즈 2/2] 최종 힌트 해금 도전! (2차)';
  document.getElementById('quiz-modal-title').innerHTML = `<span class="quiz-step-badge">${stageBadgeText}</span><br>라운드 퀴즈`;
  document.getElementById('quiz-modal-desc').style.display = 'block';
  document.getElementById('quiz-modal-desc').textContent = stage === 1 ? 
    '1차 퀴즈를 맞추면 힌트 1(애매한 힌트)이 해금되며 2차 퀴즈에 도전할 수 있습니다!' :
    '2차 퀴즈까지 정답을 맞추면 힌트 2(분명한 힌트)까지 추가 해금됩니다!';

  document.getElementById('quiz-question-container').style.display = 'block';
  document.getElementById('quiz-question').style.display = 'block';
  quizQuestion.textContent = currentQuizObj.question;

  quizOptions.innerHTML = '';
  quizResult.style.display = 'none';
  if (quizHint1Box) quizHint1Box.style.display = 'none';
  if (quizHint2Box) quizHint2Box.style.display = 'none';
  closeQuizBtn.style.display = 'none';

  if (currentQuizObj.type === 'OX') {
    ['O', 'X'].forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.addEventListener('click', () => submitQuiz(currentQuizObj, opt));
      quizOptions.appendChild(btn);
    });
  } else {
    currentQuizObj.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.addEventListener('click', () => submitQuiz(currentQuizObj, idx));
      quizOptions.appendChild(btn);
    });
  }
}

function submitQuiz(quiz, selected) {
  quizOptions.innerHTML = '';
  quizResult.style.display = 'block';

  document.getElementById('quiz-modal-title').textContent = '퀴즈 결과';
  document.getElementById('quiz-modal-desc').style.display = 'none';
  document.getElementById('quiz-question').style.display = 'none';

  const isCorrect = (quiz.answer === selected);

  if (currentQuizStage === 1) {
    if (isCorrect) {
      correctQuizCount = 1;
      socket.emit('quizSolved', { roomId: currentRoom });
      
      quizExplain.innerHTML = `
        <div style="color:var(--success); font-weight:bold; font-size:1.15rem; margin-bottom:8px;">
          🎉 1차 퀴즈 정답입니다! [힌트 1 (애매한 힌트)] 해금 완료!
        </div>
        <div>${quiz.explain}</div>
        <button id="next-quiz-btn" style="margin-top:16px; background:var(--accent); color:#ffffff; padding:12px 20px; font-size:1rem; font-weight:bold; border-radius:10px; cursor:pointer;">
          🔥 2차 퀴즈 도전하고 힌트 2까지 얻기 ➔
        </button>
      `;

      updateHintDisplay();
      closeQuizBtn.style.display = 'inline-block';
      closeQuizBtn.textContent = '닫기 및 힌트 1만 가져가기';
      viewHintBtn.style.display = 'inline-block';

      document.getElementById('next-quiz-btn').addEventListener('click', () => {
        renderQuizStage(2);
      });

    } else {
      correctQuizCount = 0;
      let corrAns = quiz.type === 'OX' ? quiz.answer : quiz.options[quiz.answer];
      quizExplain.innerHTML = `<span style="color:var(--danger); font-weight:bold;">1차 퀴즈 오답입니다.</span> (정답: ${corrAns})<br>${quiz.explain}`;
      updateHintDisplay();
      closeQuizBtn.style.display = 'inline-block';
      closeQuizBtn.textContent = '확인';
    }
  } else if (currentQuizStage === 2) {
    if (isCorrect) {
      correctQuizCount = 2;
      quizExplain.innerHTML = `
        <div style="color:var(--success); font-weight:bold; font-size:1.15rem; margin-bottom:8px;">
          🏆 2차 퀴즈까지 모두 정답! [힌트 2 (분명한 힌트)] 최종 해금 완료!
        </div>
        <div>${quiz.explain}</div>
      `;
      updateHintDisplay();
      closeQuizBtn.style.display = 'inline-block';
      closeQuizBtn.textContent = '확인';
      viewHintBtn.style.display = 'inline-block';
    } else {
      correctQuizCount = 1;
      let corrAns = quiz.type === 'OX' ? quiz.answer : quiz.options[quiz.answer];
      quizExplain.innerHTML = `
        <div style="color:var(--danger); font-weight:bold; font-size:1.15rem; margin-bottom:8px;">
          2차 퀴즈 오답입니다. (정답: ${corrAns})
        </div>
        <div>1차 퀴즈 정답 보상인 [힌트 1]만 제공됩니다.</div>
        <div style="margin-top:6px;">${quiz.explain}</div>
      `;
      updateHintDisplay();
      closeQuizBtn.style.display = 'inline-block';
      closeQuizBtn.textContent = '확인';
      viewHintBtn.style.display = 'inline-block';
    }
  }
}

closeQuizBtn.addEventListener('click', () => {
  quizModal.style.display = 'none';
});

// Chart.js 꺾은선 그래프 렌더링
let stockChart = null;

const CHART_COLORS = [
  { border: '#2563eb', bg: 'rgba(37, 99, 235, 0.15)' },  // 파랑 (삼성전자 등)
  { border: '#dc2626', bg: 'rgba(220, 38, 38, 0.15)' },  // 빨강 (SK하이닉스 등)
  { border: '#16a34a', bg: 'rgba(22, 163, 74, 0.15)' },  // 초록 (TSMC 등)
  { border: '#d97706', bg: 'rgba(217, 119, 6, 0.15)' },  // 주황 (엔비디아 등)
  { border: '#7c3aed', bg: 'rgba(124, 58, 237, 0.15)' }, // 보라 (ASML 등)
  { border: '#0891b2', bg: 'rgba(8, 145, 178, 0.15)' }   // 청록 (Intel 등)
];

function renderStockChart(companies, changes) {
  const ctx = document.getElementById('stock-chart-canvas');
  if (!ctx) return;

  if (stockChart) {
    stockChart.destroy();
  }

  const defaultChanges = changes || {};

  const datasets = [{
    label: '주가 변동률 (%)',
    data: companies.map(c => defaultChanges[c.id] || 0),
    backgroundColor: companies.map((c, idx) => {
      const val = defaultChanges[c.id] || 0;
      return CHART_COLORS[idx % CHART_COLORS.length].border;
    }),
    borderColor: companies.map((c, idx) => CHART_COLORS[idx % CHART_COLORS.length].border),
    borderWidth: 1,
    borderRadius: 8,
    borderSkipped: false
  }];

  stockChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: companies.map(c => c.name),
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.parsed.y;
              const sign = val > 0 ? '+' : '';
              return `변동률: ${sign}${val}%`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#94a3b8',
            font: {
              family: 'Pretendard',
              size: 12,
              weight: 'bold'
            }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.08)'
          },
          ticks: {
            color: '#94a3b8',
            font: {
              family: 'Pretendard',
              size: 11
            },
            callback: function(value) {
              const sign = value > 0 ? '+' : '';
              return `${sign}${value}%`;
            }
          }
        }
      }
    }
  });
}

// 차트 양 옆 인물 GIF 카운터 및 렌더링
function renderCharacterGifs(companies, changes) {
  const leftPanel = document.getElementById('chart-left-characters');
  const rightPanel = document.getElementById('chart-right-characters');

  if (!leftPanel || !rightPanel) return;

  leftPanel.innerHTML = '';
  rightPanel.innerHTML = '';

  const leftCompanyIds = ['jswtech', 'shcdark', 'lhysemi'];

  companies.forEach(c => {
    const cidLower = (c.id || '').toLowerCase();
    const pct = changes ? (changes[c.id] || 0) : 0;
    const isUp = pct > 0;
    const sign = isUp ? '+' : '';
    const gifFile = `assets/gifs/${cidLower}_${isUp ? 'up' : 'down'}.gif`;

    const card = document.createElement('div');
    card.className = 'character-card';
    card.innerHTML = `
      <div class="character-avatar-wrap">
        <img src="${gifFile}" alt="${c.name}" class="character-gif" 
             onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='block';" />
        <span class="character-fallback-icon" style="display:none;">${isUp ? '🎉' : '😭'}</span>
      </div>
      <div class="character-name">${c.name}</div>
      <div class="character-status ${isUp ? 'status-up' : 'status-down'}">
        ${isUp ? '▲' : '▼'} ${sign}${pct}%
      </div>
    `;

    if (leftCompanyIds.includes(cidLower) || leftPanel.children.length < 3) {
      leftPanel.appendChild(card);
    } else {
      rightPanel.appendChild(card);
    }
  });
}

// 라운드 종료
socket.on('roundEnded', (data) => {
  gameScreen.style.display = 'none';
  resultScreen.style.display = 'block';

  document.getElementById('result-title').textContent = `Round ${data.round} 결과`;

  let changeHtml = '';
  data.companies.forEach(c => {
    const pct = data.changes[c.id] || 0;
    const oldPrice = Math.floor(c.basePrice / (1 + pct / 100)); // 역산
    const colorClass = pct > 0 ? 'price-up' : (pct < 0 ? 'price-down' : '');
    const sign = pct > 0 ? '+' : '';
    changeHtml += `<div><strong>${c.name}:</strong> <span class="${colorClass}">${formatMoney(oldPrice)} ➔ ${formatMoney(c.basePrice)} (${sign}${pct}%)</span></div>`;
  });
  document.getElementById('result-stock-changes').innerHTML = changeHtml;

  // 라운드 종료 시 주식 6개 가격 꺾은선 그래프 및 양 옆 인물 GIF 렌더링
  if (data.companies) {
    renderStockChart(data.companies, data.changes);
    renderCharacterGifs(data.companies, data.changes);
  }

  const sortedPlayers = [...data.players].sort((a, b) => b.totalAsset - a.totalAsset);
  const rankingList = document.getElementById('final-ranking-list');
  rankingList.innerHTML = '';

  sortedPlayers.forEach((p, idx) => {
    const li = document.createElement('li');
    li.className = 'ranking-item';
    li.innerHTML = `<span>${idx + 1}위: ${p.name}</span> <span>${formatMoney(p.totalAsset)}</span>`;
    rankingList.appendChild(li);
  });

  if (isHost) {
    document.getElementById('host-next-round-controls').style.display = 'block';
  } else {
    document.getElementById('guest-next-round-waiting').style.display = 'block';
  }
});

// 다음 라운드 버튼
document.getElementById('next-round-btn').addEventListener('click', () => {
  socket.emit('nextRound', { roomId: currentRoom });
  document.getElementById('host-next-round-controls').style.display = 'none';
});

// 최종 게임 오버
socket.on('gameOver', (players) => {
  gameScreen.style.display = 'none';
  resultScreen.style.display = 'block';

  localStorage.removeItem('roomId'); // 게임 종료 시 세션 삭제

  document.getElementById('result-title').textContent = `🎉 게임 종료! 최종 랭킹 🎉`;
  document.getElementById('result-stock-changes').innerHTML = '';
  document.getElementById('host-next-round-controls').style.display = 'none';
  document.getElementById('guest-next-round-waiting').style.display = 'none';

  const sortedPlayers = [...players].sort((a, b) => b.totalAsset - a.totalAsset);
  const rankingList = document.getElementById('final-ranking-list');
  rankingList.innerHTML = '';

  sortedPlayers.forEach((p, idx) => {
    const li = document.createElement('li');
    li.className = `ranking-item ${idx === 0 ? 'first-place' : ''}`;
    li.innerHTML = `<span>${idx === 0 ? '🏆 ' : ''}${idx + 1}위: ${p.name}</span> <span>${formatMoney(p.totalAsset)}</span>`;
    rankingList.appendChild(li);
  });
});

// 스킵 버튼 클릭 이벤트
skipRoundBtn.addEventListener('click', () => {
  if (skipRoundBtn.disabled || hasVotedCurrentRound) return;
  
  socket.emit('voteSkip', { roomId: currentRoom });
  hasVotedCurrentRound = true;
  skipRoundBtn.classList.add('voted');
  skipRoundBtn.disabled = true;
});

// 스킵 현황 업데이트 수신
socket.on('skipStatusUpdated', ({ votedCount, totalCount }) => {
  skipVotedStatus = { votedCount, totalCount };
});

// 라운드 스킵 완료 알림 및 8초 자동 카운트다운 시작
socket.on('roundSkipped', ({ nextRoundIn }) => {
  // 결과 화면의 컨트롤 숨김 처리 (자동으로 넘어가므로 불필요)
  document.getElementById('host-next-round-controls').style.display = 'none';
  document.getElementById('guest-next-round-waiting').style.display = 'none';
  
  const noticeEl = document.getElementById('auto-next-round-notice');
  const timerEl = document.getElementById('auto-next-timer');
  
  noticeEl.style.display = 'block';
  
  let timeLeft = nextRoundIn;
  timerEl.textContent = timeLeft;
  
  if (skipCountdownInterval) clearInterval(skipCountdownInterval);
  skipCountdownInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft <= 0) {
      clearInterval(skipCountdownInterval);
      skipCountdownInterval = null;
    } else {
      timerEl.textContent = timeLeft;
    }
  }, 1000);
});


// News Banner Container
const newsBannerContainer = document.getElementById('news-banner-container');

socket.on('breakingNews', (data) => {
  // 주가 및 내 자산 갱신
  renderStocks(data.companies, data.players);
  renderPlayers(data.players);

  // 개별 특보 배너 동적 생성
  const banner = document.createElement('div');
  banner.className = 'news-banner ' + (data.news.type === 'good' ? 'good-news' : 'bad-news');
  
  // 인라인 스타일로 개별 배너 배치 최적화 (가로폭 100%, 상대 위치 등)
  banner.style.position = 'relative';
  banner.style.top = 'auto';
  banner.style.left = 'auto';
  banner.style.transform = 'none';
  banner.style.width = '100%';
  banner.style.pointerEvents = 'auto';

  banner.innerHTML = `
    <div class="news-content">
      <span class="news-icon">🚨</span>
      <span class="news-text">${data.news.text}</span>
      <span class="news-impact">주가 ${data.impact > 0 ? "+" : ""}${data.impact}%</span>
    </div>
  `;

  newsBannerContainer.appendChild(banner);

  // 7초 후 제거
  setTimeout(() => {
    banner.style.opacity = '0';
    banner.style.transform = 'scale(0.95)';
    banner.style.transition = 'all 0.4s ease';
    setTimeout(() => {
      banner.remove();
    }, 400);
  }, 7000);
});
