const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const ScrabbleEngine = require('./public/scrabble-engine.js');
const LobbyManager = require('./backend/lobby/LobbyManager');
const LOBBY_EVENTS = require('./shared/constants/lobbyEvents');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static files from public directory & shared directory
app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));

// Initialisiere Lobby-Manager
const lobbyManager = new LobbyManager(io, {
  gameId: 'scrabble_pro',
  gameTitle: 'Scrabble Pro',
  minPlayers: 2,
  maxPlayers: 4,
  requireReady: true
});

// Active Scrabble Games (roomCode -> gameData)
const scrabbleGames = new Map();

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
 * Broadcasts filtered state to each player in the room
 */
function broadcastScrabbleGameState(game) {
  for (const player of game.players) {
    const state = {
      roomId: game.roomId,
      gameStarted: game.gameStarted,
      turnIndex: game.turnIndex,
      activePlayerId: game.players[game.turnIndex]?.id || null,
      board: game.board,
      bagCount: game.bag.length,
      history: game.history,
      winner: game.winner || null,
      players: game.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        rackCount: p.rack.length,
        isActive: game.gameStarted && game.players[game.turnIndex]?.id === p.id,
        connected: p.connected !== false
      })),
      myRack: game.players.find(p => p.id === player.id)?.rack || [],
      canChallenge: game.gameStarted && game.history.length > 0 && !game.history[game.history.length - 1].challenged && !game.history[game.history.length - 1].system
    };
    io.to(player.id).emit('gameState', state);
  }
}

/**
 * Gets active Scrabble game for a socket ID
 */
function getGameBySocket(socketId) {
  const roomCode = lobbyManager.socketToRoomMap.get(socketId);
  if (!roomCode) return null;
  return scrabbleGames.get(roomCode) || null;
}

// Register onGameStart callback from LobbyManager
lobbyManager.onGameStart((room, hostSocketId) => {
  console.log(`[Server] Game started callback triggered for room ${room.code}`);
  
  const bag = createShuffledBag();
  const board = Array(15).fill(null).map(() => Array(15).fill(null));

  // Initialize players
  const players = room.players.map((p) => {
    const rack = [];
    for (let i = 0; i < 7; i++) {
      if (bag.length > 0) rack.push(bag.pop());
    }
    return {
      id: p.id,
      name: p.name,
      score: 0,
      rack: rack,
      connected: true
    };
  });

  const turnIndex = Math.floor(Math.random() * players.length);

  const gameData = {
    roomId: room.code,
    gameStarted: true,
    players: players,
    board: board,
    bag: bag,
    turnIndex: turnIndex,
    history: [{
      id: 'start',
      system: true,
      text: 'Das Spiel hat begonnen! Viel Spaß!'
    }],
    previousState: null,
    winner: null
  };

  scrabbleGames.set(room.code, gameData);
  broadcastScrabbleGameState(gameData);
});

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

    if (!dudenBlockedOrFailed && dudenUrls.length > 0) {
      return false; // Confirmed invalid in Duden
    }

    console.warn(`Duden check failed or was blocked for "${word}". Falling back to Wiktionary...`);
    return await checkWordInWiktionaryInternal(word);
  } catch (err) {
    console.error(`Error in Duden validation for "${word}", falling back to Wiktionary:`, err);
    return await checkWordInWiktionaryInternal(word);
  }
}

