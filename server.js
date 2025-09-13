const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Store room data and drawing data
const rooms = new Map();
const drawingData = new Map();

// Generate unique room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Handle room creation
  socket.on('create-room', (username) => {
    const roomId = generateRoomId();
    
    // Initialize room
    rooms.set(roomId, {
      users: [{ id: socket.id, username }],
      createdAt: Date.now()
    });
    drawingData.set(roomId, []);
    
    // Join the room
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;
    
    // Send room info back to creator
    socket.emit('room-created', { roomId, username });
    
    console.log(`Room ${roomId} created by ${username}`);
  });
  
  // Handle room joining
  socket.on('join-room', ({ roomId, username }) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('join-error', 'Room not found');
      return;
    }
    
    if (room.users.length >= 2) {
      socket.emit('join-error', 'Room is full (max 2 users)');
      return;
    }
    
    // Check if username already exists in room
    if (room.users.some(user => user.username === username)) {
      socket.emit('join-error', 'Username already taken in this room');
      return;
    }
    
    // Add user to room
    room.users.push({ id: socket.id, username });
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;
    
    // Send existing drawing data to new user
    socket.emit('load-drawing', drawingData.get(roomId) || []);
    
    // Notify all users in room about the new user
    io.to(roomId).emit('user-joined', {
      users: room.users,
      message: `${username} joined the room`
    });
    
    console.log(`${username} joined room ${roomId}`);
  });
  
  // Handle drawing events
  socket.on('draw', (data) => {
    if (!socket.roomId) return;
    
    // Store the drawing data
    const roomDrawingData = drawingData.get(socket.roomId) || [];
    roomDrawingData.push(data);
    drawingData.set(socket.roomId, roomDrawingData);
    
    // Broadcast to all other clients in the same room
    socket.to(socket.roomId).emit('draw', data);
  });
  
  // Handle clear canvas
  socket.on('clear-canvas', () => {
    if (!socket.roomId) return;
    
    drawingData.set(socket.roomId, []);
    io.to(socket.roomId).emit('clear-canvas');
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        // Remove user from room
        room.users = room.users.filter(user => user.id !== socket.id);
        
        if (room.users.length === 0) {
          // Delete empty room
          rooms.delete(socket.roomId);
          drawingData.delete(socket.roomId);
          console.log(`Room ${socket.roomId} deleted (empty)`);
        } else {
          // Notify remaining users
          io.to(socket.roomId).emit('user-left', {
            users: room.users,
            message: `${socket.username} left the room`
          });
        }
      }
    }
  });
});

// Clean up inactive rooms (older than 1 hour)
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.createdAt > oneHour && room.users.length === 0) {
      rooms.delete(roomId);
      drawingData.delete(roomId);
      console.log(`Cleaned up inactive room: ${roomId}`);
    }
  }
}, 30 * 60 * 1000); // Check every 30 minutes

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});