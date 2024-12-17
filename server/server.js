const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { availableParallelism } = require('node:os');
const cluster = require('node:cluster');
const { createAdapter, setupPrimary } = require('@socket.io/cluster-adapter');

if (cluster.isPrimary) {
  const numCPUs = availableParallelism();
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork({
      PORT: 3000 + i
    });
  }

  return setupPrimary();
}

async function main() {
  const db = await open({
    filename: 'chat.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room TEXT,
      username TEXT,
      content TEXT,
      client_offset TEXT UNIQUE
    );
  `);
  
  const app = express();
  const server = createServer(app);
  let chatRoom = '';
  const io = new Server(server, {
    connectionStateRecovery: {},
    adapter: createAdapter()
  });

  app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
  });

  io.on('connection', async (socket) => {

    const adjectives = ['Cool', 'Fast', 'Bright', 'Sassy', 'Funky'];
    const nouns = ['Tiger', 'Eagle', 'Panda', 'Shark', 'Wolf'];
    const randomUsername = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
    socket.username = randomUsername; // Store username in socket object
  
    console.log(`User connected with username: ${socket.username}`);
    socket.emit('username', socket.username); // Emit the username to the client
    let chatRoom = '';  // Track the room user is in
    // Join a room
    socket.on('join room', async (room) => {
      if (!room) {
          console.log(`No room specified.`);
          return; // Prevent joining or emitting messages without specifying a room.
        }
      socket.join(room);
      chatRoom = room;
      console.log(`Socket ${socket.id} (${socket.username}) joined room: ${room}`);      
      try {
        const messages = await db.all(
            'SELECT id, username, content FROM messages WHERE room = ? ORDER BY id ASC',
            [room]
          );
        console.log(`Fetched messages for room ${room}:`, messages);
        if (messages && messages.length > 0) {
            messages.forEach((message) => {
                socket.emit('chat message', `${message.username}: ${message.content}`, message.id);            
            });
          } else {
            console.log(`No messages found for room ${room}`);
          }
      } catch (error) {
        console.error(`Failed to fetch messages for room ${room}:`, error);
      }
    });
    // Leave a room
    socket.on('leave room', (room) => {
      socket.leave(room);
      console.log(`${socket.id} left room: ${room}`);
    });

    socket.on('chat message', async (msg, clientOffset, callback) => {
    if (!chatRoom) {
        console.log(`User ${socket.username} tried to send a message without joining a room.`);
        return;
    }
      try {
        console.log(` Username: ${socket.username}. Received message: ${msg} from ${socket.id} in room: ${chatRoom}. Client offset: ${clientOffset}.`);
        const result = await db.run(
            'INSERT INTO messages (room, username, content, client_offset) VALUES (?, ?, ?, ?)',
            chatRoom,
            socket.username,
            msg,
            clientOffset
          );
        console.log(`Username ${socket.username}.  Inserted message with id: ${result.lastID} in room: ${chatRoom}. Client offset: ${clientOffset}. Message: ${msg}`);
        const messageWithUsername = `${socket.username}: ${msg}`;
        io.to(chatRoom).emit('chat message', messageWithUsername, result.lastID); // Emit to specific room

      } catch (e) {
        console.error(`Failed to send message: ${e}`);
        return;
      }
    // callback(); // Check if callback exists before calling
    });
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });

    if (!socket.recovered) {
        if (chatRoom) { // Ensure the user has joined a room
          try {
            await db.each(
              'SELECT id, username, content FROM messages WHERE room = ? AND id > ?',
              [chatRoom, socket.handshake.auth.serverOffset || 0],
              (err, row) => {
                if (err) {
                  console.error('Error fetching messages:', err);
                } else if (row) {
                  socket.emit('chat message', `${row.username}: ${row.content}`, row.id); // Send only messages for the room
                }
              }
            );
          } catch (e) {
            console.error('Error in socket.recovered block:', e);
          }
        } else {
          console.log(`Socket ${socket.id} has not joined a room yet, skipping message recovery.`);
        }
      }
      
  });

  const port = process.env.PORT;
  app.use('/css', express.static(__dirname + '/css'));
  app.use('/js', express.static(__dirname + '/js'));
  server.listen(port, () => {
    console.log(`server running at http://localhost:${port}`);
  });
}

main();