const socket = io(window.location.origin);
const audioPlayer = document.getElementById("audio-player");
const roomIdInput = document.getElementById("room-id");
const usernameInput = document.getElementById("username");
const joinRoomBtn = document.getElementById("join-room-btn");
const playBtn = document.getElementById("play-btn");
const pauseBtn = document.getElementById("pause-btn");
const nextBtn = document.getElementById("next-btn");
const previousBtn = document.getElementById("previous-btn");
const playbackControls = document.getElementById("playback-controls");
const playlistElement = document.getElementById("playlist");
const youtubePlaylistInput = document.getElementById("youtube-playlist-url");
const loadPlaylistBtn = document.getElementById("load-playlist-btn");

let player;
let roomId = "";
let currentRoom = null;
let videoQueue = [];
let currentVideoIndex = 0;

// Example MP3 playlist
const songs = [
  { title: "Ah bandham abhadhama", artist: "Artist 1", url: "public/music/song2.mp3", image: "public/images/bachan.jpg" },
  { title: "Rangule", artist: "Artist 2", url: "public/music/song3.mp3", image: "public/images/download.jpeg" },
  { title: "Rayani kathale", artist: "Artist 3", url: "public/music/song4.mp3", image: "public/images/rajini.jpg" },
];

// Join room
joinRoomBtn.addEventListener("click", () => {
  roomId = roomIdInput.value;
  const username = usernameInput.value;
  if (roomId && username) {
    currentRoom = roomId;
    socket.emit("join-room", { roomId, username });
    playbackControls.style.display = "block";
  } else {
    alert("Please enter a room ID and username.");
  }
});

// Handle MP3 play
playBtn.addEventListener("click", () => {
  if (currentRoom) {
    socket.emit("play-song", { roomId: currentRoom });
    audioPlayer.play().catch((error) => {
      console.error("Error playing audio:", error);
      alert("Click the play button to start playback.");
    });
  }
});

// Handle MP3 pause
pauseBtn.addEventListener("click", () => {
  if (currentRoom) {
    socket.emit("pause-song", { roomId: currentRoom });
    audioPlayer.pause();
  }
});

// Handle MP3 next
nextBtn.addEventListener("click", () => {
  if (currentRoom) {
    socket.emit("next-song", { roomId: currentRoom });
  }
});

// Handle MP3 previous
previousBtn.addEventListener("click", () => {
  if (currentRoom) {
    socket.emit("previous-song", { roomId: currentRoom });
  }
});

// Sync MP3 playback time
audioPlayer.addEventListener("timeupdate", () => {
  if (currentRoom) {
    socket.emit("update-time", { roomId: currentRoom, currentTime: audioPlayer.currentTime });
  }
});

// Handle play-song event (MP3)
socket.on("play-song", ({ song, isPlaying, currentTime }) => {
  console.log("Received play-song event:", song);
  audioPlayer.src = song.url;
  audioPlayer.currentTime = currentTime;
  if (isPlaying) {
    audioPlayer.play().catch((error) => {
      console.error("Error playing audio:", error);
      alert("Click the play button to start playback.");
    });
  }
});

// Handle pause-song event (MP3)
socket.on("pause-song", () => {
  console.log("Received pause-song event");
  audioPlayer.pause();
});

// Handle user-joined event
socket.on("user-joined", ({ username, users }) => {
  console.log(`${username} joined the room. Users in room:`, users);
});

// Handle user-left event
socket.on("user-left", ({ users }) => {
  console.log("Users in room:", users);
});

/* ------------------- YouTube Playlist Integration ------------------- */

// Load YouTube playlist
loadPlaylistBtn.addEventListener("click", async () => {
  const playlistUrl = youtubePlaylistInput.value;
  const playlistId = extractPlaylistId(playlistUrl);

  if (playlistId) {
    socket.emit("load-playlist", { roomId, playlistId });
  } else {
    alert("Invalid YouTube playlist URL");
  }
});

// Function to extract YouTube playlist ID from the URL
function extractPlaylistId(url) {
  const match = url.match(/[?&]list=([^&]+)/);
  return match ? match[1] : null;
}

// Listen for a new playlist from the server
socket.on("playlist-loaded", (videoIds) => {
  if (videoIds.length > 0) {
    videoQueue = videoIds;
    currentVideoIndex = 0;
    playYouTubeVideo(videoQueue[currentVideoIndex]); // Start with the first video
  }
});

// Load the YouTube IFrame Player API code asynchronously
function onYouTubeIframeAPIReady() {
  player = new YT.Player("player", {
    height: "360",
    width: "640",
    playerVars: { autoplay: 1, controls: 1 },
    events: { onStateChange: onPlayerStateChange },
  });
}


// Function to load YouTube video
function playYouTubeVideo(videoId) {
  if (typeof YT === "undefined" || !YT.Player) {
    console.warn("YouTube API not loaded yet. Retrying...");
    setTimeout(() => playYouTubeVideo(videoId), 1000);
    return;
  }
  if (player) {
    player.loadVideoById(videoId);
  } else {
    player = new YT.Player("player", {
      height: "360",
      width: "640",
      videoId: videoId,
      playerVars: { autoplay: 1, controls: 1 },
      events: { onStateChange: onPlayerStateChange },
    });
  }
}


// Handle YouTube player state change
function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    currentVideoIndex++;
    if (currentVideoIndex < videoQueue.length) {
      playYouTubeVideo(videoQueue[currentVideoIndex]);
      socket.emit("syncPlay", { roomId, videoId: videoQueue[currentVideoIndex] });
    }
  } else if (event.data === YT.PlayerState.PLAYING) {
    const time = player.getCurrentTime();
    socket.emit("syncPlay", { roomId, videoId: videoQueue[currentVideoIndex], time });
  } else if (event.data === YT.PlayerState.PAUSED) {
    socket.emit("syncPause", { roomId });
  }
}

// Play button sync (YouTube)
playBtn.addEventListener("click", () => {
  if (player) {
    player.playVideo();
    socket.emit("syncPlay", { roomId, videoId: videoQueue[currentVideoIndex], time: player.getCurrentTime() });
  }
});

// Pause button sync (YouTube)
pauseBtn.addEventListener("click", () => {
  if (player) {
    player.pauseVideo();
    socket.emit("syncPause", { roomId });
  }
});

// Listen for sync events (YouTube)
socket.on("syncPlay", ({ videoId, time }) => {
  if (player) {
    if (player.getVideoData().video_id !== videoId) {
      playYouTubeVideo(videoId);
    }
    player.seekTo(time, true);
    player.playVideo();
  }
});

socket.on("syncPause", () => {
  if (player) {
    player.pauseVideo();
  }
});
