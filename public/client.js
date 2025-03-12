// Global variables for YouTube integration
let player;
let videoQueue = [];
let currentVideoIndex = 0;
let isPlaying = false;
let currentRoom = null;
let maxRetries = 3;
let retryCount = 0;
let lastAttemptedIndex = 0;
let isPlayerReady = false;
let pendingPlayRequest = null;
let socket = io(window.location.origin);  // Initialize socket in global scope
let syncInterval = null;
let lastSyncTime = 0;
const SYNC_INTERVAL = 2000; // Sync every 2 seconds
const TIME_SYNC_THRESHOLD = 0.5; // Sync if time difference is more than 0.5 seconds
const SYNC_RETRY_DELAY = 500; // Wait 500ms before retrying sync
let autoSync = true; // Default to auto-sync enabled

// Synchronization functions in global scope
function startSyncInterval() {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    // Initial sync
    sendSyncUpdate();
    
    syncInterval = setInterval(() => {
        if (currentRoom && player && isPlaying) {
            sendSyncUpdate();
        }
    }, SYNC_INTERVAL);
}

function stopSyncInterval() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}

function sendSyncUpdate() {
    if (!player || !player.getCurrentTime || !currentRoom) return;
    
    try {
        const currentTime = parseFloat(player.getCurrentTime());
        const timestamp = Date.now().toString(); // Convert to string to ensure proper serialization
        
        // Only emit if we haven't synced recently and have valid data
        if (parseInt(timestamp) - lastSyncTime > SYNC_INTERVAL && !isNaN(currentTime)) {
            console.log(`Sending sync update - Time: ${currentTime.toFixed(2)}, Timestamp: ${timestamp}`);
            socket.emit("sync-playback", {
                roomId: currentRoom,
                currentIndex: currentVideoIndex,
                videoId: videoQueue[currentVideoIndex]?.id,
                isPlaying: isPlaying,
                currentTime: currentTime,
                timestamp: timestamp // Send as string
            });
            lastSyncTime = parseInt(timestamp);
        }
    } catch (error) {
        console.error('Error in sendSyncUpdate:', error);
    }
}

// YouTube error codes
const YT_Errors = {
    2: 'Invalid parameter',
    5: 'HTML5 player error',
    100: 'Video not found',
    101: 'Playback not allowed',
    150: 'Playback not allowed'
};

// Global UI update function
function updatePlayPauseButton() {
    // Safely get the buttons
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    
    // Only update if both buttons exist
    if (playBtn && pauseBtn) {
        playBtn.style.display = isPlaying ? 'none' : 'flex';
        pauseBtn.style.display = isPlaying ? 'flex' : 'none';
    }
}

// YouTube Player Functions
function onPlayerStateChange(event) {
    if (!event || !event.data) return;
    
    if (event.data === YT.PlayerState.ENDED) {
        playNextSong();
    } else if (event.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        updatePlayPauseButton();
    } else if (event.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        updatePlayPauseButton();
    } else if (event.data === YT.PlayerState.ERROR) {
        console.error('YouTube player error occurred');
        handlePlayerError();
    }
}

function onPlayerReady(event) {
    console.log("YouTube player is ready");
    isPlayerReady = true;
    isPlaying = false;
    updatePlayPauseButton();
    
    // If there's a pending play request, execute it
    if (pendingPlayRequest) {
        console.log("Executing pending play request");
        const { index } = pendingPlayRequest;
        pendingPlayRequest = null;
        playSong(index);
    }
}

function handlePlayerError() {
    isPlaying = false;
    updatePlayPauseButton();
    console.log("Attempting to recover from player error...");
    
    if (retryCount === 0 || currentVideoIndex !== lastAttemptedIndex) {
        retryCount = 0;
        lastAttemptedIndex = currentVideoIndex;
    }
    
    retryCount++;
    
    if (retryCount > maxRetries) {
        console.error('Max retries reached, skipping to next song');
        retryCount = 0;
        playNextSong();
        return;
    }
    
    if (currentVideoIndex < videoQueue.length) {
        console.log(`Retry attempt ${retryCount} of ${maxRetries}`);
        setTimeout(() => playNextSong(), 1000);
    }
}

