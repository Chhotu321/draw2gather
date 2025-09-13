require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://exquisite-pudding-cf4f73.netlify.app'
];

// Configure CORS for Express
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const server = http.createServer(app);

// Configure Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  path: process.env.SOCKET_PATH || '/socket.io/'
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
    
    // Clear stored drawing data for the room
    drawingData.set(socket.roomId, []);
    
    // Broadcast to all clients in the room
    io.to(socket.roomId).emit('clear-canvas');
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      if (room) {
        // Remove user from room
        room.users = room.users.filter(user => user.id !== socket.id);
        
        // If room is empty, clean up
        if (room.users.length === 0) {
          rooms.delete(socket.roomId);
          drawingData.delete(socket.roomId);
          console.log(`Room ${socket.roomId} deleted (empty)`);
        } else {
          // Notify remaining users that someone left
          io.to(socket.roomId).emit('user-left', {
            userId: socket.id,
            username: socket.username,
            users: room.users,
            message: `${socket.username || 'A user'} left the room`
          });
        }
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cors: {
      allowedOrigins: allowedOrigins
    }
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`Socket.IO path: ${process.env.SOCKET_PATH || '/socket.io/'}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});