// sockets.js
const { Server } = require('socket.io');

function randomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}
function generateLobbyCode(hostName) {
  return `${hostName}-${randomCode()}`;
}

module.exports = function(server, sessionMiddleware) {
  const io = new Server(server);

  // Partage de la session Express avec Socket.IO
  io.use((socket, next) =>
    sessionMiddleware(socket.request, socket.request.res || {}, next)
  );

  let nextLobbyId = 1;
  const lobbies = new Map();      // id → { id, code, hostUserId, hostSocketId, settings, players, banned }
  const pendingDestruct = new Map(); // id → timeoutID

  function broadcastLobbyList() {
    const list = Array.from(lobbies.values()).map(l => {
      const host = l.players.find(p => p.userId === l.hostUserId);
      return {
        id:           l.id,
        code:         l.code,
        playersCount: l.players.length,
        hostName:     host?.name || '',
        hasPassword:  !!l.settings.password
      };
    });
    io.emit('lobbyList', list);
  }

  function emitLobbyUpdate(lobbyId) {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    for (let p of lobby.players) {
      const isHost = p.userId === lobby.hostUserId;
      const payload = {
        players: lobby.players.map(pl => ({
          id:     pl.socketId,
          userId: pl.userId,
          name:   pl.name
        })),
        settings: {
          rounds:          lobby.settings.rounds,
          difficulty:      lobby.settings.difficulty,
          timePerQuestion: lobby.settings.timePerQuestion,
          hasPassword:     !!lobby.settings.password,
          password:        isHost ? lobby.settings.password || '' : undefined
        },
        hostId: lobby.hostUserId,
        code:   lobby.code,
        isHost
      };
      io.to(p.socketId).emit('lobbyUpdated', payload);
    }
  }

  io.on('connection', socket => {
    const sess = socket.request.session;
    if (!sess.user) return socket.disconnect(true);
    const userId   = sess.user.id;
    const username = sess.user.username;

    // Reconnexion hôte (60s)
    for (let [id, lobby] of lobbies) {
      if (lobby.hostUserId === userId) {
        clearTimeout(pendingDestruct.get(id));
        pendingDestruct.delete(id);
        lobby.hostSocketId = socket.id;
        lobby.players = lobby.players.map(p =>
          p.userId === userId ? { ...p, socketId: socket.id } : p
        );
        socket.join(`lobby-${id}`);
        socket.emit('lobbyJoined', {
          players: lobby.players.map(pl => ({
            id:     pl.socketId,
            userId: pl.userId,
            name:   pl.name
          })),
          settings: {
            rounds:           lobby.settings.rounds,
            difficulty:       lobby.settings.difficulty,
            timePerQuestion:  lobby.settings.timePerQuestion,
            hasPassword:      !!lobby.settings.password,
            password:         lobby.settings.password || ''
          },
          hostId:  lobby.hostUserId,
          code:    lobby.code,
          isHost:  true
        });
        broadcastLobbyList();
        emitLobbyUpdate(id);
        break;
      }
    }

    socket.on('getLobbyList', () => broadcastLobbyList());

    socket.on('createLobby', () => {
      const id   = nextLobbyId++;
      const code = generateLobbyCode(username);
      const lobby = {
        id,
        code,
        hostUserId:   userId,
        hostSocketId: socket.id,
        settings:     { rounds: 5, difficulty: 'easy', timePerQuestion: 15, password: '' },
        players:      [{ socketId: socket.id, userId, name: username }],
        banned:       new Set()
      };
      lobbies.set(id, lobby);
      socket.join(`lobby-${id}`);
      socket.emit('lobbyJoined', {
        players: lobby.players.map(pl => ({
          id:     pl.socketId,
          userId: pl.userId,
          name:   pl.name
        })),
        settings: {
          rounds:          5,
          difficulty:      'easy',
          timePerQuestion: 15,
          hasPassword:     false,
          password:        ''
        },
        hostId: userId,
        code,
        isHost: true
      });
      broadcastLobbyList();
    });

    socket.on('joinLobby', ({ lobbyId, password }) => {
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return socket.emit('errorMessage', 'Lobby introuvable.');
      if (lobby.banned.has(userId)) return socket.emit('errorMessage', 'Vous êtes banni de ce lobby.');
      const pwd = lobby.settings.password || '';
      if (pwd && pwd !== (password || ''))
        return socket.emit('errorMessage', 'Mot de passe incorrect.');
      const existing = lobby.players.find(p => p.userId === userId);
      if (existing) {
        existing.socketId = socket.id;
      } else {
        lobby.players.push({ socketId: socket.id, userId, name: username });
        socket.to(`lobby-${lobbyId}`).emit('playerJoined', username);
      }
      socket.join(`lobby-${lobbyId}`);
      socket.emit('lobbyJoined', {
        players: lobby.players.map(pl => ({
          id:     pl.socketId,
          userId: pl.userId,
          name:   pl.name
        })),
        settings: {
          rounds:          lobby.settings.rounds,
          difficulty:      lobby.settings.difficulty,
          timePerQuestion: lobby.settings.timePerQuestion,
          hasPassword:     !!lobby.settings.password
        },
        hostId: lobby.hostUserId,
        code:   lobby.code,
        isHost: userId === lobby.hostUserId
      });
      broadcastLobbyList();
      emitLobbyUpdate(lobbyId);
    });

    socket.on('kickPlayer', targetId => {
      for (let [id, lobby] of lobbies) {
        if (lobby.hostSocketId === socket.id) {
          const target = lobby.players.find(p => p.socketId === targetId);
          if (target) {
            io.sockets.sockets.get(targetId)?.leave(`lobby-${id}`);
            lobby.players = lobby.players.filter(p => p.socketId !== targetId);
            io.in(`lobby-${id}`).emit('playerLeft', target.name);
            io.to(targetId).emit('kicked', 'Vous avez été expulsé du lobby.');
            broadcastLobbyList();
            emitLobbyUpdate(id);
          }
          break;
        }
      }
    });

    socket.on('banPlayer', targetId => {
      for (let [id, lobby] of lobbies) {
        if (lobby.hostSocketId === socket.id) {
          const target = lobby.players.find(p => p.socketId === targetId);
          if (target) {
            lobby.banned.add(target.userId);
            io.sockets.sockets.get(targetId)?.leave(`lobby-${id}`);
            lobby.players = lobby.players.filter(p => p.socketId !== targetId);
            io.in(`lobby-${id}`).emit('playerLeft', target.name);
            io.to(targetId).emit('kicked', 'Vous avez été banni du lobby.');
            broadcastLobbyList();
            emitLobbyUpdate(id);
          }
          break;
        }
      }
    });

    socket.on('updateSettings', settings => {
      for (let [id, lobby] of lobbies) {
        if (lobby.hostSocketId === socket.id) {
          lobby.settings.rounds          = settings.rounds;
          lobby.settings.difficulty      = settings.difficulty;
          lobby.settings.timePerQuestion = settings.timePerQuestion;
          lobby.settings.password        = settings.password || '';
          emitLobbyUpdate(id);
          broadcastLobbyList();
          break;
        }
      }
    });

    socket.on('destroyLobby', () => {
      for (let [id, lobby] of lobbies) {
        if (lobby.hostSocketId === socket.id) {
          io.in(`lobby-${id}`).emit('lobbyDestroyed');
          lobbies.delete(id);
          clearTimeout(pendingDestruct.get(id));
          pendingDestruct.delete(id);
          broadcastLobbyList();
          break;
        }
      }
    });

    socket.on('disconnect', () => {
      for (let [id, lobby] of lobbies) {
        if (lobby.hostSocketId === socket.id) {
          const to = setTimeout(() => {
            if (lobbies.has(id)) {
              io.in(`lobby-${id}`).emit('lobbyDestroyed');
              lobbies.delete(id);
              broadcastLobbyList();
            }
            pendingDestruct.delete(id);
          }, 60000);
          pendingDestruct.set(id, to);
        } else {
          const dep = lobby.players.find(p => p.socketId === socket.id);
          if (dep) {
            socket.to(`lobby-${id}`).emit('playerLeft', dep.name);
            lobby.players = lobby.players.filter(p => p.socketId !== socket.id);
            broadcastLobbyList();
            emitLobbyUpdate(id);
          }
        }
      }
    });
  });

  return io;
};
