const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const ScrabbleEngine = require('./public/scrabble-engine.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for lobby routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// In-memory database of active game rooms
const rooms = new Map();

/**
 * Generates a unique 4-character room ID
 */
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid ambiguous chars
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

/**
 * Creates a fresh, shuffled tile bag for German Scrabble
 */
function createShuffledBag() {
  const bag = [];
  for (const [letter, count] of Object.entries(ScrabbleEngine.TILE_BAG_DISTRIBUTION)) {
    for (let i = 0; i < count; i++) {
      bag.push(letter);
    }
  }
  // Fisher-Yates Shuffle
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/**
 * Extracts relevant game state for a specific player (securely hiding other players' racks)
 */
function getPlayerState(room, socketId) {
  return {
    roomId: room.roomId,
    gameStarted: room.gameStarted,
    turnIndex: room.turnIndex,
    activePlayerId: room.players[room.turnIndex]?.id || null,
    board: room.board,
    bagCount: room.bag.length,
    history: room.history,
    winner: room.winner || null,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      rackCount: p.rack.length,
      isActive: room.gameStarted && room.players[room.turnIndex]?.id === p.id
    })),
    myRack: room.players.find(p => p.id === socketId)?.rack || [],
    canChallenge: room.gameStarted && room.history.length > 0 && !room.history[room.history.length - 1].challenged && !room.history[room.history.length - 1].system
  };
}

/**
 * Broadcasts filtered state to each player in the room
 */
function broadcastRoomState(room) {
  for (const player of room.players) {
    io.to(player.id).emit('gameState', getPlayerState(room, player.id));
  }
}

/**
 * Transcribes special German characters into URL-safe formats used by Duden.de
 */
function transcribeForDuden(word) {
  return word
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'sz')
    .replace(/ẞ/g, 'sz');
}

/**
 * Generates the TitleCase and lowercase URL candidates for a word on Duden.de
 */
function getDudenUrls(word) {
  const cleanWord = word.trim().toUpperCase();
  if (cleanWord.length < 2) return [];

  const titleCase = cleanWord.charAt(0) + cleanWord.slice(1).toLowerCase();
  const lowercase = cleanWord.toLowerCase();
  
  const tcTranscribed = transcribeForDuden(titleCase);
  const lcTranscribed = transcribeForDuden(lowercase);
  
  const uniquePaths = Array.from(new Set([tcTranscribed, lcTranscribed]));
  return uniquePaths.map(path => `https://www.duden.de/rechtschreibung/${encodeURIComponent(path)}`);
}

/**
 * Checks a word on Duden.de first. If Duden is blocked or fails, falls back to Wiktionary.
 */
async function checkWordInWiktionary(word) {
  try {
    const dudenUrls = getDudenUrls(word);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    let dudenFound = false;
    let dudenBlockedOrFailed = false;

    // Check Duden first via fast HEAD requests
    for (const url of dudenUrls) {
      try {
        const res = await fetch(url, { headers, method: 'HEAD' });
        if (res.status === 200) {
          dudenFound = true;
          break;
        } else if (res.status !== 404) {
          // 403, 429, 503, etc. indicates rate-limiting or blocks
          dudenBlockedOrFailed = true;
        }
      } catch (err) {
        console.error('Duden HEAD request failed:', err);
        dudenBlockedOrFailed = true;
      }
    }

    if (dudenFound) {
      return true; // Valid in Duden
    }

    // If Duden successfully returned 404 for all paths without blocking, it's invalid
    if (!dudenBlockedOrFailed && dudenUrls.length > 0) {
      return false; // Confirmed invalid in Duden
    }

    // Otherwise, Duden request was blocked or failed, so we fall back to Wiktionary
    console.warn(`Duden check failed or was blocked for "${word}". Falling back to Wiktionary...`);
    return await checkWordInWiktionaryInternal(word);
  } catch (err) {
    console.error(`Error in Duden validation for "${word}", falling back to Wiktionary:`, err);
    return await checkWordInWiktionaryInternal(word);
  }
}

/**
 * Fallback validator using the German Wiktionary API (verifies exact Level-2 German header)
 */
