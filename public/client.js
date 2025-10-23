// ================================
// Constants and Core Variables
// ================================
const API_ENDPOINT = '/api/room';
const socket = io();
let currentRoom = null;
let player = null;
let isPlaying = false;
let currentVideoIndex = 0;
let videoQueue = [];
let lastSyncTime = 0;
let pendingSyncData = null;

// ================================
// Connection & Player Initialization
// ================================
async function initializeConnection() {
    setupEventListeners();
    setupThemeSwitcher();
    try {
        await loadYouTubeAPI();
    } catch (error) {
        console.error('Error loading YouTube API:', error);
        alert('Failed to load YouTube player. Please check your internet connection and try again.');
    }
}

function loadYouTubeAPI() {
    return new Promise((resolve, reject) => {
        if (window.YT) {
            resolve();
            return;
        }
        window.onYouTubeIframeAPIReady = () => {
            resolve();
            initializeYouTubePlayer();
        };
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.onerror = reject;
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    });
}

function initializeYouTubePlayer() {
    try {
        player = new YT.Player('player', {
            height: '360',
            width: '640',
            videoId: '',
            playerVars: {
                playsinline: 1,
                controls: 0,
                disablekb: 1,
                rel: 0,
                origin: window.location.origin,
                enablejsapi: 1,
                modestbranding: 1,
                iv_load_policy: 3,
                fs: 1,
                nocookie: true,
            },
            events: {
                onReady: onPlayerReady,
                onStateChange: onPlayerStateChange,
                onError: onPlayerError,
            },
        });
    } catch (e) {
        console.error('Error initializing YouTube player:', e);
        handlePlayerError('Failed to initialize video player');
    }
}

// ================================
// Playlist & Sync Handlers
// ================================
socket.on('playlist-loaded', (videos) => {
    videoQueue = videos;
    displayPlaylist();
    if (pendingSyncData) {
        applySyncPlayback(pendingSyncData);
        pendingSyncData = null;
    }
});

socket.on('sync-playback', (data) => {
    if (!videoQueue.length) {
        pendingSyncData = data;
        return;
    }
    applySyncPlayback(data);
});

function applySyncPlayback(data) {
    if (!player) return;
    const { currentTime, isPlaying: remoteIsPlaying, videoId, index, timestamp } = data;
    let targetTime = currentTime;
    if (timestamp) {
        const drift = (Date.now() - timestamp) / 1000;
        targetTime += drift;
    }
    if (
        videoId &&
        videoQueue[index] &&
        videoId === videoQueue[index].id &&
        videoId !== player.getVideoData().video_id
    ) {
        currentVideoIndex = index;
        player.loadVideoById(videoId);
    }
    if (typeof targetTime === 'number' && Math.abs(player.getCurrentTime() - targetTime) > 1) {
        player.seekTo(targetTime);
    }
    if (remoteIsPlaying && player.getPlayerState() !== YT.PlayerState.PLAYING) {
        player.playVideo();
    } else if (!remoteIsPlaying && player.getPlayerState() === YT.PlayerState.PLAYING) {
        player.pauseVideo();
    }
}

// ================================
// Playback Control
// ================================
function playCurrentVideo() {
    if (!player || currentVideoIndex < 0 || currentVideoIndex >= videoQueue.length) {
        console.log('Player not ready, bad index, or empty queue:', player, currentVideoIndex, videoQueue.length);
        return;
    }
    const video = videoQueue[currentVideoIndex];
    console.log('About to play video:', video);
    if (!video || !isValidYouTubeVideoId(video.id)) {
        handlePlayerError('Invalid video ID. Skipping to next video...');
        if (currentVideoIndex < videoQueue.length - 1) {
            currentVideoIndex++;
            setTimeout(playCurrentVideo, 1000);
        }
        return;
    }
    try {
        player.loadVideoById(video.id);
        isPlaying = true;
        updateNowPlayingUI(video);
        sendSyncUpdate();
    } catch (error) {
        console.error('Error playing video:', error, video);
        handlePlayerError('Failed to play video. Trying next video...');
        if (currentVideoIndex < videoQueue.length - 1) {
            currentVideoIndex++;
            setTimeout(playCurrentVideo, 1000);
        }
    }
}


function updateNowPlayingUI(video) {
    const nowPlayingSection = document.querySelector('.now-playing');
    if (nowPlayingSection) {
        nowPlayingSection.style.display = 'flex';
        document.getElementById('current-thumbnail').src = video.thumbnail || '';
        document.getElementById('current-title').textContent = video.title || 'Unknown Title';
        document.getElementById('current-artist').textContent = video.channelTitle || 'Unknown Artist';
    }
}

