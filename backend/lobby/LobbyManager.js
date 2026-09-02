const LobbyRoom = require('./LobbyRoom');
const { generateRoomCode } = require('../utils/roomCodeGenerator');
const LOBBY_EVENTS = require('../../shared/constants/lobbyEvents');

class LobbyManager {
  /**
   * @param {import('socket.io').Server} io - Socket.IO Server Instanz
   * @param {Object} [globalConfig] - Globale Konfigurations-Overrides
   */
  constructor(io, globalConfig = {}) {
    this.io = io;
    this.globalConfig = globalConfig;
    this.rooms = new Map();
    this.socketToRoomMap = new Map(); // socket.id -> roomCode
    this.onGameStartHandler = null;
  }

  /**
   * Registriert ein Callback-Event, das ausgelöst wird, wenn ein Spiel im Raum gestartet wird.
   * @param {Function} handler - (room: LobbyRoom, hostSocketId: string) => void
   */
  onGameStart(handler) {
    this.onGameStartHandler = handler;
  }

  /**
   * Generiert einen eindeutigen Raumcode
   * @returns {string} Unique room code
   */
  generateUniqueCode() {
    let code = generateRoomCode(this.globalConfig.roomCodeLength || 4);
    let attempts = 0;
    while (this.rooms.has(code) && attempts < 1000) {
      code = generateRoomCode(this.globalConfig.roomCodeLength || 4);
      attempts++;
    }
    return code;
  }

  /**
   * Erstellt einen neuen Lobby-Raum
   * @param {string} socketId - Socket ID des Erstellers (Hosts)
   * @param {string} playerName - Name des Erstellers
   * @param {Object} [roomConfig] - Raumkonfiguration
   * @returns {{ success: boolean, roomCode?: string, state?: Object, message?: string }}
   */
  createRoom(socketId, playerName, roomConfig = {}) {
    const code = this.generateUniqueCode();
    const config = { ...this.globalConfig, ...roomConfig };
    const room = new LobbyRoom(code, config);

    const joinResult = room.addPlayer(socketId, playerName);
    if (!joinResult.success) {
      return { success: false, message: joinResult.message };
    }

    if (this.onGameStartHandler) {
      room.setGameStartHandler((r) => this.onGameStartHandler(r, socketId));
    }

    this.rooms.set(code, room);
    this.socketToRoomMap.set(socketId, code);

    console.log(`[LobbyManager] Room ${code} created by ${playerName} (${socketId})`);
    return {
      success: true,
      roomCode: code,
      state: room.getClientState()
    };
  }

  /**
   * Tritt einem bestehenden Raum bei
   * @param {string} socketId 
   * @param {string} roomCode 
   * @param {string} playerName 
   * @returns {{ success: boolean, roomCode?: string, state?: Object, message?: string }}
   */
  joinRoom(socketId, roomCode, playerName) {
    const code = (roomCode || '').toUpperCase().trim();
    const room = this.rooms.get(code);

    if (!room) {
      return { success: false, message: 'Raum nicht gefunden' };
    }

    // Abbrechen von evtl. getriggertem Deletion Timeout
    if (room.deletionTimeout) {
      clearTimeout(room.deletionTimeout);
      room.deletionTimeout = null;
    }

    const result = room.addPlayer(socketId, playerName);
    if (result.success) {
      this.socketToRoomMap.set(socketId, code);
      console.log(`[LobbyManager] Player ${playerName} (${socketId}) joined room ${code}`);
      return {
        success: true,
        roomCode: code,
        state: room.getClientState()
      };
    }

    return { success: false, message: result.message };
  }

  /**
   * Toggelt den Ready-Status eines Spielers
   * @param {string} socketId 
   * @returns {boolean} Success
   */
  toggleReady(socketId) {
    const roomCode = this.socketToRoomMap.get(socketId);
    if (!roomCode) return false;

    const room = this.rooms.get(roomCode);
    if (room) {
      room.toggleReady(socketId);
      this.broadcastRoomState(roomCode);
      return true;
    }
    return false;
  }

