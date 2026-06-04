// Initialize Socket.IO connection
const socket = io();

// Local UI & Game States
let currentRoomId = '';
let lobbyPlayers = [];
let gameBoard = Array(15).fill(null).map(() => Array(15).fill(null));
let gamePlayers = [];
let gameHistory = [];
let localRack = [];
let localPlacedTiles = []; // [{ r, c, letter, isBlank }]
let isMyTurn = false;
let myPlayerId = '';
let canChallenge = false;

// Audio Settings
let audioCtx = null;
let audioEnabled = true;

// Zoom scale configuration
let boardZoomPercent = 100;
let autoFitBoard = true;

// Drag and Drop active status
let activeDrag = null;
let dragProxy = null;

// DOM Elements cache
const els = {
  lobbyScreen: document.getElementById('lobby-screen'),
  waitingScreen: document.getElementById('waiting-screen'),
  gameScreen: document.getElementById('game-screen'),
  
  playerNameInput: document.getElementById('player-name-input'),
  roomCodeInput: document.getElementById('room-code-input'),
  lobbyCodeDisplay: document.getElementById('lobby-code-display'),
  inviteLinkDisplay: document.getElementById('invite-link-display'),
  lobbyCountDisplay: document.getElementById('lobby-count-display'),
  lobbyPlayerList: document.getElementById('lobby-player-list'),
  gameRoomCode: document.getElementById('game-room-code'),
  
  btnCreateLobby: document.getElementById('btn-create-lobby'),
  btnJoinLobby: document.getElementById('btn-join-lobby'),
  btnCopyLink: document.getElementById('btn-copy-link'),
  btnWhatsappShare: document.getElementById('btn-whatsapp-share'),
  btnStartGame: document.getElementById('btn-start-game'),
  hostOnlyMsg: document.getElementById('host-only-msg'),
  btnOpenOptions: document.getElementById('btn-open-options'),
  btnForfeit: document.getElementById('btn-forfeit'),
  
  scoreboard: document.getElementById('game-scoreboard'),
  scrabbleBoard: document.getElementById('scrabble-board'),
  zoomViewport: document.getElementById('zoom-viewport'),
  wordValueOverlay: document.getElementById('word-value-overlay'),
  previewWordText: document.getElementById('preview-word-text'),
  previewScoreText: document.getElementById('preview-score-text'),
  
  turnBanner: document.getElementById('turn-banner'),
  tileRack: document.getElementById('tile-rack'),
  bagCountDisplay: document.getElementById('bag-count-display'),
  turnHistoryList: document.getElementById('turn-history-list'),
  btnToggleHistory: document.getElementById('btn-toggle-history'),
  historyContent: document.getElementById('history-content'),
  
  btnPass: document.getElementById('btn-pass'),
  btnSwap: document.getElementById('btn-swap'),
  btnRecall: document.getElementById('btn-recall'),
  btnSubmit: document.getElementById('btn-submit'),
  
  modalOptions: document.getElementById('modal-options'),
  modalSwap: document.getElementById('modal-swap'),
  modalWordInfo: document.getElementById('modal-word-info'),
  
  audioToggle: document.getElementById('options-audio-toggle'),
  zoomSlider: document.getElementById('options-zoom-slider'),
  zoomLabelDisplay: document.getElementById('zoom-label-display'),
  
  swapSelectionGrid: document.getElementById('swap-selection-grid'),
  btnConfirmSwap: document.getElementById('btn-confirm-swap'),
  
  wordTitleDisplay: document.getElementById('word-title-display'),
  wordValidationBadge: document.getElementById('word-validation-badge'),
  wordDefinitionDisplay: document.getElementById('word-definition-display'),
  challengePanel: document.getElementById('challenge-panel'),
  btnTriggerChallenge: document.getElementById('btn-trigger-challenge'),
  linkDwdsLookup: document.getElementById('link-dwds-lookup'),

  modalAlert: document.getElementById('modal-alert'),
  alertTitleDisplay: document.getElementById('alert-title-display'),
  alertMessageDisplay: document.getElementById('alert-message-display'),
  btnAlertOk: document.getElementById('btn-alert-ok'),
  btnAlertCancel: document.getElementById('btn-alert-cancel'),
  btnAlertClose: document.getElementById('btn-alert-close'),

  chatMessages: document.getElementById('chat-messages'),
  chatInput: document.getElementById('chat-input'),
  btnSendChat: document.getElementById('btn-send-chat')
};

// -------------------------------------------------------------
// EVENT LISTENERS & SETUP
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Check URL params for joining code automatically (WhatsApp shared link support)
  const urlParams = new URLSearchParams(window.location.search);
  const inviteCode = urlParams.get('code');
  if (inviteCode) {
    els.roomCodeInput.value = inviteCode.toUpperCase();
  }

  setupUIEventListeners();
  setupDragAndDrop();
  setupWebSocketListeners();
  
  // Listen for window resizes to automatically fit board
  window.addEventListener('resize', resizeBoardToFit);
  
  // Set slider to 100 (which represents Auto-Fit)
  els.zoomSlider.value = 100;
  els.zoomLabelDisplay.textContent = 'Auto-Fit';
});