async function checkWordInWiktionaryInternal(word) {
  try {
    const cleanWord = word.trim().toUpperCase();
    if (cleanWord.length < 2) return false;

    const titleCase = cleanWord.charAt(0) + cleanWord.slice(1).toLowerCase();
    const lowercase = cleanWord.toLowerCase();

    const urls = [
      `https://de.wiktionary.org/w/api.php?action=query&format=json&prop=revisions&rvprop=content&rvslots=main&origin=*&titles=${encodeURIComponent(titleCase)}`,
      `https://de.wiktionary.org/w/api.php?action=query&format=json&prop=revisions&rvprop=content&rvslots=main&origin=*&titles=${encodeURIComponent(lowercase)}`
    ];

    const headers = {
      'User-Agent': 'ScrabblePro/1.0 (https://github.com/gnpanschur/Scrabble-Pro; contact@example.com)'
    };

    const responses = await Promise.all(
      urls.map(url =>
        fetch(url, { headers })
          .then(res => {
            if (!res.ok) return null;
            return res.json();
          })
          .catch(() => null)
      )
    );

    let allFailed = true;
    for (const data of responses) {
      if (data !== null && data !== undefined) {
        allFailed = false;
      }
    }

    if (allFailed) {
      console.warn('Wiktionary API requests failed (network error, rate-limited, or blocked). Falling back to assuming word is valid.');
      return true; // Fallback to true so the game doesn't break
    }

    for (const data of responses) {
      if (data && data.query && data.query.pages) {
        const pages = data.query.pages;
        for (const pageId in pages) {
          const page = pages[pageId];
          if (pageId !== '-1' && !page.missing && page.revisions && page.revisions[0]) {
            const content = page.revisions[0]['*'] || page.revisions[0].slots?.main?.['*'] || '';
            const escapedTitle = page.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const headerRegex = new RegExp(`==\\s*${escapedTitle}\\s*\\(\\s*\\{\\{\\s*Sprache\\s*\\|\\s*Deutsch\\s*\\}\\}\\s*\\)\\s*==`, 'i');
            if (headerRegex.test(content)) {
              return true; // Word exists and is a German entry!
            }
          }
        }
      }
    }
    return false;
  } catch (err) {
    console.error('Wiktionary Check Failed:', err);
    return true; // Fallback to true if network fails
  }
}

