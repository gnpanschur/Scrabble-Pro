const DEFAULT_LOBBY_CONFIG = require('./lobbyConfig');

class LobbyRoom {
  /**
   * @param {string} code - 4-stelliger Raumcode
   * @param {Object} [customConfig] - Optionale Raumkonfiguration
   */
  constructor(code, customConfig = {}) {
    this.code = code;
    this.config = { ...DEFAULT_LOBBY_CONFIG, ...customConfig };
    this.players = [];
    this.status = 'lobby'; // 'lobby' | 'playing' | 'ended'
    this.createdAt = Date.now();
    this.deletionTimeout = null;
    this.onGameStartCallback = null;
    this.customData = {}; // Beliebige zusätzliche Spieldaten (z. B. Scrabble-Zustand)
  }

  /**
   * Registriert den Handler, der aufgerufen wird, wenn das Spiel gestartet wird
   * @param {Function} callback
   */
  setGameStartHandler(callback) {
    this.onGameStartCallback = callback;
  }

  /**
   * Fügt einen Spieler zur Lobby hinzu
   * @param {string} socketId - Socket ID des Spielers
   * @param {string} playerName - Name des Spielers
   * @returns {{ success: boolean, message?: string }}
   */
  addPlayer(socketId, playerName) {
    const cleanName = (playerName || 'Spieler').trim().substring(0, this.config.maxPlayerNameLength);
    if (!cleanName) {
      return { success: false, message: 'Ungültiger Spielername' };
    }

    // Prüfen, ob Spieler bereits im Raum ist
    const existingPlayer = this.players.find(p => p.id === socketId);
    if (existingPlayer) {
      existingPlayer.name = cleanName;
      return { success: true };
    }

    // Raum voll?
    if (this.players.length >= this.config.maxPlayers) {
      return { success: false, message: `Raum ist voll (max. ${this.config.maxPlayers} Spieler)` };
    }

    // Spiel läuft bereits?
    if (this.status !== 'lobby') {
      return { success: false, message: 'Spiel wurde bereits gestartet' };
    }

    const isHost = this.players.length === 0;
    const newPlayer = {
      id: socketId,
      name: cleanName,
      isHost: isHost,
      isReady: true, // Alle Spieler stehen automatisch auf BEREIT
      joinedAt: Date.now()
    };

    this.players.push(newPlayer);
    return { success: true };
  }

  /**
   * Entfernt einen Spieler aus dem Raum
   * @param {string} socketId 
   * @returns {boolean} Ob der Raum nun leer ist
   */
  removePlayer(socketId) {
    const index = this.players.findIndex(p => p.id === socketId);
    if (index === -1) return this.players.length === 0;

    const removedPlayer = this.players.splice(index, 1)[0];

    // Falls der Host gegangen ist, nächsten Spieler zum Host befördern
    if (removedPlayer && removedPlayer.isHost && this.players.length > 0) {
      this.players[0].isHost = true;
      this.players[0].isReady = true;
    }

    return this.players.length === 0;
  }

  /**
   * Toggelt den Ready-Status eines Spielers
   * @param {string} socketId 
   * @returns {boolean} Neuer Ready-Status
   */
  toggleReady(socketId) {
    const player = this.players.find(p => p.id === socketId);
    if (player && !player.isHost) {
      player.isReady = !player.isReady;
      return player.isReady;
    }
    return false;
  }

  /**
   * Prüft, ob das Spiel gestartet werden kann
   * @returns {{ canStart: boolean, reason?: string }}
   */
  canStartGame() {
    if (this.players.length < this.config.minPlayers) {
      return {
        canStart: false,
        reason: `Mindestens ${this.config.minPlayers} Spieler erforderlich (aktuell: ${this.players.length})`
      };
    }

    if (this.config.requireReady) {
      const allReady = this.players.every(p => p.isReady || p.isHost);
      if (!allReady) {
        return {
          canStart: false,
          reason: 'Nicht alle Spieler sind bereit'
        };
      }
    }

    return { canStart: true };
  }

  /**
   * Startet das Spiel im Raum (nur durch Host erlaubt)
   * @param {string} socketId - Socket ID des Anforderers
   * @returns {{ success: boolean, message?: string }}
   */
  startGame(socketId) {
    const player = this.players.find(p => p.id === socketId);
    if (!player || !player.isHost) {
      return { success: false, message: 'Nur der Host kann das Spiel starten' };
    }

    const check = this.canStartGame();
    if (!check.canStart) {
      return { success: false, message: check.reason };
    }

    this.status = 'playing';

    if (typeof this.onGameStartCallback === 'function') {
      this.onGameStartCallback(this);
    }

    return { success: true };
  }

  /**
   * Setzt den Status des Raums zurück zur Lobby
   */
  resetToLobby() {
    this.status = 'lobby';
    this.players.forEach(p => {
      p.isReady = true;
    });
  }

  /**
   * Gibt den bereinigten Client-Zustand des Raums zurück
   * @returns {Object} Client Lobby State
   */
  getClientState() {
    const hostPlayer = this.players.find(p => p.isHost);
    const startCheck = this.canStartGame();

    return {
      code: this.code,
      status: this.status,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isReady: p.isReady
      })),
      hostId: hostPlayer ? hostPlayer.id : null,
      minPlayers: this.config.minPlayers,
      maxPlayers: this.config.maxPlayers,
      canStart: startCheck.canStart,
      startReason: startCheck.reason || null,
      config: {
        gameId: this.config.gameId,
        gameTitle: this.config.gameTitle,
        minPlayers: this.config.minPlayers,
        maxPlayers: this.config.maxPlayers
      }
    };
  }
}

module.exports = LobbyRoom;
