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
const scenarioSelect = document.getElementById('scenario-select');
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

// 초기화
window.SCENARIOS.forEach(s => {
  const opt = document.createElement('option');
  opt.value = s.id;
  opt.textContent = `${s.id}. ${s.title}`;
  scenarioSelect.appendChild(opt);
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
    li.innerHTML = `<strong>방 ${r.id}</strong> <span style="font-size:0.8rem; color:#aaa;">(${r.playerCount}/${r.maxPlayers}명)</span>`;
    li.addEventListener('click', () => {
      roomCodeInput.value = r.id;
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
    li.textContent = p.name + (p.id === socket.id ? ' (나)' : '');
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
  const sid = parseInt(scenarioSelect.value);
  socket.emit('startGame', { roomId: currentRoom, scenarioId: sid });
});

// 게임 시작됨
socket.on('gameStarted', (data) => {
  setupRound(data);
});

socket.on('roundStarted', (data) => {
  setupRound(data);
});

function setupRound(data, isReconnect = false) {
  roomScreen.style.display = 'none';
  resultScreen.style.display = 'none';
  gameScreen.style.display = 'block';
  viewHintBtn.style.display = 'none'; // 매 라운드 시작 시 숨김

  if (data.scenario) scenarioTitle.textContent = data.scenario.title;
  roundIndicator.textContent = `Round ${data.round} / 3`;

  renderPlayers(data.players);
  renderStocks(data.companies, data.players);
  
  if (!isReconnect) {
    showQuizModal(data);
  } else {
    // 재접속 시 이미 퀴즈를 풀었다면 힌트 버튼 표시
    const myData = data.players.find(p => p.id === myPlayerId);
    if (myData && myData.quizSolved && currentHintHtml) {
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
});

socket.on('updatePlayers', (players) => {
  renderPlayers(players);
  // 주식 패널 내 보유량 업데이트
  const myData = players.find(p => p.id === socket.id);
  if (myData) {
    window.COMPANIES.forEach(c => {
      const shareEl = document.getElementById(`share-${c.id}`);
      if (shareEl) shareEl.textContent = `보유량: ${myData.shares[c.id]}주`;
    });
  }
});

function renderPlayers(players) {
  const myData = players.find(p => p.id === socket.id);
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
  const myData = players.find(p => p.id === socket.id) || me;

  companies.forEach(c => {
    const div = document.createElement('div');
    div.className = 'stock-card glass';
    div.innerHTML = `
      <div>
        <div class="stock-name">${c.name}</div>
        <div class="stock-desc">${c.desc}</div>
      </div>
      <div class="stock-price">${formatMoney(c.basePrice)}</div>
      <div class="my-shares" id="share-${c.id}">보유량: ${myData.shares[c.id]}주</div>
      <div class="trade-controls">
        <input type="number" id="trade-qty-${c.id}" value="1" min="1" />
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

// 퀴즈 팝업 및 힌트 보기
let currentRoundDataForQuiz = null;
let currentHintHtml = "";

viewHintBtn.addEventListener('click', () => {
  if (!currentHintHtml) return;
  document.getElementById('quiz-modal-title').textContent = '💡 독점 힌트 다시 보기';
  document.getElementById('quiz-modal-desc').style.display = 'none';
  document.getElementById('quiz-question-container').style.display = 'none';
  
  quizResult.style.display = 'block';
  quizExplain.innerHTML = '';
  quizHintBox.style.display = 'block';
  quizHintBox.innerHTML = currentHintHtml;
  closeQuizBtn.style.display = 'inline-block';
  closeQuizBtn.textContent = '닫기';
  quizModal.style.display = 'flex';
});

function showQuizModal(data) {
  // 클라이언트의 로컬 SCENARIOS 참조
  const scenarioData = window.SCENARIOS.find(s => s.id === (data.scenario ? data.scenario.id : parseInt(scenarioSelect.value)));
  if (data.scenario) currentRoundDataForQuiz = data.scenario.rounds.find(r => r.round === data.round);

  const qIdx = Math.floor(Math.random() * window.QUIZ_BANK.length);
  const quiz = window.QUIZ_BANK[qIdx];

  document.getElementById('quiz-modal-title').textContent = '라운드 시작! 반도체 상식 퀴즈';
  document.getElementById('quiz-modal-desc').style.display = 'block';
  document.getElementById('quiz-question-container').style.display = 'block';
  document.getElementById('quiz-question').style.display = 'block';

  quizQuestion.textContent = quiz.question;
  quizOptions.innerHTML = '';
  quizResult.style.display = 'none';
  quizHintBox.style.display = 'none';
  closeQuizBtn.style.display = 'none';

  if (quiz.type === 'OX') {
    ['O', 'X'].forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.addEventListener('click', () => submitQuiz(quiz, opt));
      quizOptions.appendChild(btn);
    });
  } else {
    quiz.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.addEventListener('click', () => submitQuiz(quiz, idx));
      quizOptions.appendChild(btn);
    });
  }

  quizModal.style.display = 'flex';
}

function submitQuiz(quiz, selected) {
  quizOptions.innerHTML = '';
  quizResult.style.display = 'block';
  closeQuizBtn.style.display = 'inline-block';
  closeQuizBtn.textContent = '확인';

  document.getElementById('quiz-modal-title').textContent = '퀴즈 결과';
  document.getElementById('quiz-modal-desc').style.display = 'none';
  document.getElementById('quiz-question').style.display = 'none';

  const isCorrect = (quiz.answer === selected);

  if (isCorrect) {
    socket.emit('quizSolved', { roomId: currentRoom });
    quizExplain.innerHTML = `<span style="color:var(--success); font-weight:bold;">정답입니다!</span><br>${quiz.explain}`;
    quizHintBox.style.display = 'block';
    currentHintHtml = `<strong>💡 입수된 독점 힌트:</strong><br>${currentRoundDataForQuiz.hint}`;
    quizHintBox.innerHTML = currentHintHtml;
    viewHintBtn.style.display = 'inline-block'; // 힌트 다시보기 버튼 노출
  } else {
    let corrAns = quiz.type === 'OX' ? quiz.answer : quiz.options[quiz.answer];
    quizExplain.innerHTML = `<span style="color:var(--danger); font-weight:bold;">오답입니다.</span> (정답: ${corrAns})<br>${quiz.explain}`;
    quizHintBox.style.display = 'block';
    quizHintBox.innerHTML = `<em>오답으로 인해 힌트를 얻지 못했습니다. 감각으로 투자하세요!</em>`;
    currentHintHtml = "";
  }
}

closeQuizBtn.addEventListener('click', () => {
  quizModal.style.display = 'none';
});

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


// News Banner
const newsBanner = document.getElementById('news-banner');
const newsText = document.getElementById('news-text');
const newsImpact = document.getElementById('news-impact');

socket.on('breakingNews', (data) => {
  // 주가 및 내 자산 갱신
  renderStocks(data.companies, data.players);
  renderPlayers(data.players);

  // 특보 배너 노출
  newsText.textContent = data.news.text;
  newsImpact.textContent = "주가 " + (data.impact > 0 ? "+" : "") + data.impact + "%";

  newsBanner.className = 'news-banner'; // 클래스 초기화
  if (data.news.type === 'good') {
    newsBanner.classList.add('good-news');
  } else {
    newsBanner.classList.add('bad-news');
  }

  newsBanner.style.display = 'flex';

  // 7초 후 숨김
  setTimeout(() => {
    newsBanner.style.display = 'none';
  }, 7000);
});
