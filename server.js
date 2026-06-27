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
    socket.on('createRoom', ({ playerName, adminPassword }) => {
      if (adminPassword !== ADMIN_PASSWORD) {
        socket.emit('errorMsg', GAME_CONFIG.TEXTS.WRONG_PASSWORD_ALERT);
        return;
      }
      const roomId = generateRoomCode();
      rooms[roomId] = {
        id: roomId,
        host: socket.id,
        players: [],
        status: 'lobby', // lobby, playing, result
        round: 1,
        timer: GAME_CONFIG.SYSTEM.ROUND_TIME,
        timerInterval: null,
        scenario: null,
        companies: JSON.parse(JSON.stringify(COMPANIES)),
        breakingNewsSchedule: []
      };

      const player = { id: socket.id, name: playerName, cash: GAME_CONFIG.SYSTEM.DEFAULT_CASH, shares: {}, totalAsset: GAME_CONFIG.SYSTEM.DEFAULT_CASH, quizSolved: false };
      COMPANIES.forEach(c => player.shares[c.id] = 0);
      rooms[roomId].players.push(player);

      socket.join(roomId);
      socket.emit('roomCreated', { roomId, player });
      io.to(roomId).emit('updateLobby', rooms[roomId].players);
    });

    // 방 참가 (게스트)
    socket.on('joinRoom', ({ roomId, playerName }) => {
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

      const player = { id: socket.id, name: playerName, cash: GAME_CONFIG.SYSTEM.DEFAULT_CASH, shares: {}, totalAsset: GAME_CONFIG.SYSTEM.DEFAULT_CASH, quizSolved: false };
      COMPANIES.forEach(c => player.shares[c.id] = 0);
      room.players.push(player);

      socket.join(roomId);
      socket.emit('joinedRoom', { roomId, player, room });
      io.to(roomId).emit('updateLobby', room.players);
    });

    // 플레이어 강퇴 (호스트 전용)
    socket.on('kickPlayer', ({ roomId, playerId }) => {
      const room = rooms[roomId];
      if (room && room.host === socket.id) {
        const pIdx = room.players.findIndex(p => p.id === playerId);
        if (pIdx !== -1) {
          const kickedSocket = io.sockets.sockets.get(playerId);
          if (kickedSocket) {
            kickedSocket.leave(roomId);
            kickedSocket.emit('kicked');
          }
          room.players.splice(pIdx, 1);
          io.to(roomId).emit('updateLobby', room.players);
        }
      }
    });

    // 게임 시작 (호스트 전용)
    socket.on('startGame', ({ roomId, scenarioId }) => {
      const room = rooms[roomId];
      if (room && room.host === socket.id) {
        room.scenario = SCENARIOS.find(s => s.id === scenarioId);
        room.status = 'playing';
        room.round = 1;
        
        io.to(roomId).emit('gameStarted', {
          scenario: room.scenario,
          companies: room.companies,
          players: room.players,
          round: room.round
        });

        startRoundTimer(roomId);
      }
    });

    // 퀴즈 정답 제출 처리
    socket.on('quizSolved', ({ roomId }) => {
      const room = rooms[roomId];
      if (room) {
        const player = room.players.find(p => p.id === socket.id);
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

      const player = room.players.find(p => p.id === socket.id);
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

    // 다음 라운드 진행
    socket.on('nextRound', ({ roomId }) => {
      const room = rooms[roomId];
      if (room && room.host === socket.id) {
        if (room.round >= 3) {
          room.status = 'end';
          io.to(roomId).emit('gameOver', room.players);
        } else {
          room.round++;
          room.status = 'playing';
          room.players.forEach(p => p.quizSolved = false); // 퀴즈 상태 초기화

          io.to(roomId).emit('roundStarted', {
            round: room.round,
            companies: room.companies,
            players: room.players
          });
          startRoundTimer(roomId);
        }
      }
    });

    // 타이머 로직
    function startRoundTimer(roomId) {
      const room = rooms[roomId];
      room.timer = GAME_CONFIG.SYSTEM.ROUND_TIME;
      
      // 긴급특보 스케줄링 (0 ~ 2회)
      const newsCount = Math.floor(Math.random() * 3);
      room.breakingNewsSchedule = [];
      const availableNews = [...BREAKING_NEWS];
      for(let i=0; i<newsCount; i++) {
        if (availableNews.length === 0) break;
        const idx = Math.floor(Math.random() * availableNews.length);
        const newsItem = availableNews.splice(idx, 1)[0];
        const triggerTime = Math.floor(Math.random() * 140) + 20; // 20초 ~ 160초 남았을 때
        room.breakingNewsSchedule.push({ time: triggerTime, news: newsItem });
      }
      
      if (room.timerInterval) clearInterval(room.timerInterval);

      room.timerInterval = setInterval(() => {
        room.timer--;
        io.to(roomId).emit('timerUpdate', room.timer);
        
        // 긴급특보 발생 체크
        room.breakingNewsSchedule.forEach(sch => {
          if (sch.time === room.timer) {
            const impact = Math.floor(Math.random() * (sch.news.impact.max - sch.news.impact.min + 1)) + sch.news.impact.min;
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
      
      // 시나리오에 의한 주가 변동 적용 (특보 이후 복리로 적용됨)
      const currentRoundData = room.scenario.rounds.find(r => r.round === room.round);
      const changes = currentRoundData.changes;
      
      room.companies.forEach(c => {
        const pct = changes[c.id] || 0;
        c.basePrice = Math.floor(c.basePrice * (1 + pct / 100));
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
        const pIdx = room.players.findIndex(p => p.id === socket.id);
        if (pIdx !== -1) {
          room.players.splice(pIdx, 1);
          if (room.players.length === 0) {
            if(room.timerInterval) clearInterval(room.timerInterval);
            delete rooms[roomId]; // 방 폭파
          } else {
            // 만약 호스트가 나갔다면 다음 사람에게 방장 위임
            if (room.host === socket.id) {
              room.host = room.players[0].id;
            }
            io.to(roomId).emit('updateLobby', room.players);
          }
        }
      }
    });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

startServer();
