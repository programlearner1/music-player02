let player;
let videoQueue = [];
let currentVideoIndex = 0;
let isPlaying = false;
let currentRoom = null;
let username = null;
let lastSyncTime = 0;
let syncInterval = null;
let autoSync = true;
let lastSyncUpdate = 0;
const SYNC_INTERVAL = 2000;
const TIME_SYNC_THRESHOLD = 0.5;
const SYNC_RETRY_DELAY = 500;

const socket = io();

document.addEventListener('DOMContentLoaded', () => {
    const joinRoomBtn = document.getElementById('join-room-btn');
    const loadPlaylistBtn = document.getElementById('load-playlist-btn');
    const previousBtn = document.getElementById('previous-btn');
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const nextBtn = document.getElementById('next-btn');
    const syncBtn = document.getElementById('sync-btn');
    const themeButtons = document.querySelectorAll('.theme-btn');

    joinRoomBtn.addEventListener('click', joinRoom);
    loadPlaylistBtn.addEventListener('click', loadPlaylist);
    previousBtn.addEventListener('click', playPreviousSong);
    playBtn.addEventListener('click', () => {
        if (player && videoQueue.length > 0) {
            player.playVideo();
            isPlaying = true;
            socket.emit('playback-state', { isPlaying: true, room: currentRoom });
            updatePlaybackControls();
        }
    });
    pauseBtn.addEventListener('click', () => {
        if (player) {
            player.pauseVideo();
            isPlaying = false;
            socket.emit('playback-state', { isPlaying: false, room: currentRoom });
            updatePlaybackControls();
        }
    });
    nextBtn.addEventListener('click', playNextSong);
    syncBtn.addEventListener('click', () => {
        autoSync = !autoSync;
        syncBtn.classList.toggle('syncing', autoSync);
        if (autoSync) {
            requestSync();
        }
    });

    themeButtons.forEach(button => {
        button.addEventListener('click', () => {
            const theme = button.getAttribute('data-theme');
            document.body.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
        });
    });

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.body.setAttribute('data-theme', savedTheme);
    }
});

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '360',
        width: '640',
        videoId: '',
        playerVars: {
            'playsinline': 1,
            'controls': 0
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    updatePlaybackControls();
}

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.ENDED) {
        playNextSong();
    } else if (event.data === YT.PlayerState.PLAYING) {
        isPlaying = true;
        startSyncInterval();
        updatePlaybackControls();
        document.querySelector('.now-playing').style.display = 'flex';
    } else if (event.data === YT.PlayerState.PAUSED) {
        isPlaying = false;
        stopSyncInterval();
        updatePlaybackControls();
    }
}

function joinRoom() {
    const roomId = document.getElementById('room-id').value.trim();
    username = document.getElementById('username').value.trim();

    if (!roomId || !username) {
        alert('Please enter both Room ID and Username');
        return;
    }

    currentRoom = roomId;
    socket.emit('join-room', { room: roomId, username });
    document.getElementById('current-room').textContent = roomId;
    document.getElementById('playback-controls').style.display = 'flex';
}

async function loadPlaylist() {
    const playlistUrl = document.getElementById('youtube-playlist-url').value.trim();
    if (!playlistUrl) {
        alert('Please enter a YouTube playlist URL');
        return;
    }

    try {
        const playlistId = extractPlaylistId(playlistUrl);
        if (!playlistId) {
            alert('Invalid YouTube playlist URL');
            return;
        }

        const response = await fetch(`/api/playlist/${playlistId}`);
        if (!response.ok) {
            throw new Error('Failed to load playlist');
        }

        const data = await response.json();
        videoQueue = data;
        currentVideoIndex = 0;
        updatePlaylist();
        if (videoQueue.length > 0) {
            playSong(currentVideoIndex);
        }
    } catch (error) {
        console.error('Error loading playlist:', error);
        alert('Error loading playlist. Please try again.');
    }
}

