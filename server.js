const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const axios = require("axios");

const YOUTUBE_API_KEY = "AIzaSyB8Phtr6Jlm9wRm-Ja51QhNZiA1zM4541o"; // Replace with your YouTube API key

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static("public")); // Serve files from /public

// Serve favicon
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
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

  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);
    
    // Initialize room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: [],
        playlist: [],
        currentIndex: 0,
        isPlaying: false
      });
    }
    
    const room = rooms.get(roomId);
    room.users.push({ id: socket.id, username });
    
    // Send current room state to new user
    socket.emit("sync-playlist-from-room", {
      videos: room.playlist,
      currentIndex: room.currentIndex,
      isPlaying: room.isPlaying
    });
    
    // Notify others about new user
    io.to(roomId).emit("user-joined", {
      username,
      users: room.users
    });
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
    // Remove user from all rooms they were in
    rooms.forEach((room, roomId) => {
      const index = room.users.findIndex(user => user.id === socket.id);
      if (index !== -1) {
        room.users.splice(index, 1);
        io.to(roomId).emit("user-left", {
          users: room.users
        });
        
        // Clean up empty rooms
        if (room.users.length === 0) {
          rooms.delete(roomId);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
