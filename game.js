// game.js - 반도체 모의투자 멀티플레이어 클라이언트

const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? ''
  : 'https://encoding-stock.onrender.com';

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

let pastBreakingNews = [];
let allOverallRankings = [];

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

// Turn HUD
const turnHud = document.getElementById('turn-hud');
const activeTurnPlayerEl = document.getElementById('active-turn-player');
const turnTimerDisplayEl = document.getElementById('turn-timer-display');
const skipTurnBtn = document.getElementById('skip-turn-btn');

// Quiz
const quizModal = document.getElementById('quiz-modal');
const quizQuestion = document.getElementById('quiz-question');
const quizOptions = document.getElementById('quiz-options');
const quizResult = document.getElementById('quiz-result');
const quizExplain = document.getElementById('quiz-explain');
const closeQuizBtn = document.getElementById('close-quiz-btn');

// Items Card
const myItemsCard = document.getElementById('my-items-card');
const itemsListEl = document.getElementById('items-list');

// Chart.js 단일 그래프용 변수
let singleStockChart = null;

// 유틸리티
function formatMoney(num) {
  return new Intl.NumberFormat('ko-KR').format(num) + '원';
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentRoom) {
    socket.emit('requestSync', { roomId: currentRoom });
  }
});

socket.on('connect', () => {
  connectionStatus.textContent = '서버 연결 완료!';
  connectionStatus.style.color = 'var(--success)';
  socket.emit('getRoomList');

  const savedRoom = localStorage.getItem('roomId');
  if (savedRoom) {
    socket.emit('rejoinRoom', { roomId: savedRoom, playerId: myPlayerId });
  }
});

createRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || 'Player';
  const password = adminPasswordInput.value.trim();
  if (!password) {
    alert('방을 생성하려면 관리자 비밀번호를 입력해주세요.');
    return;
  }
  socket.emit('createRoom', { playerName: name, adminPassword: password, playerId: myPlayerId });
});

joinRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || 'Player';
  const code = roomCodeInput.value.trim().toUpperCase();
  if (code.length === 4) {
    socket.emit('joinRoom', { roomId: code, playerName: name, playerId: myPlayerId });
  } else {
    alert('4자리 방 코드를 입력하세요.');
  }
});

socket.on('roomCreated', ({ roomId, player }) => {
  me = player;
  currentRoom = roomId;
  isHost = true;
  localStorage.setItem('roomId', roomId);
  showRoomScreen();
  hostControls.style.display = 'block';
});

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
  alert('📢 새로고침 복구 완료');
  window.location.reload();
});

socket.on('disconnect', () => {
  connectionStatus.textContent = '서버와 연결이 끊어졌습니다. 재연결 중...';
  connectionStatus.style.color = 'var(--danger)';
});

// 재접속 시 복구
socket.on('rejoinedRoom', ({ roomId, player, room, overallRankings }) => {
  me = player;
  currentRoom = roomId;
  isHost = (room.host === myPlayerId);
  localStorage.setItem('roomId', roomId);
  if (overallRankings) allOverallRankings = overallRankings;

  if (room.status === 'lobby') {
    showRoomScreen();
    if (isHost) {
      hostControls.style.display = 'block';
      guestWaiting.style.display = 'none';
    } else {
      hostControls.style.display = 'none';
      guestWaiting.style.display = 'block';
    }
  } else {
    loginScreen.style.display = 'none';
    roomScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    setupRound({ scenario: room.scenario, companies: room.companies, players: room.players, round: room.round }, true);
  }
});

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
    li.innerHTML = `<strong>${r.hostName}님의 서버</strong> <span style="font-size:0.8rem; color:#aaa;">(${r.playerCount}/${r.maxPlayers}명)</span>`;
    li.addEventListener('click', () => {
      roomCodeInput.value = r.id;
    });
    liveRoomList.appendChild(li);
  });
});

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

startGameBtn.addEventListener('click', () => {
  const randomScenario = window.SCENARIOS[Math.floor(Math.random() * window.SCENARIOS.length)];
  socket.emit('startGame', { roomId: currentRoom, scenarioId: randomScenario.id });
});

socket.on('gameStarted', (data) => {
  if (data.overallRankings) allOverallRankings = data.overallRankings;
  setupRound(data);
});

socket.on('roundStarted', (data) => {
  setupRound(data);
});

let skipVotedStatus = { votedCount: 0, totalCount: 0 };
let hasVotedCurrentRound = false;

