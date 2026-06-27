const io = require('socket.io-client');
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server!');
  console.log('Sending createRoom with admin123...');
  socket.emit('createRoom', { playerName: 'Test', adminPassword: 'admin123' });
});

socket.on('roomCreated', (data) => {
  console.log('SUCCESS! Room created:', data.roomId);
  process.exit(0);
});

socket.on('errorMsg', (msg) => {
  console.log('ERROR FROM SERVER:', msg);
  process.exit(1);
});

setTimeout(() => {
  console.log('TIMEOUT');
  process.exit(1);
}, 3000);
