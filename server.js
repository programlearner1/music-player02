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

let rooms = {};
const songs = [
  { title: "Ah bandham abhadhama", artist: "Artist 1", url: "music/song2.mp3", image: "music/download.jpeg" },
  { title: "Rangule", artist: "Artist 2", url: "music/song3.mp3", image: "music/raniji.jpg" },
  { title: "Rayani kathale", artist: "Artist 3", url: "music/song4.mp3", image: "music/bachan.jpg" },
];

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join-room", ({ roomId, username }) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = { users: [], currentSongIndex: 0, isPlaying: false, currentTime: 0, videoId: null, videoTime: 0 };
    }
    rooms[roomId].users.push({ id: socket.id, username });
    io.to(roomId).emit("user-joined", { username, users: rooms[roomId].users });
  });

  socket.on("play-song", ({ roomId }) => {
    if (rooms[roomId]) {
      rooms[roomId].isPlaying = true;
      io.to(roomId).emit("play-song", { song: songs[rooms[roomId].currentSongIndex], isPlaying: true, currentTime: rooms[roomId].currentTime });
    }
  });

  socket.on("pause-song", ({ roomId }) => {
    if (rooms[roomId]) {
      rooms[roomId].isPlaying = false;
      io.to(roomId).emit("pause-song");
    }
  });

  socket.on("next-song", ({ roomId }) => {
    if (rooms[roomId]) {
      rooms[roomId].currentSongIndex = (rooms[roomId].currentSongIndex + 1) % songs.length;
      rooms[roomId].isPlaying = true;
      rooms[roomId].currentTime = 0;
      io.to(roomId).emit("play-song", { song: songs[rooms[roomId].currentSongIndex], isPlaying: true, currentTime: 0 });
    }
  });

  socket.on("previous-song", ({ roomId }) => {
    if (rooms[roomId]) {
      rooms[roomId].currentSongIndex = (rooms[roomId].currentSongIndex - 1 + songs.length) % songs.length;
      rooms[roomId].isPlaying = true;
      rooms[roomId].currentTime = 0;
      io.to(roomId).emit("play-song", { song: songs[rooms[roomId].currentSongIndex], isPlaying: true, currentTime: 0 });
    }
  });

  socket.on("update-time", ({ roomId, currentTime }) => {
    if (rooms[roomId]) {
      rooms[roomId].currentTime = currentTime;
    }
  });

  socket.on("syncPlay", ({ roomId, videoId, time }) => {
    if (rooms[roomId]) {
      rooms[roomId].videoId = videoId;
      rooms[roomId].videoTime = time;
      io.to(roomId).emit("syncPlay", { videoId, time });
    }
  });

  socket.on("syncPause", ({ roomId }) => {
    if (rooms[roomId]) {
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
    for (let roomId in rooms) {
      rooms[roomId].users = rooms[roomId].users.filter((user) => user.id !== socket.id);
      if (rooms[roomId].users.length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit("user-left", { users: rooms[roomId].users });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
