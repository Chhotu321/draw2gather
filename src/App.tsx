import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// Use environment variable or fallback to localhost for development
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Point {
  x: number;
  y: number;
  color: string;
  size: number;
}

interface Room {
  roomId: string;
  username: string;
}

const COLORS = ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];
const BRUSH_SIZES = [2, 4, 8, 16, 32];

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [users, setUsers] = useState<Array<{id: string, username: string}>>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  // Initialize socket connection
  useEffect(() => {
    const socketInstance = io(API_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      path: '/socket.io/',
      query: {}
    });

    // Connection established
    socketInstance.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
      setError('');
    });

    // Connection error
    socketInstance.on('connect_error', (err) => {
      console.error('Connection error:', err);
      setError('Failed to connect to the server. Please try again.');
      setIsConnected(false);
    });

    // Handle drawing events
    socketInstance.on('draw', (data: Point) => {
      drawOnCanvas(data, false);
    });

    // Handle canvas clear
    socketInstance.on('clear-canvas', () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });

    // Handle user joined room
    socketInstance.on('user-joined', (data: { users: Array<{id: string, username: string}>, message: string }) => {
      setUsers(data.users);
      console.log(data.message);
    });

    // Handle user left room
    socketInstance.on('user-left', (data: { userId: string, username: string, users: Array<{id: string, username: string}>, message: string }) => {
      setUsers(data.users);
      console.log(data.message);
    });

    // Handle join errors
    socketInstance.on('join-error', (message: string) => {
      setError(message);
      setIsJoining(false);
    });

    // Load existing drawing data
    socketInstance.on('load-drawing', (drawingData: Point[]) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawingData.forEach(point => drawPoint(ctx, point));
      }
    });

    setSocket(socketInstance);

    // Clean up on unmount
    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, []);

  // Draw a point on the canvas
  const drawPoint = (ctx: CanvasRenderingContext2D, point: Point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.size / 2, 0, Math.PI * 2);
    ctx.fillStyle = point.color;
    ctx.fill();
  };

  // Handle drawing on canvas
  const drawOnCanvas = (data: Point, isLocal: boolean) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      drawPoint(ctx, data);
      
      // Only emit if it's the local user drawing
      if (isLocal && socket && room) {
        socket.emit('draw', data);
      }
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    drawOnCanvas({ x, y, color, size: brushSize }, true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    drawOnCanvas({ x, y, color, size: brushSize }, true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (socket) {
        socket.emit('clear-canvas');
      }
    }
  };

  const createRoom = () => {
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }
    
    if (socket) {
      socket.emit('create-room', username);
      socket.once('room-created', (data: { roomId: string; username: string }) => {
        setRoom({ roomId: data.roomId, username });
        setUsers([{ id: socket?.id || '', username }]);
      });
    }
  };

  const joinRoom = () => {
    if (!username.trim() || !roomId.trim()) {
      setError('Please enter both username and room ID');
      return;
    }
    
    setIsJoining(true);
    setError('');
    
    if (socket) {
      socket.emit('join-room', { roomId, username });
      socket.once('user-joined', (data) => {
        setRoom({ roomId, username });
        setUsers(data.users);
        setIsJoining(false);
      });
    }
  };

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold mb-6 text-center">Multiplayer Drawing App</h1>
          
          {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              placeholder="Enter your username"
            />
          </div>
          
          {!showRoomForm ? (
            <div className="flex flex-col space-y-4">
              <button
                onClick={() => setShowRoomForm(true)}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              >
                Join a Room
              </button>
              <button
                onClick={createRoom}
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              >
                Create a Room
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="roomId">
                  Room ID
                </label>
                <input
                  id="roomId"
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                  placeholder="Enter room ID"
                />
              </div>
              <div className="flex space-x-4">
                <button
                  onClick={joinRoom}
                  disabled={isJoining}
                  className="flex-1 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline disabled:opacity-50"
                >
                  {isJoining ? 'Joining...' : 'Join Room'}
                </button>
                <button
                  onClick={() => setShowRoomForm(false)}
                  className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">Room: {room.roomId}</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Users:</span>
              <div className="flex -space-x-2">
                {users.map((user, index) => (
                  <div key={user.id} className="relative">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    {index === 0 && users.length > 1 && (
                      <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {users.length}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={clearCanvas}
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded text-sm"
            >
              Clear Canvas
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4">
        <div className="max-w-7xl mx-auto bg-white rounded-lg shadow overflow-hidden">
          <div className="p-2 bg-gray-100 border-b flex flex-wrap items-center space-x-2">
            <div className="flex items-center space-x-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-blue-500' : 'border-gray-300'}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            <div className="h-6 border-l border-gray-300 mx-2"></div>
            <div className="flex items-center space-x-1">
              {BRUSH_SIZES.map((size) => (
                <button
                  key={size}
                  onClick={() => setBrushSize(size)}
                  className={`flex items-center justify-center rounded ${brushSize === size ? 'bg-blue-100' : 'hover:bg-gray-200'} px-2 py-1`}
                >
                  <div 
                    className="rounded-full bg-black"
                    style={{ width: size / 2, height: size / 2 }}
                  />
                </button>
              ))}
            </div>
          </div>
          
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={1200}
              height={600}
              className="w-full border border-gray-200 cursor-crosshair"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />
          </div>
        </div>
      </main>

      <footer className="bg-white border-t p-4">
        <div className="max-w-7xl mx-auto text-center text-sm text-gray-500">
          Drawing with: {color} | Brush size: {brushSize}px | {users.length} {users.length === 1 ? 'user' : 'users'} in room
        </div>
      </footer>
    </div>
  );
}

export default App;
