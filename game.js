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

// 뒤로가기 버튼 처리 (브라우저/모바일)
function goToLoginScreen() {
  loginScreen.style.display = 'block';
  roomScreen.style.display = 'none';
  gameScreen.style.display = 'none';
  resultScreen.style.display = 'none';
  currentRoom = null;
  me = null;
  localStorage.removeItem('roomId');
  // 힌트/퀴즈 모달 닫기
  if (quizModal) quizModal.style.display = 'none';
  // 방 목록 새로 요청
  socket.emit('getRoomList');
}

window.addEventListener('popstate', (e) => {
  // 게임 또는 방 화면에 있을 때 뒤로가기 → 홈
  const onGameScreen = gameScreen.style.display === 'block';
  const onRoomScreen = roomScreen.style.display === 'block';
  if (onGameScreen || onRoomScreen) {
    goToLoginScreen();
    history.replaceState({ screen: 'home' }, '');
  }
});

// 초기 상태 설정
history.replaceState({ screen: 'home' }, '');


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
  // 재접속 실패 → 로그인 화면으로 (새로고침 없이)
  loginScreen.style.display = 'block';
  roomScreen.style.display = 'none';
  gameScreen.style.display = 'none';
  resultScreen.style.display = 'none';
  currentRoom = null;
  me = null;
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
    pushGameState();
    setupRound({ scenario: room.scenario, companies: room.companies, players: room.players, round: room.round }, true);
    socket.emit('requestSync', { roomId: currentRoom });
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
  window.currentRoomPlayers = players || [];
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
  // 뒤로가기 이벤트를 위한 히스토리 추가
  history.pushState({ screen: 'room' }, '');
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

  const adminBanner = document.getElementById('admin-observer-banner');
  if (adminBanner) {
    adminBanner.style.display = (me && me.isAdmin) ? 'block' : 'none';
  }

  hasVotedCurrentRound = false;
  skipRoundBtn.disabled = false;
  skipRoundBtn.classList.remove('voted');
  if (me && me.isAdmin) {
    skipRoundBtn.style.display = 'block';
    skipRoundBtn.textContent = '⚡ [어드민] 라운드 강제 스킵';
  } else {
    skipRoundBtn.style.display = data.round === 1 ? 'block' : 'none';
    skipRoundBtn.textContent = '⏩ 라운드 스킵 (0/0)';
  }

  document.getElementById('auto-next-round-notice').style.display = 'none';
  if (skipCountdownInterval) {
    clearInterval(skipCountdownInterval);
    skipCountdownInterval = null;
  }

  if (data.scenario) scenarioTitle.textContent = data.scenario.title;
  roundIndicator.textContent = `Round ${data.round} / 5`;

  // 4라운드에만 아이템 슬롯 노출 (어드민 제외)
  if (data.round === 4 && (!me || !me.isAdmin)) {
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

  if (!isReconnect && (!me || !me.isAdmin)) {
    showHintQuizSystem(data);
  }
}

// 힌트 및 2회 퀴즈 시스템
let selectedHints = []; // 유저가 해금한 힌트 리스트 { companyName, hint }
let currentRoundScenario = null;
let currentRoundNumber = 1;
let selectedCompanyIdsForQuiz = [];

function showHintQuizSystem(data) {
  if (me && me.isAdmin) return; // 어드민은 퀴즈 및 힌트 팝업 대상에서 제외

  currentRoundScenario = data.scenario || (window.SCENARIOS && window.SCENARIOS[0]) || null;
  currentRoundNumber = data.round || 1;
  selectedHints = [];
  selectedCompanyIdsForQuiz = [];

  // 미니게임 예외: 2라운드 시 퀴즈 모달이 아니라 불량 칩 미니게임 실행
  if (data.round === 2) {
    showMiniGameModal(data);
    return;
  }

  // 1, 3, 4, 5 라운드 모두 먼저 보고 싶은 기본 힌트 1개 카드를 선택하고 퀴즈를 풀 수 있도록 통일
  showHintSelectionScreen();
}

// 회사별 무지개색 & 서휘찬회사 검정색 고정 맵핑 함수 (대소문자/이름 기반 안전 매핑)
const RAINBOW_PALETTE = ['#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed'];