function setupUIEventListeners() {
  document.querySelectorAll('.fullscreen-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.error('Error attempting to enable fullscreen:', err);
        });
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    });
  });

  // Lobby creation
  els.btnCreateLobby.addEventListener('click', async () => {
    const name = els.playerNameInput.value.trim();
    if (!name) {
      await showCustomAlert('Bitte gib einen Namen ein.');
      return;
    }
    initAudio();
    socket.emit('createLobby', { name });
  });

  // Lobby joining
  els.btnJoinLobby.addEventListener('click', async () => {
    const name = els.playerNameInput.value.trim();
    const code = els.roomCodeInput.value.trim().toUpperCase();
    if (!name) {
      await showCustomAlert('Bitte gib einen Namen ein.');
      return;
    }
    if (code.length !== 4) {
      await showCustomAlert('Bitte gib einen gültigen 4-stelligen Lobby-Code ein.');
      return;
    }
    initAudio();
    socket.emit('joinLobby', { name, roomId: code });
  });

  // Copy invitation link to clipboard
  els.btnCopyLink.addEventListener('click', () => {
    const link = els.inviteLinkDisplay.textContent;
    navigator.clipboard.writeText(link)
      .then(() => {
        els.btnCopyLink.textContent = '✅';
        setTimeout(() => { els.btnCopyLink.textContent = '📋'; }, 2000);
        playAudio('success');
      })
      .catch(err => console.error('Fehler beim Kopieren:', err));
  });

  // WhatsApp share Link
  els.btnWhatsappShare.addEventListener('click', () => {
    const link = els.inviteLinkDisplay.textContent;
    const text = `Komm in meine Scrabble Pro Lobby! Spiele mit mir unter: ${link}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  });

  // Host starts the game
  els.btnStartGame.addEventListener('click', () => {
    socket.emit('startGame');
  });

  // Toggle History Drawer
  els.btnToggleHistory.addEventListener('click', () => {
    els.historyContent.classList.toggle('collapsed');
    els.btnToggleHistory.textContent = els.historyContent.classList.contains('collapsed') 
      ? '📜 Verlauf anzeigen' 
      : '❌ Verlauf einklappen';
  });

  // Submission controls
  els.btnRecall.addEventListener('click', () => {
    recallAllTiles();
  });

  els.btnPass.addEventListener('click', async () => {
    if (!isMyTurn) return;
    if (await showCustomConfirm('Möchtest du diese Runde wirklich aussetzen?')) {
      socket.emit('passTurn');
    }
  });

  els.btnSwap.addEventListener('click', () => {
    if (!isMyTurn) return;
    openSwapModal();
  });

  els.btnSubmit.addEventListener('click', async () => {
    if (!isMyTurn) return;
    if (localPlacedTiles.length === 0) {
      await showCustomAlert('Du hast noch keine Steine auf das Spielfeld gelegt.');
      return;
    }
    socket.emit('submitTurn', { tiles: localPlacedTiles });
  });

  els.btnForfeit.addEventListener('click', async () => {
    if (await showCustomConfirm('Möchtest du diese Partie wirklich aufgeben?')) {
      socket.emit('resignGame');
      location.reload();
    }
  });

  // Modals system trigger closing
  document.querySelectorAll('.modal-close-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    });
  });

  // Close modals clicking outside
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });

  // Options triggers
  els.btnOpenOptions.addEventListener('click', () => {
    els.modalOptions.classList.add('active');
  });

  els.audioToggle.addEventListener('change', (e) => {
    audioEnabled = e.target.checked;
  });

  els.zoomSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    if (val === 100) {
      autoFitBoard = true;
      resizeBoardToFit();
    } else {
      autoFitBoard = false;
      updateZoomScale(val);
    }
  });

  // Triggering Word challenge
  els.btnTriggerChallenge.addEventListener('click', async () => {
    if (await showCustomConfirm('Bist du sicher? Bei Fehlalarm verlierst du 10 Punkte.')) {
      socket.emit('challengeTurn');
      els.modalWordInfo.classList.remove('active');
    }
  });

  // Chat listeners
  els.btnSendChat.addEventListener('click', sendChatMessage);
  els.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });
}

// -------------------------------------------------------------
// AUDIO ENGINES (Synthesized via Web Audio API)
// -------------------------------------------------------------

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playAudio(type) {
  if (!audioEnabled) return;
  initAudio();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  
  const now = audioCtx.currentTime;
  
  if (type === 'click') {
    // Wood Tile Clack Sound
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.07);
    
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(now);
    osc.stop(now + 0.08);
  } else if (type === 'success') {
    // Chime (C-major triad chord)
    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5
    frequencies.forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.05);
      
      gain.gain.setValueAtTime(0.12, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.25);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.3);
    });
  } else if (type === 'error') {
    // low buzzer sound
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(85, now);
    osc.frequency.linearRampToValueAtTime(75, now + 0.18);
    
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.18);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(now);
    osc.stop(now + 0.19);
  }
}

function showCustomAlert(message, title = 'Hinweis') {
  return new Promise((resolve) => {
    els.alertTitleDisplay.textContent = title;
    els.alertMessageDisplay.textContent = message;
    els.btnAlertCancel.style.display = 'none';
    
    // Unbind previous listeners by creating clones
    const newOk = els.btnAlertOk.cloneNode(true);
    els.btnAlertOk.parentNode.replaceChild(newOk, els.btnAlertOk);
    els.btnAlertOk = newOk;
    
    const newClose = els.btnAlertClose.cloneNode(true);
    els.btnAlertClose.parentNode.replaceChild(newClose, els.btnAlertClose);
    els.btnAlertClose = newClose;
    
    const onOk = () => {
      els.modalAlert.classList.remove('active');
      resolve();
    };
    
    els.btnAlertOk.addEventListener('click', onOk);
    els.btnAlertClose.addEventListener('click', onOk);
    els.modalAlert.classList.add('active');
  });
}

function showCustomConfirm(message, title = 'Bestätigung') {
  return new Promise((resolve) => {
    els.alertTitleDisplay.textContent = title;
    els.alertMessageDisplay.textContent = message;
    els.btnAlertCancel.style.display = 'block';
    
    // Unbind previous listeners by creating clones
    const newOk = els.btnAlertOk.cloneNode(true);
    els.btnAlertOk.parentNode.replaceChild(newOk, els.btnAlertOk);
    els.btnAlertOk = newOk;
    
    const newCancel = els.btnAlertCancel.cloneNode(true);
    els.btnAlertCancel.parentNode.replaceChild(newCancel, els.btnAlertCancel);
    els.btnAlertCancel = newCancel;
    
    const newClose = els.btnAlertClose.cloneNode(true);
    els.btnAlertClose.parentNode.replaceChild(newClose, els.btnAlertClose);
    els.btnAlertClose = newClose;
    
    const cleanup = () => {
      els.modalAlert.classList.remove('active');
    };
    
    const onOk = () => {
      cleanup();
      resolve(true);
    };
    
    const onCancel = () => {
      cleanup();
      resolve(false);
    };
    
    els.btnAlertOk.addEventListener('click', onOk);
    els.btnAlertCancel.addEventListener('click', onCancel);
    els.btnAlertClose.addEventListener('click', onCancel);
    els.modalAlert.classList.add('active');
  });
}

// -------------------------------------------------------------
// ZOOM INTERACTION
// -------------------------------------------------------------

function updateZoomScale(percent) {
  boardZoomPercent = percent;
  els.zoomLabelDisplay.textContent = `${percent}%`;
  
  // Directly edit CSS variables on root element
  // 100% zoom = 32px cell size
  const px = Math.round(32 * (percent / 100));
  document.documentElement.style.setProperty('--cell-size', `${px}px`);
}

function resizeBoardToFit() {
  if (!autoFitBoard) return;
  const container = document.querySelector('.board-viewport-container');
  if (!container) return;
  
  const w = container.clientWidth - 4; // padding space (2px on each side)
  const h = container.clientHeight - 4;
  const size = Math.min(w, h);
  
  if (size <= 0) return;
  
  // 15 cells, 16 gaps of 3px each
  const gapSize = 3;
  const totalGapSpace = 16 * gapSize;
  const cellSize = Math.floor((size - totalGapSpace) / 15);
  
  const finalCellSize = Math.max(16, cellSize);
  document.documentElement.style.setProperty('--cell-size', `${finalCellSize}px`);
  
  if (els.zoomLabelDisplay) {
    els.zoomLabelDisplay.textContent = 'Auto-Fit';
  }
}

// -------------------------------------------------------------
// WEBSOCKET LISTENERS
// -------------------------------------------------------------

function setupWebSocketListeners() {
  // Lobby Created
  socket.on('lobbyCreated', ({ roomId }) => {
    currentRoomId = roomId;
    transitionToScreen('waiting-screen');
    updateLobbyUI();
  });

  // Lobby errors (Lobby full, lobby started, not found)
  socket.on('lobbyError', async (msg) => {
    await showCustomAlert(msg, 'Lobby-Fehler');
  });

  // Server-side turn errors (e.g. invalid placement coordinates)
  socket.on('turnError', async (msg) => {
    await showCustomAlert(msg, 'Ungültiger Zug');
    playAudio('error');
  });

  // Synchronized state broadcast
  socket.on('gameState', (state) => {
    myPlayerId = socket.id;
    currentRoomId = state.roomId;
    
    if (state.gameStarted) {
      transitionToScreen('game-screen');
      setTimeout(resizeBoardToFit, 50);
      
      // Update data
      gameBoard = state.board;
      gamePlayers = state.players;
      gameHistory = state.history;
      canChallenge = state.canChallenge;
      
      // Update local rack and clear placed tiles IF it was NOT our turn
      // OR if we just received a fresh turn
      const myPlayerObj = gamePlayers.find(p => p.id === myPlayerId);
      isMyTurn = (state.activePlayerId === myPlayerId);
      
      // Determine if we should overwrite rack
      // If we are currently building a turn, we keep our local rack layout
      // unless we submitted or turn was reverted
      const currentActiveId = state.activePlayerId;
      const isReverted = state.history.length > 0 && state.history[state.history.length - 1].text?.includes('zurückgesetzt');

      if (!isMyTurn || localPlacedTiles.length === 0 || isReverted) {
        localRack = [...state.myRack];
        localPlacedTiles = [];
      }
      
      renderScoreboard();
      renderBoard();
      renderRack();
      renderHistory(state.history);
      updateTurnBanner();
      updateWordPreview();
      
      els.bagCountDisplay.textContent = state.bagCount;
      els.gameRoomCode.textContent = state.roomId;
    } else {
      transitionToScreen('waiting-screen');
      lobbyPlayers = state.players;
      updateLobbyUI();
    }
  });

  // Reversion challenge messages
  socket.on('challengeNotification', async ({ success, message }) => {
    await showCustomAlert(message, 'Herausforderung');
    if (success) {
      playAudio('success');
    } else {
      playAudio('error');
    }
  });

  // Right-click lookup reply from server
  socket.on('wordInfoResult', async ({ word, isValid }) => {
    els.wordTitleDisplay.textContent = word.toUpperCase();
    
    if (isValid) {
      els.wordValidationBadge.textContent = '✓ GÜLTIGES WORT';
      els.wordValidationBadge.className = 'validation-status-badge valid';
    } else {
      els.wordValidationBadge.textContent = '✗ UNGÜLTIGES WORT';
      els.wordValidationBadge.className = 'validation-status-badge invalid';
    }

    els.linkDwdsLookup.href = `https://www.dwds.de/wb/${encodeURIComponent(word)}`;

    // Show challenge box only if challengeable
    const lastHistory = gameHistory.length > 0 ? gameHistory[gameHistory.length - 1] : null;
    const isLastTurnWord = lastHistory && !lastHistory.system && lastHistory.words.map(w => w.toUpperCase()).includes(word.toUpperCase());
    
    if (isLastTurnWord && canChallenge && lastHistory.playerId !== myPlayerId) {
      els.challengePanel.style.display = 'block';
    } else {
      els.challengePanel.style.display = 'none';
    }

    // Fetch definition client-side from Wiktionary for modern premium experience
    els.wordDefinitionDisplay.textContent = 'Lade Erklärung...';
    const definition = await fetchWordDefinition(word);
    els.wordDefinitionDisplay.textContent = definition;
  });

  // Chat Message handler
  socket.on('chatMessage', ({ sender, message }) => {
    appendChatMessage(sender, message);
  });
}

