const BOARD_SIZE = 15;

const TILE_VALUES = {
  'A': 1, 'B': 3, 'C': 4, 'D': 1, 'E': 1, 'F': 4, 'G': 2, 'H': 4, 'I': 1, 'J': 6,
  'K': 4, 'L': 2, 'M': 3, 'N': 1, 'O': 2, 'P': 4, 'Q': 10, 'R': 1, 'S': 1, 'T': 1,
  'U': 2, 'V': 4, 'W': 3, 'X': 8, 'Y': 10, 'Z': 3,
  'Ä': 6, 'Ö': 8, 'Ü': 6, ' ': 0
};

const TILE_BAG_DISTRIBUTION = {
  'E': 15, 'N': 9, 'S': 7, 'I': 6, 'R': 6, 'T': 6, 'U': 6, 'A': 5, 'D': 4, 'H': 4, 'M': 4,
  'G': 3, 'L': 3, 'O': 3, 'B': 2, 'C': 2, 'F': 2, 'K': 2, ' ': 2,
  'W': 1, 'P': 1, 'V': 1, 'J': 1, 'Q': 1, 'X': 1, 'Y': 1, 'Z': 1, 'Ä': 1, 'Ö': 1, 'Ü': 1
};

/**
 * Returns the multiplier type for a given cell (row, col)
 */
function getMultiplierType(r, c) {
  // Triple Word Score (TW)
  if ((r === 0 || r === 7 || r === 14) && (c === 0 || c === 7 || c === 14)) {
    if (r === 7 && c === 7) return 'DW'; // Center is DW star
    return 'TW';
  }
  
  // Double Word Score (DW)
  if ((r === c || r === 14 - c) && ((r >= 1 && r <= 4) || (r >= 10 && r <= 13))) {
    return 'DW';
  }
  
  // Triple Letter Score (TL)
  if (
    ((r === 1 || r === 13) && (c === 5 || c === 9)) ||
    ((r === 5 || r === 9) && (c === 1 || c === 5 || c === 9 || c === 13))
  ) {
    return 'TL';
  }
  
  // Double Letter Score (DL)
  if (
    ((r === 0 || r === 14) && (c === 3 || c === 11)) ||
    ((r === 2 || r === 12) && (c === 6 || c === 8)) ||
    ((r === 3 || r === 11) && (c === 0 || c === 7 || c === 14)) ||
    ((r === 6 || r === 8) && (c === 2 || c === 6 || c === 8 || c === 12)) ||
    ((r === 7) && (c === 3 || c === 11))
  ) {
    return 'DL';
  }
  
  return 'normal';
}

/**
 * Checks if a given coordinate has an adjacent tile on the board
 */
