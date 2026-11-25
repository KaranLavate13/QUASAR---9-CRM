export type GameCategoryId =
  | 'lateral'
  | 'pattern'
  | 'circuit'
  | 'word'
  | 'spatial'
  | 'memory'
  | 'probability'
  | 'stroop'
  | 'resource'
  | 'cipher';

export interface GameCategoryMeta {
  id: GameCategoryId;
  label: string;
  skillFocus: string;
}

export const GAME_CATEGORIES: GameCategoryMeta[] = [
  { id: 'lateral', label: 'Lateral Logic', skillFocus: 'Reframing assumptions' },
  { id: 'pattern', label: 'Pattern Matrix', skillFocus: 'Non-linear induction' },
  { id: 'circuit', label: 'Circuit Toggle', skillFocus: 'Systems thinking' },
  { id: 'word', label: 'Word Alchemy', skillFocus: 'Remote association' },
  { id: 'spatial', label: 'Spatial Routing', skillFocus: 'Constraint navigation' },
  { id: 'memory', label: 'Signal Recall', skillFocus: 'Working memory' },
  { id: 'probability', label: 'Decision Traps', skillFocus: 'Probabilistic clarity' },
  { id: 'stroop', label: 'Cognitive Shift', skillFocus: 'Inhibitory control' },
  { id: 'resource', label: 'Bottleneck Lab', skillFocus: 'Trade-off optimization' },
  { id: 'cipher', label: 'Cipher Signals', skillFocus: 'Symbolic decoding' },
];

export interface BaseGame {
  id: number;
  title: string;
  category: GameCategoryId;
  difficulty: 'Warmup' | 'Tactical' | 'Master';
  prompt: string;
  hint: string;
  insight: string;
}

export interface ChoiceGame extends BaseGame {
  engine: 'choice';
  options: string[];
  correctIndex: number;
}

export interface CircuitGame extends BaseGame {
  engine: 'circuit';
  size: number;
  initialGrid: boolean[];
  parMoves: number;
}

export interface TextAnswerGame extends BaseGame {
  engine: 'text';
  clues: string[];
  acceptedAnswers: string[];
  placeholder: string;
}

export interface SpatialMazeGame extends BaseGame {
  engine: 'spatial';
  rows: number;
  cols: number;
  start: [number, number];
  goal: [number, number];
  walls: Array<[number, number]>;
  portals?: Array<{ from: [number, number]; to: [number, number] }>;
  maxMoves: number;
}

export interface MemoryFlashGame extends BaseGame {
  engine: 'memory';
  gridSize: number;
  sequence: number[];
  flashMs: number;
}

export interface StroopGame extends BaseGame {
  engine: 'stroop';
  rule: 'match_ink' | 'match_word' | 'avoid_ink';
  rounds: number;
  seedOffset: number;
}

export interface ResourceGame extends BaseGame {
  engine: 'resource';
  budget: number;
  targetOutput: number;
  channels: Array<{
    name: string;
    costPerUnit: number;
    baseYield: number;
    synergyBonusWithIndex?: number;
    synergyBonusAmount?: number;
    maxUnits: number;
  }>;
}

export interface CipherGame extends BaseGame {
  engine: 'cipher';
  plaintext: string;
  shift: number;
  mode: 'caesar' | 'atbash';
}

export type SmartGame =
  | ChoiceGame
  | CircuitGame
  | TextAnswerGame
  | SpatialMazeGame
  | MemoryFlashGame
  | StroopGame
  | ResourceGame
  | CipherGame;

/**
 * Pure engine: toggles a cell and its 4 orthogonal neighbors in a Circuit Toggle grid.
 */
export function toggleCircuitGrid(grid: boolean[], size: number, index: number): boolean[] {
  const next = [...grid];
  const row = Math.floor(index / size);
  const col = index % size;
  const coords: Array<[number, number]> = [
    [row, col],
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ];
  for (const [r, c] of coords) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      const idx = r * size + c;
      next[idx] = !next[idx];
    }
  }
  return next;
}

/**
 * Generates a guaranteed solvable initial circuit board by applying deterministic reverse toggles
 * starting from an all-lit (true) target state.
 */
export function generateSolvableCircuit(size: number, solutionClicks: number[]): boolean[] {
  let grid = Array<boolean>(size * size).fill(true);
  for (const idx of solutionClicks) {
    grid = toggleCircuitGrid(grid, size, idx);
  }
  return grid;
}

export function isCircuitSolved(grid: boolean[]): boolean {
  return grid.length > 0 && grid.every(Boolean);
}

/**
 * Pure engine: Spatial maze movement with obstacle & optional portal teleportation.
 */
export function stepSpatialMaze(
  game: SpatialMazeGame,
  pos: [number, number],
  dr: number,
  dc: number
): [number, number] {
  const nr = pos[0] + dr;
  const nc = pos[1] + dc;
  if (nr < 0 || nr >= game.rows || nc < 0 || nc >= game.cols) {
    return pos;
  }
  const hitWall = game.walls.some(([wr, wc]) => wr === nr && wc === nc);
  if (hitWall) {
    return pos;
  }
  if (game.portals) {
    const portal = game.portals.find((p) => p.from[0] === nr && p.from[1] === nc);
    if (portal) {
      return [portal.to[0], portal.to[1]];
    }
  }
  return [nr, nc];
}

/**
 * Pure engine: Resource allocation throughput evaluator with optional cross-channel synergy.
 */
export function evaluateResourceAllocation(
  game: ResourceGame,
  allocations: number[]
): { spent: number; output: number; valid: boolean; won: boolean } {
  let spent = 0;
  let output = 0;
  for (let i = 0; i < game.channels.length; i++) {
    const units = Math.max(0, Math.min(game.channels[i].maxUnits, allocations[i] ?? 0));
    spent += units * game.channels[i].costPerUnit;
    output += units * game.channels[i].baseYield;
    const synIdx = game.channels[i].synergyBonusWithIndex;
    const synAmt = game.channels[i].synergyBonusAmount ?? 0;
    if (synIdx !== undefined && units > 0 && (allocations[synIdx] ?? 0) > 0) {
      output += Math.min(units, allocations[synIdx] ?? 0) * synAmt;
    }
  }
  const valid = spent <= game.budget;
  return { spent, output, valid, won: valid && output >= game.targetOutput };
}

/**
 * Pure engine: Caesar / Atbash encoding for Cipher Signals games.
 */
export function encodeCipher(text: string, shift: number, mode: 'caesar' | 'atbash'): string {
  const upper = text.toUpperCase();
  let out = '';
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      const idx = code - 65;
      const mapped = mode === 'atbash' ? 25 - idx : (idx + ((shift % 26) + 26)) % 26;
      out += String.fromCharCode(65 + mapped);
    } else {
      out += upper[i];
    }
  }
  return out;
}

export function checkNormalizedAnswer(input: string, accepted: string[]): boolean {
  const clean = input.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean) return false;
  return accepted.some((a) => a.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === clean);
}

export function scoreGameAttempt(base: number, hintsUsed: number, extraPenalty = 0): number {
  return Math.max(20, Math.round(base - hintsUsed * 15 - extraPenalty));
}
