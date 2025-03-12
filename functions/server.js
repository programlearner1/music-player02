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
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Method Not Allowed'
    };
  }

  const { action, roomId, userId, data } = JSON.parse(event.body);

  switch (action) {
    case 'join':
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }
      rooms.get(roomId).add(userId);
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Joined room', users: Array.from(rooms.get(roomId)) })
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
        body: JSON.stringify({ message: 'Left room' })
      };

    case 'sync':
      if (!rooms.has(roomId)) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Room not found' })
        };
      }
      // Broadcast sync data to all users in room except sender
      io.to(roomId).emit('sync-playback', {
        ...data,
        timestamp: Date.now()
      });
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Sync sent' })
      };

    default:
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid action' })
      };
  }
}; 