function setupRound(data, isReconnect = false) {
  pushGameState();
  loginScreen.style.display = 'none';
  roomScreen.style.display = 'none';
  resultScreen.style.display = 'none';
  gameScreen.style.display = 'block';
  viewHintBtn.style.display = 'none';

  hasVotedCurrentRound = false;
  skipRoundBtn.disabled = true;
  skipRoundBtn.classList.remove('voted');
  skipRoundBtn.style.display = data.round === 1 ? 'block' : 'none'; // 1라운드에만 전원 스킵투표 표시

  document.getElementById('auto-next-round-notice').style.display = 'none';
  if (skipCountdownInterval) {
    clearInterval(skipCountdownInterval);
    skipCountdownInterval = null;
  }

  if (data.scenario) scenarioTitle.textContent = data.scenario.title;
  roundIndicator.textContent = `Round ${data.round} / 5`;

  // 4라운드에만 아이템 슬롯 노출
  if (data.round === 4) {
    myItemsCard.style.display = 'block';
  } else {
    myItemsCard.style.display = 'none';
  }

  // 턴 HUD 초기화
  if (data.round >= 2) {
    turnHud.style.display = 'flex';
  } else {
    turnHud.style.display = 'none';
  }

  renderPlayers(data.players);
  renderStocks(data.companies, data.players, data.round);
  updateItemsDisplay(data.players);

  if (!isReconnect) {
    showHintQuizSystem(data);
  }
}

// 힌트 및 2회 퀴즈 시스템
let selectedHints = []; // 유저가 해금한 힌트 리스트 { companyName, hint }
let currentRoundScenario = null;
let currentRoundNumber = 1;
let selectedCompanyIdsForQuiz = [];

function showHintQuizSystem(data) {
  currentRoundScenario = data.scenario;
  currentRoundNumber = data.round;
  selectedHints = [];
  selectedCompanyIdsForQuiz = [];

  // 미니게임 예외: 2라운드 시 퀴즈 모달이 아니라 불량 칩 미니게임 실행
  if (data.round === 2) {
    showMiniGameModal(data);
    return;
  }

  // 1단계: 힌트 선택 화면
  showHintSelectionScreen();
}

// 회사별 무지개색 & 서휘찬회사 검정색 고정 맵핑 (corefab, nextmemory, nanodesign, gwangseong, chemicalwave, packagingworld)
const COMPANY_COLORS = {
  'corefab': '#000000',
  'nextmemory': '#ef4444',
  'nanodesign': '#f97316',
  'gwangseong': '#22c55e',
  'chemicalwave': '#3b82f6',
  'packagingworld': '#8b5cf6'
};

// 브라우저 뒤로가기 / 새로고침 시 홈화면 이동 복구 및 1인 플레이 편리성 지원
window.addEventListener('popstate', (event) => {
  localStorage.removeItem('roomId');
  window.location.href = '/';
});

function pushGameState() {
  if (window.history.state !== 'playing') {
    window.history.pushState('playing', '', window.location.pathname + '?room=' + (currentRoom || ''));
  }
}