function getCompanyColor(company) {
  if (!company) return '#2563eb';
  const idLower = (company.id || '').toLowerCase();
  const name = company.name || '';
  
  // 서휘찬 다크파운드리(Shcdark)는 항상 검정색 고정
  if (idLower.includes('shc') || name.includes('서휘찬') || idLower.includes('corefab')) {
    return '#000000';
  }
  if (idLower.includes('jsw') || name.includes('정선우') || idLower.includes('nextmemory')) {
    return '#ef4444'; // 빨강
  }
  if (idLower.includes('garden') || name.includes('서정원') || idLower.includes('nanodesign')) {
    return '#f97316'; // 주황
  }
  if (idLower.includes('soap') || name.includes('이형주') || idLower.includes('gwangseong')) {
    return '#22c55e'; // 초록
  }
  if (idLower.includes('park') || name.includes('박주빈') || idLower.includes('chemicalwave')) {
    return '#3b82f6'; // 파랑
  }
  if (idLower.includes('we') || name.includes('위윤성') || idLower.includes('packagingworld')) {
    return '#8b5cf6'; // 보라
  }
  return '#2563eb';
}

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
  document.getElementById('quiz-modal-title').textContent = `💡 Round ${currentRoundNumber} 힌트 시작 선택`;
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
    const cardColor = getCompanyColor(c);
    const textColor = (cardColor === '#000000' || cardColor === '#ef4444' || cardColor === '#8b5cf6' || cardColor === '#3b82f6') ? '#ffffff' : '#000000';
    const card = document.createElement('div');
    card.className = 'hint-card';
    
    // 카드 내부 구성 (회사이름 즉시 노출)
    card.innerHTML = `
      <div class="hint-card-inner" style="background: ${cardColor}; color: ${textColor}; border: 2.5px solid ${cardColor === '#000000' ? '#ffffff' : '#000000'}; border-radius: 12px; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; height: 100%; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);">
        <div class="hint-card-name" style="font-size: 1.1rem; font-weight: 900;">${c.name}</div>
        <span style="font-size: 0.78rem; margin-top: 6px; opacity: 0.85; font-weight: bold;">💡 힌트 열람</span>
      </div>
    `;

    card.addEventListener('click', () => {
      // 선택한 회사의 힌트 즉시 해금
      const scenarioObj = currentRoundScenario || (window.SCENARIOS && window.SCENARIOS[0]);
      const activeRoundData = scenarioObj?.rounds?.find(r => r.round === currentRoundNumber) || scenarioObj?.rounds?.[(currentRoundNumber - 1) % (scenarioObj?.rounds?.length || 1)];
      const rawHint = activeRoundData?.companyHints ? (activeRoundData.companyHints[c.id] || activeRoundData.companyHints[c.id.toLowerCase()] || Object.entries(activeRoundData.companyHints).find(([k]) => k.toLowerCase() === c.id.toLowerCase())?.[1] || "힌트가 없습니다.") : "힌트가 없습니다.";
      
      selectedHints.push({ companyName: c.name, hint: rawHint, color: cardColor });
      selectedCompanyIdsForQuiz.push(c.id);

      // 힌트 선택 후 퀴즈 1단계로 진행 (맞추면 추가 힌트 카드 선택, 틀리면 종료)
      startHintQuizStage(1);
    });
    quizOptions.appendChild(card);
  });
}

