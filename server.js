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

    // 방 생성 (호스트/어드민)
    socket.on('createRoom', ({ playerName, adminPassword, playerId }) => {
      if (adminPassword !== ADMIN_PASSWORD) {
        socket.emit('errorMsg', GAME_CONFIG.TEXTS.WRONG_PASSWORD_ALERT);
        return;
      }
      const roomId = generateRoomCode();
      const adminPlayer = {
        id: playerId,
        socketId: socket.id,
        name: (playerName || '어드민') + ' (어드민)',
        isAdmin: true
      };
      rooms[roomId] = {
        id: roomId,
        host: playerId,
        admin: adminPlayer,
        players: [],
        status: 'lobby', // lobby, playing, result, randombox, drillgame, end
        round: 1,
        maxRounds: 5, // 시나리오 길이에 맞춰 startGame 시 업데이트
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

      socket.join(roomId);
      socket.emit('roomCreated', { roomId, player: adminPlayer });
      io.to(roomId).emit('updateLobby', rooms[roomId].players);
      io.emit('roomListUpdate', getActiveRooms());
    });

    // 방 참가 (게스트 플레이어)
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
      if ((room.admin && room.admin.name === playerName) || room.players.some(p => p.name === playerName)) {
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
        if (room.admin && room.admin.id === playerId) {
          room.admin.socketId = socket.id;
          socket.join(roomId);
          socket.emit('rejoinedRoom', { roomId, player: room.admin, room: getSafeRoomData(room), overallRankings });
          if (room.status === 'lobby') {
            io.to(roomId).emit('updateLobby', room.players);
          } else {
            io.to(roomId).emit('updatePlayers', room.players);
          }
          return;
        }

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
        socket.emit('updateCompanies', room.companies);
        const connectedPlayers = room.players.filter(p => p.socketId !== null);
        socket.emit('skipStatusUpdated', {
          votedCount: room.skipVotes ? room.skipVotes.length : 0,
          totalCount: connectedPlayers.length
        });
        if (room.round >= 2 && room.activePlayerId) {
          const activePlayer = room.players.find(p => p.id === room.activePlayerId);
          socket.emit('turnStarted', {
            activePlayerId: room.activePlayerId,
            activePlayerName: activePlayer ? activePlayer.name : '-',
            turnTimer: room.turnTimer,
            turnOrder: room.turnOrder,
            activePlayerIndex: room.activePlayerIndex
          });
        }
      }
    });

    socket.on('getRoomList', () => {
      socket.emit('roomListUpdate', getActiveRooms());
    });

    // 강퇴
    socket.on('kickPlayer', ({ roomId, playerId }) => {
      const room = rooms[roomId];
      const isHost = room && (room.admin?.socketId === socket.id || room.host === socket.id);
      if (room && isHost) {
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
      const isHost = room && (room.admin?.socketId === socket.id || room.host === socket.id || room.players.find(p => p.socketId === socket.id)?.id === room.host);
      if (room && isHost) {
        if (room.players.length === 0) {
          socket.emit('errorMsg', '게임에 참여한 플레이어가 없습니다. 최소 1명 이상의 플레이어가 참가해야 게임을 시작할 수 있습니다.');
          return;
        }
        room.scenario = SCENARIOS.find(s => Number(s.id) === Number(scenarioId));
        room.maxRounds = Math.max(5, (room.scenario && room.scenario.rounds && room.scenario.rounds.length > 0) ? room.scenario.rounds.length : 5);
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

        // 라운드별 주식 구매한도 체크 (시나리오별 MaxJsw, MaxShc, MaxGar, MaxSoap, MaxPark, MaxWe 기준)
        const currentRoundData = room.scenario?.rounds?.find(r => r.round === room.round);
        let maxBuyLimit = 9999;
        if (currentRoundData && currentRoundData.maxBuyLimits && currentRoundData.maxBuyLimits[companyId] !== undefined) {
          maxBuyLimit = currentRoundData.maxBuyLimits[companyId];
        } else if (comp[`maxBuyR${room.round}`] !== undefined) {
          maxBuyLimit = comp[`maxBuyR${room.round}`];
        }

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

    socket.on('skipMyTurn', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing' || room.round < 2) return;

      const isAdminOrHost = (room.admin && room.admin.socketId === socket.id) ||
                            (room.host === socket.id) ||
                            (room.players.some(p => p.socketId === socket.id && (p.id === room.host || p.isAdmin)));

      const player = room.players.find(p => p.socketId === socket.id);

      // 어드민 / 호스트인 경우: 언제든지 즉시 턴 넘기기 가능
      if (isAdminOrHost) {
        nextTurn(roomId);
        return;
      }

      if (!player) return;

      const isTestHost = (player.name === 'TEST');

      // 본인 턴인 경우 스킵 가능
      if (!isTestHost && room.activePlayerId !== player.id) return;

      // 최소 15초 생존 룰 (단, TEST인 경우 즉시 스킵 가능)
      if (!isTestHost && room.turnElapsedTime < 15) {
        socket.emit('errorMsg', '턴 시작 후 15초가 지나야 넘길 수 있습니다.');
        return;
      }

      nextTurn(roomId);
    });

    // 다음 라운드 진행
    socket.on('nextRound', ({ roomId }) => {
      const room = rooms[roomId];
      const isHost = room && (room.admin?.socketId === socket.id || room.host === socket.id || room.players.find(p => p.socketId === socket.id)?.id === room.host);
      if (room && isHost) {
        proceedToNextRound(roomId);
      }
    });

    // 관리자/테스트용 강제 게임 종료
    socket.on('forceEndGame', ({ roomId }) => {
      const room = rooms[roomId];
      const isHost = room && (room.admin?.socketId === socket.id || room.host === socket.id || room.players.find(p => p.socketId === socket.id)?.id === room.host);
      if (!room || !isHost) return;
      
      if (room.timerInterval) {
        clearInterval(room.timerInterval);
        room.timerInterval = null;
      }
      if (room.autoSkipTimeout) {
        clearTimeout(room.autoSkipTimeout);
        room.autoSkipTimeout = null;
      }

      calculateAssets(room);
      room.status = 'end';
      
      room.players.forEach(p => {
        overallRankings.push({
          name: p.name,
          totalAsset: p.totalAsset,
          date: new Date().toLocaleDateString()
        });
      });
      overallRankings.sort((a, b) => b.totalAsset - a.totalAsset);
      overallRankings = overallRankings.slice(0, 30);

      io.to(roomId).emit('gameOver', { players: room.players, overallRankings });
    });

    // 라운드 스킵 (일반 투표 및 어드민 강제 스킵)
    socket.on('voteSkip', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing') return;

      const isAdminOrHost = (room.admin && room.admin.socketId === socket.id) ||
                            (room.host === socket.id) ||
                            (room.players.some(p => p.socketId === socket.id && (p.id === room.host || p.isAdmin)));

      // 어드민 / 호스트인 경우: 언제든지 즉시 라운드 강제 스킵 (결과 화면은 10초 보장)
      if (isAdminOrHost) {
        if (room.timerInterval) {
          clearInterval(room.timerInterval);
          room.timerInterval = null;
        }
        endRound(roomId);
        return;
      }

      // 일반 플레이어는 1라운드에서만 투표 가능
      if (room.round >= 2) return;

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;

      const elapsedTime = GAME_CONFIG.SYSTEM.ROUND_TIME - room.timer;
      if (elapsedTime < 60) {
        socket.emit('errorMsg', '라운드 시작 후 60초가 지나야 스킵할 수 있습니다.');
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
      }
    });

    // 아이템 사용 처리
    socket.on('useItem', ({ roomId, itemId, targetCompanyId, targetPlayerId, targetRound }) => {
      const room = rooms[roomId];
      if (!room) return;
      if (room.status !== 'playing' && room.status !== 'randombox') return;
      if (room.status === 'playing' && room.round !== 4) {
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
        const q = String(targetCompanyId).trim().toLowerCase();
        const foundComp = COMPANIES.find(c => 
          c.id.toLowerCase() === q ||
          c.name.toLowerCase().includes(q) ||
          q.includes(c.name.toLowerCase()) ||
          q.includes(c.id.toLowerCase())
        );
        const resolvedId = foundComp ? foundComp.id : targetCompanyId;
        const compName = foundComp ? foundComp.name : targetCompanyId;

        room.monopolizedStocks[resolvedId] = player.id;
        io.to(roomId).emit('systemAlert', `${player.name}님이 [${compName}] 주식에 독점권을 선포했습니다! 이번 라운드에 다른 플레이어는 매수 불가.`);
      } else if (itemId === 'distorted') {
        const roundNum = parseInt(targetRound, 10);
        if (!targetPlayerId || !roundNum || (roundNum !== 4 && roundNum !== 5)) {
          socket.emit('errorMsg', '왜곡할 플레이어와 라운드(4 또는 5)를 올바르게 선택해 주세요.');
          return;
        }
        const targetP = room.players.find(p => String(p.id) === String(targetPlayerId));
        if (!targetP) {
          socket.emit('errorMsg', '존재하지 않는 대상 플레이어입니다.');
          return;
        }
        room.distortedTruths.push({
          targetPlayerId: targetP.id,
          round: roundNum,
          fromPlayerId: player.id
        });
        io.to(roomId).emit('systemAlert', `누군가 ${targetP.name}의 ${roundNum}라운드 힌트에 왜곡된 진실을 사용하였습니다!`);

        // 만약 랜덤박스 상태에서 왜곡된 진실을 설정 완료했다면 4라운드로 즉시 진행
        if (room.status === 'randombox') {
          proceedToNextRound(roomId);
        }
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

    // 모든 플레이어 아이템 확인 수령 완료 추적
    socket.on('confirmItemReceived', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'randombox') return;
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        player.itemConfirmed = true;
        const allConfirmed = room.players.every(p => p.socketId === null || p.itemConfirmed);
        if (allConfirmed) {
          proceedToNextRound(roomId);
        }
      }
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
            io.to(roomId).emit('drillGameWinner', { winnerName: winner.name, score: maxScore });
          }
          // 전체 플레이어 대상 랜덤 박스 단계 진행 (각자 정확히 1개씩 획득)
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
        setupBreakingNews(room);
        // 순서: 직전 라운드 수익률(yield)이 낮은 순서대로
        room.turnOrder = [...room.players]
          .sort((a, b) => a.yield - b.yield)
          .map(p => p.id);

        room.activePlayerIndex = 0;

        // 2라운드는 불량 칩 미니게임 및 힌트 퀴즈 단계가 있으므로 미니게임 시간(약 45초)을 충분히 보장한 후 첫 턴 시작
        if (room.round === 2) {
          if (room.timerInterval) clearInterval(room.timerInterval);
          if (room.minigameDelayTimeout) clearTimeout(room.minigameDelayTimeout);
          room.minigameDelayTimeout = setTimeout(() => {
            if (room.status === 'playing' && room.round === 2) {
              startTurn(roomId);
            }
          }, 45000);
        } else {
          startTurn(roomId);
        }
      }
    }

    function startTurn(roomId) {
      const room = rooms[roomId];
      if (!room) return;

      const activeId = room.turnOrder[room.activePlayerIndex];
      const activePlayer = room.players.find(p => p.id === activeId);
      room.activePlayerId = activeId;
      room.turnTimer = 45;
      room.turnElapsedTime = 0;

      io.to(roomId).emit('turnStarted', {
        activePlayerId: activeId,
        activePlayerName: activePlayer ? activePlayer.name : '-',
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
        checkBreakingNews(room);

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

    // 뉴스 설정 (1~5 모든 라운드 발생)
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
        if (selectedNewsItems.length >= 6) break;
      }

      if (selectedNewsItems.length > 0) {
        const targetNewsCount = Math.min(Math.floor(Math.random() * 2) + 4, selectedNewsItems.length); // 4~5개 뉴스 발생
        const finalNewsSelection = selectedNewsItems.slice(0, targetNewsCount);
        
        // 1라운드(180초) 또는 턴제(턴당 45초)에 맞춘 타이머 시간대 분배
        const maxTime = room.round === 1 ? 170 : 40;
        const minTime = room.round === 1 ? 15 : 5;
        const usedTimes = new Set();

        for (let i = 0; i < finalNewsSelection.length; i++) {
          let triggerTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
          while (usedTimes.has(triggerTime)) {
            triggerTime = Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
          }
          usedTimes.add(triggerTime);
          room.breakingNewsSchedule.push({ time: triggerTime, news: finalNewsSelection[i] });
        }
      }
    }

    function checkBreakingNews(room) {
      const currentCheckTime = room.round === 1 ? room.timer : room.turnTimer;
      room.breakingNewsSchedule.forEach(sch => {
        if (sch.time === currentCheckTime) {
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

      const currentRoundData = room.scenario?.rounds?.find(r => r.round === room.round);
      const changes = currentRoundData ? currentRoundData.changes : (room.scenario?.rounds?.[(room.round - 1) % (room.scenario.rounds.length || 1)]?.changes || {});

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

      // 라운드 종료 결과창 노출 후 무조건 10초 뒤 자동 다음 라운드 진행
      const autoWaitSeconds = 10;
      io.to(roomId).emit('roundSkipped', { nextRoundIn: autoWaitSeconds });
      if (room.autoSkipTimeout) clearTimeout(room.autoSkipTimeout);
      room.autoSkipTimeout = setTimeout(() => {
        proceedToNextRound(roomId);
      }, autoWaitSeconds * 1000);
    }

    function rollRandomBoxForEveryone(roomId) {
      const room = rooms[roomId];
      if (!room) return;
      if (room.status === 'randombox') return; // 중복 호출 방지
      room.status = 'randombox';
      const rolls = {};
      room.players.forEach(p => {
        delete p.itemConfirmed;
        const rolled = ITEMS[Math.floor(Math.random() * ITEMS.length)];
        p.items = [rolled]; // 항상 정확히 1개의 아이템만 보유하도록 보장
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

        // 각 플레이어별 왜곡된 진실(distortedTruths) 적용 여부 확인 후 시나리오 전송
        room.players.forEach(p => {
          let playerScenario = JSON.parse(JSON.stringify(room.scenario));
          const distortion = room.distortedTruths.find(d => d.targetPlayerId === p.id && d.round === room.round);
          if (distortion) {
            playerScenario.rounds.forEach(r => {
              if (r.round === room.round && r.companyHints) {
                for (let compId in r.companyHints) {
                  r.companyHints[compId] = invertHintText(r.companyHints[compId]);
                }
              }
            });
          }

          if (p.socketId) {
            io.to(p.socketId).emit('roundStarted', {
              round: room.round,
              companies: room.companies,
              players: room.players,
              scenario: playerScenario
            });
          }
        });

        // 어드민에게도 roundStarted 브로드캐스트하여 결과창에서 다음 라운드 인게임 화면으로 자동 전환되도록 처리
        if (room.admin && room.admin.socketId) {
          io.to(room.admin.socketId).emit('roundStarted', {
            round: room.round,
            companies: room.companies,
            players: room.players,
            scenario: room.scenario
          });
        }
        
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
        if (room.admin && room.admin.socketId === socket.id) {
          room.admin.socketId = null;
        }
        const pIdx = room.players.findIndex(p => p.socketId === socket.id);
        if (pIdx !== -1) {
          if (room.status === 'lobby') {
            room.players.splice(pIdx, 1);
          } else {
            const disconnectedPlayer = room.players[pIdx];
            disconnectedPlayer.socketId = null;
          }
        }

        if (room.status === 'lobby') {
          if (room.players.length === 0 && (!room.admin || room.admin.socketId === null)) {
            if (room.timerInterval) clearInterval(room.timerInterval);
            delete rooms[roomId];
          } else {
            io.to(roomId).emit('updateLobby', room.players);
          }
          io.emit('roomListUpdate', getActiveRooms());
        }
      }
    });
  });

  function getActiveRooms() {
    const list = [];
    for (const roomId in rooms) {
      if (rooms[roomId].status === 'lobby') {
        const room = rooms[roomId];
        const hostName = room.admin ? room.admin.name : '어드민';
        list.push({
          id: roomId,
          hostName: hostName,
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
