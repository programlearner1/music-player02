require('dotenv').config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");
const axios = require("axios");

const app = express();
const server = http.createServer(app);

// Configure CORS for both Express and Socket.IO
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com']
        : ['http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
};

const io = socketIo(server, {
    cors: corsOptions
});

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

const PORT = process.env.PORT || 3000;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Store room data (users via socket.id)
const rooms = new Map();

// YouTube API helper
async function getPlaylistItems(playlistId) {
    try {
        const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
            params: {
                part: 'snippet',
                maxResults: 50,
                playlistId,
                key: YOUTUBE_API_KEY,
            }
        });

        if (!response.data?.items) throw new Error('Invalid response from YouTube API');

        return response.data.items.map(item => ({
            id: item.snippet.resourceId.videoId,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails.medium.url,
            channelTitle: item.snippet.channelTitle,
        }));
    } catch (e) {
        console.error('Error fetching playlist:', e.response?.data || e.message);
        throw e;
    }
}

// API POST route for room actions
app.post('/api/room', async (req, res) => {
    try {
        const { action, roomId, data } = req.body;
        switch (action) {
            case 'join':
                if (!data.username) {
                    return res.status(400).json({ error: 'Username is required' });
                }
                if (!rooms.has(roomId)) {
                    rooms.set(roomId, {
                        users: new Map(),
                        playlist: [],
                        currentIndex: 0,
                        isPlaying: false,
                        currentTime: 0,
                    });
                }
                // NOTE: Do not track users here, only in socket handler
                const roomData = rooms.get(roomId);
                return res.json({
                    message: 'Joined room',
                    users: Array.from(roomData.users.values()),
                });

            case 'leave':
                if (rooms.has(roomId)) {
                    rooms.get(roomId).users.delete(data.socketId);
                    if (rooms.get(roomId).users.size === 0) {
                        rooms.delete(roomId);
                    }
                }
                return res.json({ message: 'Left room' });

            case 'sync':
                if (!rooms.has(roomId)) {
                    return res.status(404).json({ error: 'Room not found' });
                }
                io.to(roomId).emit('sync-playback', {
                    ...data,
                    timestamp: Date.now(),
                });
                return res.json({ message: 'Sync sent' });

            case 'load-playlist':
                if (!data.playlistId) {
                    return res.status(400).json({ error: 'Playlist ID is required' });
                }
                const videos = await getPlaylistItems(data.playlistId);
                if (!videos.length) {
                    return res.status(404).json({ error: 'No videos found in playlist' });
                }
                if (rooms.has(roomId)) {
                    rooms.get(roomId).playlist = videos;
                    rooms.get(roomId).currentIndex = 0;
                    rooms.get(roomId).currentTime = 0;
                    rooms.get(roomId).isPlaying = false;
                }
                return res.json({ videos });

            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (e) {
        console.error('API Error:', e);
        return res.status(500).json({ error: e.message });
    }
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    let currentRoom = null;
    let username = null;

    socket.on('join-room', ({ room, username: user }) => {
        currentRoom = room;
        username = user;

        socket.join(room);
        if (!rooms.has(room)) {
            rooms.set(room, {
                users: new Map(),
                playlist: [],
                currentIndex: 0,
                isPlaying: false,
                currentTime: 0,
            });
        }

        const roomData = rooms.get(room);
        // Prevent double join - check if username already joined by socket.id
        if (!roomData.users.has(socket.id)) {
            roomData.users.set(socket.id, username);
        }

        io.to(room).emit('user-joined', { users: Array.from(roomData.users.values()) });

        if (roomData.playlist.length) {
            socket.emit('playlist-loaded', roomData.playlist);
            socket.emit('sync-playback', {
                videoId: roomData.playlist[roomData.currentIndex]?.id,
                currentTime: roomData.currentTime,
                isPlaying: roomData.isPlaying,
                index: roomData.currentIndex,
            });
        }
    });

    socket.on('sync-update', ({ room, currentTime, videoId, index, isPlaying }) => {
        if (!rooms.has(room)) return;
        const roomData = rooms.get(room);
        roomData.currentTime = currentTime;
        roomData.currentIndex = index;
        roomData.isPlaying = isPlaying;

        socket.to(room).emit('sync-playback', {
            currentTime,
            videoId,
            index,
            isPlaying,
            timestamp: Date.now(),
        });
        socket.emit('sync-playback', {
            currentTime,
            videoId,
            index,
            isPlaying,
            timestamp: Date.now(),
        });
    });

    socket.on('request-sync', ({ room }) => {
        if (!rooms.has(room)) return;
        const roomData = rooms.get(room);
        if (roomData.playlist.length) {
            socket.emit('playlist-loaded', roomData.playlist);
            socket.emit('sync-playback', {
                videoId: roomData.playlist[roomData.currentIndex]?.id,
                currentTime: roomData.currentTime,
                isPlaying: roomData.isPlaying,
                index: roomData.currentIndex,
            });
        }
    });

    socket.on('disconnect', () => {
        if (currentRoom) {
            const roomData = rooms.get(currentRoom);
            if (roomData) {
                roomData.users.delete(socket.id);
                if (roomData.users.size === 0) {
                    rooms.delete(currentRoom);
                    console.log(`Room ${currentRoom} deleted as last user left`);
                } else {
                    io.to(currentRoom).emit('user-left', {
                        users: Array.from(roomData.users.values()),
                    });
                }
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

// Serve favicon and SPA fallback routes
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
