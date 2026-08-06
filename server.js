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

async function startServer() {
  const gameData = await loadGameData();
  const COMPANIES = gameData.COMPANIES;
  const SCENARIOS = gameData.SCENARIOS;
  const BREAKING_NEWS = gameData.BREAKING_NEWS;

  // 클라이언트에 제공할 데이터 (기존 data.js를 대체)
  app.get('/data.js', (req, res) => {
    res.type('application/javascript');
    res.send(`
      window.COMPANIES = ${JSON.stringify(COMPANIES)};
      window.QUIZ_BANK = ${JSON.stringify(gameData.QUIZ_BANK)};
      window.SCENARIOS = ${JSON.stringify(SCENARIOS)};
      window.BREAKING_NEWS = ${JSON.stringify(BREAKING_NEWS)};
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
        host: playerId, // socket.id 대신 고유 playerId 사용
        players: [],
        status: 'lobby', // lobby, playing, result
        round: 1,
        timer: GAME_CONFIG.SYSTEM.ROUND_TIME,
        timerInterval: null,
        scenario: null,
        companies: JSON.parse(JSON.stringify(COMPANIES)),
        breakingNewsSchedule: [],
        skipVotes: []
      };

      const player = { id: playerId, socketId: socket.id, name: playerName, cash: GAME_CONFIG.SYSTEM.DEFAULT_CASH, shares: {}, totalAsset: GAME_CONFIG.SYSTEM.DEFAULT_CASH, quizSolved: false };
      COMPANIES.forEach(c => player.shares[c.id] = 0);
      rooms[roomId].players.push(player);

      socket.join(roomId);
      socket.emit('roomCreated', { roomId, player });
      io.to(roomId).emit('updateLobby', rooms[roomId].players);
      io.emit('roomListUpdate', getActiveRooms()); // 대기실 목록 갱신 브로드캐스트
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

      const player = { id: playerId, socketId: socket.id, name: playerName, cash: GAME_CONFIG.SYSTEM.DEFAULT_CASH, shares: {}, totalAsset: GAME_CONFIG.SYSTEM.DEFAULT_CASH, quizSolved: false };
      COMPANIES.forEach(c => player.shares[c.id] = 0);
      room.players.push(player);

      socket.join(roomId);
      socket.emit('joinedRoom', { roomId, player, room: getSafeRoomData(room) });
      io.to(roomId).emit('updateLobby', room.players);
      io.emit('roomListUpdate', getActiveRooms());
    });

    // 재접속 (새로고침 복구)
    socket.on('rejoinRoom', ({ roomId, playerId }) => {
      const room = rooms[roomId];
      if (room) {
        const player = room.players.find(p => p.id === playerId);
        if (player) {
          player.socketId = socket.id; // 새 소켓 아이디 갱신
          socket.join(roomId);
          socket.emit('rejoinedRoom', { roomId, player, room: getSafeRoomData(room) });
          if (room.status === 'lobby') {
            io.to(roomId).emit('updateLobby', room.players);
          } else {
            // 게임 중이면 현재 랭킹 및 자산 업데이트
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

    // 화면 복귀 시 동기화 요청
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

    // 방 목록 요청
    socket.on('getRoomList', () => {
      socket.emit('roomListUpdate', getActiveRooms());
    });

    // 플레이어 강퇴 (호스트 전용)
    socket.on('kickPlayer', ({ roomId, playerId }) => {
      const room = rooms[roomId];
      // 요청자가 호스트인지 확인 (host는 playerId)
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

    // 게임 시작 (호스트 전용)
    socket.on('startGame', ({ roomId, scenarioId }) => {
      const room = rooms[roomId];
      const requester = room?.players.find(p => p.socketId === socket.id);
      if (room && requester && room.host === requester.id) {
        room.scenario = SCENARIOS.find(s => s.id === scenarioId);
        room.status = 'playing';
        room.round = 1;
        room.skipVotes = [];
        
        // 라운드 시작 시점 가격 기록 및 주가 히스토리 초기화
        room.companies.forEach(c => {
          c.startPrice = c.basePrice;
          c.priceHistory = [c.basePrice];
        });
        
        io.to(roomId).emit('gameStarted', {
          scenario: room.scenario,
          companies: room.companies,
          players: room.players,
          round: room.round
        });
        
        io.emit('roomListUpdate', getActiveRooms()); // 대기실 목록에서 제거됨
        startRoundTimer(roomId);
      }
    });

    // 퀴즈 정답 제출 처리
    socket.on('quizSolved', ({ roomId }) => {
      const room = rooms[roomId];
      if (room) {
        const player = room.players.find(p => p.socketId === socket.id);
        if (player) {
          player.quizSolved = true;
          // 다른 유저들에게도 누군가 퀴즈를 풀었음을 알릴 수 있음
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

      const totalCost = comp.basePrice * qty;

      if (isBuy) {
        if (player.cash >= totalCost) {
          player.cash -= totalCost;
          player.shares[companyId] += qty;
        }
      } else {
        if (player.shares[companyId] >= qty) {
          player.cash += totalCost;
          player.shares[companyId] -= qty;
        }
      }

      calculateAssets(room);
      io.to(roomId).emit('updatePlayers', room.players);
    });

    // 다음 라운드 진행 헬퍼
    function proceedToNextRound(roomId) {
      const room = rooms[roomId];
      if (!room) return;

      if (room.autoSkipTimeout) {
        clearTimeout(room.autoSkipTimeout);
        room.autoSkipTimeout = null;
      }

      // 결과 화면 상태(result)에서만 진행 가능하도록 강제하여 중복 진입 차단
      if (room.status !== 'result') return;

      if (room.round >= 3) {
        room.status = 'end';
        io.to(roomId).emit('gameOver', room.players);
      } else {
        room.round++;
        room.status = 'playing';
        room.players.forEach(p => p.quizSolved = false); // 퀴즈 상태 초기화
        room.skipVotes = []; // 스킵 투표 초기화

        // 라운드 시작 시점 가격 기록
        room.companies.forEach(c => {
          c.startPrice = c.basePrice;
        });

        io.to(roomId).emit('roundStarted', {
          round: room.round,
          companies: room.companies,
          players: room.players
        });
        startRoundTimer(roomId);
      }
    }

    // 다음 라운드 진행
    socket.on('nextRound', ({ roomId }) => {
      const room = rooms[roomId];
      const requester = room?.players.find(p => p.socketId === socket.id);
      if (room && requester && room.host === requester.id) {
        proceedToNextRound(roomId);
      }
    });

    // 스킵 투표 처리
    socket.on('voteSkip', ({ roomId }) => {
      const room = rooms[roomId];
      if (!room || room.status !== 'playing') return;

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;

      const isHost = (room.host === player.id);

      // 라운드 시작 후 60초 미만에는 스킵 불가 (방장은 상관 없음)
      const elapsedTime = GAME_CONFIG.SYSTEM.ROUND_TIME - room.timer;
      if (!isHost && elapsedTime < 60) {
        socket.emit('errorMsg', '라운드 시작 후 60초가 지나야 스킵할 수 있습니다.');
        return;
      }

      if (isHost) {
        // 호스트(방장)가 누른 경우 즉시 강제 스킵 진행
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
        return;
      }

      if (!room.skipVotes) {
        room.skipVotes = [];
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

    // 타이머 로직
    function startRoundTimer(roomId) {
      const room = rooms[roomId];
      room.timer = GAME_CONFIG.SYSTEM.ROUND_TIME;
      
      // 긴급특보 스케줄링 (모든 라운드 적용)
      room.breakingNewsSchedule = [];
      
      const availableNews = [...BREAKING_NEWS];
      // 무작위 셔플
      for (let i = availableNews.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableNews[i], availableNews[j]] = [availableNews[j], availableNews[i]];
      }

      // 회사가 중복되지 않도록 라운드당 뉴스 후보 선정
      const selectedNewsItems = [];
      const selectedCompanyIds = new Set();

      for (const news of availableNews) {
        if (!selectedCompanyIds.has(news.companyId)) {
          selectedNewsItems.push(news);
          selectedCompanyIds.add(news.companyId);
        }
        if (selectedNewsItems.length >= 4) break; // 최대 4종목
      }

      if (selectedNewsItems.length > 0) {
        // 라운드당 뉴스 개수 설정 (3개 또는 4개)
        const targetNewsCount = Math.min(Math.floor(Math.random() * 2) + 3, selectedNewsItems.length);
        const finalNewsSelection = selectedNewsItems.slice(0, targetNewsCount);

        // 첫 번째 뉴스는 무조건 라운드 시작 30초 이내 (남은 시간 150 ~ 175초 사이)에 발생
        const firstTriggerTime = Math.floor(Math.random() * (175 - 150 + 1)) + 150;
        const usedTimes = new Set([firstTriggerTime]);

        room.breakingNewsSchedule.push({ time: firstTriggerTime, news: finalNewsSelection[0] });

        // 나머지 뉴스들은 30초 이후 (남은 시간 10 ~ 149초 사이)에 겹치지 않게 배정
        for (let i = 1; i < finalNewsSelection.length; i++) {
          let triggerTime = Math.floor(Math.random() * (149 - 10 + 1)) + 10;
          while (usedTimes.has(triggerTime)) {
            triggerTime = Math.floor(Math.random() * (149 - 10 + 1)) + 10;
          }
          usedTimes.add(triggerTime);
          room.breakingNewsSchedule.push({ time: triggerTime, news: finalNewsSelection[i] });
        }
      }
      
      if (room.timerInterval) clearInterval(room.timerInterval);

      room.timerInterval = setInterval(() => {
        room.timer--;
        io.to(roomId).emit('timerUpdate', room.timer);
        
        // 긴급특보 발생 체크
        room.breakingNewsSchedule.forEach(sch => {
          if (sch.time === room.timer) {
            // 구글 시트 기반 변동폭 계산 및 1.2배 보정 (노이즈로 자유롭게 요동침)
            const baseImpact = Math.floor(Math.random() * (sch.news.impact.max - sch.news.impact.min + 1)) + sch.news.impact.min;
            const impact = Math.round(baseImpact * 1.2);
            
            const comp = room.companies.find(c => c.id === sch.news.companyId);
            if (comp) {
              comp.basePrice = Math.floor(comp.basePrice * (1 + impact / 100));
              calculateAssets(room); // 자산 즉시 재계산
              
              io.to(roomId).emit('breakingNews', {
                news: sch.news,
                impact: impact,
                companies: room.companies,
                players: room.players
              });
            }
          }
        });

        if (room.timer <= 0) {
          clearInterval(room.timerInterval);
          endRound(roomId);
        }
      }, 1000);
    }

    // 라운드 종료 처리
    function endRound(roomId) {
      const room = rooms[roomId];
      room.status = 'result';
      
      // 시나리오에 의한 주가 변동 적용 (중간 뉴스 수치와 상관없이 시작 가격 기준으로 정직하게 수렴)
      const currentRoundData = room.scenario.rounds.find(r => r.round === room.round);
      const changes = currentRoundData.changes;
      
      room.companies.forEach(c => {
        const pct = changes[c.id] || 0;
        const startP = c.startPrice !== undefined ? c.startPrice : c.basePrice;
        c.basePrice = Math.floor(startP * (1 + pct / 100));
        if (!c.priceHistory) {
          c.priceHistory = [c.startPrice !== undefined ? c.startPrice : c.basePrice];
        }
        c.priceHistory.push(c.basePrice);
      });

      calculateAssets(room);

      io.to(roomId).emit('roundEnded', {
        round: room.round,
        companies: room.companies,
        players: room.players,
        changes: changes
      });
    }

    // 자산 계산 유틸
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

    // 연결 종료
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      for (const roomId in rooms) {
        const room = rooms[roomId];
        const pIdx = room.players.findIndex(p => p.socketId === socket.id);
        if (pIdx !== -1) {
          // 게임 대기실인 경우에만 방에서 완전히 제거
          if (room.status === 'lobby') {
            room.players.splice(pIdx, 1);
            if (room.players.length === 0) {
              if(room.timerInterval) clearInterval(room.timerInterval);
              delete rooms[roomId]; // 방 폭파
            } else {
              // 나간 사람이 방장이면 다음 사람에게 위임
              if (room.host === room.players[pIdx]?.id || true) {
                // 방장인지 체크 (위에서 splice 되었으므로 인덱스 주의)
                // 만약 현재 방장이 안보이면 첫번째 사람에게 위임
                const hasHost = room.players.some(p => p.id === room.host);
                if (!hasHost && room.players.length > 0) {
                  room.host = room.players[0].id;
                }
              }
              io.to(roomId).emit('updateLobby', room.players);
            }
            io.emit('roomListUpdate', getActiveRooms());
          } else {
            // 게임이 시작된 경우 접속만 끊김 처리 (데이터 유지)
            const disconnectedPlayer = room.players[pIdx];
            disconnectedPlayer.socketId = null;
            
            // 스킵 목록에서 제거
            if (room.skipVotes) {
              room.skipVotes = room.skipVotes.filter(id => id !== disconnectedPlayer.id);
            }

            // 게임 중이었다면 스킵 상황 체크 및 업데이트
            if (room.status === 'playing') {
              const connectedPlayers = room.players.filter(p => p.socketId !== null);
              if (connectedPlayers.length > 0) {
                if (room.skipVotes && room.skipVotes.length >= connectedPlayers.length) {
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
                } else {
                  io.to(roomId).emit('skipStatusUpdated', {
                    votedCount: room.skipVotes ? room.skipVotes.length : 0,
                    totalCount: connectedPlayers.length
                  });
                }
              }
            }
          }
        }
      }
    });
  });

  // 대기 중인 방 목록 반환 헬퍼 함수
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
