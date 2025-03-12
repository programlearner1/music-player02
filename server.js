const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

app.use(cors());
app.use(express.static(path.join(__dirname)));

// Serve favicon
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'favicon.ico'));
});

// Playlist API endpoint
app.get('/api/playlist/:playlistId', async (req, res) => {
    try {
        const playlistId = req.params.playlistId;
        const response = await axios.get(`https://www.googleapis.com/youtube/v3/playlistItems`, {
            params: {
                part: 'snippet',
                maxResults: 50,
                playlistId: playlistId,
                key: YOUTUBE_API_KEY
            }
        });

        const videos = response.data.items.map(item => ({
            videoId: item.snippet.resourceId.videoId,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails.default.url
        }));

        res.json(videos);
    } catch (error) {
        console.error('Error fetching playlist:', error);
        res.status(500).json({ error: 'Failed to fetch playlist' });
    }
});

// Fallback route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Store room states
const rooms = new Map();

let songs = [
  { title: "Ah bandham abhadhama", artist: "Artist 1", url: "music/song2.mp3", image: "music/download.jpeg" },
  { title: "Rangule", artist: "Artist 2", url: "music/song3.mp3", image: "music/raniji.jpg" },
  { title: "Rayani kathale", artist: "Artist 3", url: "music/song4.mp3", image: "music/bachan.jpg" },
];

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  let currentRoom = null;
  let username = null;

  socket.on("join-room", ({ room, username: user }) => {
    currentRoom = room;
    username = user;

    socket.join(room);
    if (!rooms.has(room)) {
      rooms.set(room, new Set());
    }
    rooms.get(room).add(username);

    io.to(room).emit("user-joined", {
      users: Array.from(rooms.get(room))
    });

    // Request sync state from an existing user
    socket.to(room).emit("request-sync", { room });
  });

  socket.on("playback-state", ({ isPlaying, room }) => {
    socket.to(room).emit("playback-state", { isPlaying });
  });

  socket.on("song-change", ({ room, videoId, index, timestamp }) => {
    socket.to(room).emit("song-change", { videoId, index, timestamp });
  });

  socket.on("sync-update", ({ room, currentTime, timestamp, videoId, index }) => {
    const latency = Date.now() - timestamp;
    socket.to(room).emit("sync-playback", {
      currentTime,
      timestamp,
      latency,
      videoId,
      index
    });
  });

  socket.on("request-sync", ({ room }) => {
    socket.to(room).emit("request-sync", { room });
  });

  socket.on("sync-playlist-to-room", (data) => {
    const room = rooms.get(data.roomId);
    if (room) {
      room.playlist = data.videos;
      room.currentIndex = data.currentIndex;
      room.isPlaying = data.isPlaying;
      
      // Broadcast to all other users in the room
      socket.to(data.roomId).emit("sync-playlist-from-room", {
        videos: data.videos,
        currentIndex: data.currentIndex,
        isPlaying: data.isPlaying
      });
    }
  });

  socket.on("sync-playback", (data) => {
    const room = rooms.get(data.roomId);
    if (room) {
      room.currentIndex = data.currentIndex;
      room.isPlaying = data.isPlaying;
      
      // Broadcast to all other users in the room
      socket.to(data.roomId).emit("sync-playback", {
        currentIndex: data.currentIndex,
        isPlaying: data.isPlaying,
        currentTime: data.currentTime
      });
    }
  });

  socket.on("play-song", ({ roomId }) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.isPlaying = true;
      io.to(roomId).emit("play-song", { song: songs[room.currentIndex], isPlaying: true, currentTime: room.currentTime });
    }
  });

  socket.on("pause-song", ({ roomId }) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.isPlaying = false;
      io.to(roomId).emit("pause-song");
    }
  });

  socket.on("next-song", ({ roomId }) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.currentIndex = (room.currentIndex + 1) % songs.length;
      room.isPlaying = true;
      room.currentTime = 0;
      io.to(roomId).emit("play-song", { song: songs[room.currentIndex], isPlaying: true, currentTime: 0 });
    }
  });

  socket.on("previous-song", ({ roomId }) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.currentIndex = (room.currentIndex - 1 + songs.length) % songs.length;
      room.isPlaying = true;
      room.currentTime = 0;
      io.to(roomId).emit("play-song", { song: songs[room.currentIndex], isPlaying: true, currentTime: 0 });
    }
  });

  socket.on("update-time", ({ roomId, currentTime }) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.currentTime = currentTime;
    }
  });

  socket.on("syncPlay", ({ roomId, videoId, time }) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.videoId = videoId;
      room.videoTime = time;
      io.to(roomId).emit("syncPlay", { videoId, time });
    }
  });

  socket.on("syncPause", ({ roomId }) => {
    if (rooms.has(roomId)) {
      io.to(roomId).emit("syncPause");
    }
  });

  socket.on("load-playlist", async ({ roomId, playlistId }) => {
    try {
      const response = await axios.get("https://www.googleapis.com/youtube/v3/playlistItems", {
        params: { part: "snippet", maxResults: 10, playlistId: playlistId, key: YOUTUBE_API_KEY },
      });
      const videoIds = response.data.items.map((item) => item.snippet.resourceId.videoId);
      io.to(roomId).emit("playlist-loaded", videoIds);
    } catch (error) {
      console.error("Error fetching playlist:", error);
    }
  });

  socket.on("disconnect", () => {
    if (currentRoom && username) {
      const room = rooms.get(currentRoom);
      if (room) {
        room.delete(username);
        if (room.size === 0) {
          rooms.delete(currentRoom);
        } else {
          io.to(currentRoom).emit("user-left", {
            users: Array.from(room)
          });
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