// Find room by socket ID
function findRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.id === socketId)) {
      return room;
    }
  }
  return null;
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Create Lobby
  socket.on('createLobby', ({ name }) => {
    const roomId = generateRoomId();
    const room = {
      roomId,
      gameStarted: false,
      players: [{ id: socket.id, name: name || 'Spieler 1', score: 0, rack: [] }],
      board: Array(15).fill(null).map(() => Array(15).fill(null)),
      bag: createShuffledBag(),
      turnIndex: 0,
      history: [],
      previousState: null,
      winner: null
    };
    rooms.set(roomId, room);
    socket.join(roomId);
    
    console.log(`Lobby created: ${roomId} by ${name}`);
    socket.emit('lobbyCreated', { roomId });
    broadcastRoomState(room);
  });

  // Join Lobby
  socket.on('joinLobby', ({ name, roomId }) => {
    const cleanRoomId = roomId.trim().toUpperCase();
    const room = rooms.get(cleanRoomId);

    if (!room) {
      socket.emit('lobbyError', 'Lobby wurde nicht gefunden.');
      return;
    }
    if (room.gameStarted) {
      socket.emit('lobbyError', 'Das Spiel hat bereits begonnen.');
      return;
    }
    if (room.players.length >= 4) {
      socket.emit('lobbyError', 'Lobby ist voll (max. 4 Spieler).');
      return;
    }

    const playerName = name || `Spieler ${room.players.length + 1}`;
    room.players.push({ id: socket.id, name: playerName, score: 0, rack: [] });
    socket.join(cleanRoomId);

    console.log(`${playerName} joined lobby ${cleanRoomId}`);
    broadcastRoomState(room);
  });

  // Start Game
  socket.on('startGame', () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    if (room.players[0].id !== socket.id) {
      socket.emit('lobbyError', 'Nur der Host kann das Spiel starten.');
      return;
    }

    room.gameStarted = true;
    room.bag = createShuffledBag();
    room.board = Array(15).fill(null).map(() => Array(15).fill(null));
    room.history = [{
      id: 'start',
      system: true,
      text: 'Das Spiel hat begonnen! Viel Spaß!'
    }];

    // Draw initial 7 tiles for all players
    for (const player of room.players) {
      player.rack = [];
      for (let i = 0; i < 7; i++) {
        if (room.bag.length > 0) {
          player.rack.push(room.bag.pop());
        }
      }
    }

    // Set random starting player
    room.turnIndex = Math.floor(Math.random() * room.players.length);

    console.log(`Game started in room ${room.roomId}. Turn: ${room.players[room.turnIndex].name}`);
    broadcastRoomState(room);
  });

  // Submit Turn
  socket.on('submitTurn', ({ tiles }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.gameStarted) return;

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== room.turnIndex) {
      socket.emit('turnError', 'Du bist nicht an der Reihe.');
      return;
    }

    // Calculate and validate placement
    const result = ScrabbleEngine.calculateScore(room.board, tiles);
    if (!result.valid) {
      socket.emit('turnError', result.error);
      return;
    }

    // Backup current state for challenges
    room.previousState = {
      board: JSON.parse(JSON.stringify(room.board)),
      players: JSON.parse(JSON.stringify(room.players)),
      bag: [...room.bag],
      turnIndex: room.turnIndex,
      history: [...room.history]
    };

    // Apply placed tiles to board
    for (const tile of tiles) {
      room.board[tile.r][tile.c] = {
        letter: tile.letter.toUpperCase(),
        isBlank: !!tile.isBlank
      };
    }

    // Update player score & rack
    const player = room.players[playerIndex];
    player.score += result.score;

    for (const tile of tiles) {
      // Remove used tile from rack
      let tileIndex = player.rack.indexOf(tile.letter);
      if (tileIndex === -1 && tile.isBlank) {
        tileIndex = player.rack.indexOf(' '); // Blank tile
      }
      if (tileIndex !== -1) {
        player.rack.splice(tileIndex, 1);
      }
    }

    // Draw new tiles
    const drawCount = 7 - player.rack.length;
    for (let i = 0; i < drawCount; i++) {
      if (room.bag.length > 0) {
        player.rack.push(room.bag.pop());
      }
    }

    // Log in turn history
    room.history.push({
      id: Date.now().toString(),
      player: player.name,
      playerId: player.id,
      words: result.words.map(w => w.word),
      score: result.score,
      tilesPlaced: tiles,
      challenged: false
    });

    // Advance turn
    room.turnIndex = (room.turnIndex + 1) % room.players.length;

    // Check game over condition
    // Game ends if bag is empty and one player has empty rack, or if all players pass twice
    const outOfTiles = room.bag.length === 0 && room.players.some(p => p.rack.length === 0);
    if (outOfTiles) {
      // Calculate final deductions (points remaining on other players' racks are subtracted from their scores, and added to the player who finished)
      let finisherIndex = room.players.findIndex(p => p.rack.length === 0);
      let finisherBonus = 0;
      room.players.forEach((p, idx) => {
        if (idx !== finisherIndex) {
          let rackDeduction = p.rack.reduce((sum, char) => sum + (ScrabbleEngine.TILE_VALUES[char] || 0), 0);
          p.score = Math.max(0, p.score - rackDeduction);
          finisherBonus += rackDeduction;
        }
      });
      room.players[finisherIndex].score += finisherBonus;

      // Find winner
      let highestScore = -1;
      let winnerName = '';
      for (const p of room.players) {
        if (p.score > highestScore) {
          highestScore = p.score;
          winnerName = p.name;
        }
      }
      room.winner = winnerName;
      room.history.push({
        id: 'gameover',
        system: true,
        text: `Spiel beendet! Gewinner: ${winnerName} mit ${highestScore} Punkten!`
      });
    }

    broadcastRoomState(room);
  });

  // Pass Turn
  socket.on('passTurn', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.gameStarted) return;

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== room.turnIndex) return;

    const player = room.players[playerIndex];

    room.history.push({
      id: Date.now().toString(),
      system: true,
      text: `${player.name} hat gepasst.`
    });

    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    broadcastRoomState(room);
  });

  // Swap Tiles
  socket.on('swapTiles', ({ letters }) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.gameStarted || !letters || letters.length === 0) return;

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== room.turnIndex) return;

    const player = room.players[playerIndex];

    if (room.bag.length < letters.length) {
      socket.emit('turnError', 'Nicht genügend Steine im Beutel für einen Tausch.');
      return;
    }

    // Remove tiles from rack
    const swappedLetters = [];
    for (const letter of letters) {
      const idx = player.rack.indexOf(letter);
      if (idx !== -1) {
        swappedLetters.push(player.rack.splice(idx, 1)[0]);
      }
    }

    // Draw new tiles
    const drawn = [];
    for (let i = 0; i < swappedLetters.length; i++) {
      if (room.bag.length > 0) {
        drawn.push(room.bag.pop());
      }
    }
    player.rack.push(...drawn);

    // Put swapped tiles back and reshuffle
    room.bag.push(...swappedLetters);
    // Shuffle bag
    for (let i = room.bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [room.bag[i], room.bag[j]] = [room.bag[j], room.bag[i]];
    }

    room.history.push({
      id: Date.now().toString(),
      system: true,
      text: `${player.name} hat ${swappedLetters.length} Stein(e) getauscht.`
    });

    // Advance turn
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    broadcastRoomState(room);
  });

  // Challenge Last Play
  socket.on('challengeTurn', async () => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.gameStarted || room.history.length === 0) return;

    const lastPlayIndex = [...room.history].reverse().findIndex(h => !h.system);
    if (lastPlayIndex === -1) return;
    
    // Find the actual index of the last play in the history array
    const actualIndex = room.history.length - 1 - lastPlayIndex;
    const lastTurn = room.history[actualIndex];

    if (lastTurn.challenged) {
      socket.emit('challengeFeedback', { success: false, message: 'Dieser Zug wurde bereits herausgefordert.' });
      return;
    }

    lastTurn.challenged = true;
    let allValid = true;
    const invalidWords = [];

    // Check each word against Wiktionary
    for (const word of lastTurn.words) {
      const isValid = await checkWordInWiktionary(word);
      if (!isValid) {
        allValid = false;
        invalidWords.push(word);
      }
    }

    if (!allValid) {
      // SUCCESSFUL CHALLENGE - REVERT!
      const playerWhoPlayed = room.previousState.players[room.previousState.turnIndex];
      
      room.board = room.previousState.board;
      room.players = room.previousState.players;
      room.bag = room.previousState.bag;
      room.turnIndex = room.previousState.turnIndex;
      room.history = room.previousState.history;

      // Log successful challenge
      room.history.push({
        id: Date.now().toString(),
        system: true,
        text: `Herausforderung ERFOLGREICH! Der Zug von ${playerWhoPlayed.name} wurde zurückgesetzt, da die Wörter ungültig sind: ${invalidWords.join(', ')}.`
      });

      // Turn is skipped (losses their turn). So we advance turnIndex to the next player.
      room.turnIndex = (room.previousState.turnIndex + 1) % room.players.length;

      io.to(room.roomId).emit('challengeNotification', {
        success: true,
        message: `Herausforderung erfolgreich! Der Zug von ${playerWhoPlayed.name} wurde gelöscht. Ungültige Wörter: ${invalidWords.join(', ')}.`
      });
    } else {
      // FAILED CHALLENGE - challenger loses 10 points
      const challenger = room.players.find(p => p.id === socket.id);
      if (challenger) {
        challenger.score = Math.max(0, challenger.score - 10);
      }

      room.history.push({
        id: Date.now().toString(),
        system: true,
        text: `${challenger ? challenger.name : 'Ein Spieler'} hat den Zug von ${lastTurn.player} erfolglos herausgefordert (-10 Punkte).`
      });

      io.to(room.roomId).emit('challengeNotification', {
        success: false,
        message: `Herausforderung gescheitert! Alle Wörter (${lastTurn.words.join(', ')}) sind gültig. ${challenger ? challenger.name : ''} verliert 10 Punkte.`
      });
    }

    broadcastRoomState(room);
  });

  // Client requests dictionary validation of a specific word (on demand via right click)
  socket.on('queryWordInfo', async ({ word }) => {
    const isValid = await checkWordInWiktionary(word);
    socket.emit('wordInfoResult', { word, isValid });
  });

  // Handle Chat Message
  socket.on('sendChatMessage', ({ message }) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    io.to(room.roomId).emit('chatMessage', {
      sender: player.name,
      message: message.trim().slice(0, 60)
    });
  });

  // Forfeit/Resign Game
  socket.on('resignGame', () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    room.history.push({
      id: Date.now().toString(),
      system: true,
      text: `${player.name} hat die Partie aufgegeben.`
    });

    // Remove player
    room.players = room.players.filter(p => p.id !== socket.id);

    if (room.players.length === 0) {
      rooms.delete(room.roomId);
    } else {
      // Re-adjust turn index
      room.turnIndex = room.turnIndex % room.players.length;
      broadcastRoomState(room);
    }
  });

  // Handle Disconnection
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const room = findRoomBySocket(socket.id);
    if (room) {
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        // If game has not started, remove player. Otherwise, keep them but mark them inactive/leave room
        if (!room.gameStarted) {
          room.players = room.players.filter(p => p.id !== socket.id);
          if (room.players.length === 0) {
            rooms.delete(room.roomId);
          } else {
            broadcastRoomState(room);
          }
        } else {
          // Keep player in list so they can reconnect if needed, or if they left permanently:
          // For simplicity, we can let them disconnect but notify other players.
          room.history.push({
            id: Date.now().toString(),
            system: true,
            text: `${player.name} hat die Verbindung getrennt.`
          });
          broadcastRoomState(room);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