// Global playback control functions
function playNextSong() {
    if (!videoQueue.length) {
        console.log('No songs in queue');
        return;
    }
    
    // Prevent infinite loops by checking if we've tried all songs
    const startIndex = currentVideoIndex;
    let attempts = 0;
    
    do {
        currentVideoIndex = (currentVideoIndex + 1) % videoQueue.length;
        attempts++;
        
        // If we've tried all songs, stop trying
        if (attempts >= videoQueue.length) {
            console.error('No valid songs found in playlist');
            isPlaying = false;
            updatePlayPauseButton();
            return;
        }
    } while (!videoQueue[currentVideoIndex]?.id && currentVideoIndex !== startIndex);
    
    playSong(currentVideoIndex);
}

function playSong(index, initialTime = 0) {
    if (!isPlayerReady) {
        console.log('YouTube player not initialized, queueing play request');
        pendingPlayRequest = { index, initialTime };
        return;
    }

    if (!player) {
        console.error('YouTube player not initialized');
        return;
    }

    if (!videoQueue[index]) {
        console.error('Invalid video index:', index);
        return;
    }

    if (!currentRoom) {
        console.error('Not in a room, cannot play song');
        return;
    }

    try {
        currentVideoIndex = index;
        const video = videoQueue[index];
        
        if (!video.id || typeof video.id !== 'string') {
            console.error('Invalid video ID:', video);
            if (videoQueue.length > 1) {
                playNextSong();
            }
            return;
        }

        const videoId = video.id.trim();
        if (!videoId) {
            console.error('Empty video ID after trimming');
            playNextSong();
            return;
        }

        console.log('Attempting to play video:', { id: videoId, title: video.title, startTime: initialTime });
        
        retryCount = 0;
        
        // Emit sync event to server with exact timestamp
        if (socket && socket.connected) {
            const timestamp = Date.now();
            
            socket.emit("sync-playback", {
                roomId: currentRoom,
                currentIndex: index,
                videoId: videoId,
                isPlaying: true,
                currentTime: initialTime,
                timestamp: timestamp
            });
            
            // Start immediate sync interval
            startSyncInterval();
        } else {
            console.warn('Socket not connected, playback sync disabled');
        }
        
        if (player.cueVideoById) {
            try {
                player.cueVideoById({
                    videoId: videoId,
                    startSeconds: initialTime
                });
                setTimeout(() => {
                    if (player.playVideo) {
                        player.playVideo();
                        updatePlaylistUI(index);
                        updateNowPlayingUI(video);
                        isPlaying = true;
                        updatePlayPauseButton();
                    }
                }, 1000);
            } catch (loadError) {
                console.error('Error loading video:', loadError);
                handlePlayerError();
            }
        } else {
            console.error('YouTube player methods not available');
            setTimeout(() => {
                if (isPlayerReady) {
                    playSong(index, initialTime);
                } else {
                    pendingPlayRequest = { index, initialTime };
                }
            }, 1000);
        }
    } catch (error) {
        console.error('Error playing song:', error);
        handlePlayerError();
    }
}

function updatePlaylistUI(index) {
    const playlistElement = document.getElementById('playlist');
    if (playlistElement) {
        const items = playlistElement.getElementsByClassName('playlist-item');
        Array.from(items).forEach((item, i) => {
            if (i === index) {
                item.style.background = 'rgba(255, 255, 255, 0.2)';
                item.style.transform = 'scale(1.02)';
            } else {
                item.style.background = 'rgba(255, 255, 255, 0.1)';
                item.style.transform = 'scale(1)';
            }
        });
    }
}

function updateNowPlayingUI(video) {
    const nowPlaying = document.querySelector('.now-playing');
    const currentThumbnail = document.getElementById('current-thumbnail');
    const currentTitle = document.getElementById('current-title');
    const currentArtist = document.getElementById('current-artist');
    
    if (nowPlaying && currentThumbnail && currentTitle && currentArtist) {
        nowPlaying.style.display = 'flex';
        if (video.thumbnail) {
            currentThumbnail.src = video.thumbnail;
        }
        currentTitle.textContent = video.title || 'Unknown Title';
        currentArtist.textContent = video.channelTitle || 'Unknown Artist';
    }
}

