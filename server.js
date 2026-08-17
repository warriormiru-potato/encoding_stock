const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { loadGameData } = require('./sheetParser');
const { GAME_CONFIG } = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || GAME_CONFIG.SYSTEM.DEFAULT_ADMIN_PASSWORD;

// 정적 파일 제공
app.use(express.static(__dirname));

// 게임 방 상태 저장
const rooms = {};

// 누적 역대 게임 순위 저장
let overallRankings = [];

// 난수 문자열 생성기 (방 코드)
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// 클라이언트에 안전하게 보낼 방 정보 복사본 생성 (타이머 관련 객체 제거)
function getSafeRoomData(room) {
  if (!room) return null;
  const safeRoom = { ...room };
  delete safeRoom.timerInterval;
  delete safeRoom.autoSkipTimeout;
  return safeRoom;
}

// 힌트 왜곡 유틸리티
function invertHintText(text) {
  if (!text) return "";
  let inverted = text;
  const replacements = [
    ["상승", "__DOWN__"],
    ["하락", "__UP__"],
    ["폭등", "__CRASH__"],
    ["폭락", "__BOOM__"],
    ["급등", "__FALL__"],
    ["급락", "__RISE__"],
    ["매수", "__SELL__"],
    ["매도", "__BUY__"]
  ];
  replacements.forEach(([orig, placeholder]) => {
    inverted = inverted.split(orig).join(placeholder);
  });
  const resolves = [
    ["__DOWN__", "하락"],
    ["__UP__", "상승"],
    ["__CRASH__", "폭락"],
    ["__BOOM__", "폭등"],
    ["__FALL__", "급락"],
    ["__RISE__", "급등"],
    ["__SELL__", "매도"],
    ["__BUY__", "매수"]
  ];
  resolves.forEach(([placeholder, resolved]) => {
    inverted = inverted.split(placeholder).join(resolved);
  });
  return inverted;
}