function showHintSelectionScreen() {
  document.getElementById('quiz-modal-title').textContent = `💡 라운드 힌트 시작 선택`;
  document.getElementById('quiz-modal-desc').textContent = '라운드를 시작하기 전, 6개 주식 중 힌트를 보고 싶은 회사를 1개 선택하세요!';
  
  quizQuestion.style.display = 'none';
  quizOptions.innerHTML = '';
  quizResult.style.display = 'none';
  document.getElementById('quiz-hint-box').style.display = 'none';
  closeQuizBtn.style.display = 'none';
  quizModal.style.display = 'flex';

  // 3개 / 3개 중앙 정렬을 위한 컨테이너 클래스 지정
  quizOptions.className = 'quiz-options hint-cards-container';

  window.COMPANIES.forEach(c => {
    const cardColor = COMPANY_COLORS[c.id] || '#ffffff';
    const card = document.createElement('div');
    card.className = 'hint-card';
    card.style.borderColor = cardColor;
    
    // 카드 내부 구성 (앞면: 선택 유도, 뒷면: 회사이름)
    card.innerHTML = `
      <div class="hint-card-inner">
        <div class="hint-card-front" style="background: rgba(255, 255, 255, 0.05); border: 2px solid ${cardColor};">
          <span style="font-size: 2rem;">❓</span>
          <span style="font-size: 0.85rem; margin-top: 5px; color: var(--text-muted);">HINT</span>
        </div>
        <div class="hint-card-back" style="background: ${cardColor}; color: ${cardColor === '#000000' || cardColor === '#ef4444' || cardColor === '#8b5cf6' ? '#ffffff' : '#000000'};">
          <div class="hint-card-name">${c.name}</div>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      // 선택한 회사의 힌트 즉시 해금
      const activeRoundData = currentRoundScenario.rounds.find(r => r.round === currentRoundNumber);
      const rawHint = activeRoundData?.companyHints[c.id] || "힌트가 없습니다.";
      
      selectedHints.push({ companyName: c.name, hint: rawHint, color: cardColor });
      selectedCompanyIdsForQuiz.push(c.id);

      // 다음 1차 퀴즈로 진행
      startHintQuizStage(1);
    });
    quizOptions.appendChild(card);
  });
}

function startHintQuizStage(stage) {
  // 클래스 복구
  quizOptions.className = 'quiz-options';
  
  let qCandidates = window.QUIZ_BANK;
  const qIdx = Math.floor(Math.random() * qCandidates.length);
  const quizObj = qCandidates[qIdx];

  const stageBadgeText = stage === 1 ? '📝 [퀴즈 1/2] 힌트 추가 해금 도전!' : '🔥 [퀴즈 2/2] 마지막 힌트 추가 해금 도전!';
  document.getElementById('quiz-modal-title').innerHTML = `<span class="quiz-step-badge">${stageBadgeText}</span><br>상식 퀴즈`;
  document.getElementById('quiz-modal-desc').textContent = quizObj.question;

  quizQuestion.style.display = 'none';
  quizOptions.innerHTML = '';
  quizResult.style.display = 'none';

  if (quizObj.type === 'OX') {
    ['O', 'X'].forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.addEventListener('click', () => submitRoundQuiz(quizObj, opt, stage));
      quizOptions.appendChild(btn);
    });
  } else {
    quizObj.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.addEventListener('click', () => submitRoundQuiz(quizObj, idx, stage));
      quizOptions.appendChild(btn);
    });
  }
}

function submitRoundQuiz(quiz, selected, stage) {
  const isCorrect = (quiz.answer === selected);
  quizOptions.innerHTML = '';
  quizResult.style.display = 'block';

  if (isCorrect) {
    // 맞췄을 때 힌트를 획득할 회사 선택하게 함
    quizExplain.innerHTML = `<span style="color:var(--success); font-weight:bold;">정답입니다!</span><br>${quiz.explain}<br><br><strong>힌트를 열람할 추가 회사를 선택하세요:</strong>`;
    
    // 아직 고르지 않은 회사 필터링
    window.COMPANIES.forEach(c => {
      if (!selectedCompanyIdsForQuiz.includes(c.id)) {
        const btn = document.createElement('button');
        btn.textContent = c.name;
        btn.style.margin = '5px';
        btn.addEventListener('click', () => {
          const activeRoundData = currentRoundScenario.rounds.find(r => r.round === currentRoundNumber);
          const rawHint = activeRoundData?.companyHints[c.id] || "힌트가 없습니다.";
          const cardColor = COMPANY_COLORS[c.id] || '#ffffff';
          selectedHints.push({ companyName: c.name, hint: rawHint, color: cardColor });
          selectedCompanyIdsForQuiz.push(c.id);

          if (stage === 1) {
            startHintQuizStage(2);
          } else {
            showFinalQuizHintsSummary();
          }
        });
        quizExplain.appendChild(btn);
      }
    });
  } else {
    // 틀렸을 경우 즉시 퀴즈 종료 (더 이상 퀴즈 기회 없음)
    quizExplain.innerHTML = `<span style="color:var(--danger); font-weight:bold;">오답입니다.</span> (정답: ${quiz.type === 'OX' ? quiz.answer : quiz.options[quiz.answer]})<br>${quiz.explain}`;
    
    const finishBtn = document.createElement('button');
    finishBtn.textContent = '획득한 힌트 확인하기';
    finishBtn.style.marginTop = '15px';
    finishBtn.addEventListener('click', () => {
      showFinalQuizHintsSummary();
    });
    quizExplain.appendChild(finishBtn);
  }
}

function showFinalQuizHintsSummary() {
  document.getElementById('quiz-modal-title').textContent = '💡 획득한 독점 힌트 목록';
  document.getElementById('quiz-modal-desc').textContent = '이번 라운드에 수집한 정보들입니다.';
  quizOptions.innerHTML = '';
  quizQuestion.style.display = 'none';
  quizResult.style.display = 'block';

  // 힌트 가시성 개선: 하얀배경에 검정글씨 보색, 컴퍼니 컬러 보더 강조
  let summaryHtml = '<div style="display:flex; flex-direction:column; gap:12px; text-align:left;">';
  selectedHints.forEach((sh, idx) => {
    summaryHtml += `
      <div style="background:#ffffff; color:#000000; padding:15px; border-radius:10px; border-left:8px solid ${sh.color}; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">
        <strong style="color:${sh.color}; font-size:1.1rem;">[${sh.companyName}] 힌트</strong>
        <p style="margin-top:8px; line-height: 1.5; font-size:1.05rem; font-weight:600;">${sh.hint}</p>
      </div>
    `;
  });
  summaryHtml += '</div>';

  quizExplain.innerHTML = summaryHtml;
  closeQuizBtn.style.display = 'block';
  closeQuizBtn.textContent = '확인 (거래 개시)';
  viewHintBtn.style.display = 'inline-block';
}

closeQuizBtn.addEventListener('click', () => {
  quizModal.style.display = 'none';
});

viewHintBtn.addEventListener('click', () => {
  showFinalQuizHintsSummary();
  closeQuizBtn.textContent = '닫기';
  quizModal.style.display = 'flex';
});

// 지나간 긴급속보 보기 버튼 및 팝업 연동
const viewPastNewsBtn = document.getElementById('view-past-news-btn');
const pastNewsModal = document.getElementById('past-news-modal');
const pastNewsList = document.getElementById('past-news-list');

viewPastNewsBtn.addEventListener('click', () => {
  pastNewsList.innerHTML = '';
  if (pastBreakingNews.length === 0) {
    pastNewsList.innerHTML = '<span style="color:var(--text-muted);">발생한 긴급속보가 없습니다.</span>';
  } else {
    pastBreakingNews.forEach(sch => {
      const item = document.createElement('div');
      item.style.padding = '10px';
      item.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
      item.innerHTML = `
        <div style="color:var(--danger); font-weight:bold; font-size:0.9rem;">[${sch.timestamp}] 긴급 속보</div>
        <div style="color:white; margin-top:3px;">${sch.news.text}</div>
        <div style="color:#fbbf24; font-size:0.85rem; margin-top:2px;">영향: 주가 ${sch.impact > 0 ? "+" : ""}${sch.impact}%</div>
      `;
      pastNewsList.appendChild(item);
    });
  }
  pastNewsModal.style.display = 'flex';
});

// 타이머 및 턴 진행 이벤트들 수신
socket.on('timerUpdate', (time) => {
  const m = Math.floor(time / 60).toString().padStart(2, '0');
  const s = (time % 60).toString().padStart(2, '0');
  timerDisplay.textContent = `${m}:${s}`;
});

// 2라운드 이상 턴 진행 타이머 수신
socket.on('turnStarted', ({ activePlayerId, turnTimer, turnOrder, activePlayerIndex }) => {
  // 현재 턴 플레이어 이름 표시
  const pName = lobbyPlayers.children[activePlayerIndex]?.textContent.split(' ')[0] || '-';
  activeTurnPlayerEl.textContent = pName + (activePlayerId === myPlayerId ? ' (나)' : '');
  turnTimerDisplayEl.textContent = turnTimer;

  // 15초 대기 룰에 따라 스킵버튼 제어
  skipTurnBtn.disabled = true;
  skipTurnBtn.textContent = '턴 넘기기 (15초 대기)';

  // 본인 턴인 경우 강조
  if (activePlayerId === myPlayerId) {
    turnHud.style.borderColor = '#fbbf24';
    turnHud.style.background = 'rgba(251, 191, 36, 0.1)';
  } else {
    turnHud.style.borderColor = '#3b82f6';
    turnHud.style.background = 'rgba(59, 130, 246, 0.15)';
  }
});

socket.on('turnTimerUpdate', ({ time, elapsed }) => {
  turnTimerDisplayEl.textContent = time;

  const activeId = activeTurnPlayerEl.textContent.includes('(나)');
  if (activeId) {
    if (elapsed < 15) {
      skipTurnBtn.disabled = true;
      skipTurnBtn.textContent = `턴 넘기기 (${15 - elapsed}초 대기)`;
    } else {
      skipTurnBtn.disabled = false;
      skipTurnBtn.textContent = '턴 넘기기';
    }
  } else {
    skipTurnBtn.disabled = true;
    skipTurnBtn.textContent = '턴 대기 중';
  }
});

skipTurnBtn.addEventListener('click', () => {
  socket.emit('skipMyTurn', { roomId: currentRoom });
});

socket.on('updatePlayers', (players) => {
  renderPlayers(players);
  updateItemsDisplay(players);
  // 보유 수량 리프레시
  const myData = players.find(p => p.id === myPlayerId);
  if (myData) {
    window.COMPANIES.forEach(c => {
      const shareEl = document.getElementById(`share-${c.id}`);
      if (shareEl) {
        const countEl = shareEl.querySelector('.shares-count');
        if (countEl) countEl.textContent = `${myData.shares[c.id]}주`;
      }
    });
  }
});

socket.on('updateCompanies', (companies) => {
  companies.forEach(c => {
    const target = window.COMPANIES.find(orig => orig.id === c.id);
    if (target) {
      target.basePrice = c.basePrice;
    }
  });
  if (currentRoom) {
    renderStocks(companies, [me], currentRoundNumber);
  }
});

// 아이템 목록 렌더링 및 사용
function updateItemsDisplay(players) {
  const myData = players.find(p => p.id === myPlayerId);
  if (!myData || !itemsListEl) return;

  itemsListEl.innerHTML = '';
  if (!myData.items || myData.items.length === 0) {
    itemsListEl.innerHTML = '<span style="color:var(--text-muted); font-size:0.9rem;">보유한 아이템이 없습니다.</span>';
    return;
  }

  myData.items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'glass';
    div.style.padding = '10px';
    div.style.borderRadius = '8px';
    div.style.border = '1px solid #fbbf24';
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.alignItems = 'center';
    div.style.gap = '10px';

    div.innerHTML = `
      <div style="text-align:left;">
        <strong style="color:#fbbf24;">${item.name}</strong>
        <p style="font-size:0.8rem; color:#ccc; margin-top:2px;">${item.desc}</p>
      </div>
      <button class="use-item-btn btn" data-id="${item.id}" style="padding:6px 12px; font-size:0.8rem; background:#fbbf24; color:black; font-weight:bold; border-radius:4px;">사용</button>
    `;

    div.querySelector('.use-item-btn').addEventListener('click', () => {
      triggerItemUsage(item.id);
    });

    itemsListEl.appendChild(div);
  });
}

function triggerItemUsage(itemId) {
  if (itemId === 'distorted') {
    // 왜곡된 진실 타겟 선택 모달 오픈
    const selectP = document.getElementById('item-target-player');
    selectP.innerHTML = '';
    
    // 나를 제외한 플레이어들
    lobbyPlayers.querySelectorAll('li').forEach((li, idx) => {
      // lobbyPlayers 순서대로 파싱 또는 소켓 정보 복사
    });

    // 소켓 데이터를 바탕으로 플레이어 로드
    // 여기서는 간단하게 select option 구성
    socket.emit('requestSync', { roomId: currentRoom });
    
    // 임시로 prompt 사용 가능하나 모달로 바인딩
    const playerSelect = document.getElementById('item-target-player');
    playerSelect.innerHTML = '';
    me = me || { id: myPlayerId };
    
    // server.js updates updateLobby or updatePlayers
    // players 전역에서 가져와서 select 구성
    const sortedLi = document.getElementById('lobby-players').querySelectorAll('li');
    // fallback option
    const option = document.createElement('option');
    option.value = myPlayerId;
    option.textContent = "자기 자신 (또는 테스트)";
    playerSelect.appendChild(option);
    
    document.getElementById('item-use-modal').style.display = 'flex';
    
    document.getElementById('confirm-use-item-btn').onclick = () => {
      const targetPlayerId = playerSelect.value;
      const targetRound = document.getElementById('item-target-round').value;
      socket.emit('useItem', {
        roomId: currentRoom,
        itemId: 'distorted',
        targetPlayerId,
        targetRound
      });
      document.getElementById('item-use-modal').style.display = 'none';
    };
  } else if (itemId === 'monopoly') {
    const compName = prompt("독점할 회사의 영문 ID를 적어주세요 (Jswtech, Shcdark, gardensemi, Soap, Parkjubin, Weclass):");
    if (compName) {
      socket.emit('useItem', {
        roomId: currentRoom,
        itemId: 'monopoly',
        targetCompanyId: compName
      });
    }
  } else {
    // 즉각 사용 가능한 아이템들 (인버스권, 레버리지권, 올클리어)
    if (confirm(`${itemId} 아이템을 즉시 활성화하시겠습니까?`)) {
      socket.emit('useItem', {
        roomId: currentRoom,
        itemId
      });
    }
  }
}

socket.on('allClearHintsUnlocked', ({ round, scenario }) => {
  const activeRoundData = scenario.rounds.find(r => r.round === round);
  let allHintsStr = "🔥 [올 클리어] 이번 라운드 모든 힌트 정보:\n\n";
  for (let cid in activeRoundData.companyHints) {
    const cName = window.COMPANIES.find(c => c.id === cid)?.name || cid;
    allHintsStr += `[${cName}]: ${activeRoundData.companyHints[cid]}\n`;
  }
  alert(allHintsStr);
});

socket.on('systemAlert', (msg) => {
  alert("🔔 [알림] " + msg);
});

socket.on('distortedGainedAlert', ({ playerName }) => {
  alert(`📢 누군가 '왜곡된 진실' 아이템을 획득하였습니다!`);
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

function renderStocks(companies, players, roundNum = 1) {
  stocksPanel.innerHTML = '';
  const myData = players.find(p => p.id === myPlayerId) || me;

  companies.forEach(c => {
    const div = document.createElement('div');
    div.className = 'stock-card glass';

    // 2라운드부터는 현재가 우측 끝에 추이 그래프 버튼 표시
    const graphBtnHtml = roundNum >= 2
      ? `<button class="single-graph-btn" data-id="${c.id}" style="float: right; margin-top: 5px; background: rgba(0,200,255,0.2); border: 1px solid var(--accent); color: var(--text-main); font-size: 0.85rem; cursor: pointer; padding: 4px 8px; border-radius: 6px;">📈 추이</button>`
      : '';

    div.innerHTML = `
      <div style="position:relative;">
        <div class="stock-name">${c.name}</div>
        <div class="stock-desc">${c.desc}</div>
      </div>
      <div class="stock-price-wrapper" style="display: flex; justify-content: space-between; align-items: center; margin: 12px 0;">
        <div class="stock-price" style="margin: 0; font-size: 1.8rem; font-weight: 900;">${formatMoney(c.basePrice)}</div>
        ${graphBtnHtml}
      </div>
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

  // 단일 주식 꺾은선그래프 버튼 핸들러 설정
  document.querySelectorAll('.single-graph-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const cid = e.target.getAttribute('data-id');
      openSingleStockTrend(cid);
    });
  });
}