function transitionToScreen(screenId) {
  els.lobbyScreen.classList.remove('active');
  els.waitingScreen.classList.remove('active');
  els.gameScreen.classList.remove('active');
  
  document.getElementById(screenId).classList.add('active');
}

function updateLobbyUI() {
  els.lobbyCodeDisplay.textContent = currentRoomId;
  
  // Set invitation share link details
  const link = `${window.location.origin}${window.location.pathname}?code=${currentRoomId}`;
  els.inviteLinkDisplay.textContent = link;
  
  els.lobbyCountDisplay.textContent = lobbyPlayers.length;
  
  els.lobbyPlayerList.innerHTML = '';
  lobbyPlayers.forEach((player, index) => {
    const li = document.createElement('li');
    li.textContent = player.name;
    if (index === 0) {
      li.classList.add('is-host');
    }
    els.lobbyPlayerList.appendChild(li);
  });

  // Display start button only to host
  const isHost = lobbyPlayers.length > 0 && lobbyPlayers[0].id === socket.id;
  if (isHost && lobbyPlayers.length >= 2) {
    els.btnStartGame.style.display = 'block';
    els.hostOnlyMsg.style.display = 'none';
  } else {
    els.btnStartGame.style.display = 'none';
    els.hostOnlyMsg.style.display = 'block';
    if (isHost) {
      els.hostOnlyMsg.textContent = 'Mindestens 2 Spieler erforderlich, um zu starten.';
    } else {
      els.hostOnlyMsg.textContent = 'Warten auf den Host, um das Spiel zu starten.';
    }
  }
}