function hasAdjacentTile(board, r, c) {
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
      if (board[nr][nc] !== null) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Validates the tile placement on the board
 * @param {Array} board - 15x15 board state
 * @param {Array} newTiles - Array of {r, c, letter, isBlank}
 */
function validatePlacement(board, newTiles) {
  if (!newTiles || newTiles.length === 0) {
    return { valid: false, error: 'Keine Steine platziert.' };
  }

  // Check if board is completely empty (first move)
  let isFirstMove = true;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== null) {
        isFirstMove = false;
        break;
      }
    }
    if (!isFirstMove) break;
  }

  // Check if tiles are within bounds and placed on empty cells
  for (const tile of newTiles) {
    if (tile.r < 0 || tile.r >= BOARD_SIZE || tile.c < 0 || tile.c >= BOARD_SIZE) {
      return { valid: false, error: 'Steine außerhalb des Spielfelds.' };
    }
    if (board[tile.r][tile.c] !== null) {
      return { valid: false, error: 'Feld bereits belegt.' };
    }
  }

  // First move must cover center (7,7)
  if (isFirstMove) {
    const coversCenter = newTiles.some(t => t.r === 7 && t.c === 7);
    if (!coversCenter) {
      return { valid: false, error: 'Der erste Zug muss das Startfeld (Mitte 7,7) abdecken.' };
    }
    if (newTiles.length < 2) {
      return { valid: false, error: 'Das erste Wort muss mindestens zwei Buchstaben lang sein.' };
    }
  }

  // If only 1 tile is placed
  if (newTiles.length === 1) {
    const tile = newTiles[0];
    const hasAdj = hasAdjacentTile(board, tile.r, tile.c);
    if (!hasAdj) {
      return { valid: false, error: 'Stein muss an ein bestehendes Wort grenzen.' };
    }
    return { valid: true };
  }

  // Check if all tiles are in the same row or column
  const firstTile = newTiles[0];
  const isHorizontal = newTiles.every(t => t.r === firstTile.r);
  const isVertical = newTiles.every(t => t.c === firstTile.c);

  if (!isHorizontal && !isVertical) {
    return { valid: false, error: 'Steine müssen in einer Reihe oder einer Spalte platziert werden.' };
  }

  // Sort tiles to verify contiguity
  const sortedTiles = [...newTiles];
  if (isHorizontal) {
    sortedTiles.sort((a, b) => a.c - b.c);
  } else {
    sortedTiles.sort((a, b) => a.r - b.r);
  }

  // Check contiguity (no empty gaps)
  const row = sortedTiles[0].r;
  const col = sortedTiles[0].c;
  if (isHorizontal) {
    const startC = sortedTiles[0].c;
    const endC = sortedTiles[sortedTiles.length - 1].c;
    for (let c = startC; c <= endC; c++) {
      const isNew = newTiles.some(t => t.r === row && t.c === c);
      const isOld = board[row][c] !== null;
      if (!isNew && !isOld) {
        return { valid: false, error: 'Das Wort darf keine Lücken enthalten.' };
      }
    }
  } else {
    const startR = sortedTiles[0].r;
    const endR = sortedTiles[sortedTiles.length - 1].r;
    for (let r = startR; r <= endR; r++) {
      const isNew = newTiles.some(t => t.r === r && t.c === col);
      const isOld = board[r][col] !== null;
      if (!isNew && !isOld) {
        return { valid: false, error: 'Das Wort darf keine Lücken enthalten.' };
      }
    }
  }

  // If not the first move, check connectivity (must touch/overlap existing tiles)
  if (!isFirstMove) {
    let connected = false;
    for (const tile of newTiles) {
      if (hasAdjacentTile(board, tile.r, tile.c)) {
        connected = true;
        break;
      }
    }
    // Check if there are existing tiles in between (overlap)
    if (isHorizontal) {
      for (let c = sortedTiles[0].c; c <= sortedTiles[sortedTiles.length - 1].c; c++) {
        if (board[row][c] !== null) {
          connected = true;
          break;
        }
      }
    } else {
      for (let r = sortedTiles[0].r; r <= sortedTiles[sortedTiles.length - 1].r; r++) {
        if (board[r][col] !== null) {
          connected = true;
          break;
        }
      }
    }

    if (!connected) {
      return { valid: false, error: 'Gelegte Steine müssen mit dem bestehenden Spielfeld verbunden sein.' };
    }
  }

  return { valid: true };
}

/**
 * Helper to extract word details in a direction starting at a coordinate
 */
