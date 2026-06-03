const ScrabbleEngine = require('../public/scrabble-engine.js');

function createEmptyBoard() {
  return Array(15).fill(null).map(() => Array(15).fill(null));
}

function runTests() {
  console.log('--- STARTING SCRABBLE SCORING TESTS ---');

  // Test Case 1: First word covering center, normal letters
  // Word: "WORT" at Row 7, Cols 7-10
  // W(3) [at 7,7 - DW], O(2) [7,8], R(1) [7,9], T(1) [7,10]
  // Expected base score: 3+2+1+1 = 7. Word multiplier: 2. Total: 14.
  {
    console.log('\nTest Case 1: Erstes Wort "WORT" (DW in der Mitte)');
    const board = createEmptyBoard();
    const newTiles = [
      { r: 7, c: 7, letter: 'W' },
      { r: 7, c: 8, letter: 'O' },
      { r: 7, c: 9, letter: 'R' },
      { r: 7, c: 10, letter: 'T' }
    ];
    const result = ScrabbleEngine.calculateScore(board, newTiles);
    console.log('Result:', result);
    if (result.valid && result.score === 14 && result.words[0].word === 'WORT') {
      console.log('✅ TEST PASSED');
    } else {
      console.log('❌ TEST FAILED');
    }
  }

  // Test Case 2: Placing a word that doesn't cover center on first move
  {
    console.log('\nTest Case 2: Erstes Wort nicht in der Mitte (Sollte fehlschlagen)');
    const board = createEmptyBoard();
    const newTiles = [
      { r: 0, c: 0, letter: 'W' },
      { r: 0, c: 1, letter: 'O' }
    ];
    const result = ScrabbleEngine.calculateScore(board, newTiles);
    console.log('Result:', result);
    if (!result.valid && result.error.includes('Mitte')) {
      console.log('✅ TEST PASSED (Correctly rejected)');
    } else {
      console.log('❌ TEST FAILED');
    }
  }

  // Test Case 3: Placing a second word that connects to the first
  // Existing board: "WORT" at Row 7, Cols 7-10.
  // Play: "HUND" vertically, using existing 'W' at (7,7)
  // Placement: H at (6,7), U at (8,7), N at (9,7), D at (10,7)
  // Expected word: H(4) + W(3, old) + U(2) + N(1) + D(1) = 11.
  {
    console.log('\nTest Case 3: Zweites Wort "HWUND" vertikal (anknüpfend an WORT)');
    const board = createEmptyBoard();
    board[7][7] = { letter: 'W', isBlank: false };
    board[7][8] = { letter: 'O', isBlank: false };
    board[7][9] = { letter: 'R', isBlank: false };
    board[7][10] = { letter: 'T', isBlank: false };

    const newTiles = [
      { r: 6, c: 7, letter: 'H' },
      { r: 8, c: 7, letter: 'U' },
      { r: 9, c: 7, letter: 'N' },
      { r: 10, c: 7, letter: 'D' }
    ];

    const result = ScrabbleEngine.calculateScore(board, newTiles);
    console.log('Result:', result);
    if (result.valid && result.score === 11 && result.words[0].word === 'HWUND') {
      console.log('✅ TEST PASSED');
    } else {
      console.log('❌ TEST FAILED');
    }
  }

  // Test Case 4: Word with Letter multiplier
  // First play: "SPIEL" horizontally from (7,3) to (7,7)
  // S(1) at (7,3) [DL], P(4) at (7,4), I(1) at (7,5), E(1) at (7,6), L(2) at (7,7) [DW]
  // Expected: S = 1*2 = 2. Others = 4, 1, 1, 2. Base = 2+4+1+1+2 = 10. Multiplier = 2. Total = 20.
  {
    console.log('\nTest Case 4: Wort mit DL und DW "SPIEL"');
    const board = createEmptyBoard();
    const newTiles = [
      { r: 7, c: 3, letter: 'S' },
      { r: 7, c: 4, letter: 'P' },
      { r: 7, c: 5, letter: 'I' },
      { r: 7, c: 6, letter: 'E' },
      { r: 7, c: 7, letter: 'L' }
    ];
    const result = ScrabbleEngine.calculateScore(board, newTiles);
    console.log('Result:', result);
    if (result.valid && result.score === 20) {
      console.log('✅ TEST PASSED');
    } else {
      console.log('❌ TEST FAILED');
    }
  }

  // Test Case 5: Cross words scoring
  // Existing board: "WORT" at Row 7, Cols 7-10.
  // Play: A at (6,8) [DL? (6,8) is DL], T at (8,8)
  // This forms vertical word: A(1) + O(2, old) + T(1) = 4.
  // But A is at (6,8) which is DL, so A = 1*2 = 2. Base = 2+2+1 = 5.
  // There are no other cross words.
  // Wait, let's verify if A and T form a contiguous column: (6,8), (7,8) is O, (8,8) is T. Contiguous!
  // Expected main word: "AOT" with score 5.
  {
    console.log('\nTest Case 5: Kreuzungswort-Punkte');
    const board = createEmptyBoard();
    board[7][7] = { letter: 'W', isBlank: false };
    board[7][8] = { letter: 'O', isBlank: false };
    board[7][9] = { letter: 'R', isBlank: false };
    board[7][10] = { letter: 'T', isBlank: false };

    const newTiles = [
      { r: 6, c: 8, letter: 'A' },
      { r: 8, c: 8, letter: 'T' }
    ];

    const result = ScrabbleEngine.calculateScore(board, newTiles);
    console.log('Result:', result);
    if (result.valid && result.score === 6 && result.words[0].word === 'AOT') {
      console.log('✅ TEST PASSED');
    } else {
      console.log('❌ TEST FAILED');
    }
  }

  // Test Case 6: Bingo Bonus
  // Placed 7 tiles in first move: "HAUSTÜR" (H-A-U-S-T-U-R) at Row 7, Cols 4-10
  // H(4) at (7,4), A(1) at (7,5), U(2) at (7,6), S(1) at (7,7)[DW], T(1) at (7,8), Ü(6) at (7,9), R(1) at (7,10)
  // Base score: 4+1+2+1+1+6+1 = 16.
  // DW at (7,7) makes it 16 * 2 = 32.
  // Bingo adds 50 points. Total: 82.
  // Let's test using U instead of Ü for simplicity if we didn't type Umlaut, but we support Umlaut, so Ü is fine.
  {
    console.log('\nTest Case 6: Bingo Bonus (7 Steine)');
    const board = createEmptyBoard();
    const newTiles = [
      { r: 7, c: 4, letter: 'H' },
      { r: 7, c: 5, letter: 'A' },
      { r: 7, c: 6, letter: 'U' },
      { r: 7, c: 7, letter: 'S' },
      { r: 7, c: 8, letter: 'T' },
      { r: 7, c: 9, letter: 'Ü' },
      { r: 7, c: 10, letter: 'R' }
    ];
    const result = ScrabbleEngine.calculateScore(board, newTiles);
    console.log('Result:', result);
    if (result.valid && result.score === 82 && result.isBingo) {
      console.log('✅ TEST PASSED');
    } else {
      console.log('❌ TEST FAILED');
    }
  }

  console.log('\n--- ALL TESTS COMPLETED ---');
}

runTests();