// -------------------------------------------------------------
// RENDERERS
// -------------------------------------------------------------

function renderScoreboard() {
  els.scoreboard.innerHTML = '';
  gamePlayers.forEach(p => {
    const card = document.createElement('div');
    card.className = `player-score-card ${p.isActive ? 'active-turn' : ''}`;
    
    const name = document.createElement('span');
    name.className = 'score-name';
    name.textContent = p.name;
    
    const val = document.createElement('span');
    val.className = 'score-val';
    val.textContent = p.score;
    
    const rackCount = document.createElement('span');
    rackCount.className = 'score-tiles-count';
    rackCount.textContent = `(${p.rackCount} Steine)`;
    
    card.appendChild(name);
    card.appendChild(val);
    card.appendChild(rackCount);
    els.scoreboard.appendChild(card);
  });
}

function renderBoard() {
  els.scrabbleBoard.innerHTML = '';
  
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cell = document.createElement('div');
      cell.dataset.r = r;
      cell.dataset.c = c;
      
      const mult = ScrabbleEngine.getMultiplierType(r, c);
      let cellClass = 'cell-normal';
      if (mult === 'DL') cellClass = 'cell-dl';
      else if (mult === 'TL') cellClass = 'cell-tl';
      else if (mult === 'DW') cellClass = 'cell-dw';
      else if (mult === 'TW') cellClass = 'cell-tw';
      
      if (r === 7 && c === 7) {
        cellClass = 'cell-center';
      }
      
      cell.className = `board-cell ${cellClass}`;
      
      // Check if there is an official letter placed on board
      const officialTile = gameBoard[r][c];
      // Check if there is a pending tile placed by current player
      const pendingTile = localPlacedTiles.find(t => t.r === r && t.c === c);
      
      if (officialTile) {
        cell.classList.add('has-tile');
        const tile = createTileElement(officialTile.letter, officialTile.isBlank, false);
        cell.appendChild(tile);
      } else if (pendingTile) {
        cell.classList.add('has-tile');
        const tile = createTileElement(pendingTile.letter, pendingTile.isBlank, true);
        tile.dataset.r = r;
        tile.dataset.c = c;
        cell.appendChild(tile);
      }
      
      // Right-click or long-press on board cells to check words
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const tile = officialTile || pendingTile;
        if (tile) {
          triggerWordLookupAt(r, c);
        }
      });
      
      els.scrabbleBoard.appendChild(cell);
    }
  }
}