function isValidYouTubeVideoId(videoId) {
    return videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

function sendSyncUpdate() {
    if (!player || !currentRoom) return;
    const currentTime = player.getCurrentTime();
    if (typeof currentTime !== 'number') return;
    const now = Date.now();
    if (now - lastSyncTime > 1000) {
        socket.emit('sync-update', {
            room: currentRoom,
            videoId: videoQueue[currentVideoIndex]?.id,
            currentTime,
            isPlaying,
            index: currentVideoIndex,
            timestamp: now,
        });
        lastSyncTime = now;
    }
}

// ================================
// Error Handling
// ================================
function onPlayerError(event) {
    let errorMessage = '';
    switch (event.data) {
        case 2:
            errorMessage = 'Invalid video ID. The video might have been removed or is private.';
            break;
        case 5:
            errorMessage = 'The requested content cannot be played in an HTML5 player.';
            break;
        case 100:
            errorMessage = 'Video not found or has been removed.';
            break;
        case 101:
        case 150:
            errorMessage = 'Video playback not allowed. The owner has restricted embedding.';
            break;
        default:
            errorMessage = 'An error occurred with the YouTube player.';
    }
    handlePlayerError(errorMessage);
    if (currentVideoIndex < videoQueue.length - 1) {
        currentVideoIndex++;
        setTimeout(playCurrentVideo, 1000);
    }
}

function handlePlayerError(message) {
    const playerContainer = document.getElementById('player').parentElement;
    if (!playerContainer) return;

    const existingError = playerContainer.querySelector('.player-error');
    if (existingError) existingError.remove();

    const errorDiv = document.createElement('div');
    errorDiv.className = 'player-error';
    errorDiv.innerHTML = `<p>${message}</p><div class="error-buttons"><button onclick="retryLoadPlayer()">Retry</button><button onclick="skipToNextVideo()">Next Video</button></div>`;
    playerContainer.appendChild(errorDiv);

    setTimeout(() => {
        if (errorDiv && errorDiv.parentNode) errorDiv.remove();
    }, 5000);
}

function skipToNextVideo() {
    if (currentVideoIndex < videoQueue.length - 1) {
        currentVideoIndex++;
        playCurrentVideo();
    }
}

function retryLoadPlayer() {
    const errorDiv = document.querySelector('.player-error');
    if (errorDiv) errorDiv.remove();
    initializeConnection();
}

// ================================
// User & Room Management
// ================================
socket.on('connect', () => {
    console.log('Connected to server');
});
socket.on('user-joined', ({ users }) => {
    updateUserList(users);
});
socket.on('user-left', ({ users }) => {
    updateUserList(users);
});

async function joinRoom() {
    const roomId = document.getElementById('room-id').value.trim();
    const username = document.getElementById('username').value.trim();
    if (!roomId || !username) {
        alert('Please enter both room ID and username');
        return;
    }
    currentRoom = roomId;
    const response = await sendToServer('join', { username });
    if (response && response.message === 'Joined room') {
        socket.emit('join-room', { room: roomId, username });
        document.getElementById('current-room').textContent = roomId;
        document.getElementById('user-count').textContent = response.users.length;
        document.querySelector('.room-info').classList.add('active');
        document.querySelector('.user-list').classList.add('active');
        updateUserList(response.users);
        document.getElementById('playback-controls').style.display = 'flex';
        socket.emit('request-sync', { room: roomId });
    }
}

function updateUserList(users) {
    const userListElement = document.getElementById('connected-users');
    userListElement.innerHTML = '';
    users.forEach(username => {
        const li = document.createElement('li');
        li.textContent = username;
        userListElement.appendChild(li);
    });
    document.getElementById('user-count').textContent = users.length;
}

// ================================
// Playback controls UI
// ================================
function setupPlayerControls() {
    document.getElementById('play-btn').addEventListener('click', () => {
        if (player) {
            player.playVideo();
            isPlaying = true;
            sendSyncUpdate();
        }
    });
    document.getElementById('pause-btn').addEventListener('click', () => {
        if (player) {
            player.pauseVideo();
            isPlaying = false;
            sendSyncUpdate();
        }
    });
    document.getElementById('sync-btn').addEventListener('click', async () => {
        socket.emit('request-sync', { room: currentRoom });
    });
    document.getElementById('previous-btn').addEventListener('click', () => {
        if (currentVideoIndex > 0) {
            currentVideoIndex--;
            playCurrentVideo();
        }
    });
    document.getElementById('next-btn').addEventListener('click', () => {
        if (currentVideoIndex < videoQueue.length - 1) {
            currentVideoIndex++;
            playCurrentVideo();
        }
    });
}

// ================================
// Generic event listeners
// ================================
function setupEventListeners() {
    document.getElementById('join-room-btn').addEventListener('click', joinRoom);
    document.getElementById('load-playlist-btn').addEventListener('click', async () => {
        const url = document.getElementById('youtube-playlist-url').value.trim();
        if (url) await loadPlaylist(url);
    });
    const progressContainer = document.querySelector('.progress-container');
    if (progressContainer) {
        progressContainer.addEventListener('click', (e) => {
            if (!player) return;
            const rect = progressContainer.getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            const duration = player.getDuration();
            player.seekTo(duration * pos);
            sendSyncUpdate();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                isPlaying ? document.getElementById('pause-btn').click() : document.getElementById('play-btn').click();
                break;
            case 'arrowright':
                document.getElementById('next-btn').click();
                break;
            case 'arrowleft':
                document.getElementById('previous-btn').click();
                break;
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initializeConnection();
    setupPlayerControls();
});

// ================================
// Theme Switcher
// ================================
function setupThemeSwitcher() {
    const themeBtns = document.querySelectorAll('.theme-btn');
    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('preferred-theme', theme);
        });
    });
    const savedTheme = localStorage.getItem('preferred-theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
}

