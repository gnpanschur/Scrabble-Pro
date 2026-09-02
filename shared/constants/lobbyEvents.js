/**
 * Zentrale Event-Konstanten für die Socket.IO Kommunikation
 * zwischen Lobby-Client und Lobby-Server.
 */
const LOBBY_EVENTS = {
  // Client -> Server Actions
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  TOGGLE_READY: 'toggle_ready',
  START_GAME: 'start_game',
  UPDATE_ROOM_SETTINGS: 'update_room_settings',

  // Server -> Client Updates
  LOBBY_STATE: 'lobby_state',
  GAME_STARTED: 'game_started',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  ERROR: 'lobby_error'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LOBBY_EVENTS;
} else if (typeof window !== 'undefined') {
  window.LOBBY_EVENTS = LOBBY_EVENTS;
}
