/**
 * Clientseitige Konfiguration für Scrabble Pro
 */
const GAME_LOBBY_CONFIG = {
  // Name & Branding des Spiels
  gameTitle: 'SCRABBLE PRO',
  logoLetters: [
    { text: 'S', color: 'red' },
    { text: 'C', color: 'yellow' },
    { text: 'R', color: 'green' },
    { text: 'A', color: 'blue' },
    { text: 'B', color: 'red' },
    { text: 'B', color: 'yellow' },
    { text: 'L', color: 'green' },
    { text: 'E', color: 'blue' }
  ],
  subtitle: 'Das deutsche Wortduell',

  // Lobby-Parameter
  minPlayers: 2,
  maxPlayers: 4,
  
  // Storage Key für den Spielernamen
  storageKeyName: 'scrabble_player_name',

  // Feature Flags
  enableWhatsAppShare: true,
  enableCopyCode: true,
  enableReadySystem: true,

  // Ziel-URL oder Screen nach Spielstart
  onGameStart: function(roomState) {
    console.log('[LobbyConfig] Game started event received! Room:', roomState);
    if (typeof window.startScrabbleGameUI === 'function') {
      window.startScrabbleGameUI(roomState);
    }
  }
};

if (typeof window !== 'undefined') {
  window.GAME_LOBBY_CONFIG = GAME_LOBBY_CONFIG;
}