// 단일 주가 꺾은선그래프 모달 띄우기
function openSingleStockTrend(companyId) {
  const comp = window.COMPANIES.find(c => c.id === companyId);
  if (!comp) return;

  document.getElementById('trend-modal-title').textContent = `📈 [${comp.name}] 주가 라운드별 변동 추이`;
  document.getElementById('stock-trend-modal').style.display = 'flex';

  const canvas = document.getElementById('single-stock-canvas');
  if (singleStockChart) {
    singleStockChart.destroy();
  }

  // 꺾은선그래프 그리기
  const labels = comp.priceHistory ? comp.priceHistory.map((_, i) => `${i}R시작`) : [];
  const data = comp.priceHistory || [comp.basePrice];

  singleStockChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: `${comp.name} 주가 추이`,
        data: data,
        borderColor: '#00c8ff',
        backgroundColor: 'rgba(0, 200, 255, 0.1)',
        borderWidth: 3,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          grid: {
            color: 'rgba(255,255,255,0.08)'
          },
          ticks: {
            color: '#cbd5e1'
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#cbd5e1'
          }
        }
      }
    }
  });
}

// 2라운드 미니게임 모달
const minigameModal = document.getElementById('minigame-modal');
const minigameIframe = document.getElementById('minigame-iframe');

