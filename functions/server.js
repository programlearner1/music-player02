const { Server } = require('socket.io');
const { createServer } = require('http');
const express = require('express');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store room data
const rooms = new Map();

exports.handler = async (event, context) => {
    // Handle CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const { action, roomId, userId, data } = JSON.parse(event.body);

        // Common headers for all responses
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        };

        switch (action) {
            case 'join':
                if (!rooms.has(roomId)) {
                    rooms.set(roomId, new Map());
                }
                rooms.get(roomId).set(userId, data.username || 'Anonymous');
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        message: 'Joined room',
                        users: Array.from(rooms.get(roomId).values())
                    })
                };

            case 'leave':
                if (rooms.has(roomId)) {
                    rooms.get(roomId).delete(userId);
                    if (rooms.get(roomId).size === 0) {
                        rooms.delete(roomId);
                    }
                }
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ message: 'Left room' })
                };

            case 'sync':
                if (!rooms.has(roomId)) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ error: 'Room not found' })
                    };
                }
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        message: 'Sync received',
                        timestamp: Date.now(),
                        ...data
                    })
                };

            case 'request-sync':
                if (!rooms.has(roomId)) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ error: 'Room not found' })
                    };
                }
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        message: 'Sync requested',
                        timestamp: Date.now()
                    })
                };

            case 'load-playlist':
                // Simulate playlist loading (in production, you would fetch from YouTube API)
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        videos: [
                            {
                                id: 'dQw4w9WgXcQ',
                                title: 'Sample Video 1',
                                thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg',
                                channelTitle: 'Sample Channel'
                            }
                            // Add more sample videos as needed
                        ]
                    })
                };

            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: 'Invalid action' })
                };
        }
    } catch (error) {
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
}; 