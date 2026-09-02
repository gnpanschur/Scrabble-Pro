/**
 * Standard-Konfiguration für den Lobby-Server.
 * Kann bei Bedarf von einzelnen Spielen beim Initialisieren überschrieben werden.
 */
const DEFAULT_LOBBY_CONFIG = {
  gameId: 'scrabble_pro',
  gameTitle: 'Scrabble Pro',
  roomCodeLength: 4,
  minPlayers: 2,
  maxPlayers: 4,
  requireReady: true,
  emptyRoomTimeoutMs: 60000, // 60 Sekunden bis ein leerer Raum gelöscht wird
  maxPlayerNameLength: 15
};

module.exports = DEFAULT_LOBBY_CONFIG;