function createTileElement(letter, isBlank, isPending) {
  const tile = document.createElement('div');
  tile.className = `scrabble-tile ${isPending ? 'tile-pending' : ''}`;
  tile.dataset.letter = letter;
  tile.dataset.isBlank = isBlank;
  
  const charSpan = document.createElement('span');
  charSpan.textContent = isBlank ? (letter || '') : letter;
  
  const scoreSpan = document.createElement('span');
  scoreSpan.className = 'letter-score';
  scoreSpan.textContent = isBlank ? '0' : (ScrabbleEngine.TILE_VALUES[letter] || '0');
  
  tile.appendChild(charSpan);
  tile.appendChild(scoreSpan);
  return tile;
}

function renderRack() {
  els.tileRack.innerHTML = '';
  
  // Render exactly 7 slots for rack elements
  for (let i = 0; i < 7; i++) {
    const slot = document.createElement('div');
    slot.className = 'rack-slot';
    slot.dataset.index = i;
    
    const letter = localRack[i];
    if (letter !== undefined) {
      const tile = createTileElement(letter, letter === ' ', false);
      tile.dataset.index = i;
      slot.appendChild(tile);
    }
    
    els.tileRack.appendChild(slot);
  }
}

function renderHistory(history) {
  els.turnHistoryList.innerHTML = '';
  
  // Render chronological log entries (reverse order for scrolling top-to-bottom or just chronological order)
  history.forEach(h => {
    const div = document.createElement('div');
    if (h.system) {
      div.className = 'history-item system-log';
      div.textContent = h.text;
    } else {
      div.className = 'history-item';
      
      const header = document.createElement('div');
      header.style.fontWeight = 'bold';
      header.textContent = `${h.player} (+${h.score} Pkt):`;
      
      const wordsDiv = document.createElement('div');
      wordsDiv.className = 'history-words';
      
      h.words.forEach(word => {
        const wordBadge = document.createElement('span');
        wordBadge.className = 'history-word-clickable';
        if (h.challenged && h.score === 0) {
          wordBadge.classList.add('invalid-challenged');
        }
        wordBadge.textContent = word;
        
        // Click to view DWDS/Challenge word
        wordBadge.addEventListener('click', () => {
          triggerWordLookup(word);
        });
        
        wordsDiv.appendChild(wordBadge);
      });
      
      div.appendChild(header);
      div.appendChild(wordsDiv);
    }
    els.turnHistoryList.appendChild(div);
  });

  // Scroll to bottom of history list
  els.turnHistoryList.scrollTop = els.turnHistoryList.scrollHeight;
}

function updateTurnBanner() {
  if (isMyTurn) {
    els.turnBanner.className = 'turn-status-banner-mini my-turn';
    els.turnBanner.textContent = '🟢 DU bist an der Reihe! Wähle deine Steine.';
    els.btnSubmit.disabled = false;
    els.btnPass.disabled = false;
    els.btnSwap.disabled = false;
  } else {
    els.turnBanner.className = 'turn-status-banner-mini';
    const activePlayer = gamePlayers.find(p => p.isActive);
    els.turnBanner.textContent = activePlayer 
      ? `🔴 ${activePlayer.name} ist an der Reihe...` 
      : 'Warten...';
    els.btnSubmit.disabled = true;
    els.btnPass.disabled = true;
    els.btnSwap.disabled = true;
  }
}