function showMiniGameModal(data) {
  minigameIframe.src = 'yindex.html';
  minigameModal.style.display = 'flex';
}

// 미니게임 완료 결과 리스너
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'MINIGAME_COMPLETE') {
    const score = e.data.score;
    // 800점 이상 힌트 1, 2000점 이상 힌트 2
    selectedHints = [];
    const activeRoundData = currentRoundScenario.rounds.find(r => r.round === 2);
    
    if (score >= 2000) {
      // 힌트 2개 해금
      const keys = Object.keys(activeRoundData.companyHints);
      if (keys.length > 0) {
        selectedHints.push({ companyName: "서휘찬 다크파운드리", hint: activeRoundData.companyHints[keys[0]] });
      }
      if (keys.length > 1) {
        selectedHints.push({ companyName: "정선우 팹리스", hint: activeRoundData.companyHints[keys[1]] });
      }
    } else if (score >= 800) {
      const keys = Object.keys(activeRoundData.companyHints);
      if (keys.length > 0) {
        selectedHints.push({ companyName: "서휘찬 다크파운드리", hint: activeRoundData.companyHints[keys[0]] });
      }
    }

    if (score >= 800) {
      socket.emit('quizSolved', { roomId: currentRoom });
    }
  } else if (e.data && e.data.type === 'MINIGAME_EXIT') {
    minigameModal.style.display = 'none';
    minigameIframe.src = '';
    showFinalQuizHintsSummary();
    closeQuizBtn.textContent = '확인';
  } else if (e.data && e.data.type === 'DRILL_GAME_COMPLETE') {
    // 드릴 게임 완료 점수 전송
    const drillModal = document.getElementById('drillgame-modal');
    drillModal.style.display = 'none';
    document.getElementById('drillgame-iframe').src = '';
    
    socket.emit('drillGameFinished', {
      roomId: currentRoom,
      score: e.data.score
    });
  }
});