function startHintQuizStage(stage) {
  quizModal.style.display = 'flex';
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
    // 맞췄을 때 힌트를 획득할 회사 선택하게 함 (카드 형태)
    quizExplain.innerHTML = `<span style="color:var(--success); font-weight:bold; font-size:1.1rem;">🎉 정답입니다!</span><br>${quiz.explain}<br><br><strong style="color:var(--accent);">👇 힌트를 열람할 추가 회사를 선택하세요 (앞뒤 3x2 중앙정렬 카드):</strong>`;
    
    const cardContainer = document.createElement('div');
    cardContainer.className = 'hint-cards-container';
    cardContainer.style.marginTop = '15px';
    
    let hasAvailable = false;
    window.COMPANIES.forEach(c => {
      if (!selectedCompanyIdsForQuiz.includes(c.id)) {
        hasAvailable = true;
        const cardColor = getCompanyColor(c);
        const textColor = (cardColor === '#000000' || cardColor === '#ef4444' || cardColor === '#8b5cf6' || cardColor === '#3b82f6') ? '#ffffff' : '#000000';
        const card = document.createElement('div');
        card.className = 'hint-card';
        card.innerHTML = `
          <div class="hint-card-inner" style="background: ${cardColor}; color: ${textColor}; border: 2.5px solid ${cardColor === '#000000' ? '#ffffff' : '#000000'}; border-radius: 12px; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; height: 100%; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);">
            <div class="hint-card-name" style="font-size:1.05rem; font-weight: 900;">${c.name}</div>
            <span style="font-size: 0.75rem; margin-top: 4px; opacity: 0.85; font-weight: bold;">💡 힌트 선택</span>
          </div>
        `;
        card.addEventListener('click', () => {
          const scenarioObj = currentRoundScenario || (window.SCENARIOS && window.SCENARIOS[0]);
          const activeRoundData = scenarioObj?.rounds?.find(r => r.round === currentRoundNumber) || scenarioObj?.rounds?.[(currentRoundNumber - 1) % (scenarioObj?.rounds?.length || 1)];
          const rawHint = activeRoundData?.companyHints ? (activeRoundData.companyHints[c.id] || activeRoundData.companyHints[c.id.toLowerCase()] || Object.entries(activeRoundData.companyHints).find(([k]) => k.toLowerCase() === c.id.toLowerCase())?.[1] || "힌트가 없습니다.") : "힌트가 없습니다.";
          selectedHints.push({ companyName: c.name, hint: rawHint, color: cardColor });
          selectedCompanyIdsForQuiz.push(c.id);

          if (stage === 1) {
            startHintQuizStage(2);
          } else {
            showFinalQuizHintsSummary();
          }
        });
        cardContainer.appendChild(card);
      }
    });
    
    if (hasAvailable) {
      quizExplain.appendChild(cardContainer);
    } else {
      showFinalQuizHintsSummary();
    }
  } else {
    // 틀렸을 경우 즉시 퀴즈 종료 (더 이상 퀴즈 기회 없음)
    quizExplain.innerHTML = `<span style="color:var(--danger); font-weight:bold; font-size:1.1rem;">❌ 오답입니다.</span> (정답: ${quiz.type === 'OX' ? quiz.answer : quiz.options[quiz.answer]})<br>${quiz.explain}`;
    
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

  quizExplain.innerHTML = '<div style="margin-bottom: 10px; font-weight: bold; color: var(--success); font-size:1.05rem;">수집된 힌트 목록:</div>';

  // 가시성 대폭 향상: 흰색 카드 배경에 선명한 흑색 텍스트 & 좌측 굵은 컬러 태그
  const hintBox = document.getElementById('quiz-hint-box');
  hintBox.style.display = 'block';
  
  let summaryHtml = '<div style="display:flex; flex-direction:column; gap:14px; text-align:left; width:100%;">';
  selectedHints.forEach((sh, idx) => {
    summaryHtml += `
      <div style="background: #ffffff; color: #0f172a; padding: 16px 20px; border-radius: 12px; border-left: 10px solid ${sh.color}; border: 1.5px solid #e2e8f0; border-left-width: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.25);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
          <span style="display:inline-block; width:14px; height:14px; border-radius:50%; background:${sh.color}; border:1px solid #000;"></span>
          <strong style="color: #0f172a; font-size: 1.15rem; font-weight: 900;">[${sh.companyName}] 힌트</strong>
        </div>
        <p style="margin: 0; line-height: 1.6; font-size: 1.05rem; font-weight: 700; color: #1e293b;">${sh.hint}</p>
      </div>
    `;
  });
  summaryHtml += '</div>';

  hintBox.innerHTML = summaryHtml;
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

let currentActivePlayerId = null;

// 2라운드 이상 턴 진행 타이머 수신
socket.on('turnStarted', ({ activePlayerId, activePlayerName, turnTimer, turnOrder, activePlayerIndex }) => {
  currentActivePlayerId = activePlayerId;
  // 현재 턴 플레이어 이름 표시 (서버에서 전달된 activePlayerName 또는 플레이어 목록에서 ID로 정확히 조회)
  const isMyTurn = (activePlayerId === myPlayerId);
  const targetPlayer = (window.currentRoomPlayers || []).find(p => p.id === activePlayerId);
  const pName = activePlayerName || (targetPlayer ? targetPlayer.name : (lobbyPlayers.children[activePlayerIndex]?.textContent.split(' ')[0] || '-'));
  activeTurnPlayerEl.textContent = pName + (isMyTurn ? ' (나)' : '');
  turnTimerDisplayEl.textContent = turnTimer;

  // 15초 대기 룰에 따라 스킵버튼 제어
  const isAdminUser = (me && me.isAdmin);
  if (isAdminUser) {
    skipTurnBtn.disabled = false;
    skipTurnBtn.textContent = '⚡ [어드민] 턴 강제 넘기기';
  } else if (isMyTurn) {
    skipTurnBtn.disabled = true;
    skipTurnBtn.textContent = '턴 넘기기 (15초 대기)';
  } else {
    skipTurnBtn.disabled = true;
    skipTurnBtn.textContent = '턴 대기 중';
  }

  // 본인 턴인 경우 강조
  if (isMyTurn) {
    turnHud.style.borderColor = '#fbbf24';
    turnHud.style.background = 'rgba(251, 191, 36, 0.1)';
  } else {
    turnHud.style.borderColor = '#3b82f6';
    turnHud.style.background = 'rgba(59, 130, 246, 0.15)';
  }
});

socket.on('turnTimerUpdate', ({ time, elapsed }) => {
  turnTimerDisplayEl.textContent = time;

  const isMyTurn = (currentActivePlayerId === myPlayerId) || activeTurnPlayerEl.textContent.includes('(나)');
  const isTestUser = (me && me.name === 'TEST') || (isHost && me && me.name === 'TEST');
  const isAdminUser = (me && me.isAdmin);

  if (isAdminUser) {
    skipTurnBtn.disabled = false;
    skipTurnBtn.textContent = '⚡ [어드민] 턴 강제 넘기기';
  } else if (isMyTurn || isTestUser) {
    if (!isTestUser && elapsed < 15) {
      skipTurnBtn.disabled = true;
      skipTurnBtn.textContent = `턴 넘기기 (${15 - elapsed}초 대기)`;
    } else {
      skipTurnBtn.disabled = false;
      skipTurnBtn.textContent = isTestUser ? '⚡ 즉시 턴 넘기기' : '턴 넘기기';
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
  window.currentRoomPlayers = players || [];
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
    const compInput = prompt("독점할 회사의 한글 이름 또는 영문명을 입력해주세요:\n(예: 위윤성, 서휘찬, 이형주, 정선우, 서정원, 박주빈)");
    if (compInput && compInput.trim()) {
      const q = compInput.trim().toLowerCase();
      const matched = window.COMPANIES.find(c => 
        c.name.toLowerCase().includes(q) || 
        c.id.toLowerCase() === q ||
        q.includes(c.name.toLowerCase()) ||
        q.includes(c.id.toLowerCase())
      );
      const targetId = matched ? matched.id : compInput.trim();
      socket.emit('useItem', {
        roomId: currentRoom,
        itemId: 'monopoly',
        targetCompanyId: targetId
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
  window.currentRoomPlayers = players || [];
  const myData = players.find(p => p.id === myPlayerId);
  if (myData) {
    me = myData;
    myNameEl.textContent = me.name;
    myCashEl.textContent = formatMoney(me.cash);
    myTotalAssetEl.textContent = formatMoney(me.totalAsset);
  } else if (me && me.isAdmin) {
    myNameEl.textContent = me.name || '어드민 (관전자)';
    myCashEl.textContent = '- (관전 중)';
    myTotalAssetEl.textContent = '- (관전 중)';
  }

  const sorted = [...players].sort((a, b) => b.totalAsset - a.totalAsset);
  liveRanking.innerHTML = '';
  if (sorted.length === 0) {
    liveRanking.innerHTML = '<li class="ranking-item" style="color:var(--text-muted); font-size:0.9rem;">참여 플레이어가 없습니다.</li>';
  } else {
    sorted.forEach((p, idx) => {
      const li = document.createElement('li');
      li.className = 'ranking-item';
      li.innerHTML = `<span>${idx + 1}위: ${p.name}</span> <span>${formatMoney(p.totalAsset)}</span>`;
      liveRanking.appendChild(li);
    });
  }
}

function renderStocks(companies, players, roundNum = 1) {
  // 현재 입력되어 있는 수량을 먼저 백업해 둠
  const qtyBackup = {};
  companies.forEach(c => {
    const inputEl = document.getElementById(`trade-qty-${c.id}`);
    if (inputEl) {
      qtyBackup[c.id] = inputEl.value;
    }
  });

  stocksPanel.innerHTML = '';
  const myData = players.find(p => p.id === myPlayerId) || (me && !me.isAdmin ? me : null);
  const isObserver = (me && me.isAdmin);

  companies.forEach(c => {
    const div = document.createElement('div');
    div.className = 'stock-card glass';

    // 2라운드부터는 현재가 우측 끝에 추이 그래프 버튼 표시 (flex space-between으로 오른쪽 정렬)
    const graphBtnHtml = roundNum >= 2
      ? `<button class="single-graph-btn" data-id="${c.id}" style="background: rgba(0,200,255,0.15); border: 1px solid var(--accent); color: var(--text-main); font-size: 0.85rem; cursor: pointer; padding: 5px 10px; border-radius: 6px; white-space: nowrap; flex-shrink: 0;">📈 추이</button>`
      : '';

    const savedQty = qtyBackup[c.id] !== undefined ? qtyBackup[c.id] : "1";
    const sharesBadgeHtml = isObserver
      ? `<div class="my-shares-badge" id="share-${c.id}"><span class="shares-label">구분</span><span class="shares-count" style="color:#fbbf24;">관전자</span></div>`
      : `<div class="my-shares-badge" id="share-${c.id}"><span class="shares-label">보유 수량</span><span class="shares-count">${myData ? (myData.shares[c.id] || 0) : 0}주</span></div>`;

    const tradeControlsHtml = isObserver
      ? `<div class="trade-controls" style="justify-content: center; color: #fbbf24; font-weight: bold; font-size: 0.9rem; padding-top: 10px; border-top: 1.5px dashed rgba(255,255,255,0.08);">🛡️ 어드민 관전 모드 (거래 제외)</div>`
      : `
        <div class="trade-controls">
          <span class="qty-label">주문수량</span>
          <input type="number" id="trade-qty-${c.id}" value="${savedQty}" min="1" class="qty-input" />
          <button class="btn-buy" data-id="${c.id}">매수</button>
          <button class="btn-danger btn-sell" data-id="${c.id}">매도</button>
        </div>
      `;

    div.innerHTML = `
      <div style="position:relative;">
        <div class="stock-name">${c.name}</div>
        <div class="stock-desc">${c.desc}</div>
      </div>
      <div class="stock-price-wrapper" style="display: flex; justify-content: space-between; align-items: center; margin: 12px 0; padding: 4px 0;">
        <div class="stock-price" style="margin: 0; font-size: 1.8rem; font-weight: 900; color: #ffffff;">${formatMoney(c.basePrice)}</div>
        ${graphBtnHtml ? `<div style="margin-left: auto;">${graphBtnHtml}</div>` : ''}
      </div>
      ${sharesBadgeHtml}
      ${tradeControlsHtml}
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
      // 힌트 2개 해금 - 실제 companyId로 이름 조회
      const companyIds = Object.keys(activeRoundData.companyHints);
      if (companyIds.length > 0) {
        const cid = companyIds[0];
        const cName = window.COMPANIES.find(c => c.id === cid)?.name || cid;
        const cColor = COMPANY_COLORS[cid] || '#ffffff';
        selectedHints.push({ companyName: cName, hint: activeRoundData.companyHints[cid], color: cColor });
      }
      if (companyIds.length > 1) {
        const cid = companyIds[1];
        const cName = window.COMPANIES.find(c => c.id === cid)?.name || cid;
        const cColor = COMPANY_COLORS[cid] || '#ffffff';
        selectedHints.push({ companyName: cName, hint: activeRoundData.companyHints[cid], color: cColor });
      }
    } else if (score >= 800) {
      const companyIds = Object.keys(activeRoundData.companyHints);
      if (companyIds.length > 0) {
        const cid = companyIds[0];
        const cName = window.COMPANIES.find(c => c.id === cid)?.name || cid;
        const cColor = COMPANY_COLORS[cid] || '#ffffff';
        selectedHints.push({ companyName: cName, hint: activeRoundData.companyHints[cid], color: cColor });
      }
    }

    if (score >= 800) {
      socket.emit('quizSolved', { roomId: currentRoom });
    }
  } else if (e.data && e.data.type === 'MINIGAME_EXIT') {
    minigameModal.style.display = 'none';
    minigameIframe.src = '';
    const score = e.data.score || 0;
    
    // 점수에 따라 카드 선택 기회 제공
    if (score >= 2000) {
      // 2개 선택 가능
      showMinigameCardSelection(2);
    } else if (score >= 800) {
      // 1개 선택 가능
      showMinigameCardSelection(1);
    } else {
      // 800점 미만: 힌트 없음
      showMinigameFailureSummary();
    }
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

function showMinigameCardSelection(allowedCount) {
  selectedHints = [];
  selectedCompanyIdsForQuiz = [];
  
  document.getElementById('quiz-modal-title').textContent = `🎁 미니게임 보상: 힌트 카드 선택 (${allowedCount}개)`;
  document.getElementById('quiz-modal-desc').textContent = `우수한 성적 달성! 6개 회사 카드 중 힌트를 열람할 회사를 선택하세요. (남은 선택: ${allowedCount}개)`;
  
  quizQuestion.style.display = 'none';
  quizOptions.innerHTML = '';
  quizResult.style.display = 'none';
  document.getElementById('quiz-hint-box').style.display = 'none';
  closeQuizBtn.style.display = 'none';
  quizModal.style.display = 'flex';

  quizOptions.className = 'quiz-options hint-cards-container';

  function renderChoices(remaining) {
    quizOptions.innerHTML = '';
    document.getElementById('quiz-modal-desc').textContent = `6개 회사 카드 중 힌트를 열람할 회사를 선택하세요. (남은 선택: ${remaining}개)`;
    
    window.COMPANIES.forEach(c => {
      if (!selectedCompanyIdsForQuiz.includes(c.id)) {
        const cardColor = getCompanyColor(c);
        const textColor = (cardColor === '#000000' || cardColor === '#ef4444' || cardColor === '#8b5cf6' || cardColor === '#3b82f6') ? '#ffffff' : '#000000';
        const card = document.createElement('div');
        card.className = 'hint-card';
        card.innerHTML = `
          <div class="hint-card-inner" style="background: ${cardColor}; color: ${textColor}; border: 2.5px solid ${cardColor === '#000000' ? '#ffffff' : '#000000'}; border-radius: 12px; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; height: 100%; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);">
            <div class="hint-card-name" style="font-size: 1.1rem; font-weight: 900;">${c.name}</div>
            <span style="font-size: 0.78rem; margin-top: 6px; opacity: 0.85; font-weight: bold;">💡 힌트 선택</span>
          </div>
        `;

        card.addEventListener('click', () => {
          const scenarioObj = currentRoundScenario || (window.SCENARIOS && window.SCENARIOS[0]);
          const activeRoundData = scenarioObj?.rounds?.find(r => r.round === 2) || scenarioObj?.rounds?.[1] || scenarioObj?.rounds?.[0];
          const rawHint = activeRoundData?.companyHints ? (activeRoundData.companyHints[c.id] || activeRoundData.companyHints[c.id.toLowerCase()] || Object.entries(activeRoundData.companyHints).find(([k]) => k.toLowerCase() === c.id.toLowerCase())?.[1] || "힌트가 없습니다.") : "힌트가 없습니다.";
          
          selectedHints.push({ companyName: c.name, hint: rawHint, color: cardColor });
          selectedCompanyIdsForQuiz.push(c.id);

          const nextRemaining = remaining - 1;
          if (nextRemaining > 0) {
            renderChoices(nextRemaining);
          } else {
            // 2라운드 미니게임 카드 선택 완료 후 퀴즈 1회 도전 제공
            startPostMinigameQuiz();
          }
        });
        quizOptions.appendChild(card);
      }
    });
  }

  renderChoices(allowedCount);
}

function showMinigameFailureSummary() {
  document.getElementById('quiz-modal-title').textContent = '⚠️ 미니게임 결과';
  document.getElementById('quiz-modal-desc').textContent = '검사 점수가 800점 미만으로 미니게임 힌트 획득에 실패하였습니다.';
  quizOptions.innerHTML = '';
  quizQuestion.style.display = 'none';
  quizResult.style.display = 'block';

  quizExplain.innerHTML = '<div style="color:var(--warning); font-weight:bold; font-size:1.05rem; margin-bottom:15px;">하지만 상식 퀴즈를 맞추면 힌트를 1개 만회할 수 있습니다!</div>';
  const hintBox = document.getElementById('quiz-hint-box');
  hintBox.style.display = 'none';

  closeQuizBtn.style.display = 'block';
  closeQuizBtn.textContent = '퀴즈 풀고 힌트 도전하기';
  closeQuizBtn.onclick = () => {
    closeQuizBtn.onclick = null;
    startPostMinigameQuiz();
  };
  quizModal.style.display = 'flex';
}

function startPostMinigameQuiz() {
  quizOptions.className = 'quiz-options';
  let qCandidates = window.QUIZ_BANK;
  const qIdx = Math.floor(Math.random() * qCandidates.length);
  const quizObj = qCandidates[qIdx];

  document.getElementById('quiz-modal-title').innerHTML = `<span class="quiz-step-badge">📝 [보너스 퀴즈] 힌트 추가 해금 도전!</span><br>상식 퀴즈`;
  document.getElementById('quiz-modal-desc').textContent = quizObj.question;

  quizQuestion.style.display = 'none';
  quizOptions.innerHTML = '';
  quizResult.style.display = 'none';
  closeQuizBtn.style.display = 'none';

  if (quizObj.type === 'OX') {
    ['O', 'X'].forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.addEventListener('click', () => submitPostMinigameQuiz(quizObj, opt));
      quizOptions.appendChild(btn);
    });
  } else {
    quizObj.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.addEventListener('click', () => submitPostMinigameQuiz(quizObj, idx));
      quizOptions.appendChild(btn);
    });
  }
}

function submitPostMinigameQuiz(quiz, selected) {
  const isCorrect = (quiz.answer === selected);
  quizOptions.innerHTML = '';
  quizResult.style.display = 'block';

  if (isCorrect) {
    quizExplain.innerHTML = `<span style="color:var(--success); font-weight:bold; font-size:1.1rem;">🎉 정답입니다!</span><br>${quiz.explain}<br><br><strong style="color:var(--accent);">👇 힌트를 열람할 회사를 1개 선택하세요:</strong>`;
    
    const cardContainer = document.createElement('div');
    cardContainer.className = 'hint-cards-container';
    cardContainer.style.marginTop = '15px';
    
    let hasAvailable = false;
    window.COMPANIES.forEach(c => {
      if (!selectedCompanyIdsForQuiz.includes(c.id)) {
        hasAvailable = true;
        const cardColor = getCompanyColor(c);
        const textColor = (cardColor === '#000000' || cardColor === '#ef4444' || cardColor === '#8b5cf6' || cardColor === '#3b82f6') ? '#ffffff' : '#000000';
        const card = document.createElement('div');
        card.className = 'hint-card';
        card.innerHTML = `
          <div class="hint-card-inner" style="background: ${cardColor}; color: ${textColor}; border: 2.5px solid ${cardColor === '#000000' ? '#ffffff' : '#000000'}; border-radius: 12px; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; height: 100%; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);">
            <div class="hint-card-name" style="font-size:1.05rem; font-weight: 900;">${c.name}</div>
            <span style="font-size: 0.75rem; margin-top: 4px; opacity: 0.85; font-weight: bold;">💡 힌트 선택</span>
          </div>
        `;
        card.addEventListener('click', () => {
          const scenarioObj = currentRoundScenario || (window.SCENARIOS && window.SCENARIOS[0]);
          const activeRoundData = scenarioObj?.rounds?.find(r => r.round === 2) || scenarioObj?.rounds?.[1] || scenarioObj?.rounds?.[0];
          const rawHint = activeRoundData?.companyHints ? (activeRoundData.companyHints[c.id] || activeRoundData.companyHints[c.id.toLowerCase()] || Object.entries(activeRoundData.companyHints).find(([k]) => k.toLowerCase() === c.id.toLowerCase())?.[1] || "힌트가 없습니다.") : "힌트가 없습니다.";
          selectedHints.push({ companyName: c.name, hint: rawHint, color: cardColor });
          selectedCompanyIdsForQuiz.push(c.id);

          showFinalQuizHintsSummary();
        });
        cardContainer.appendChild(card);
      }
    });
    
    if (hasAvailable) {
      quizExplain.appendChild(cardContainer);
    } else {
      showFinalQuizHintsSummary();
    }
  } else {
    quizExplain.innerHTML = `<span style="color:var(--danger); font-weight:bold; font-size:1.1rem;">❌ 오답입니다.</span> (정답: ${quiz.type === 'OX' ? quiz.answer : quiz.options[quiz.answer]})<br>${quiz.explain}`;
    
    const finishBtn = document.createElement('button');
    finishBtn.textContent = '획득한 힌트 확인하기';
    finishBtn.style.marginTop = '15px';
    finishBtn.addEventListener('click', () => {
      showFinalQuizHintsSummary();
    });
    quizExplain.appendChild(finishBtn);
  }
}

// 3라운드 드릴 미니게임 이벤트 리스너
socket.on('startDrillGame', () => {
  if (me && me.isAdmin) return; // 어드민은 미니게임 대상에서 제외
  const drillModal = document.getElementById('drillgame-modal');
  const drillIframe = document.getElementById('drillgame-iframe');
  
  drillIframe.src = 'drill.html';
  drillModal.style.display = 'flex';
});

// 드릴 게임 승자 소식 (alert 대신 콘솔 로그 또는 자연스럽게 랜덤박스로 진행)
socket.on('drillGameWinner', ({ winnerName, score, itemName }) => {
  console.log(`드릴 미션 완료 - 최고 유사율: ${winnerName} (${score}%), 보상: [${itemName}]`);
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
    
    if (myItem.id === 'distorted') {
      confirmBtn.textContent = '🌀 왜곡 대상 설정하기 (필수)';
      confirmBtn.style.background = '#8b5cf6';
      confirmBtn.onclick = () => {
        randomboxModal.style.display = 'none';
        confirmBtn.remove();
        openDistortedTruthSetup(players);
      };
    } else {
      confirmBtn.textContent = '확인 (아이템 수령 완료)';
      confirmBtn.onclick = () => {
        randomboxModal.style.display = 'none';
        confirmBtn.remove();
        socket.emit('confirmItemReceived', { roomId: currentRoom });
      };
    }
    rolledItemResult.appendChild(confirmBtn);
  };
});

function openDistortedTruthSetup(playersList) {
  const modal = document.getElementById('item-use-modal');
  const playerSelect = document.getElementById('item-target-player');
  playerSelect.innerHTML = '';

  const candidates = (playersList && playersList.length > 0) 
    ? playersList 
    : ((window.currentRoomPlayers && window.currentRoomPlayers.length > 0) ? window.currentRoomPlayers : (window.allPlayers || []));
  
  if (candidates.length > 0) {
    candidates.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + (p.id === myPlayerId ? ' (나)' : '');
      playerSelect.appendChild(opt);
    });
  } else {
    const opt = document.createElement('option');
    opt.value = myPlayerId;
    opt.textContent = (me && me.name) ? me.name : "플레이어";
    playerSelect.appendChild(opt);
  }

  modal.style.display = 'flex';

  document.getElementById('confirm-use-item-btn').onclick = () => {
    const targetPlayerId = playerSelect.value;
    const targetRound = document.getElementById('item-target-round').value;

    socket.emit('useItem', {
      roomId: currentRoom,
      itemId: 'distorted',
      targetPlayerId,
      targetRound
    });

    modal.style.display = 'none';
  };
}

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

function tryNextGifSource(imgEl) {
  try {
    const candidates = JSON.parse(imgEl.getAttribute('data-candidates') || '[]');
    if (candidates.length > 0) {
      const nextSrc = candidates.shift();
      imgEl.setAttribute('data-candidates', JSON.stringify(candidates));
      imgEl.src = nextSrc;
    } else {
      imgEl.style.display = 'none';
      if (imgEl.nextElementSibling) {
        imgEl.nextElementSibling.style.display = 'block';
      }
    }
  } catch (e) {
    imgEl.style.display = 'none';
    if (imgEl.nextElementSibling) {
      imgEl.nextElementSibling.style.display = 'block';
    }
  }
}
window.tryNextGifSource = tryNextGifSource;

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
    const emotion = isUp ? 'happy' : 'sad';
    const legacyEmotion = isUp ? 'up' : 'down';
    const shortPrefix = c.id ? c.id.substring(0, 3) : '';

    const candidateSources = [
      `assets/gifs/${c.id}/${c.id}${emotion}.gif`,
      `assets/gifs/${c.id}/${shortPrefix}${emotion}.gif`,
      `assets/gifs/${c.id}/${emotion}.gif`,
      `assets/gifs/${c.id}/${c.id}_${legacyEmotion}.gif`,
      `assets/gifs/${cidLower}/${cidLower}${emotion}.gif`,
      `assets/gifs/${cidLower}/${shortPrefix.toLowerCase()}${emotion}.gif`,
      `assets/gifs/${c.id}${emotion}.gif`,
      `assets/gifs/${shortPrefix}${emotion}.gif`,
      `assets/gifs/${cidLower}_${legacyEmotion}.gif`
    ];

    const firstSrc = candidateSources.shift();

    const card = document.createElement('div');
    card.className = 'character-card';
    card.innerHTML = `
      <div class="character-avatar-wrap">
        <img src="${firstSrc}" alt="${c.name}" class="character-gif" 
             data-candidates='${JSON.stringify(candidateSources)}'
             onerror="window.tryNextGifSource(this);" />
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

  document.getElementById('host-next-round-controls').style.display = 'none';
  document.getElementById('guest-next-round-waiting').style.display = 'none';
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

// 콘솔 개발자/테스트용 단축 명령어
window.forceEndGame = function() {
  if (!currentRoom) {
    console.warn("참여 중인 방이 없습니다.");
    return;
  }
  socket.emit('forceEndGame', { roomId: currentRoom });
  console.log("⚡ [강제 게임 종료] 서버에 요청을 전송했습니다.");
};

window.skipRound = function() {
  if (!currentRoom) return;
  socket.emit('voteSkip', { roomId: currentRoom });
};

window.skipTurn = function() {
  if (!currentRoom) return;
  socket.emit('skipMyTurn', { roomId: currentRoom });
};

console.log(`
%c🎮 [자운고 주식의신 디버그 콘솔 명령어]
- forceEndGame() : 즉시 게임을 종료하고 최종 순위/명예의 전당 화면으로 이동
- skipRound()    : 1라운드 즉시 스킵
- skipTurn()     : 2~5라운드 턴 즉시 넘기기
`, 'color: #38bdf8; font-weight: bold; font-size: 1.1rem;');