// ================================
// YouTube Player Events
// ================================
function onYouTubeIframeAPIReady() {
    initializeYouTubePlayer();
}

function onPlayerReady(event) {
    console.log('YouTube player is ready');
}

function onPlayerStateChange(event) {
    switch (event.data) {
        case YT.PlayerState.PLAYING:
            isPlaying = true;
            document.getElementById('play-btn').style.display = 'none';
            document.getElementById('pause-btn').style.display = 'inline-block';
            startProgressBarUpdate();
            break;
        case YT.PlayerState.PAUSED:
            isPlaying = false;
            document.getElementById('play-btn').style.display = 'inline-block';
            document.getElementById('pause-btn').style.display = 'none';
            break;
        case YT.PlayerState.ENDED:
            if (currentVideoIndex < videoQueue.length - 1) {
                currentVideoIndex++;
                playCurrentVideo();
            }
            break;
    }
    sendSyncUpdate();
}

// ================================
// Progress Bar and Playlist UI
// ================================
let progressInterval;
function startProgressBarUpdate() {
    if (progressInterval) clearInterval(progressInterval);
    progressInterval = setInterval(updateProgress, 1000);
}

function updateProgress() {
    if (!player || !player.getCurrentTime) return;
    const currentTime = player.getCurrentTime();
    const duration = player.getDuration();
    if (isNaN(currentTime) || isNaN(duration)) return;
    const progress = (currentTime / duration) * 100;
    document.querySelector('.progress-bar').style.width = `${progress}%`;
    document.getElementById('current-time').textContent = formatTime(currentTime);
    document.getElementById('duration').textContent = formatTime(duration);
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

async function loadPlaylist(url) {
    try {
        const playlistId = extractPlaylistId(url);
        if (!playlistId) {
            alert('Invalid YouTube playlist URL. Please enter a valid playlist URL.');
            return;
        }
        const response = await sendToServer('load-playlist', { playlistId });
        if (response && response.videos) {
            videoQueue = response.videos;
            displayPlaylist();
            if (videoQueue.length > 0) {
                currentVideoIndex = 0;
                playCurrentVideo();
            }
        } else if (response && response.error) {
            alert('Error loading playlist: ' + response.message);
        }
    } catch (error) {
        alert('Failed to load playlist. Please check your YouTube API key and try again.');
    }
}

function extractPlaylistId(url) {
    const regex = /[?&]list=([^#\&\?]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function displayPlaylist() {
    const playlistContainer = document.getElementById('playlist');
    playlistContainer.innerHTML = '';
    videoQueue.forEach((video, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        if (index === currentVideoIndex) item.classList.add('active');
        item.innerHTML = `
            <img src="${video.thumbnail}" alt="${video.title}">
            <div class="playlist-item-info">
                <div class="playlist-item-title">${video.title}</div>
                <div class="playlist-item-artist">${video.channelTitle}</div>
            </div>
        `;
        item.addEventListener('click', () => {
            currentVideoIndex = index;
            playCurrentVideo();
        });
        playlistContainer.appendChild(item);
    });
}

// ================================
// Utilities
// ================================
async function sendToServer(action, data = {}) {
    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, roomId: currentRoom, data }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || result.error || 'Server error');
        return result;
    } catch (error) {
        alert('Error: ' + (error.message || 'Failed to communicate with server'));
        return null;
    }
}