// 3라운드 드릴 미니게임 이벤트 리스너
socket.on('startDrillGame', () => {
  const drillModal = document.getElementById('drillgame-modal');
  const drillIframe = document.getElementById('drillgame-iframe');
  
  drillIframe.src = 'drill.html';
  drillModal.style.display = 'flex';
});

// 드릴 게임 승자 소식
socket.on('drillGameWinner', ({ winnerName, score, itemName }) => {
  alert(`🏆 드릴 미션 완료!\n최고 유사율 득점자: ${winnerName} (${score}%)\n보상으로 [${itemName}]을 획득하였습니다!`);
});

// 랜덤박스 오픈 처리
const randomboxModal = document.getElementById('randombox-modal');
const openBoxBtn = document.getElementById('open-box-btn');
const boxAnimationArea = document.getElementById('box-animation-area');
const rolledItemResult = document.getElementById('rolled-item-result');
const rolledItemName = document.getElementById('rolled-item-name');
const rolledItemDesc = document.getElementById('rolled-item-desc');

socket.on('randomBoxRolled', ({ rolls, players }) => {
  const myItem = rolls[myPlayerId];
  if (!myItem) return;

  rolledItemResult.style.display = 'none';
  boxAnimationArea.textContent = '📦';
  boxAnimationArea.style.animation = 'pulse 1.5s infinite';
  openBoxBtn.style.display = 'block';

  randomboxModal.style.display = 'flex';

  openBoxBtn.onclick = () => {
    // 상자 오픈 애니메이션 연출
    boxAnimationArea.textContent = '✨🎁✨';
    boxAnimationArea.style.animation = 'none';
    openBoxBtn.style.display = 'none';
    
    rolledItemName.textContent = myItem.name;
    rolledItemDesc.textContent = myItem.desc;
    rolledItemResult.style.display = 'block';

    // 확인 버튼 생성
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn';
    confirmBtn.style.width = '100%';
    confirmBtn.style.marginTop = '15px';
    confirmBtn.textContent = '아이템 보관함 확인';
    confirmBtn.onclick = () => {
      randomboxModal.style.display = 'none';
      confirmBtn.remove();
      socket.emit('requestSync', { roomId: currentRoom });
    };
    rolledItemResult.appendChild(confirmBtn);
  };
});