function onYouTubeIframeAPIReady() {
    try {
        console.log('Initializing YouTube player...');
        player = new YT.Player("player", {
            height: "360",
            width: "640",
            playerVars: { 
                autoplay: 0,
                controls: 1,
                modestbranding: 1,
                rel: 0,
                enablejsapi: 1,
                origin: window.location.origin,
                playsinline: 1,
                iv_load_policy: 3,
                fs: 1
            },
            events: {
                onReady: (event) => {
                    console.log('YouTube player ready event fired');
                    onPlayerReady(event);
                },
                onStateChange: (event) => {
                    console.log('Player state changed:', event.data);
                    onPlayerStateChange(event);
                },
                onError: (event) => {
                    console.log('Player error event:', event);
                    if (event.data) {
                        console.log('Error code:', event.data, 'Error description:', YT_Errors[event.data] || 'Unknown error');
                    }
                    handleYouTubeError(event);
                }
            }
        });
    } catch (error) {
        console.error('Error initializing YouTube player:', error);
        // Retry initialization after a delay
        setTimeout(onYouTubeIframeAPIReady, 2000);
    }
}

function handleYouTubeError(event) {
    const errorCode = event.data;
    console.error('YouTube player error:', YT_Errors[errorCode] || 'Unknown error');
    
    // Reset player state
    isPlaying = false;
    updatePlayPauseButton();
    
    if (!videoQueue.length) {
        console.error('No videos in queue to recover with');
        if (player && player.stopVideo) {
            player.stopVideo();
        }
        return;
    }
    
    // Handle specific error cases
    switch(errorCode) {
        case 2: // Invalid parameter
            console.log('Invalid parameter error - attempting recovery...');
            setTimeout(() => {
                if (currentVideoIndex >= videoQueue.length) {
                    currentVideoIndex = 0;
                }
                playNextSong();
            }, 1000);
            break;
        case 100: // Video not found
        case 101: // Embedding disabled
        case 150: // Embedding disabled
            console.log('Video not available or embedding disabled, skipping to next...');
            playNextSong();
            break;
        default:
            console.log('Unhandled error, attempting general recovery...');
            handlePlayerError();
    }
}

