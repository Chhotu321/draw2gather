class DrawingApp {
    constructor() {
        this.socket = io();
        this.currentPage = 'homepage';
        this.roomId = null;
        this.username = null;
        this.isDrawing = false;
        this.currentTool = 'pencil';
        this.currentColor = '#000000';
        this.currentBrushSize = 3;
        
        this.initHomepage();
        this.initPaintInterface();
        this.initSocketEvents();
    }
    
    initHomepage() {
        const createRoomBtn = document.getElementById('create-room-btn');
        const joinRoomBtn = document.getElementById('join-room-btn');
        const usernameInput = document.getElementById('username');
        const roomIdInput = document.getElementById('room-id');
        
        createRoomBtn.addEventListener('click', () => {
            const username = usernameInput.value.trim();
            if (!username) {
                this.showError('Please enter your name');
                return;
            }
            
            this.username = username;
            this.socket.emit('create-room', username);
        });
        
        joinRoomBtn.addEventListener('click', () => {
            const username = usernameInput.value.trim();
            const roomId = roomIdInput.value.trim().toUpperCase();
            
            if (!username) {
                this.showError('Please enter your name');
                return;
            }
            
            if (!roomId) {
                this.showError('Please enter a room ID');
                return;
            }
            
            this.username = username;
            this.socket.emit('join-room', { roomId, username });
        });
        
        // Enter key handlers
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                createRoomBtn.click();
            }
        });
        
        roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                joinRoomBtn.click();
            }
        });
        
        // Auto-uppercase room ID input
        roomIdInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }
    
    initPaintInterface() {
        this.canvas = document.getElementById('drawing-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Set initial drawing properties
        this.updateDrawingProperties();
        
        // Tool selection
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;
                this.updateCursor();
            });
        });
        
        // Color selection
        document.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', (e) => {
                document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
                this.currentColor = swatch.dataset.color;
                document.getElementById('color-picker').value = this.currentColor;
                this.updateDrawingProperties();
            });
        });
        
        // Color picker
        document.getElementById('color-picker').addEventListener('change', (e) => {
            this.currentColor = e.target.value;
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            this.updateDrawingProperties();
        });
        
        // Brush size
        const brushSizeSlider = document.getElementById('brush-size');
        const brushSizeDisplay = document.getElementById('brush-size-display');
        
        brushSizeSlider.addEventListener('input', (e) => {
            this.currentBrushSize = parseInt(e.target.value);
            brushSizeDisplay.textContent = `${this.currentBrushSize}px`;
            this.updateDrawingProperties();
        });
        
        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());
        
        // Touch events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            this.canvas.dispatchEvent(mouseEvent);
        });
        
        // Clear canvas
        document.getElementById('clear-canvas-btn').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear the canvas? This action cannot be undone.')) {
                this.socket.emit('clear-canvas');
            }
        });
        
        // Leave room
        document.getElementById('leave-room-btn').addEventListener('click', () => {
            if (confirm('Are you sure you want to leave the room?')) {
                this.leaveRoom();
            }
        });
    }
    
    initSocketEvents() {
        this.socket.on('connect', () => {
            this.updateConnectionStatus('connected', 'Connected');
        });
        
        this.socket.on('disconnect', () => {
            this.updateConnectionStatus('disconnected', 'Disconnected');
        });
        
        this.socket.on('room-created', ({ roomId, username }) => {
            this.roomId = roomId;
            this.showSuccess(`Room created! Share this ID with a friend: ${roomId}`);
            setTimeout(() => {
                this.enterPaintInterface();
            }, 2000);
        });
        
        this.socket.on('join-error', (message) => {
            this.showError(message);
        });
        
        this.socket.on('user-joined', ({ users, message }) => {
            this.updateUserList(users);
            this.showNotification(message);
        });
        
        this.socket.on('user-left', ({ users, message }) => {
            this.updateUserList(users);
            this.showNotification(message);
        });
        
        this.socket.on('load-drawing', (drawingData) => {
            this.clearCanvas();
            drawingData.forEach(data => {
                this.drawLine(data);
            });
            this.enterPaintInterface();
        });
        
        this.socket.on('draw', (data) => {
            this.drawLine(data);
        });
        
        this.socket.on('clear-canvas', () => {
            this.clearCanvas();
        });
    }
    
    updateDrawingProperties() {
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.currentBrushSize;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }
    
    updateCursor() {
        if (this.currentTool === 'eraser') {
            this.canvas.style.cursor = 'grab';
        } else {
            this.canvas.style.cursor = 'crosshair';
        }
    }
    
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }
    
    startDrawing(e) {
        this.isDrawing = true;
        const pos = this.getMousePos(e);
        this.lastX = pos.x;
        this.lastY = pos.y;
    }
    
    draw(e) {
        if (!this.isDrawing) return;
        
        const pos = this.getMousePos(e);
        
        const drawData = {
            x0: this.lastX,
            y0: this.lastY,
            x1: pos.x,
            y1: pos.y,
            color: this.currentTool === 'eraser' ? '#FFFFFF' : this.currentColor,
            lineWidth: this.currentTool === 'eraser' ? this.currentBrushSize * 2 : this.currentBrushSize,
            tool: this.currentTool
        };
        
        // Draw locally
        this.drawLine(drawData);
        
        // Send to server
        this.socket.emit('draw', drawData);
        
        this.lastX = pos.x;
        this.lastY = pos.y;
    }
    
    stopDrawing() {
        this.isDrawing = false;
    }
    
    drawLine(data) {
        this.ctx.globalCompositeOperation = data.tool === 'eraser' ? 'destination-out' : 'source-over';
        this.ctx.beginPath();
        this.ctx.strokeStyle = data.color || '#000000';
        this.ctx.lineWidth = data.lineWidth || 3;
        this.ctx.moveTo(data.x0, data.y0);
        this.ctx.lineTo(data.x1, data.y1);
        this.ctx.stroke();
        this.ctx.globalCompositeOperation = 'source-over';
    }
    
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    enterPaintInterface() {
        document.getElementById('homepage').classList.remove('active');
        document.getElementById('paint-interface').classList.add('active');
        document.getElementById('room-title').textContent = `Room: ${this.roomId} - Paint`;
        this.currentPage = 'paint-interface';
    }
    
    leaveRoom() {
        this.socket.disconnect();
        this.socket.connect();
        document.getElementById('paint-interface').classList.remove('active');
        document.getElementById('homepage').classList.add('active');
        this.currentPage = 'homepage';
        this.roomId = null;
        this.clearMessages();
    }
    
    updateUserList(users) {
        const userList = document.getElementById('user-list');
        const usernames = users.map(user => user.username).join(', ');
        userList.textContent = `Users (${users.length}/2): ${usernames}`;
    }
    
    updateConnectionStatus(status, text) {
        const statusElement = document.getElementById('connection-status');
        const dot = statusElement.querySelector('.status-dot');
        const textElement = statusElement.querySelector('.status-text');
        
        dot.className = `status-dot ${status}`;
        textElement.textContent = text;
    }
    
    showError(message) {
        const errorElement = document.getElementById('error-message');
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
        
        setTimeout(() => {
            errorElement.classList.add('hidden');
        }, 5000);
    }
    
    showSuccess(message) {
        const successElement = document.getElementById('success-message');
        successElement.textContent = message;
        successElement.classList.remove('hidden');
        
        setTimeout(() => {
            successElement.classList.add('hidden');
        }, 5000);
    }
    
    showNotification(message) {
        // You could implement a toast notification system here
        console.log('Notification:', message);
    }
    
    clearMessages() {
        document.getElementById('error-message').classList.add('hidden');
        document.getElementById('success-message').classList.add('hidden');
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new DrawingApp();
});