// Chart.js 라운드 결과 그래프
let stockChart = null;

const CHART_COLORS = [
  { border: '#2563eb', bg: 'rgba(37, 99, 235, 0.15)' },
  { border: '#dc2626', bg: 'rgba(220, 38, 38, 0.15)' },
  { border: '#16a34a', bg: 'rgba(22, 163, 74, 0.15)' },
  { border: '#d97706', bg: 'rgba(217, 119, 6, 0.15)' },
  { border: '#7c3aed', bg: 'rgba(124, 58, 237, 0.15)' },
  { border: '#0891b2', bg: 'rgba(8, 145, 178, 0.15)' }
];

function renderStockChart(companies, changes) {
  const ctx = document.getElementById('stock-chart-canvas');
  if (!ctx) return;

  if (stockChart) stockChart.destroy();

  const defaultChanges = changes || {};
  const datasets = [{
    label: '주가 변동률 (%)',
    data: companies.map(c => defaultChanges[c.id] || 0),
    backgroundColor: companies.map((c, idx) => CHART_COLORS[idx % CHART_COLORS.length].border),
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
        legend: { display: false },
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
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { family: 'Pretendard', size: 12, weight: 'bold' } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          ticks: {
            color: '#94a3b8',
            font: { family: 'Pretendard', size: 11 },
            callback: function(value) {
              return `${value > 0 ? '+' : ''}${value}%`;
            }
          }
        }
      }
    }
  });
}

