/**
 * SocketClient - Network Interface Wrapper für Socket.IO
 */
class SocketClient {
  constructor() {
    const socketUrl = window.location.origin;
    this.currentRoomCode = null;
    this.currentPlayerName = null;

    // Direct io() connection (reuses window.io if already existing or creates new instance)
    if (typeof window.socket !== 'undefined' && window.socket) {
      this.socket = window.socket;
    } else {
      this.socket = io(socketUrl, {
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
      });
      window.socket = this.socket;
    }

    this.onLobbyStateCallback = null;
    this.onGameStartedCallback = null;

    this.initListeners();
  }

  initListeners() {
    this.socket.on('connect', () => {
      console.log('[Socket] Connected to server:', this.socket.id);
      if (this.currentRoomCode && this.currentPlayerName) {
        console.log(`[Socket] Auto-rejoining room ${this.currentRoomCode} as ${this.currentPlayerName}`);
        this.joinRoom(this.currentRoomCode, this.currentPlayerName, () => {});
      }
    });

    const events = window.LOBBY_EVENTS || {
      LOBBY_STATE: 'lobby_state',
      GAME_STARTED: 'game_started'
    };

    this.socket.on(events.LOBBY_STATE, (state) => {
      if (typeof this.onLobbyStateCallback === 'function') {
        this.onLobbyStateCallback(state);
      }
    });

    this.socket.on(events.GAME_STARTED, (payload) => {
      if (typeof this.onGameStartedCallback === 'function') {
        this.onGameStartedCallback(payload);
      }
    });

    this.socket.on('disconnect', () => {
      console.warn('[Socket] Disconnected from server');
    });

    // Auto-Sync, wenn Browser-Tab wieder aktiv wird
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.currentRoomCode && this.currentPlayerName) {
        console.log('[Socket] Tab active - refreshing room state...');
        if (!this.socket.connected) {
          this.socket.connect();
        } else {
          this.joinRoom(this.currentRoomCode, this.currentPlayerName, () => {});
        }
      }
    });
  }

  onLobbyState(callback) {
    this.onLobbyStateCallback = callback;
  }

  onGameStarted(callback) {
    this.onGameStartedCallback = callback;
  }

  createRoom(playerName, roomConfig, callback) {
    this.currentPlayerName = playerName;
    const events = window.LOBBY_EVENTS || { CREATE_ROOM: 'create_room' };
    
    this.socket.emit(events.CREATE_ROOM, { playerName, roomConfig }, (res) => {
      if (res && res.success) {
        this.currentRoomCode = res.roomCode;
      }
      if (typeof callback === 'function') callback(res);
    });
  }

  joinRoom(roomCode, playerName, callback) {
    this.currentRoomCode = roomCode;
    this.currentPlayerName = playerName;
    const events = window.LOBBY_EVENTS || { JOIN_ROOM: 'join_room' };

    this.socket.emit(events.JOIN_ROOM, { roomCode, playerName }, (res) => {
      if (typeof callback === 'function') callback(res);
    });
  }

  toggleReady() {
    const events = window.LOBBY_EVENTS || { TOGGLE_READY: 'toggle_ready' };
    this.socket.emit(events.TOGGLE_READY);
  }

  startGame(callback) {
    const events = window.LOBBY_EVENTS || { START_GAME: 'start_game' };
    this.socket.emit(events.START_GAME, callback);
  }

  leaveRoom() {
    const events = window.LOBBY_EVENTS || { LEAVE_ROOM: 'leave_room' };
    this.socket.emit(events.LEAVE_ROOM);
    this.currentRoomCode = null;
  }

  get socketId() {
    return this.socket ? this.socket.id : null;
  }
}

window.socketClient = new SocketClient();