// Recalculates points prediction during active turn placement
function updateWordPreview() {
  if (localPlacedTiles.length === 0) {
    els.wordValueOverlay.style.display = 'none';
    return;
  }

  const prediction = ScrabbleEngine.calculateScore(gameBoard, localPlacedTiles);
  
  if (prediction.valid) {
    els.wordValueOverlay.style.display = 'block';
    
    // Join main word and cross words
    const mainWord = prediction.words.map(w => w.word).join(', ');
    els.previewWordText.textContent = mainWord;
    els.previewScoreText.textContent = prediction.score;
  } else {
    // Show validation error status, don't hide completely to give direct gameplay feedback
    els.wordValueOverlay.style.display = 'block';
    els.previewWordText.textContent = `[Plazierung ungültig: ${prediction.error}]`;
    els.previewScoreText.textContent = '0';
  }
}

// -------------------------------------------------------------
// DRAG & DROP MULTI-TOUCH CONTROLLER
// -------------------------------------------------------------

function setupDragAndDrop() {
  // We use unified Pointer Events to support Mouse and mobile Touch smoothly
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
}

function onPointerDown(e) {
  // Only start dragging if it's our turn
  if (!isMyTurn) return;

  const tileEl = e.target.closest('.scrabble-tile');
  if (!tileEl) return;
  
  // Verify source
  const isRackSlot = tileEl.closest('#tile-rack') !== null;
  const isPendingBoardTile = tileEl.classList.contains('tile-pending');
  
  if (!isRackSlot && !isPendingBoardTile) return;
  
  e.preventDefault();
  
  let source = {};
  if (isRackSlot) {
    source = { type: 'rack', index: parseInt(tileEl.dataset.index) };
  } else {
    source = { type: 'board', r: parseInt(tileEl.dataset.r), c: parseInt(tileEl.dataset.c) };
  }
  
  activeDrag = {
    element: tileEl,
    letter: tileEl.dataset.letter,
    isBlank: tileEl.dataset.isBlank === 'true',
    source: source,
    offsetX: e.clientX - tileEl.getBoundingClientRect().left,
    offsetY: e.clientY - tileEl.getBoundingClientRect().top
  };
  
  // Create absolute proxy clone
  dragProxy = tileEl.cloneNode(true);
  dragProxy.classList.add('tile-dragging');
  dragProxy.classList.add('drag-proxy-active');
  
  // Maintain proportional dimensions
  const rect = tileEl.getBoundingClientRect();
  dragProxy.style.width = `${rect.width}px`;
  dragProxy.style.height = `${rect.height}px`;
  dragProxy.style.left = `${e.clientX - activeDrag.offsetX}px`;
  dragProxy.style.top = `${e.clientY - activeDrag.offsetY}px`;
  
  document.body.appendChild(dragProxy);
  tileEl.style.opacity = '0.1';
  
  playAudio('click');
}

function onPointerMove(e) {
  if (!activeDrag || !dragProxy) return;
  
  dragProxy.style.left = `${e.clientX - activeDrag.offsetX}px`;
  dragProxy.style.top = `${e.clientY - activeDrag.offsetY}px`;
  
  // Hover detection
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  
  dragProxy.style.pointerEvents = 'none'; // Avoid elementFromPoint hitting the proxy itself
  const hovered = document.elementFromPoint(e.clientX, e.clientY);
  
  if (hovered) {
    const cell = hovered.closest('.board-cell');
    const slot = hovered.closest('.rack-slot');
    
    if (cell && !cell.classList.contains('has-tile')) {
      cell.classList.add('drag-over');
    } else if (slot) {
      slot.classList.add('drag-over');
    }
  }
}

async function onPointerUp(e) {
  if (!activeDrag) return;
  
  dragProxy.style.pointerEvents = 'none';
  const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
  
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  
  let placedSuccess = false;
  
  if (dropTarget) {
    const cell = dropTarget.closest('.board-cell');
    const slot = dropTarget.closest('.rack-slot');
    
    if (cell && !cell.classList.contains('has-tile')) {
      const r = parseInt(cell.dataset.r);
      const c = parseInt(cell.dataset.c);
      
      placedSuccess = await moveTileToBoard(activeDrag, r, c);
    } else if (slot) {
      const targetIndex = parseInt(slot.dataset.index);
      placedSuccess = moveTileToRackSlot(activeDrag, targetIndex);
    } else if (dropTarget.closest('#tile-rack')) {
      // Append to the first empty slot or end of the rack
      placedSuccess = moveTileToRackSlot(activeDrag, localRack.length);
    }
  }
  
  if (!placedSuccess) {
    // Return tile back to original position
    playAudio('click');
  } else {
    playAudio('click');
  }
  
  if (dragProxy) {
    dragProxy.remove();
    dragProxy = null;
  }
  
  activeDrag.element.style.opacity = '1';
  activeDrag = null;
  
  renderBoard();
  renderRack();
  updateWordPreview();
}