function renderCharacterGifs(companies, changes) {
  const leftPanel = document.getElementById('chart-left-characters');
  const rightPanel = document.getElementById('chart-right-characters');

  if (!leftPanel || !rightPanel) return;

  leftPanel.innerHTML = '';
  rightPanel.innerHTML = '';

  const leftCompanyIds = ['jswtech', 'shcdark', 'gardensemi'];

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

  // 긴급속보 보관
  if (data.pastBreakingNews) pastBreakingNews = data.pastBreakingNews;

  document.getElementById('result-title').textContent = `Round ${data.round} 결과`;

  let changeHtml = '';
  data.companies.forEach(c => {
    const pct = data.changes[c.id] || 0;
    const oldPrice = Math.floor(c.basePrice / (1 + pct / 100));
    const colorClass = pct > 0 ? 'price-up' : (pct < 0 ? 'price-down' : '');
    const sign = pct > 0 ? '+' : '';
    changeHtml += `<div><strong>${c.name}:</strong> <span class="${colorClass}">${formatMoney(oldPrice)} ➔ ${formatMoney(c.basePrice)} (${sign}${pct}%)</span></div>`;
  });
  document.getElementById('result-stock-changes').innerHTML = changeHtml;

  if (data.companies) {
    // 꺾은선그래프용 주가 히스토리 갱신
    data.companies.forEach(c => {
      const localC = window.COMPANIES.find(lc => lc.id === c.id);
      if (localC) {
        if (!localC.priceHistory) localC.priceHistory = [localC.basePrice];
        localC.priceHistory.push(c.basePrice);
      }
    });

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

// 최종 게임 종료
socket.on('gameOver', ({ players, overallRankings }) => {
  gameScreen.style.display = 'none';
  resultScreen.style.display = 'block';

  localStorage.removeItem('roomId');

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

  // 누적 랭킹 리스트 출력
  if (overallRankings) {
    allOverallRankings = overallRankings;
  }
  
  showOverallRankingsModal();
});

function showOverallRankingsModal() {
  const tbody = document.getElementById('overall-rankings-body');
  tbody.innerHTML = '';
  allOverallRankings.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 10px 5px;">${idx + 1}위</td>
      <td style="padding: 10px 5px; font-weight:bold;">${r.name}</td>
      <td style="padding: 10px 5px; color:#10b981;">${formatMoney(r.totalAsset)}</td>
      <td style="padding: 10px 5px; color:#aaa; font-size:0.85rem;">${r.date}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('overall-rankings-modal').style.display = 'flex';
}

// 1라운드 스킵 투표 버튼 클릭 이벤트
skipRoundBtn.addEventListener('click', () => {
  if (skipRoundBtn.disabled || hasVotedCurrentRound) return;
  socket.emit('voteSkip', { roomId: currentRoom });
  hasVotedCurrentRound = true;
  skipRoundBtn.classList.add('voted');
  skipRoundBtn.disabled = true;
});

socket.on('skipStatusUpdated', ({ votedCount, totalCount }) => {
  skipVotedStatus = { votedCount, totalCount };
});

socket.on('roundSkipped', ({ nextRoundIn }) => {
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

// 긴급속보
const newsBannerContainer = document.getElementById('news-banner-container');

socket.on('breakingNews', (data) => {
  renderStocks(data.companies, data.players, currentRoundNumber);
  renderPlayers(data.players);
  if (data.pastBreakingNews) pastBreakingNews = data.pastBreakingNews;

  const banner = document.createElement('div');
  banner.className = 'news-banner ' + (data.news.type === 'good' ? 'good-news' : 'bad-news');
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

  setTimeout(() => {
    banner.style.opacity = '0';
    banner.style.transform = 'scale(0.95)';
    banner.style.transition = 'all 0.4s ease';
    setTimeout(() => {
      banner.remove();
    }, 400);
  }, 7000);
});