  /**
   * Startet das Spiel im Raum
   * @param {string} socketId 
   * @returns {{ success: boolean, message?: string }}
   */
  startGame(socketId) {
    const roomCode = this.socketToRoomMap.get(socketId);
    if (!roomCode) return { success: false, message: 'Nicht in einem Raum' };

    const room = this.rooms.get(roomCode);
    if (!room) return { success: false, message: 'Raum existiert nicht' };

    const result = room.startGame(socketId);
    if (result.success) {
      this.broadcastRoomState(roomCode);
      this.io.to(roomCode).emit(LOBBY_EVENTS.GAME_STARTED, {
        roomCode,
        state: room.getClientState()
      });
    }

    return result;
  }

  /**
   * Behandelt das Verlassen oder Verbindungsabbruch eines Spielers
   * @param {string} socketId 
   */
  handleDisconnect(socketId) {
    const roomCode = this.socketToRoomMap.get(socketId);
    if (!roomCode) return;

    this.socketToRoomMap.delete(socketId);
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const isEmpty = room.removePlayer(socketId);
    console.log(`[LobbyManager] Player (${socketId}) left room ${roomCode}. Remaining: ${room.players.length}`);

    if (isEmpty) {
      console.log(`[LobbyManager] Room ${roomCode} is empty. Scheduling deletion in ${room.config.emptyRoomTimeoutMs}ms`);
      if (room.deletionTimeout) clearTimeout(room.deletionTimeout);
      room.deletionTimeout = setTimeout(() => {
        if (room.players.length === 0) {
          console.log(`[LobbyManager] Room ${roomCode} deleted after timeout.`);
          this.rooms.delete(roomCode);
        }
      }, room.config.emptyRoomTimeoutMs);
    } else {
      this.broadcastRoomState(roomCode);
    }
  }

  /**
   * Sendet den aktuellen Raumstatus an alle Socket-Clients im Raum
   * @param {string} roomCode 
   */
  broadcastRoomState(roomCode) {
    const room = this.rooms.get(roomCode);
    if (room) {
      this.io.to(roomCode).emit(LOBBY_EVENTS.LOBBY_STATE, room.getClientState());
    }
  }

  /**
   * Registriert alle Standard Socket.IO Event Listener für die Lobby
   * @param {import('socket.io').Socket} socket 
   */
  attachSocketListeners(socket) {
    socket.on(LOBBY_EVENTS.CREATE_ROOM, ({ playerName, roomConfig }, callback) => {
      const res = this.createRoom(socket.id, playerName, roomConfig);
      if (res.success) {
        socket.join(res.roomCode);
        this.broadcastRoomState(res.roomCode);
      }
      if (typeof callback === 'function') callback(res);
    });

    socket.on(LOBBY_EVENTS.JOIN_ROOM, ({ roomCode, playerName }, callback) => {
      const res = this.joinRoom(socket.id, roomCode, playerName);
      if (res.success) {
        socket.join(res.roomCode);
        this.broadcastRoomState(res.roomCode);
      }
      if (typeof callback === 'function') callback(res);
    });

    socket.on(LOBBY_EVENTS.TOGGLE_READY, () => {
      this.toggleReady(socket.id);
    });

    socket.on(LOBBY_EVENTS.START_GAME, (callback) => {
      const res = this.startGame(socket.id);
      if (typeof callback === 'function') callback(res);
    });

    socket.on(LOBBY_EVENTS.LEAVE_ROOM, () => {
      const roomCode = this.socketToRoomMap.get(socket.id);
      if (roomCode) {
        socket.leave(roomCode);
        this.handleDisconnect(socket.id);
      }
    });

    socket.on('disconnect', () => {
      this.handleDisconnect(socket.id);
    });
  }
}

module.exports = LobbyManager;