// Move a tile from anywhere to a specific coordinate on the board
async function moveTileToBoard(drag, r, c) {
  // If blank tile, prompt for letters
  if (drag.letter === ' ' || drag.letter === '') {
    let response = prompt('Welchen Buchstaben soll der Blanko-Stein (Joker) darstellen? (A-Z)');
    if (!response) return false;
    response = response.trim().toUpperCase();
    if (response.length !== 1 || !ScrabbleEngine.TILE_VALUES.hasOwnProperty(response) || response === ' ') {
      await showCustomAlert('Ungültiger Buchstabe.', 'Fehler');
      return false;
    }
    drag.letter = response;
    drag.isBlank = true;
  }

  // Remove from source
  if (drag.source.type === 'rack') {
    localRack[drag.source.index] = undefined;
  } else if (drag.source.type === 'board') {
    localPlacedTiles = localPlacedTiles.filter(t => !(t.r === drag.source.r && t.c === drag.source.c));
  }

  // Add to board pending list
  localPlacedTiles.push({
    r,
    c,
    letter: drag.letter,
    isBlank: drag.isBlank
  });

  return true;
}

// Move a tile from anywhere to a specific index slot on the rack
function moveTileToRackSlot(drag, targetIndex) {
  // Revert back from board
  if (drag.source.type === 'board') {
    localPlacedTiles = localPlacedTiles.filter(t => !(t.r === drag.source.r && t.c === drag.source.c));
    // If it was a blank tile, reset its representation back to ' '
    const origLetter = drag.isBlank ? ' ' : drag.letter;
    
    // Find first empty rack position or target index
    insertIntoRack(origLetter, targetIndex);
  } else if (drag.source.type === 'rack') {
    // Rack to rack reordering!
    const fromIndex = drag.source.index;
    const item = localRack[fromIndex];
    
    // Remove from index
    localRack.splice(fromIndex, 1);
    
    // Shift insert
    const insertIdx = targetIndex >= 7 ? 6 : targetIndex;
    localRack.splice(insertIdx, 0, item);
    
    // Clean up rack array to exactly 7
    while (localRack.length < 7) {
      localRack.push(undefined);
    }
    localRack = localRack.slice(0, 7);
  }

  return true;
}

function insertIntoRack(letter, targetIndex) {
  const cleanIdx = targetIndex >= 7 ? 6 : targetIndex;
  if (localRack[cleanIdx] === undefined) {
    localRack[cleanIdx] = letter;
  } else {
    // Find first undefined slot
    const emptyIdx = localRack.indexOf(undefined);
    if (emptyIdx !== -1) {
      localRack[emptyIdx] = letter;
    } else {
      // Fallback overwrite (should not happen since rack has size <= 7)
      localRack.push(letter);
      localRack = localRack.filter(l => l !== undefined).slice(0, 7);
    }
  }
}

// Returns all pending tiles from the board to the player's rack
function recallAllTiles() {
  if (localPlacedTiles.length === 0) return;
  
  localPlacedTiles.forEach(tile => {
    const origLetter = tile.isBlank ? ' ' : tile.letter;
    // Find first empty position in rack
    const idx = localRack.indexOf(undefined);
    if (idx !== -1) {
      localRack[idx] = origLetter;
    } else {
      localRack.push(origLetter);
    }
  });

  localPlacedTiles = [];
  localRack = localRack.filter(l => l !== undefined);
  while (localRack.length < 7) {
    localRack.push(undefined);
  }

  playAudio('click');
  renderBoard();
  renderRack();
  updateWordPreview();
}

// -------------------------------------------------------------
// DICTIONARY LOOKUP & CHALLENGE TRIGGERS
// -------------------------------------------------------------

function triggerWordLookupAt(r, c) {
  // Find full word containing cell (r, c) on current board
  // We recreate the temp board representation
  const tempBoard = Array(15).fill(null).map((_, row) => {
    return Array(15).fill(null).map((_, col) => {
      const pending = localPlacedTiles.find(t => t.r === row && t.c === col);
      if (pending) return { letter: pending.letter, isBlank: pending.isBlank, isNew: true };
      if (gameBoard[row][col]) return { letter: gameBoard[row][col].letter, isBlank: gameBoard[row][col].isBlank, isNew: false };
      return null;
    });
  });

  // Check both directions
  const horWord = getFullWordStringAt(tempBoard, r, c, true);
  const verWord = getFullWordStringAt(tempBoard, r, c, false);

  // If word is found, open lookup modal for the longer one
  const targetWord = (horWord.length >= verWord.length) ? horWord : verWord;
  
  if (targetWord && targetWord.length >= 2) {
    triggerWordLookup(targetWord);
  }
}

function getFullWordStringAt(grid, r, c, isHorizontal) {
  if (grid[r][c] === null) return '';
  
  let start = isHorizontal ? c : r;
  let end = isHorizontal ? c : r;
  
  if (isHorizontal) {
    while (start > 0 && grid[r][start - 1] !== null) start--;
    while (end < 14 && grid[r][end + 1] !== null) end++;
    
    let wStr = '';
    for (let col = start; col <= end; col++) wStr += grid[r][col].letter;
    return wStr;
  } else {
    while (start > 0 && grid[start - 1][c] !== null) start--;
    while (end < 14 && grid[end + 1][c] !== null) end++;
    
    let wStr = '';
    for (let row = start; row <= end; row++) wStr += grid[row][c].letter;
    return wStr;
  }
}