function extractPlaylistId(url) {
    const regex = /[?&]list=([^#\&\?]+)/;
    const match = url.match(regex);
    return match && match[1];
}

function updatePlaylist() {
    const playlistElement = document.getElementById('playlist');
    playlistElement.innerHTML = '';

    videoQueue.forEach((video, index) => {
        const item = document.createElement('div');
        item.className = `playlist-item${index === currentVideoIndex ? ' active' : ''}`;
        item.innerHTML = `
            <img src="${video.thumbnail}" alt="${video.title}">
            <div class="playlist-item-info">
                <div class="playlist-item-title">${video.title}</div>
                <div class="playlist-item-artist">${video.channelTitle}</div>
            </div>
        `;
        item.addEventListener('click', () => playSong(index));
        playlistElement.appendChild(item);
    });
}

function playSong(index, initialTime = 0) {
    if (index >= 0 && index < videoQueue.length) {
        currentVideoIndex = index;
        const video = videoQueue[index];
        player.loadVideoById(video.videoId, initialTime);
        updatePlaylist();
        updateNowPlaying(video);
        socket.emit('song-change', {
            room: currentRoom,
            videoId: video.videoId,
            index: index,
            timestamp: Date.now()
        });
        startSyncInterval();
    }
}

function updateNowPlaying(video) {
    document.getElementById('current-thumbnail').src = video.thumbnail;
    document.getElementById('current-title').textContent = video.title;
    document.getElementById('current-artist').textContent = video.channelTitle;
    document.querySelector('.now-playing').style.display = 'flex';
}

function playPreviousSong() {
    if (currentVideoIndex > 0) {
        playSong(currentVideoIndex - 1);
    }
}

function playNextSong() {
    if (currentVideoIndex < videoQueue.length - 1) {
        playSong(currentVideoIndex + 1);
    }
}

function updatePlaybackControls() {
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    
    if (isPlaying) {
        playBtn.style.display = 'none';
        pauseBtn.style.display = 'flex';
    } else {
        playBtn.style.display = 'flex';
        pauseBtn.style.display = 'none';
    }
}

function startSyncInterval() {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    syncInterval = setInterval(sendSyncUpdate, SYNC_INTERVAL);
    sendSyncUpdate();
}

function stopSyncInterval() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}

function sendSyncUpdate() {
    if (!player || !currentRoom || !isPlaying) return;
    
    const currentTime = player.getCurrentTime();
    if (typeof currentTime !== 'number') return;
    
    const now = Date.now();
    if (now - lastSyncUpdate < SYNC_INTERVAL) return;
    
    lastSyncUpdate = now;
    socket.emit('sync-update', {
        room: currentRoom,
        currentTime,
        timestamp: now,
        videoId: videoQueue[currentVideoIndex].videoId,
        index: currentVideoIndex
    });
}

function requestSync() {
    if (currentRoom) {
        socket.emit('request-sync', { room: currentRoom });
    }
}

socket.on('playback-state', ({ isPlaying: newState }) => {
    if (player) {
        if (newState && player.getPlayerState() !== YT.PlayerState.PLAYING) {
            player.playVideo();
            isPlaying = true;
        } else if (!newState && player.getPlayerState() === YT.PlayerState.PLAYING) {
            player.pauseVideo();
            isPlaying = false;
        }
        updatePlaybackControls();
    }
});

socket.on('song-change', ({ videoId, index, timestamp }) => {
    if (index !== currentVideoIndex) {
        playSong(index);
    }
});

socket.on('sync-playback', ({ currentTime, timestamp, latency }) => {
    if (!player || !autoSync) return;

    const now = Date.now();
    const timeSinceUpdate = (now - timestamp) / 1000;
    const adjustedServerTime = currentTime + timeSinceUpdate + (latency / 1000);
    const localTime = player.getCurrentTime();

    if (Math.abs(localTime - adjustedServerTime) > TIME_SYNC_THRESHOLD) {
        player.seekTo(adjustedServerTime, true);
        
        setTimeout(() => {
            const newLocalTime = player.getCurrentTime();
            if (Math.abs(newLocalTime - adjustedServerTime) > TIME_SYNC_THRESHOLD) {
                player.seekTo(adjustedServerTime, true);
            }
        }, SYNC_RETRY_DELAY);
    }
});

socket.on('user-joined', ({ users }) => {
    updateUserList(users);
    document.getElementById('user-count').textContent = users.length;
});

socket.on('user-left', ({ users }) => {
    updateUserList(users);
    document.getElementById('user-count').textContent = users.length;
});

function updateUserList(users) {
    const userList = document.getElementById('connected-users');
    userList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        userList.appendChild(li);
    });
}

// Audio Visualizer
const visualizer = document.getElementById('visualizer');
const visualizerCtx = visualizer.getContext('2d');
let audioContext, analyser, dataArray;

function setupVisualizer() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
    }
}

function updateVisualizer() {
    if (!analyser) return;

    visualizer.width = visualizer.offsetWidth;
    visualizer.height = visualizer.offsetHeight;
    const width = visualizer.width;
    const height = visualizer.height;
    const barWidth = width / analyser.frequencyBinCount;

    analyser.getByteFrequencyData(dataArray);
    visualizerCtx.clearRect(0, 0, width, height);

    dataArray.forEach((value, index) => {
        const barHeight = (value / 255) * height;
        const hue = (index / analyser.frequencyBinCount) * 360;
        visualizerCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        visualizerCtx.fillRect(index * barWidth, height - barHeight, barWidth, barHeight);
    });

    requestAnimationFrame(updateVisualizer);
}

// Update progress bar
setInterval(() => {
    if (player && player.getCurrentTime && player.getDuration) {
        const currentTime = player.getCurrentTime();
        const duration = player.getDuration();
        if (currentTime && duration) {
            const progress = (currentTime / duration) * 100;
            document.querySelector('.progress-bar').style.width = `${progress}%`;
            document.getElementById('current-time').textContent = formatTime(currentTime);
            document.getElementById('duration').textContent = formatTime(duration);
        }
    }
}, 1000);

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
} 