document.addEventListener('DOMContentLoaded', () => {
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
    const progressContainer = document.querySelector('.progress-container');
    const progressBar = document.querySelector('.progress-bar');
    const currentTimeEl = document.getElementById('current-time');
    const durationEl = document.getElementById('duration');
    const visualizer = document.getElementById('visualizer');
    const roomInfo = document.querySelector('.room-info');
    const userList = document.querySelector('.user-list');
    const connectedUsersList = document.getElementById('connected-users');
    const currentRoomEl = document.getElementById('current-room');
    const userCountEl = document.getElementById('user-count');
    const nowPlaying = document.querySelector('.now-playing');
    const currentThumbnail = document.getElementById('current-thumbnail');
    const currentTitle = document.getElementById('current-title');
    const currentArtist = document.getElementById('current-artist');
    const syncBtn = document.getElementById("sync-btn");

    let roomId = "";
    let visualizerCtx = visualizer ? visualizer.getContext('2d') : null;
    let audioContext;
    let analyser;
    let dataArray;
    let source;

    // UI Animation Functions
    function showLoadingState(button) {
        const originalContent = button.innerHTML;
        button.innerHTML = '<span class="loading"></span>';
        return originalContent;
    }

    function hideLoadingState(button, originalContent) {
        button.innerHTML = originalContent;
    }

    function addPlaylistItem(video, index) {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        item.innerHTML = `
            <img src="${video.thumbnail}" alt="${video.title}">
            <div class="song-info">
                <div class="song-title">${video.title}</div>
            </div>
        `;
        item.style.opacity = '0';
        item.style.transform = 'translateX(-20px)';
        
        // Add click event with room synchronization
        item.addEventListener('click', () => {
            if (!currentRoom) {
                console.warn('Not in a room, cannot sync playback');
                return;
            }
            
            // Emit song selection to all room members
            socket.emit("sync-song-selection", {
                roomId: currentRoom,
                selectedIndex: index,
                videoId: video.id,
                isPlaying: true
            });
            
            playSong(index);
            highlightCurrentSong(index);
        });
        
        playlistElement.appendChild(item);
        
        // Trigger animation
        setTimeout(() => {
            item.style.transition = 'all 0.3s ease';
            item.style.opacity = '1';
            item.style.transform = 'translateX(0)';
        }, index * 100);
    }

    function highlightCurrentSong(index) {
        const items = playlistElement.getElementsByClassName('playlist-item');
        Array.from(items).forEach((item, i) => {
            if (i === index) {
                item.style.background = 'rgba(255, 255, 255, 0.2)';
                item.style.transform = 'scale(1.02)';
            } else {
                item.style.background = 'rgba(255, 255, 255, 0.1)';
                item.style.transform = 'scale(1)';
            }
        });
    }

    // Example MP3 playlist
    const songs = [
      { title: "Ah bandham abhadhama", artist: "Artist 1", url: "public/music/song2.mp3", image: "public/images/bachan.jpg" },
      { title: "Rangule", artist: "Artist 2", url: "public/music/song3.mp3", image: "public/images/download.jpeg" },
      { title: "Rayani kathale", artist: "Artist 3", url: "public/music/song4.mp3", image: "public/images/rajini.jpg" },
    ];

    // Theme Switcher
    const themeSwitcher = document.querySelectorAll('.theme-btn');
    if (themeSwitcher) {
        themeSwitcher.forEach(btn => {
            btn.addEventListener('click', () => {
                document.documentElement.setAttribute('data-theme', btn.dataset.theme);
                localStorage.setItem('theme', btn.dataset.theme);
            });
        });
    }

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'default';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Initialize visualizer if canvas exists
    if (visualizer && visualizerCtx) {
        function initializeVisualizer() {
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                const bufferLength = analyser.frequencyBinCount;
                dataArray = new Uint8Array(bufferLength);

                visualizer.width = window.innerWidth;
                visualizer.height = window.innerHeight;

                function animate() {
                    if (!visualizer || !visualizerCtx) return;
                    
                    requestAnimationFrame(animate);
                    analyser.getByteFrequencyData(dataArray);
                    
                    visualizerCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                    visualizerCtx.fillRect(0, 0, visualizer.width, visualizer.height);
                    
                    const barWidth = (visualizer.width / dataArray.length) * 2.5;
                    let barHeight;
                    let x = 0;
                    
                    for(let i = 0; i < dataArray.length; i++) {
                        barHeight = dataArray[i] * 2;
                        
                        const gradient = visualizerCtx.createLinearGradient(0, 0, 0, visualizer.height);
                        gradient.addColorStop(0, getComputedStyle(document.documentElement).getPropertyValue('--primary-color'));
                        gradient.addColorStop(1, getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'));
                        
                        visualizerCtx.fillStyle = gradient;
                        visualizerCtx.fillRect(x, visualizer.height - barHeight, barWidth, barHeight);
                        
                        x += barWidth + 1;
                    }
                }
                
                animate();
            } catch (error) {
                console.error('Error initializing visualizer:', error);
            }
        }
    }

    // Initialize progress bar functionality
    if (progressContainer && progressBar) {
        progressContainer.addEventListener('click', (e) => {
            if (player && player.getDuration) {
                const width = progressContainer.clientWidth;
                const clickX = e.offsetX;
                const duration = player.getDuration();
                player.seekTo((clickX / width) * duration);
            }
        });
    }

    function updateProgressBar() {
        if (!progressBar || !currentTimeEl || !durationEl) return;
        
        if (player && player.getCurrentTime && player.getDuration) {
            const currentTime = player.getCurrentTime();
            const duration = player.getDuration();
            const progressPercent = (currentTime / duration) * 100;
            
            progressBar.style.width = `${progressPercent}%`;
            currentTimeEl.textContent = formatTime(currentTime);
            durationEl.textContent = formatTime(duration);
        }
        requestAnimationFrame(updateProgressBar);
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // Enhanced Room Management
    function updateRoomInfo(roomId, users) {
        roomInfo.classList.add('active');
        currentRoomEl.textContent = roomId;
        userCountEl.textContent = users.length;
        
        // Update user list
        connectedUsersList.innerHTML = '';
        users.forEach(user => {
            const li = document.createElement('li');
            li.textContent = user.username;
            connectedUsersList.appendChild(li);
        });
        userList.classList.add('active');
    }

    // Enhanced Now Playing
    function updateNowPlaying(video) {
        if (!video) return;
        
        const nowPlaying = document.querySelector('.now-playing');
        const currentThumbnail = document.getElementById('current-thumbnail');
        const currentTitle = document.getElementById('current-title');
        const currentArtist = document.getElementById('current-artist');
        
        if (nowPlaying && currentThumbnail && currentTitle && currentArtist) {
            nowPlaying.style.display = 'flex';
            
            // Use default thumbnail if none provided
            const thumbnailUrl = video.thumbnail || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23cccccc"/%3E%3Ctext x="50" y="50" font-family="Arial" font-size="14" fill="%23666666" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E';
            
            currentThumbnail.src = thumbnailUrl;
            currentThumbnail.onerror = function() {
                this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23cccccc"/%3E%3Ctext x="50" y="50" font-family="Arial" font-size="14" fill="%23666666" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E';
            };
            
            currentTitle.textContent = video.title || 'Unknown Title';
            currentArtist.textContent = video.channelTitle || 'Unknown Artist';
        }
    }

    // Join room with animation
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener("click", async () => {
            const roomIdValue = roomIdInput?.value;
            const username = usernameInput?.value;
            
            if (roomIdValue && username) {
                const originalContent = showLoadingState(joinRoomBtn);
                
                try {
                    currentRoom = roomIdValue;
                    socket.emit("join-room", { roomId: roomIdValue, username });
                    if (playbackControls) {
                        playbackControls.style.display = "flex";
                        playbackControls.style.opacity = "0";
                        
                        setTimeout(() => {
                            playbackControls.style.transition = 'opacity 0.3s ease';
                            playbackControls.style.opacity = "1";
                        }, 100);
                    }
                    
                    if (visualizer) {
                        initializeVisualizer();
                    }
                    updateProgressBar();
                } finally {
                    setTimeout(() => hideLoadingState(joinRoomBtn, originalContent), 1000);
                }
            } else {
                alert("Please enter a room ID and username.");
            }
        });
    }

    // Handle MP3 play
    if (playBtn) {
        playBtn.addEventListener("click", () => {
            if (currentRoom && player) {
                isPlaying = true;
                const currentTime = player.getCurrentTime();
                socket.emit("sync-playback", {
                    roomId: currentRoom,
                    currentIndex: currentVideoIndex,
                    isPlaying: true,
                    currentTime: currentTime,
                    timestamp: Date.now()
                });
                player.playVideo();
                updatePlayPauseButton();
                startSyncInterval();
            }
        });
    }

    // Handle MP3 pause
    if (pauseBtn) {
        pauseBtn.addEventListener("click", () => {
            if (currentRoom && player) {
                isPlaying = false;
                socket.emit("sync-playback", {
                    roomId: currentRoom,
                    currentIndex: currentVideoIndex,
                    isPlaying: false,
                    currentTime: player.getCurrentTime(),
                    timestamp: Date.now()
                });
                player.pauseVideo();
                updatePlayPauseButton();
                stopSyncInterval();
            }
        });
    }

    // Handle MP3 next
    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            if (currentRoom) {
                playNextSong();
            }
        });
    }

    // Handle MP3 previous
    if (previousBtn) {
        previousBtn.addEventListener("click", () => {
            if (currentRoom) {
                currentVideoIndex = (currentVideoIndex - 1 + videoQueue.length) % videoQueue.length;
                playSong(currentVideoIndex);
            }
        });
    }

    if (audioPlayer) {
        let playPromise = null;

        // Sync MP3 playback time
        audioPlayer.addEventListener("timeupdate", () => {
            if (currentRoom) {
                socket.emit("update-time", { roomId: currentRoom, currentTime: audioPlayer.currentTime });
            }
        });

        // Handle play-song event (MP3)
        socket.on("play-song", async ({ song, isPlaying, currentTime }) => {
            console.log("Received play-song event:", song);
            
            try {
                // If there's a pending play operation, wait for it
                if (playPromise) {
                    await playPromise;
                }
                
                audioPlayer.src = song.url;
                audioPlayer.currentTime = currentTime;
                
                if (isPlaying) {
                    playPromise = audioPlayer.play().catch((error) => {
                        if (error.name === 'NotAllowedError') {
                            alert("Click the play button to start playback");
                        } else if (error.name !== 'AbortError') {
                            console.error("Error playing audio:", error);
                        }
                    });
                    await playPromise;
                    playPromise = null;
                }
            } catch (error) {
                console.error("Error handling play event:", error);
                playPromise = null;
            }
        });

        // Handle pause-song event (MP3)
        socket.on("pause-song", async () => {
            console.log("Received pause-song event");
            try {
                if (playPromise) {
                    await playPromise;
                }
                await audioPlayer.pause();
            } catch (error) {
                console.error("Error pausing audio:", error);
            }
        });
    } else {
        console.warn("Audio player element not found in the DOM");
    }

    // Handle user-joined event
    socket.on("user-joined", ({ username, users }) => {
        console.log(`${username} joined the room. Users in room:`, users);
        updateRoomInfo(currentRoom, users);

        // Request current playback state from other users in the room
        socket.emit("request-playback-state", { roomId: currentRoom });
    });

    // Add handler for playback state request
    socket.on("request-playback-state", () => {
        if (player && videoQueue.length > 0 && isPlaying) {
            const currentTime = player.getCurrentTime();
            const timestamp = Date.now();
            
            socket.emit("sync-playback", {
                roomId: currentRoom,
                currentIndex: currentVideoIndex,
                videoId: videoQueue[currentVideoIndex]?.id,
                isPlaying: isPlaying,
                currentTime: currentTime,
                timestamp: timestamp,
                isInitialSync: true
            });
        }
    });

    // Handle user-left event
    socket.on("user-left", ({ users }) => {
        console.log("Users in room:", users);
        updateRoomInfo(currentRoom, users);
        if (users.length === 0) {
            stopSyncInterval();
        }
    });

    /* ------------------- YouTube Playlist Integration ------------------- */

    // Load playlist with animation
    if (loadPlaylistBtn) {
        loadPlaylistBtn.addEventListener("click", async () => {
            const playlistUrl = youtubePlaylistInput.value;
            const playlistId = extractPlaylistId(playlistUrl);

            if (playlistId && currentRoom) {
                const originalContent = showLoadingState(loadPlaylistBtn);
                try {
                    socket.emit("load-playlist", { roomId: currentRoom, playlistId });
                } finally {
                    setTimeout(() => hideLoadingState(loadPlaylistBtn, originalContent), 1000);
                }
            } else {
                alert("Please join a room and enter a valid YouTube playlist URL");
            }
        });
    }

    // Extract playlist ID function
    function extractPlaylistId(url) {
      const match = url.match(/[?&]list=([^&]+)/);
      return match ? match[1] : null;
    }

    // Listen for a new playlist from the server
    socket.on("playlist-loaded", (videos) => {
        console.log('Raw playlist data:', videos);
        
        if (!Array.isArray(videos)) {
            console.error('Invalid playlist format received');
            return;
        }

        // Process videos and update videoQueue
        videoQueue = videos.map(video => {
            console.log('Processing video:', video);
            
            if (typeof video === 'string') {
                return {
                    id: video.trim(),
                    title: 'Loading...',
                    thumbnail: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23cccccc"/%3E%3Ctext x="50" y="50" font-family="Arial" font-size="14" fill="%23666666" text-anchor="middle" dy=".3em"%3ELoading...%3C/text%3E%3C/svg%3E',
                    channelTitle: 'Loading...'
                };
            }
            
            if (typeof video === 'object' && video !== null) {
                let videoId = null;
                if (typeof video.id === 'string') {
                    videoId = video.id.trim();
                } else if (video.id?.videoId) {
                    videoId = video.id.videoId.trim();
                } else if (video.videoId) {
                    videoId = video.videoId.trim();
                }
                
                if (!videoId) {
                    console.log('Missing video ID:', video);
                    return null;
                }

                return {
                    id: videoId,
                    title: video.title || video.snippet?.title || 'Loading...',
                    thumbnail: video.thumbnail || 
                              video.snippet?.thumbnails?.maxres?.url ||
                              video.snippet?.thumbnails?.high?.url ||
                              video.snippet?.thumbnails?.default?.url || 
                              'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23cccccc"/%3E%3Ctext x="50" y="50" font-family="Arial" font-size="14" fill="%23666666" text-anchor="middle" dy=".3em"%3ELoading...%3C/text%3E%3C/svg%3E',
                    channelTitle: video.channelTitle || video.snippet?.channelTitle || 'Loading...'
                };
            }
            
            return null;
        }).filter(video => video !== null);

        // Emit sync event to server for other users in the room
        if (currentRoom) {
            socket.emit("sync-playlist-to-room", {
                roomId: currentRoom,
                videos: videoQueue,
                currentIndex: currentVideoIndex,
                isPlaying: isPlaying
            });
        }

        // Update UI and start playback
        if (playlistElement) {
            playlistElement.innerHTML = '';
            videoQueue.forEach((video, index) => addPlaylistItem(video, index));
            
            if (videoQueue.length > 0) {
                currentVideoIndex = 0;
                playSong(0);
            }
        }
    });

    // Add handler for receiving synced playlist from other users
    socket.on("sync-playlist-from-room", (data) => {
        console.log('Received synced playlist from room:', data);
        
        if (Array.isArray(data.videos)) {
            videoQueue = data.videos;
            currentVideoIndex = data.currentIndex || 0;
            
            if (playlistElement) {
                playlistElement.innerHTML = '';
                videoQueue.forEach((video, index) => addPlaylistItem(video, index));
                
                if (videoQueue.length > 0) {
                    playSong(currentVideoIndex);
                    if (!data.isPlaying && player) {
                        player.pauseVideo();
                    }
                }
            }
        }
    });

    // Window resize handler for visualizer
    window.addEventListener('resize', () => {
        if (visualizer) {
            visualizer.width = window.innerWidth;
            visualizer.height = window.innerHeight;
        }
    });

    // Inside the DOMContentLoaded event listener, after socket initialization
    socket.on("sync-playlist", (data) => {
        console.log('Received playlist sync:', data);
        videoQueue = data.videos;
        currentVideoIndex = data.currentIndex;
        isPlaying = data.isPlaying;
        
        // Update UI
        if (playlistElement) {
            playlistElement.innerHTML = '';
            videoQueue.forEach((video, index) => addPlaylistItem(video, index));
            highlightCurrentSong(currentVideoIndex);
        }
        
        // Sync playback state
        if (player && player.loadVideoById) {
            if (data.currentTime) {
                player.seekTo(data.currentTime);
            }
            if (isPlaying) {
                player.playVideo();
            } else {
                player.pauseVideo();
            }
            updateNowPlayingUI(videoQueue[currentVideoIndex]);
        }
    });

    // Handle sync button click
    if (syncBtn) {
        // Add rotating animation class for sync button
        syncBtn.addEventListener('click', () => {
            if (currentRoom && player) {
                // Add rotation animation
                syncBtn.querySelector('i').style.animation = 'rotate 1s linear';
                
                // Request sync from other users
                socket.emit("request-sync", {
                    roomId: currentRoom
                });
                
                // Remove rotation animation after 1 second
                setTimeout(() => {
                    syncBtn.querySelector('i').style.animation = '';
                }, 1000);
            }
        });
    }

    // Add new socket event handler for sync requests
    socket.on("request-sync", () => {
        if (player && videoQueue.length > 0 && isPlaying) {
            const currentTime = player.getCurrentTime();
            const timestamp = Date.now();
            
            socket.emit("sync-playback", {
                roomId: currentRoom,
                currentIndex: currentVideoIndex,
                videoId: videoQueue[currentVideoIndex]?.id,
                isPlaying: isPlaying,
                currentTime: currentTime,
                timestamp: timestamp,
                isInitialSync: true // Force full sync
            });
        }
    });

    // Add CSS animation for sync button
    const style = document.createElement('style');
    style.textContent = `
        @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    // Modify the existing sync-playback event handler to respect manual sync
    socket.on("sync-playback", (data) => {
        if (!player || !data) return;
        
        try {
            const currentTime = player.getCurrentTime();
            const serverTime = parseFloat(data.currentTime);
            const timestamp = data.timestamp ? parseInt(data.timestamp) : Date.now(); // Handle both string and number
            const now = Date.now();
            
            // Ensure we have valid numbers
            if (isNaN(serverTime) || isNaN(timestamp) || isNaN(now)) {
                console.error('Invalid sync data received:', { 
                    serverTime, 
                    timestamp, 
                    now,
                    rawTimestamp: data.timestamp // Log raw timestamp for debugging
                });
                return;
            }
            
            const latency = Math.max(0, (now - timestamp) / 1000); // Ensure non-negative latency
            const adjustedServerTime = serverTime + latency;
            const timeDiff = Math.abs(currentTime - adjustedServerTime);
            
            console.log(`Time sync - Current: ${currentTime.toFixed(2)}, Server: ${serverTime.toFixed(2)}, Adjusted: ${adjustedServerTime.toFixed(2)}, Diff: ${timeDiff.toFixed(2)}, Latency: ${latency.toFixed(2)}s`);
            
            // Always process initial syncs or different video
            if (data.isInitialSync && data.currentIndex !== currentVideoIndex) {
                console.log('Initial sync or different video - switching to video index:', data.currentIndex);
                playSong(data.currentIndex, adjustedServerTime);
                return;
            }
            
            // Update current video index and playing state
            if (data.currentIndex !== undefined) {
                currentVideoIndex = data.currentIndex;
            }
            if (data.isPlaying !== undefined) {
                isPlaying = data.isPlaying;
            }
            
            // Sync time if it's a manual sync, initial sync, or if the difference is significant
            if (data.isInitialSync || timeDiff > TIME_SYNC_THRESHOLD) {
                console.log(`Syncing time - Seeking to: ${adjustedServerTime}`);
                
                // Ensure we're seeking to a valid time
                if (adjustedServerTime >= 0) {
                    player.seekTo(adjustedServerTime, true);
                    
                    // Verify the seek was successful
                    setTimeout(() => {
                        const newTime = player.getCurrentTime();
                        const newDiff = Math.abs(newTime - (adjustedServerTime + (SYNC_RETRY_DELAY/1000)));
                        
                        if (newDiff > TIME_SYNC_THRESHOLD) {
                            console.log(`Sync retry needed - New diff: ${newDiff.toFixed(2)}`);
                            player.seekTo(adjustedServerTime + (SYNC_RETRY_DELAY/1000), true);
                            
                            // More frequent sync checks temporarily
                            const tempInterval = setInterval(() => {
                                if (!player || !isPlaying) {
                                    clearInterval(tempInterval);
                                    return;
                                }
                                
                                const currentDiff = Math.abs(player.getCurrentTime() - (adjustedServerTime + (Date.now() - timestamp) / 1000));
                                if (currentDiff > TIME_SYNC_THRESHOLD) {
                                    const newAdjustedTime = adjustedServerTime + (Date.now() - timestamp) / 1000;
                                    console.log(`Temp sync - Seeking to: ${newAdjustedTime.toFixed(2)}`);
                                    player.seekTo(newAdjustedTime, true);
                                } else {
                                    clearInterval(tempInterval);
                                }
                            }, 500);
                            
                            setTimeout(() => clearInterval(tempInterval), 5000);
                        }
                    }, SYNC_RETRY_DELAY);
                }
            }
            
            // Update playback state
            if (player.getPlayerState) {
                const playerState = player.getPlayerState();
                if (isPlaying && playerState !== YT.PlayerState.PLAYING) {
                    player.playVideo();
                } else if (!isPlaying && playerState === YT.PlayerState.PLAYING) {
                    player.pauseVideo();
                }
            }
            
            // Update UI
            updatePlayPauseButton();
            highlightCurrentSong(currentVideoIndex);
            updateNowPlayingUI(videoQueue[currentVideoIndex]);
            
            // Start sync interval if needed
            if (data.isInitialSync && isPlaying) {
                startSyncInterval();
            }
        } catch (error) {
            console.error('Error in sync-playback handler:', error);
        }
    });

    // Add handler for song selection sync
    socket.on("song-selected", (data) => {
        console.log('Received song selection:', data);
        
        if (data.selectedIndex !== undefined && data.selectedIndex < videoQueue.length) {
            currentVideoIndex = data.selectedIndex;
            playSong(currentVideoIndex);
            highlightCurrentSong(currentVideoIndex);
            
            // Update UI elements
            updatePlaylistUI(currentVideoIndex);
            if (videoQueue[currentVideoIndex]) {
                updateNowPlayingUI(videoQueue[currentVideoIndex]);
            }
        }
    });
});