function triggerWordLookup(word) {
  els.modalWordInfo.classList.add('active');
  els.wordTitleDisplay.textContent = word.toUpperCase();
  els.wordValidationBadge.textContent = 'Prüfung läuft...';
  els.wordValidationBadge.className = 'validation-status-badge';
  els.wordDefinitionDisplay.textContent = 'Wörterbuch wird abgefragt...';
  els.challengePanel.style.display = 'none';

  socket.emit('queryWordInfo', { word });
}

async function fetchWordDefinition(word) {
  try {
    const cleanWord = word.trim().toUpperCase();
    const titleCase = cleanWord.charAt(0) + cleanWord.slice(1).toLowerCase();
    
    const url = `https://de.wiktionary.org/w/api.php?action=query&format=json&origin=*&prop=extracts&exintro=&explaintext=&titles=${encodeURIComponent(titleCase)}`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (data && data.query && data.query.pages) {
      const pages = data.query.pages;
      for (const pageId in pages) {
        if (pageId !== '-1' && pages[pageId].extract) {
          const extractText = pages[pageId].extract.trim();
          if (extractText) {
            // Take first few paragraphs/lines
            return extractText.split('\n\n')[0].split('\n')[0];
          }
        }
      }
    }
    return `Keine Definition für "${titleCase}" im Online-Wörterbuch verfügbar. Verwende den Link unten, um direkt im DWDS zu suchen.`;
  } catch (err) {
    console.error('Wiktionary Parse Error:', err);
    return 'Fehler beim Laden der Definition. Bitte überprüfe deine Internetverbindung.';
  }
}

// -------------------------------------------------------------
// SWAP TILE MODAL
// -------------------------------------------------------------

function openSwapModal() {
  els.modalSwap.classList.add('active');
  els.swapSelectionGrid.innerHTML = '';
  
  // Selected letters list
  const selectedIndices = [];
  
  // Render rack tiles in selection grid
  localRack.forEach((letter, index) => {
    if (letter === undefined) return;
    
    const slot = document.createElement('div');
    slot.className = 'swap-tile-slot';
    slot.dataset.index = index;
    
    const tile = createTileElement(letter, letter === ' ', false);
    slot.appendChild(tile);
    
    slot.addEventListener('click', () => {
      slot.classList.toggle('selected');
      const idx = parseInt(slot.dataset.index);
      const isSelected = slot.classList.contains('selected');
      
      if (isSelected) {
        selectedIndices.push(idx);
      } else {
        const sIdx = selectedIndices.indexOf(idx);
        if (sIdx !== -1) selectedIndices.splice(sIdx, 1);
      }
    });
    
    els.swapSelectionGrid.appendChild(slot);
  });
  
  // Handle swap confirmation
  // We remove event listeners using clone replacement
  const newBtn = els.btnConfirmSwap.cloneNode(true);
  els.btnConfirmSwap.parentNode.replaceChild(newBtn, els.btnConfirmSwap);
  els.btnConfirmSwap = newBtn;
  
  els.btnConfirmSwap.addEventListener('click', async () => {
    if (selectedIndices.length === 0) {
      await showCustomAlert('Bitte wähle mindestens einen Stein zum Tauschen aus.');
      return;
    }
    
    // Map indices back to letters
    const lettersToSwap = selectedIndices.map(idx => localRack[idx]);
    
    // Emit swap events
    socket.emit('swapTiles', { letters: lettersToSwap });
    els.modalSwap.classList.remove('active');
  });
}

function sendChatMessage() {
  const text = els.chatInput.value.trim();
  if (!text) return;
  
  socket.emit('sendChatMessage', { message: text });
  els.chatInput.value = '';
}

function appendChatMessage(sender, message) {
  // Clear placeholder if it's there
  const placeholder = els.chatMessages.querySelector('.chat-line-placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  // Create message line
  const line = document.createElement('div');
  line.className = 'chat-line';
  
  const senderSpan = document.createElement('span');
  senderSpan.className = 'chat-sender';
  senderSpan.textContent = `${sender}:`;
  
  const msgSpan = document.createElement('span');
  msgSpan.textContent = message;
  
  line.appendChild(senderSpan);
  line.appendChild(msgSpan);
  els.chatMessages.appendChild(line);
  
  // Keep only the last 2 messages
  while (els.chatMessages.children.length > 2) {
    els.chatMessages.removeChild(els.chatMessages.firstChild);
  }
  
  // Play soft click sound as notification
  playAudio('click');
}

// -------------------------------------------------------------
// WAKE LOCK API (Keep screen awake during game)
// -------------------------------------------------------------

let wakeLock = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        console.log('Screen Wake Lock released:', wakeLock.released);
      });
      console.log('Screen Wake Lock acquired:', !wakeLock.released);
    }
  } catch (err) {
    console.error(`Wake Lock error: ${err.name}, ${err.message}`);
  }
}

// Re-acquire lock when tab becomes visible again
document.addEventListener('visibilitychange', async () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    await requestWakeLock();
  }
});

// Browsers require a user gesture to grant Wake Lock. 
// We request it on the very first click on the document.
document.addEventListener('click', () => {
  if (!wakeLock && 'wakeLock' in navigator) {
    requestWakeLock();
  }
}, { once: true });
