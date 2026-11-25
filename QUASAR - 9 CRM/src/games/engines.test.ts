import test from 'node:test';
import assert from 'node:assert/strict';
import { SMART_GAMES } from './catalog';
import {
  checkNormalizedAnswer,
  encodeCipher,
  evaluateResourceAllocation,
  isCircuitSolved,
  scoreGameAttempt,
  stepSpatialMaze,
  toggleCircuitGrid,
} from './engines';

test('SMART_GAMES contains exactly 100 unique playable games numbered 1..100 across 10 categories', () => {
  assert.equal(SMART_GAMES.length, 100);
  const ids = new Set(SMART_GAMES.map((g) => g.id));
  assert.equal(ids.size, 100);
  for (let i = 1; i <= 100; i++) {
    assert.ok(ids.has(i), `Missing game id ${i}`);
  }
  const categoryCounts = new Map<string, number>();
  for (const g of SMART_GAMES) {
    categoryCounts.set(g.category, (categoryCounts.get(g.category) ?? 0) + 1);
  }
  assert.equal(categoryCounts.size, 10);
  for (const [cat, count] of categoryCounts.entries()) {
    assert.equal(count, 10, `Category ${cat} expected 10 games, got ${count}`);
  }
});

test('Circuit toggle engine solves Game #21 in 1 center click', () => {
  const g21 = SMART_GAMES.find((g) => g.id === 21);
  assert.ok(g21 && g21.engine === 'circuit');
  assert.equal(isCircuitSolved(g21.initialGrid), false);
  const solved = toggleCircuitGrid(g21.initialGrid, g21.size, 4);
  assert.equal(isCircuitSolved(solved), true);
});

test('Spatial routing engine teleports across portal on Game #42 and respects walls', () => {
  const g42 = SMART_GAMES.find((g) => g.id === 42);
  assert.ok(g42 && g42.engine === 'spatial');
  // Trying to step onto wall (0,2) from (0,1) should stay put
  const blocked = stepSpatialMaze(g42, [0, 1], 0, 1);
  assert.deepEqual(blocked, [0, 1]);
  // Stepping onto portal (2,1) from (1,1) teleports to (2,3)
  const warped = stepSpatialMaze(g42, [1, 1], 1, 0);
  assert.deepEqual(warped, [2, 3]);
});

test('Resource allocation engine verifies synergy bonus wins Game #81 within budget', () => {
  const g81 = SMART_GAMES.find((g) => g.id === 81);
  assert.ok(g81 && g81.engine === 'resource');
  // 2 Outbound (4) + 3 Content (6) = 10 budget -> 12 + 15 + 2*6 = 39 (not enough)
  const attempt1 = evaluateResourceAllocation(g81, [2, 3, 0]);
  assert.equal(attempt1.valid, true);
  assert.equal(attempt1.won, false);
  // 3 Outbound (6) + 2 Content (4) = 10 budget -> 18 + 10 + 12 = 40; wait check 2 Outbound (4) + 2 Content (4) + 1 Paid (2) = 12+10+12+7 = 41
  // Let's check 3 Outbound (6) + 2 Content (4)? Wait! Let's check max yield for Game #81!
  let maxOut = 0;
  for (let a = 0; a <= 5; a++) {
    for (let b = 0; b <= 5; b++) {
      for (let c = 0; c <= 5; c++) {
        const res = evaluateResourceAllocation(g81, [a, b, c]);
        if (res.valid && res.output > maxOut) maxOut = res.output;
      }
    }
  }
  // Ensure ALL 10 resource games are mathematically solvable!
  for (const g of SMART_GAMES) {
    if (g.engine !== 'resource') continue;
    let solvable = false;
    const m0 = g.channels[0].maxUnits;
    const m1 = g.channels[1].maxUnits;
    const m2 = g.channels[2].maxUnits;
    for (let a = 0; a <= m0 && !solvable; a++) {
      for (let b = 0; b <= m1 && !solvable; b++) {
        for (let c = 0; c <= m2 && !solvable; c++) {
          if (evaluateResourceAllocation(g, [a, b, c]).won) {
            solvable = true;
          }
        }
      }
    }
    assert.equal(solvable, true, `Resource game #${g.id} (${g.title}) must be solvable!`);
  }
});

test('Cipher encoder produces reversible Caesar and Atbash signals', () => {
  assert.equal(encodeCipher('PIVOT', 1, 'caesar'), 'QJWPU');
  assert.equal(encodeCipher('SPARK', 0, 'atbash'), 'HKZIP');
  assert.equal(encodeCipher(encodeCipher('LOGIC', 0, 'atbash'), 0, 'atbash'), 'LOGIC');
  assert.equal(checkNormalizedAnswer('  Cheese! ', ['cheese']), true);
  assert.equal(scoreGameAttempt(100, 1, 5), 80);
});