async function startServer() {
  const gameData = await loadGameData();
  const COMPANIES = gameData.COMPANIES;
  const SCENARIOS = gameData.SCENARIOS;
  const BREAKING_NEWS = gameData.BREAKING_NEWS;
  const ITEMS = gameData.ITEMS;

  // 클라이언트에 제공할 데이터
  app.get('/data.js', (req, res) => {
    res.type('application/javascript');
    res.send(`
      window.COMPANIES = ${JSON.stringify(COMPANIES)};
      window.QUIZ_BANK = ${JSON.stringify(gameData.QUIZ_BANK)};
      window.SCENARIOS = ${JSON.stringify(SCENARIOS)};
      window.BREAKING_NEWS = ${JSON.stringify(BREAKING_NEWS)};
      window.ITEMS = ${JSON.stringify(ITEMS)};
    `);
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 방 생성 (호스트)
    socket.on('createRoom', ({ playerName, adminPassword, playerId }) => {
      if (adminPassword !== ADMIN_PASSWORD) {
        socket.emit('errorMsg', GAME_CONFIG.TEXTS.WRONG_PASSWORD_ALERT);
        return;
      }
      const roomId = generateRoomCode();
      rooms[roomId] = {
        id: roomId,
        host: playerId,
        players: [],
        status: 'lobby', // lobby, playing, result, randombox, drillgame, end
        round: 1,
        maxRounds: 5,
        timer: GAME_CONFIG.SYSTEM.ROUND_TIME,
        timerInterval: null,
        scenario: null,
        companies: JSON.parse(JSON.stringify(COMPANIES)),
        breakingNewsSchedule: [],
        skipVotes: [],
        pastBreakingNews: [], // 지나간 긴급속보 저장
        activePlayerId: null, // 턴제 진행 시 현재 거래 가능한 플레이어 ID
        turnTimer: 45,
        turnElapsedTime: 0,
        turnOrder: [], // 턴 진행 순서
        monopolizedStocks: {}, // { companyId: playerId }
        distortedTruths: [], // array of { targetPlayerId, round, fromPlayerId }
        activeInverses: {}, // { playerId: true }
        activeLeverages: {} // { playerId: true }
      };

      const player = {
        id: playerId,
        socketId: socket.id,
        name: playerName,
        cash: GAME_CONFIG.SYSTEM.DEFAULT_CASH,
        shares: {},
        totalAsset: GAME_CONFIG.SYSTEM.DEFAULT_CASH,
        quizSolved: false,
        yield: 0,
        roundStartAsset: GAME_CONFIG.SYSTEM.DEFAULT_CASH,
        roundBuyCount: {}, // { companyId: count } 각 라운드별 구매 수량 기록
        items: [] // 보유한 아이템
      };
      COMPANIES.forEach(c => {
        player.shares[c.id] = 0;
        player.roundBuyCount[c.id] = 0;
      });
      rooms[roomId].players.push(player);

      socket.join(roomId);
      socket.emit('roomCreated', { roomId, player });
      io.to(roomId).emit('updateLobby', rooms[roomId].players);
      io.emit('roomListUpdate', getActiveRooms());
    });

    // 방 참가 (게스트)
    socket.on('joinRoom', ({ roomId, playerName, playerId }) => {
      const room = rooms[roomId];
      if (!room) {
        socket.emit('errorMsg', '존재하지 않는 방입니다.');
        return;
      }
      if (room.status !== 'lobby') {
        socket.emit('errorMsg', '이미 게임이 시작된 방입니다.');
        return;
      }
      if (room.players.length >= GAME_CONFIG.SYSTEM.MAX_PLAYERS) {
        socket.emit('errorMsg', '방이 가득 찼습니다.');
        return;
      }
      if (room.players.some(p => p.name === playerName)) {
        socket.emit('errorMsg', '이미 방에 같은 닉네임을 가진 플레이어가 있습니다. 다른 닉네임을 사용해주세요.');
        return;
      }

      const player = {
        id: playerId,
        socketId: socket.id,
        name: playerName,
        cash: GAME_CONFIG.SYSTEM.DEFAULT_CASH,
        shares: {},
        totalAsset: GAME_CONFIG.SYSTEM.DEFAULT_CASH,
        quizSolved: false,
        yield: 0,
        roundStartAsset: GAME_CONFIG.SYSTEM.DEFAULT_CASH,
        roundBuyCount: {},
        items: []
      };
      COMPANIES.forEach(c => {
        player.shares[c.id] = 0;
        player.roundBuyCount[c.id] = 0;
      });
      room.players.push(player);

      socket.join(roomId);
      socket.emit('joinedRoom', { roomId, player, room: getSafeRoomData(room) });
      io.to(roomId).emit('updateLobby', room.players);
      io.emit('roomListUpdate', getActiveRooms());
    });

    // 재접속
    socket.on('rejoinRoom', ({ roomId, playerId }) => {
      const room = rooms[roomId];
      if (room) {
        const player = room.players.find(p => p.id === playerId);
        if (player) {
          player.socketId = socket.id;
          socket.join(roomId);
          socket.emit('rejoinedRoom', { roomId, player, room: getSafeRoomData(room), overallRankings });
          if (room.status === 'lobby') {
            io.to(roomId).emit('updateLobby', room.players);
          } else {
            io.to(roomId).emit('updatePlayers', room.players);
            if (room.status === 'playing') {
              const connectedPlayers = room.players.filter(p => p.socketId !== null);
              socket.emit('skipStatusUpdated', {
                votedCount: room.skipVotes ? room.skipVotes.length : 0,
                totalCount: connectedPlayers.length
              });
            }
          }
        } else {
          socket.emit('rejoinFailed', '해당 방에 참여 중인 정보가 없습니다.');
        }
      } else {
        socket.emit('rejoinFailed', '방이 존재하지 않거나 이미 종료되었습니다.');
      }
    });

    socket.on('requestSync', ({ roomId }) => {
      const room = rooms[roomId];
      if (room && room.status === 'playing') {
        socket.emit('timerUpdate', room.timer);
        socket.emit('updatePlayers', room.players);
        const connectedPlayers = room.players.filter(p => p.socketId !== null);
        socket.emit('skipStatusUpdated', {
          votedCount: room.skipVotes ? room.skipVotes.length : 0,
          totalCount: connectedPlayers.length
        });
      }
    });

    socket.on('getRoomList', () => {
      socket.emit('roomListUpdate', getActiveRooms());
    });

    // 강퇴
    socket.on('kickPlayer', ({ roomId, playerId }) => {
      const room = rooms[roomId];
      const requester = room?.players.find(p => p.socketId === socket.id);
      if (room && requester && room.host === requester.id) {
        const pIdx = room.players.findIndex(p => p.id === playerId);
        if (pIdx !== -1) {
          const kickedSocketId = room.players[pIdx].socketId;
          if (kickedSocketId) {
            const kickedSocket = io.sockets.sockets.get(kickedSocketId);
            if (kickedSocket) {
              kickedSocket.leave(roomId);
              kickedSocket.emit('kicked');
            }
          }
          room.players.splice(pIdx, 1);
          io.to(roomId).emit('updateLobby', room.players);
          io.emit('roomListUpdate', getActiveRooms());
        }
      }
    });

    // 초기 주식 랜덤 지급 함수 (1라운드 시작 시 총 3주 지급)
    function distributeInitialStocks(room) {
      room.players.forEach(player => {
        for (let i = 0; i < 3; i++) {
          const randomCompany = room.companies[Math.floor(Math.random() * room.companies.length)];
          player.shares[randomCompany.id] = (player.shares[randomCompany.id] || 0) + 1;
        }
      });
    }

    // 게임 시작
    socket.on('startGame', ({ roomId, scenarioId }) => {
      const room = rooms[roomId];
      const requester = room?.players.find(p => p.socketId === socket.id);
      if (room && requester && room.host === requester.id) {
        room.scenario = SCENARIOS.find(s => Number(s.id) === Number(scenarioId));
        room.status = 'playing';
        room.round = 1;
        room.skipVotes = [];
        room.pastBreakingNews = [];

        // 주가 히스토리 초기화 및 시작 가격 세팅
        room.companies.forEach(c => {
          c.startPrice = c.basePrice;
          c.priceHistory = [c.basePrice];
        });

        // 1라운드 시작 자산 기록 및 초기 랜덤 주식 지급
        distributeInitialStocks(room);
        calculateAssets(room);
        room.players.forEach(p => {
          p.roundStartAsset = p.totalAsset;
          room.companies.forEach(c => p.roundBuyCount[c.id] = 0);
        });

        io.to(roomId).emit('gameStarted', {
          scenario: room.scenario,
          companies: room.companies,
          players: room.players,
          round: room.round,
          overallRankings
        });

        io.emit('roomListUpdate', getActiveRooms());
        startRoundTimer(roomId);
      }
    });

    // 퀴즈/힌트 관련
    socket.on('quizSolved', ({ roomId }) => {
      const room = rooms[roomId];
      if (room) {
        const player = room.players.find(p => p.socketId === socket.id);
        if (player) {
          player.quizSolved = true;
          io.to(roomId).emit('updatePlayers', room.players);
        }
      }
    });

    // 주식 거래 요청
    socket.on('tradeStock', ({ roomId, companyId, qty, isBuy }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing') return;

      const player = room.players.find(p => p.socketId === socket.id);
      const comp = room.companies.find(c => c.id === companyId);
      if (!player || !comp || qty <= 0) return;

      // 2라운드부터는 본인 턴인 경우에만 구매/판매 허용
      if (room.round >= 2 && room.activePlayerId !== player.id) {
        socket.emit('errorMsg', '현재 본인의 거래 턴이 아닙니다.');
        return;
      }

      const totalCost = comp.basePrice * qty;

      if (isBuy) {
        // 독점권 아이템 발동 상태 체크
        if (room.monopolizedStocks[companyId] && room.monopolizedStocks[companyId] !== player.id) {
          socket.emit('errorMsg', '해당 주식은 다른 플레이어에 의해 독점권이 선포되어 이번 라운드에 구매할 수 없습니다.');
          return;
        }

        // 라운드별 주식 구매한도 체크 (엑셀 열 기준)
        const maxBuyLimit = comp[`maxBuyR${room.round}`] || 9999;
        const currentBought = player.roundBuyCount[companyId] || 0;
        if (currentBought + qty > maxBuyLimit) {
          socket.emit('errorMsg', `이번 라운드 해당 주식의 구매 한도는 최대 ${maxBuyLimit}주입니다. (현재 구매량: ${currentBought}주)`);
          return;
        }

        if (player.cash >= totalCost) {
          player.cash -= totalCost;
          player.shares[companyId] += qty;
          player.roundBuyCount[companyId] = currentBought + qty;
          // 매수 시 주가 0.5% 상승
          comp.basePrice = Math.round(comp.basePrice * (1 + (0.005 * qty)));
        } else {
          socket.emit('errorMsg', '소지금이 부족합니다.');
          return;
        }
      } else {
        if (player.shares[companyId] >= qty) {
          player.cash += totalCost;
          player.shares[companyId] -= qty;
          // 매도 시 주가 0.5% 하락
          comp.basePrice = Math.max(1, Math.round(comp.basePrice * (1 - (0.005 * qty))));
        } else {
          socket.emit('errorMsg', '보유한 주식이 부족합니다.');
          return;
        }
      }

      calculateAssets(room);
      io.to(roomId).emit('updatePlayers', room.players);
      io.to(roomId).emit('updateCompanies', room.companies);
    });

    // 턴 넘기기 (스킵)
    socket.on('skipMyTurn', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing' || room.round < 2) return;

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || room.activePlayerId !== player.id) return;

      // 최소 15초 생존 룰
      if (room.turnElapsedTime < 15) {
        socket.emit('errorMsg', '턴 시작 후 15초가 지나야 넘길 수 있습니다.');
        return;
      }

      nextTurn(roomId);
    });

    // 다음 라운드 진행
    socket.on('nextRound', ({ roomId }) => {
      const room = rooms[roomId];
      const requester = room?.players.find(p => p.socketId === socket.id);
      if (room && requester && room.host === requester.id) {
        proceedToNextRound(roomId);
      }
    });

    // 스킵 투표 (1라운드 전용)
    socket.on('voteSkip', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing' || room.round >= 2) return;

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;

      const isHost = (room.host === player.id);
      const isTestHost = (isHost && player.name === 'TEST');
      const elapsedTime = GAME_CONFIG.SYSTEM.ROUND_TIME - room.timer;

      // TEST 방장이 아닌 일반 플레이어는 60초 제한
      if (!isHost && elapsedTime < 60) {
        socket.emit('errorMsg', '라운드 시작 후 60초가 지나야 스킵할 수 있습니다.');
        return;
      }

      // 방장(또는 TEST 방장)은 즉시 스킵 가능
      if (isHost) {
        if (room.timerInterval) {
          clearInterval(room.timerInterval);
          room.timerInterval = null;
        }
        endRound(roomId);
        io.to(roomId).emit('roundSkipped', { nextRoundIn: isTestHost ? 2 : 8 });
        if (room.autoSkipTimeout) clearTimeout(room.autoSkipTimeout);
        room.autoSkipTimeout = setTimeout(() => {
          proceedToNextRound(roomId);
        }, isTestHost ? 2000 : 8000);
        return;
      }

      if (!room.skipVotes.includes(player.id)) {
        room.skipVotes.push(player.id);
      }

      const connectedPlayers = room.players.filter(p => p.socketId !== null);
      io.to(roomId).emit('skipStatusUpdated', {
        votedCount: room.skipVotes.length,
        totalCount: connectedPlayers.length
      });

      if (room.skipVotes.length >= connectedPlayers.length) {
        if (room.timerInterval) {
          clearInterval(room.timerInterval);
          room.timerInterval = null;
        }
        endRound(roomId);
        io.to(roomId).emit('roundSkipped', { nextRoundIn: 8 });
        if (room.autoSkipTimeout) clearTimeout(room.autoSkipTimeout);
        room.autoSkipTimeout = setTimeout(() => {
          proceedToNextRound(roomId);
        }, 8000);
      }
    });

    // 아이템 사용 처리
    socket.on('useItem', ({ roomId, itemId, targetCompanyId, targetPlayerId, targetRound }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing') return;
      if (room.round !== 4) {
        socket.emit('errorMsg', '아이템은 4라운드에서만 사용 가능합니다.');
        return;
      }

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;

      const itemIdx = player.items.findIndex(it => it.id === itemId);
      if (itemIdx === -1) {
        socket.emit('errorMsg', '보유하지 않은 아이템입니다.');
        return;
      }

      // 아이템 사용 로직
      if (itemId === 'monopoly') {
        if (!targetCompanyId) {
          socket.emit('errorMsg', '독점할 종목을 선택해 주세요.');
          return;
        }
        room.monopolizedStocks[targetCompanyId] = player.id;
        io.to(roomId).emit('systemAlert', `${player.name}님이 ${COMPANIES.find(c => c.id === targetCompanyId)?.name || targetCompanyId} 주식에 독점권을 선포했습니다! 이번 라운드에 다른 플레이어는 매수 불가.`);
      } else if (itemId === 'distorted') {
        if (!targetPlayerId || !targetRound || (targetRound !== 4 && targetRound !== 5)) {
          socket.emit('errorMsg', '왜곡할 플레이어와 라운드(4 또는 5)를 올바르게 선택해 주세요.');
          return;
        }
        room.distortedTruths.push({
          targetPlayerId,
          round: parseInt(targetRound, 10),
          fromPlayerId: player.id
        });
        const targetP = room.players.find(p => p.id === targetPlayerId);
        io.to(roomId).emit('systemAlert', `누군가 ${targetP?.name || '특정 플레이어'}의 ${targetRound}라운드 힌트에 왜곡된 진실을 사용하였습니다!`);
      } else if (itemId === 'inverse') {
        room.activeInverses[player.id] = true;
        socket.emit('systemAlert', '인버스권이 활성화되었습니다. 라운드 종료 시 주가 하락폭만큼 이익이 됩니다.');
      } else if (itemId === 'leverage') {
        room.activeLeverages[player.id] = true;
        socket.emit('systemAlert', '레버리지권이 활성화되었습니다. 이번 라운드 주가 변동 이익/손실이 2배로 계산됩니다.');
      } else if (itemId === 'allclear') {
        socket.emit('allClearHintsUnlocked', {
          round: room.round,
          scenario: room.scenario
        });
      }

      // 아이템 소모
      player.items.splice(itemIdx, 1);
      io.to(roomId).emit('updatePlayers', room.players);
    });

    // 미니게임 완료 결과 전송 (드릴 미니게임 등)
    socket.on('drillGameFinished', ({ roomId, score }) => {
      const room = rooms[roomId];
      if (!room) return;
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        player.drillScore = score;
        const allSubmitted = room.players.every(p => p.socketId === null || p.drillScore !== undefined);
        if (allSubmitted) {
          // 최고 득점자 결정
          let winner = null;
          let maxScore = -1;
          room.players.forEach(p => {
            if (p.drillScore !== undefined && p.drillScore > maxScore) {
              maxScore = p.drillScore;
              winner = p;
            }
          });
          if (winner) {
            const rolled = ITEMS[Math.floor(Math.random() * ITEMS.length)];
            winner.items.push(rolled);
            io.to(roomId).emit('drillGameWinner', { winnerName: winner.name, score: maxScore, itemName: rolled.name });
            if (rolled.id === 'distorted') {
              io.to(roomId).emit('distortedGainedAlert', { playerName: winner.name });
            }
          }
          // 랜덤 박스 단계 진행
          rollRandomBoxForEveryone(roomId);
        }
      }
    });

    function startRoundTimer(roomId) {
      const room = rooms[roomId];
      if (!room) return;

      if (room.round === 1) {
        // 1라운드는 동시 구매 (기본 180초 타이머)
        room.timer = GAME_CONFIG.SYSTEM.ROUND_TIME;
        setupBreakingNews(room);

        if (room.timerInterval) clearInterval(room.timerInterval);
        room.timerInterval = setInterval(() => {
          room.timer--;
          io.to(roomId).emit('timerUpdate', room.timer);
          checkBreakingNews(room);

          if (room.timer <= 0) {
            clearInterval(room.timerInterval);
            endRound(roomId);
          }
        }, 1000);
      } else {
        // 2라운드부터는 턴제 거래 진행
        // 순서: 직전 라운드 수익률(yield)이 낮은 순서대로
        room.turnOrder = [...room.players]
          .sort((a, b) => a.yield - b.yield)
          .map(p => p.id);

        room.activePlayerIndex = 0;
        startTurn(roomId);
      }
    }

    function startTurn(roomId) {
      const room = rooms[roomId];
      if (!room) return;

      const activeId = room.turnOrder[room.activePlayerIndex];
      room.activePlayerId = activeId;
      room.turnTimer = 45;
      room.turnElapsedTime = 0;

      io.to(roomId).emit('turnStarted', {
        activePlayerId: activeId,
        turnTimer: room.turnTimer,
        turnOrder: room.turnOrder,
        activePlayerIndex: room.activePlayerIndex
      });

      if (room.timerInterval) clearInterval(room.timerInterval);
      room.timerInterval = setInterval(() => {
        room.turnTimer--;
        room.turnElapsedTime++;
        io.to(roomId).emit('turnTimerUpdate', {
          time: room.turnTimer,
          elapsed: room.turnElapsedTime
        });

        if (room.turnTimer <= 0) {
          clearInterval(room.timerInterval);
          nextTurn(roomId);
        }
      }, 1000);
    }

    function nextTurn(roomId) {
      const room = rooms[roomId];
      if (!room) return;

      room.activePlayerIndex++;
      if (room.activePlayerIndex >= room.turnOrder.length) {
        // 모든 플레이어가 턴을 마침 -> 라운드 종료
        if (room.timerInterval) clearInterval(room.timerInterval);
        endRound(roomId);
      } else {
        startTurn(roomId);
      }
    }

    // 뉴스 설정
    function setupBreakingNews(room) {
      room.breakingNewsSchedule = [];
      const availableNews = [...BREAKING_NEWS];
      for (let i = availableNews.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableNews[i], availableNews[j]] = [availableNews[j], availableNews[i]];
      }

      const selectedNewsItems = [];
      const selectedCompanyIds = new Set();
      for (const news of availableNews) {
        if (!selectedCompanyIds.has(news.companyId)) {
          selectedNewsItems.push(news);
          selectedCompanyIds.add(news.companyId);
        }
        if (selectedNewsItems.length >= 4) break;
      }

      if (selectedNewsItems.length > 0) {
        const targetNewsCount = Math.min(Math.floor(Math.random() * 2) + 3, selectedNewsItems.length);
        const finalNewsSelection = selectedNewsItems.slice(0, targetNewsCount);
        const firstTriggerTime = Math.floor(Math.random() * (175 - 150 + 1)) + 150;
        const usedTimes = new Set([firstTriggerTime]);

        room.breakingNewsSchedule.push({ time: firstTriggerTime, news: finalNewsSelection[0] });

        for (let i = 1; i < finalNewsSelection.length; i++) {
          let triggerTime = Math.floor(Math.random() * (149 - 10 + 1)) + 10;
          while (usedTimes.has(triggerTime)) {
            triggerTime = Math.floor(Math.random() * (149 - 10 + 1)) + 10;
          }
          usedTimes.add(triggerTime);
          room.breakingNewsSchedule.push({ time: triggerTime, news: finalNewsSelection[i] });
        }
      }
    }

    function checkBreakingNews(room) {
      room.breakingNewsSchedule.forEach(sch => {
        if (sch.time === room.timer) {
          const baseImpact = Math.floor(Math.random() * (sch.news.impact.max - sch.news.impact.min + 1)) + sch.news.impact.min;
          const impact = Math.round(baseImpact * 1.2);
          const comp = room.companies.find(c => c.id === sch.news.companyId);
          if (comp) {
            comp.basePrice = Math.floor(comp.basePrice * (1 + impact / 100));
            calculateAssets(room);
            const triggeredNews = { news: sch.news, impact, timestamp: new Date().toLocaleTimeString() };
            room.pastBreakingNews.push(triggeredNews);
            io.to(room.id).emit('breakingNews', {
              news: sch.news,
              impact: impact,
              companies: room.companies,
              players: room.players,
              pastBreakingNews: room.pastBreakingNews
            });
          }
        }
      });
    }

    function endRound(roomId) {
      const room = rooms[roomId];
      if (!room) return;
      room.status = 'result';

      const currentRoundData = room.scenario.rounds.find(r => r.round === room.round);
      const changes = currentRoundData.changes;

      // 이전 주식가치 보관 (인버스권, 레버리지권 정밀 계산용)
      const playerStockValuesPre = {};
      room.players.forEach(p => {
        let stockVal = 0;
        for (let cid in p.shares) {
          const comp = room.companies.find(c => c.id === cid);
          stockVal += p.shares[cid] * (comp.startPrice || comp.basePrice);
        }
        playerStockValuesPre[p.id] = stockVal;
      });

      // 주식 가격 변동 반영
      room.companies.forEach(c => {
        const pct = changes[c.id] || 0;
        const startP = c.startPrice !== undefined ? c.startPrice : c.basePrice;
        c.basePrice = Math.floor(startP * (1 + pct / 100));
        if (!c.priceHistory) {
          c.priceHistory = [startP];
        }
        c.priceHistory.push(c.basePrice);
      });

      // 자산 계산 및 아이템(인버스/레버리지) 처리
      room.players.forEach(p => {
        let stockValuePost = 0;
        for (let cid in p.shares) {
          const comp = room.companies.find(c => c.id === cid);
          stockValuePost += p.shares[cid] * comp.basePrice;
        }

        const standardChange = stockValuePost - playerStockValuesPre[p.id];
        let finalChange = standardChange;

        // 인버스권 적용
        if (room.activeInverses[p.id]) {
          if (standardChange < 0) {
            finalChange = Math.abs(standardChange);
          } else {
            finalChange = -standardChange;
          }
        }

        // 레버리지권 적용
        if (room.activeLeverages[p.id]) {
          finalChange = finalChange * 2;
        }

        p.totalAsset = p.cash + playerStockValuesPre[p.id] + finalChange;
        // 현금으로 이익 가산/차감 동기화
        p.cash = p.totalAsset - stockValuePost;

        // 수익률(yield) 갱신
        p.yield = (p.totalAsset - p.roundStartAsset) / p.roundStartAsset;
      });

      // 아이템 발동 상태 초기화
      room.monopolizedStocks = {};
      room.activeInverses = {};
      room.activeLeverages = {};

      io.to(roomId).emit('roundEnded', {
        round: room.round,
        companies: room.companies,
        players: room.players,
        changes: changes,
        pastBreakingNews: room.pastBreakingNews
      });
    }

    function rollRandomBoxForEveryone(roomId) {
      const room = rooms[roomId];
      if (!room) return;
      room.status = 'randombox';
      const rolls = {};
      room.players.forEach(p => {
        const rolled = ITEMS[Math.floor(Math.random() * ITEMS.length)];
        p.items.push(rolled);
        rolls[p.id] = rolled;
        if (rolled.id === 'distorted') {
          io.to(roomId).emit('distortedGainedAlert', { playerName: p.name });
        }
      });
      io.to(roomId).emit('randomBoxRolled', { rolls, players: room.players });
    }

    function proceedToNextRound(roomId) {
      const room = rooms[roomId];
      if (!room) return;

      if (room.autoSkipTimeout) {
        clearTimeout(room.autoSkipTimeout);
        room.autoSkipTimeout = null;
      }

      if (room.status !== 'result' && room.status !== 'randombox' && room.status !== 'drillgame') return;

      // 3라운드 결과 화면 -> 드릴게임 분기
      if (room.round === 3 && room.status === 'result') {
        room.status = 'drillgame';
        room.players.forEach(p => delete p.drillScore);
        io.to(roomId).emit('startDrillGame');
        return;
      }

      // 드릴게임/랜덤박스 완료 후 4라운드로 진행
      // 또는 4, 5라운드 결과 후 다음 라운드 혹은 게임오버
      const nextRound = room.round + 1;

      if (nextRound > room.maxRounds) {
        room.status = 'end';
        // 최종 누적 역대 순위 저장
        room.players.forEach(p => {
          overallRankings.push({
            name: p.name,
            totalAsset: p.totalAsset,
            date: new Date().toLocaleDateString()
          });
        });
        overallRankings.sort((a, b) => b.totalAsset - a.totalAsset);
        overallRankings = overallRankings.slice(0, 30); // 상위 30개 기록 유지

        io.to(roomId).emit('gameOver', { players: room.players, overallRankings });
      } else {
        room.round = nextRound;
        room.status = 'playing';
        room.players.forEach(p => {
          p.quizSolved = false;
          p.roundStartAsset = p.totalAsset;
          room.companies.forEach(c => p.roundBuyCount[c.id] = 0);
        });
        room.skipVotes = [];

        room.companies.forEach(c => {
          c.startPrice = c.basePrice;
        });

        io.to(roomId).emit('roundStarted', {
          round: room.round,
          companies: room.companies,
          players: room.players,
          scenario: room.scenario
        });
        startRoundTimer(roomId);
      }
    }

    function calculateAssets(room) {
      room.players.forEach(p => {
        let stockValue = 0;
        for (let cid in p.shares) {
          const comp = room.companies.find(c => c.id === cid);
          stockValue += p.shares[cid] * comp.basePrice;
        }
        p.totalAsset = p.cash + stockValue;
      });
    }

    socket.on('disconnect', () => {
      for (const roomId in rooms) {
        const room = rooms[roomId];
        const pIdx = room.players.findIndex(p => p.socketId === socket.id);
        if (pIdx !== -1) {
          if (room.status === 'lobby') {
            room.players.splice(pIdx, 1);
            if (room.players.length === 0) {
              if (room.timerInterval) clearInterval(room.timerInterval);
              delete rooms[roomId];
            } else {
              const hasHost = room.players.some(p => p.id === room.host);
              if (!hasHost && room.players.length > 0) {
                room.host = room.players[0].id;
              }
              io.to(roomId).emit('updateLobby', room.players);
            }
            io.emit('roomListUpdate', getActiveRooms());
          } else {
            const disconnectedPlayer = room.players[pIdx];
            disconnectedPlayer.socketId = null;
          }
        }
      }
    });
  });

  function getActiveRooms() {
    const list = [];
    for (const roomId in rooms) {
      if (rooms[roomId].status === 'lobby') {
        const room = rooms[roomId];
        const hostPlayer = room.players.find(p => p.id === room.host);
        list.push({
          id: roomId,
          hostName: hostPlayer ? hostPlayer.name : '알수없는',
          playerCount: room.players.length,
          maxPlayers: GAME_CONFIG.SYSTEM.MAX_PLAYERS
        });
      }
    }
    return list;
  }

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

startServer();
