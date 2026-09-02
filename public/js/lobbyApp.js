/**
 * Lobby App UI Controller
 */
document.addEventListener('DOMContentLoaded', () => {
  const config = window.GAME_LOBBY_CONFIG || {
    storageKeyName: 'scrabble_player_name',
    minPlayers: 2,
    maxPlayers: 4
  };

  // UI Screens
  const loginScreen = document.getElementById('login-screen');
  const lobbyScreen = document.getElementById('lobby-screen');
  const gameScreen = document.getElementById('game-screen');

  // Input Elements
  const playerNameInput = document.getElementById('player-name-input');
  const roomCodeInput = document.getElementById('room-code-input');
  const loginError = document.getElementById('login-error');

  // Buttons
  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnJoinRoom = document.getElementById('btn-join-room');
  const btnToggleReady = document.getElementById('btn-toggle-ready');
  const btnStartGame = document.getElementById('btn-start-game');
  const btnLeaveLobby = document.getElementById('btn-leave-lobby');
  const btnCopyCode = document.getElementById('btn-copy-code');
  const btnShareWhatsapp = document.getElementById('btn-share-whatsapp');

  // Displays
  const displayRoomCode = document.getElementById('display-room-code');
  const playerCountDisplay = document.getElementById('player-count');
  const playersList = document.getElementById('players-list');

  // Saved Player Name aus localStorage laden
  const savedName = localStorage.getItem(config.storageKeyName);
  if (savedName && playerNameInput) {
    playerNameInput.value = savedName;
  }

  // URL-Parameter prüfen (z. B. ?room=K9X2 oder ?code=K9X2)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room') || urlParams.get('code');
  if (roomParam && roomCodeInput) {
    const code = roomParam.trim().toUpperCase();
    roomCodeInput.value = code;

    if (btnCreateRoom) btnCreateRoom.style.display = 'none';
    const divider = document.querySelector('.divider');
    if (divider) divider.style.display = 'none';

    roomCodeInput.readOnly = true;
    roomCodeInput.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
    roomCodeInput.style.cursor = 'not-allowed';

    if (btnJoinRoom) {
      btnJoinRoom.textContent = `Raum ${code} Beitreten 🚀`;
      btnJoinRoom.classList.add('btn-glow');
    }

    if (savedName) {
      setTimeout(() => {
        if (roomCodeInput.value.trim().length === 4 && playerNameInput.value.trim()) {
          btnJoinRoom.click();
        }
      }, 300);
    } else {
      setTimeout(() => playerNameInput.focus(), 300);
    }
  }

  // Eingabefeld Raumcode auf Buchstaben beschränken
  if (roomCodeInput) {
    roomCodeInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase();
    });
  }

  // Navigation Helper
  function showScreen(screenName) {
    if (loginScreen) loginScreen.classList.remove('active');
    if (lobbyScreen) lobbyScreen.classList.remove('active');
    if (gameScreen) gameScreen.classList.remove('active');

    if (screenName === 'login' && loginScreen) loginScreen.classList.add('active');
    if (screenName === 'lobby' && lobbyScreen) lobbyScreen.classList.add('active');
    if (screenName === 'game' && gameScreen) gameScreen.classList.add('active');
  }
  window.showScreen = showScreen;

  // Fehler-Anzeige Helper
  function showError(msg) {
    if (!loginError) return;
    loginError.textContent = msg;
    setTimeout(() => {
      if (loginError.textContent === msg) loginError.textContent = '';
    }, 4000);
  }

  // ================= EVENT LISTENERS =================

  // Raum Erstellen
  if (btnCreateRoom) {
    btnCreateRoom.addEventListener('click', () => {
      const name = playerNameInput.value.trim();
      if (!name) return showError('Bitte gib einen Spielernamen ein!');

      localStorage.setItem(config.storageKeyName, name);
      window.socketClient.createRoom(name, {}, (res) => {
        if (res && res.success) {
          showScreen('lobby');
        } else {
          showError((res && res.message) || 'Raum konnte nicht erstellt werden');
        }
      });
    });
  }

  // Raum Beitreten
  if (btnJoinRoom) {
    btnJoinRoom.addEventListener('click', () => {
      const name = playerNameInput.value.trim();
      const code = roomCodeInput.value.trim().toUpperCase();
      if (!name) return showError('Bitte gib einen Spielernamen ein!');
      if (!code || code.length !== 4) return showError('Gültigen 4-stelligen Raumcode eingeben!');

      localStorage.setItem(config.storageKeyName, name);
      window.socketClient.joinRoom(code, name, (res) => {
        if (res && res.success) {
          showScreen('lobby');
        } else {
          showError((res && res.message) || 'Beitritt fehlgeschlagen');
        }
      });
    });
  }

  // Enter-Taste Support
  if (playerNameInput) {
    playerNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (roomParam || (roomCodeInput && roomCodeInput.value.trim())) {
          btnJoinRoom.click();
        } else {
          btnCreateRoom.click();
        }
      }
    });
  }

  if (roomCodeInput) {
    roomCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnJoinRoom.click();
    });
  }

  // Toggle Ready
  if (btnToggleReady) {
    btnToggleReady.addEventListener('click', () => {
      window.socketClient.toggleReady();
    });
  }

  // Spiel Starten (nur Host)
  if (btnStartGame) {
    btnStartGame.addEventListener('click', () => {
      window.socketClient.startGame((res) => {
        if (res && !res.success) {
          alert(res.message);
        }
      });
    });
  }

  // Raum Verlassen
  if (btnLeaveLobby) {
    btnLeaveLobby.addEventListener('click', () => {
      window.socketClient.leaveRoom();
      location.reload();
    });
  }

  // Code Kopieren
  if (btnCopyCode) {
    btnCopyCode.addEventListener('click', () => {
      const code = displayRoomCode ? displayRoomCode.textContent : '';
      if (!code || code === '----') return;
      navigator.clipboard.writeText(code).then(() => {
        alert(`Raumcode ${code} in die Zwischenablage kopiert!`);
      });
    });
  }

  // WhatsApp Teilen
  if (btnShareWhatsapp) {
    btnShareWhatsapp.addEventListener('click', () => {
      const code = displayRoomCode ? displayRoomCode.textContent : '';
      if (!code || code === '----') return;
      const joinUrl = `${window.location.origin}${window.location.pathname}?room=${code}`;
      const shareText = `Tritt meiner Scrabble Pro Lobby bei:\n${joinUrl}`;
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
      window.open(whatsappUrl, '_blank');
    });
  }

  // ================= SOCKET EVENT HANDLER =================

  window.socketClient.onLobbyState((state) => {
    if (state.status === 'lobby') {
      showScreen('lobby');
      updateLobbyUI(state);
    } else if (state.status === 'playing') {
      showScreen('game');
    }
  });

  window.socketClient.onGameStarted((payload) => {
    showScreen('game');
    if (typeof config.onGameStart === 'function') {
      config.onGameStart(payload.state);
    }
  });

  // UI Aktualisieren
  function updateLobbyUI(state) {
    if (displayRoomCode) displayRoomCode.textContent = state.code;
    if (playerCountDisplay) playerCountDisplay.textContent = state.players.length;

    if (!playersList) return;
    playersList.innerHTML = '';
    const myId = window.socketClient.socketId;
    let isHost = false;

    state.players.forEach(p => {
      if (p.id === myId && p.isHost) isHost = true;

      const li = document.createElement('li');
      li.className = 'player-card';

      let statusBadge;
      if (p.isHost) {
        statusBadge = `<span class="badge badge-host">HOST</span>`;
      } else {
        statusBadge = p.isReady
          ? `<span class="badge badge-ready">BEREIT</span>`
          : `<span class="badge badge-waiting">WARTET</span>`;
      }

      li.innerHTML = `
        <div class="player-info">
          <div class="avatar-circle">${p.name.charAt(0).toUpperCase()}</div>
          <strong>${escapeHTML(p.name)}</strong>
        </div>
        <div>${statusBadge}</div>
      `;
      playersList.appendChild(li);
    });

    const me = state.players.find(p => p.id === myId);

    if (isHost) {
      if (btnStartGame) {
        btnStartGame.style.display = 'inline-flex';
        btnStartGame.disabled = !state.canStart;
        btnStartGame.style.opacity = state.canStart ? '1' : '0.6';
        btnStartGame.title = state.canStart ? 'Spiel starten' : (state.startReason || '');
      }
      if (btnToggleReady) btnToggleReady.style.display = 'none';
    } else {
      if (btnStartGame) btnStartGame.style.display = 'none';
      if (btnToggleReady) {
        btnToggleReady.style.display = 'inline-flex';
        if (me) {
          btnToggleReady.textContent = me.isReady ? 'Bereit ✓ (Ändern)' : 'Ready schalten';
          btnToggleReady.className = me.isReady ? 'btn btn-success' : 'btn btn-secondary';
        }
      }
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Initialer Screen (falls kein Raum in der URL oder im Spiel)
  showScreen('login');
});
