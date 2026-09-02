/**
 * Generiert einen zufälligen Großbuchstaben-Raumcode ohne verwirrende Zeichen (z. B. I, O)
 * @param {number} length - Länge des Codes (Standard: 4)
 * @returns {string} Raumcode
 */
function generateRoomCode(length = 4) {
  // Buchstaben-Charset (ohne Verwechslungsgefahr)
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

module.exports = { generateRoomCode };