/**
 * Fallback validator using the German Wiktionary API
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
      console.warn('Wiktionary API requests failed. Falling back to assuming word is valid.');
      return true;
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
              return true;
            }
          }
        }
      }
    }
    return false;
  } catch (err) {
    console.error('Wiktionary Check Failed:', err);
    return true;
  }
}

// Socket Connection Handler
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Attach LobbyManager standard listeners
  lobbyManager.attachSocketListeners(socket);

  // Submit Turn
  socket.on('submitTurn', ({ tiles }) => {
    const game = getGameBySocket(socket.id);
    if (!game || !game.gameStarted) return;

    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== game.turnIndex) {
      socket.emit('turnError', 'Du bist nicht an der Reihe.');
      return;
    }

    // Calculate and validate placement
    const result = ScrabbleEngine.calculateScore(game.board, tiles);
    if (!result.valid) {
      socket.emit('turnError', result.error);
      return;
    }

    // Backup current state for challenges
    game.previousState = {
      board: JSON.parse(JSON.stringify(game.board)),
      players: JSON.parse(JSON.stringify(game.players)),
      bag: [...game.bag],
      turnIndex: game.turnIndex,
      history: [...game.history]
    };

    // Apply placed tiles to board
    for (const tile of tiles) {
      game.board[tile.r][tile.c] = {
        letter: tile.letter.toUpperCase(),
        isBlank: !!tile.isBlank
      };
    }

    // Update player score & rack
    const player = game.players[playerIndex];
    player.score += result.score;

    for (const tile of tiles) {
      let tileIndex = player.rack.indexOf(tile.letter);
      if (tileIndex === -1 && tile.isBlank) {
        tileIndex = player.rack.indexOf(' ');
      }
      if (tileIndex !== -1) {
        player.rack.splice(tileIndex, 1);
      }
    }

    // Draw new tiles
    const drawCount = 7 - player.rack.length;
    for (let i = 0; i < drawCount; i++) {
      if (game.bag.length > 0) {
        player.rack.push(game.bag.pop());
      }
    }

    // Log in turn history
    game.history.push({
      id: Date.now().toString(),
      player: player.name,
      playerId: player.id,
      words: result.words.map(w => w.word),
      score: result.score,
      tilesPlaced: tiles,
      challenged: false
    });

    // Advance turn
    game.turnIndex = (game.turnIndex + 1) % game.players.length;

    // Check game over condition
    const outOfTiles = game.bag.length === 0 && game.players.some(p => p.rack.length === 0);
    if (outOfTiles) {
      let finisherIndex = game.players.findIndex(p => p.rack.length === 0);
      let finisherBonus = 0;
      game.players.forEach((p, idx) => {
        if (idx !== finisherIndex) {
          let rackDeduction = p.rack.reduce((sum, char) => sum + (ScrabbleEngine.TILE_VALUES[char] || 0), 0);
          p.score = Math.max(0, p.score - rackDeduction);
          finisherBonus += rackDeduction;
        }
      });
      if (finisherIndex !== -1) {
        game.players[finisherIndex].score += finisherBonus;
      }

      let highestScore = -1;
      let winnerName = '';
      for (const p of game.players) {
        if (p.score > highestScore) {
          highestScore = p.score;
          winnerName = p.name;
        }
      }
      game.winner = winnerName;
      game.history.push({
        id: 'gameover',
        system: true,
        text: `Spiel beendet! Gewinner: ${winnerName} mit ${highestScore} Punkten!`
      });
    }

    broadcastScrabbleGameState(game);
  });

  // Pass Turn
  socket.on('passTurn', () => {
    const game = getGameBySocket(socket.id);
    if (!game || !game.gameStarted) return;

    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== game.turnIndex) return;

    const player = game.players[playerIndex];

    game.history.push({
      id: Date.now().toString(),
      system: true,
      text: `${player.name} hat gepasst.`
    });

    game.turnIndex = (game.turnIndex + 1) % game.players.length;
    broadcastScrabbleGameState(game);
  });

  // Swap Tiles
  socket.on('swapTiles', ({ letters }) => {
    const game = getGameBySocket(socket.id);
    if (!game || !game.gameStarted || !letters || letters.length === 0) return;

    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== game.turnIndex) return;

    const player = game.players[playerIndex];

    if (game.bag.length < letters.length) {
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
      if (game.bag.length > 0) {
        drawn.push(game.bag.pop());
      }
    }
    player.rack.push(...drawn);

    // Put swapped tiles back and reshuffle
    game.bag.push(...swappedLetters);
    for (let i = game.bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [game.bag[i], game.bag[j]] = [game.bag[j], game.bag[i]];
    }

    const swapText = `${player.name} hat ${swappedLetters.length} Stein(e) getauscht.`;
    game.history.push({
      id: Date.now().toString(),
      system: true,
      text: swapText
    });

    io.to(game.roomId).emit('swapNotification', {
      text: swapText,
      playerName: player.name,
      count: swappedLetters.length
    });

    game.turnIndex = (game.turnIndex + 1) % game.players.length;
    broadcastScrabbleGameState(game);
  });

  // Challenge Last Play
  socket.on('challengeTurn', async () => {
    const game = getGameBySocket(socket.id);
    if (!game || !game.gameStarted || game.history.length === 0) return;

    const lastPlayIndex = [...game.history].reverse().findIndex(h => !h.system);
    if (lastPlayIndex === -1) return;
    
    const actualIndex = game.history.length - 1 - lastPlayIndex;
    const lastTurn = game.history[actualIndex];

    if (lastTurn.challenged) {
      socket.emit('challengeFeedback', { success: false, message: 'Dieser Zug wurde bereits herausgefordert.' });
      return;
    }

    lastTurn.challenged = true;
    let allValid = true;
    const invalidWords = [];

    for (const word of lastTurn.words) {
      const isValid = await checkWordInWiktionary(word);
      if (!isValid) {
        allValid = false;
        invalidWords.push(word);
      }
    }

    if (!allValid) {
      // SUCCESSFUL CHALLENGE - REVERT!
      const playerWhoPlayed = game.previousState.players[game.previousState.turnIndex];
      
      game.board = game.previousState.board;
      game.players = game.previousState.players;
      game.bag = game.previousState.bag;
      game.turnIndex = game.previousState.turnIndex;
      game.history = game.previousState.history;

      game.history.push({
        id: Date.now().toString(),
        system: true,
        text: `Herausforderung ERFOLGREICH! Der Zug von ${playerWhoPlayed.name} wurde zurückgesetzt, da die Wörter ungültig sind: ${invalidWords.join(', ')}.`
      });

      game.turnIndex = (game.previousState.turnIndex + 1) % game.players.length;

      io.to(game.roomId).emit('challengeNotification', {
        success: true,
        message: `Herausforderung erfolgreich! Der Zug von ${playerWhoPlayed.name} wurde gelöscht. Ungültige Wörter: ${invalidWords.join(', ')}.`
      });
    } else {
      // FAILED CHALLENGE
      const challenger = game.players.find(p => p.id === socket.id);
      if (challenger) {
        challenger.score = Math.max(0, challenger.score - 10);
      }

      game.history.push({
        id: Date.now().toString(),
        system: true,
        text: `${challenger ? challenger.name : 'Ein Spieler'} hat den Zug von ${lastTurn.player} erfolglos herausgefordert (-10 Punkte).`
      });

      io.to(game.roomId).emit('challengeNotification', {
        success: false,
        message: `Herausforderung gescheitert! Alle Wörter (${lastTurn.words.join(', ')}) sind gültig. ${challenger ? challenger.name : ''} verliert 10 Punkte.`
      });
    }

    broadcastScrabbleGameState(game);
  });

  // Client requests dictionary validation of a specific word
  socket.on('queryWordInfo', async ({ word }) => {
    const isValid = await checkWordInWiktionary(word);
    socket.emit('wordInfoResult', { word, isValid });
  });

  // Handle Chat Message
  socket.on('sendChatMessage', ({ message }) => {
    const game = getGameBySocket(socket.id);
    if (!game) return;
    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;

    io.to(game.roomId).emit('chatMessage', {
      sender: player.name,
      message: message.trim().slice(0, 60)
    });
  });

  // Forfeit/Resign Game
  socket.on('resignGame', () => {
    const game = getGameBySocket(socket.id);
    if (!game) return;

    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;

    game.history.push({
      id: Date.now().toString(),
      system: true,
      text: `${player.name} hat die Partie aufgegeben.`
    });

    game.players = game.players.filter(p => p.id !== socket.id);

    if (game.players.length === 0) {
      scrabbleGames.delete(game.roomId);
    } else {
      game.turnIndex = game.turnIndex % game.players.length;
      broadcastScrabbleGameState(game);
    }
  });

  // Reconnect Player to Scrabble Game
  socket.on('reconnectPlayer', ({ roomId, playerId }) => {
    if (!roomId || !playerId) {
      socket.emit('reconnectFailed', 'Ungültige Anmeldedaten.');
      return;
    }
    const cleanRoomId = roomId.trim().toUpperCase();
    const game = scrabbleGames.get(cleanRoomId);
    if (game) {
      const player = game.players.find(p => p.persistentId === playerId || p.id === playerId);
      if (player) {
        player.id = socket.id;
        player.connected = true;
        socket.join(cleanRoomId);
        
        console.log(`${player.name} reconnected to game room ${cleanRoomId} with new socket ${socket.id}`);
        
        if (game.gameStarted) {
          game.history.push({
            id: Date.now().toString(),
            system: true,
            text: `${player.name} hat sich wieder verbunden.`
          });
        }
        
        socket.emit('reconnectSuccess', { roomId: cleanRoomId });
        broadcastScrabbleGameState(game);
        return;
      }
    }
    socket.emit('reconnectFailed', 'Lobby nicht gefunden oder Spieler nicht in dieser Lobby.');
  });
});

// Fallback to index.html for lobby routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