function getWordAt(grid, r, c, isHorizontal) {
  if (grid[r][c] === null) return null;
  
  const cells = [];
  if (isHorizontal) {
    let startC = c;
    while (startC > 0 && grid[r][startC - 1] !== null) {
      startC--;
    }
    let endC = c;
    while (endC < BOARD_SIZE - 1 && grid[r][endC + 1] !== null) {
      endC++;
    }
    for (let col = startC; col <= endC; col++) {
      cells.push({ r, c: col, ...grid[r][col] });
    }
  } else {
    let startR = r;
    while (startR > 0 && grid[startR - 1][c] !== null) {
      startR--;
    }
    let endR = r;
    while (endR < BOARD_SIZE - 1 && grid[endR + 1][c] !== null) {
      endR++;
    }
    for (let row = startR; row <= endR; row++) {
      cells.push({ r: row, c, ...grid[row][c] });
    }
  }
  
  if (cells.length < 2) return null; // A word must be at least 2 letters
  
  let wordString = '';
  let score = 0;
  let wordMultiplier = 1;
  
  for (const cell of cells) {
    wordString += cell.letter;
    let baseVal = TILE_VALUES[cell.letter] || 0;
    if (cell.isBlank) {
      baseVal = 0;
    }
    
    if (cell.isNew) {
      const mult = getMultiplierType(cell.r, cell.c);
      if (mult === 'DL') {
        baseVal *= 2;
      } else if (mult === 'TL') {
        baseVal *= 3;
      } else if (mult === 'DW') {
        wordMultiplier *= 2;
      } else if (mult === 'TW') {
        wordMultiplier *= 3;
      }
    }
    score += baseVal;
  }
  score *= wordMultiplier;
  
  return {
    word: wordString,
    score: score,
    cells: cells.map(cell => ({ r: cell.r, c: cell.c, letter: cell.letter, isBlank: cell.isBlank }))
  };
}

/**
 * Calculates the score of a new placement
 * @param {Array} board - 15x15 board state
 * @param {Array} newTiles - Array of {r, c, letter, isBlank}
 */
function calculateScore(board, newTiles) {
  const validation = validatePlacement(board, newTiles);
  if (!validation.valid) {
    return { valid: false, error: validation.error };
  }

  // Create temporary grid incorporating new tiles
  const tempBoard = Array(BOARD_SIZE).fill(null).map((_, r) => {
    return Array(BOARD_SIZE).fill(null).map((_, c) => {
      const newTile = newTiles.find(t => t.r === r && t.c === c);
      if (newTile) {
        return { letter: newTile.letter.toUpperCase(), isBlank: !!newTile.isBlank, isNew: true };
      }
      if (board[r][c]) {
        return { letter: board[r][c].letter.toUpperCase(), isBlank: !!board[r][c].isBlank, isNew: false };
      }
      return null;
    });
  });

  const firstTile = newTiles[0];
  
  // Determine primary placement direction
  let isHorizontal = true;
  if (newTiles.length > 1) {
    isHorizontal = newTiles.every(t => t.r === firstTile.r);
  }

  const wordsFormed = [];
  let totalScore = 0;

  // 1. Calculate main word score
  const mainWordObj = isHorizontal ? 
    getWordAt(tempBoard, firstTile.r, firstTile.c, true) : 
    getWordAt(tempBoard, firstTile.r, firstTile.c, false);

  if (mainWordObj) {
    wordsFormed.push(mainWordObj);
    totalScore += mainWordObj.score;
  }

  // 2. Calculate cross words score
  for (const tile of newTiles) {
    const crossWordObj = isHorizontal ? 
      getWordAt(tempBoard, tile.r, tile.c, false) : 
      getWordAt(tempBoard, tile.r, tile.c, true);

    if (crossWordObj) {
      wordsFormed.push(crossWordObj);
      totalScore += crossWordObj.score;
    }
  }

  // 3. Apply Bingo bonus (50 pts for using all 7 tiles)
  const isBingo = newTiles.length === 7;
  if (isBingo) {
    totalScore += 50;
  }

  return {
    valid: true,
    score: totalScore,
    words: wordsFormed,
    isBingo: isBingo
  };
}

const ScrabbleEngine = {
  BOARD_SIZE,
  TILE_VALUES,
  TILE_BAG_DISTRIBUTION,
  getMultiplierType,
  validatePlacement,
  calculateScore
};

// Export for Node and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ScrabbleEngine;
} else {
  window.ScrabbleEngine = ScrabbleEngine;
}
