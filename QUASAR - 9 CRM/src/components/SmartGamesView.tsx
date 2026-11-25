import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Eye,
  Gamepad2,
  HelpCircle,
  RotateCcw,
  Search,
  Shuffle,
  Trophy,
} from 'lucide-react';
import { SMART_GAMES } from '../games/catalog';
import {
  checkNormalizedAnswer,
  encodeCipher,
  evaluateResourceAllocation,
  GAME_CATEGORIES,
  isCircuitSolved,
  scoreGameAttempt,
  stepSpatialMaze,
  toggleCircuitGrid,
  type GameCategoryId,
  type SmartGame,
} from '../games/engines';
import type { GameProgressRecord } from '../types/crm';

interface SmartGamesViewProps {
  progressMap: Record<number, GameProgressRecord>;
  onCompleteGame: (game: SmartGame, score: number) => Promise<void>;
}

const STROOP_COLORS = [
  { name: 'RED', hex: '#ef4444' },
  { name: 'BLUE', hex: '#3b82f6' },
  { name: 'GREEN', hex: '#22c55e' },
  { name: 'AMBER', hex: '#f59e0b' },
];

export const SmartGamesView: React.FC<SmartGamesViewProps> = ({
  progressMap,
  onCompleteGame,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<GameCategoryId | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGameId, setActiveGameId] = useState<number | null>(null);

  const activeGame = useMemo(
    () => (activeGameId ? SMART_GAMES.find((g) => g.id === activeGameId) ?? null : null),
    [activeGameId]
  );

  const completedCount = useMemo(
    () => Object.values(progressMap).filter((p) => p.completed).length,
    [progressMap]
  );

  const totalScore = useMemo(
    () => Object.values(progressMap).reduce((sum, p) => sum + (p.bestScore || 0), 0),
    [progressMap]
  );

  const filteredGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return SMART_GAMES.filter((g) => {
      if (selectedCategory !== 'all' && g.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        g.title.toLowerCase().includes(q) ||
        g.prompt.toLowerCase().includes(q) ||
        String(g.id) === q
      );
    });
  }, [selectedCategory, searchQuery]);

  const handleSurpriseMe = () => {
    const unplayed = SMART_GAMES.filter((g) => !progressMap[g.id]?.completed);
    const pool = unplayed.length > 0 ? unplayed : SMART_GAMES;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setActiveGameId(pick.id);
  };

  if (activeGame) {
    return (
      <GamePlayer
        key={activeGame.id}
        game={activeGame}
        record={progressMap[activeGame.id]}
        onBack={() => setActiveGameId(null)}
        onNext={() => setActiveGameId(activeGame.id < 100 ? activeGame.id + 1 : 1)}
        onComplete={(score) => onCompleteGame(activeGame, score)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary & Random trigger */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          100 concise cognitive challenges across 10 disciplines engineered to sharpen creative reframing, systems intuition, and bias resistance.
        </p>

        <div className="flex items-center gap-3">
          <div className="text-right text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
            <div><strong>{completedCount} / 100</strong> solved</div>
            <div>{totalScore} pts total</div>
          </div>
          <button
            type="button"
            onClick={handleSurpriseMe}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold whitespace-nowrap"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
          >
            <Shuffle className="h-3.5 w-3.5" />
            Random Game
          </button>
        </div>
      </div>

      {/* Category Filter Strip (80% transparent liquid glass when active) */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Game categories">
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === 'all'}
            onClick={() => setSelectedCategory('all')}
            className={`rounded-xl px-3.5 py-2 text-xs font-medium whitespace-nowrap transition-all ${
              selectedCategory === 'all' ? 'liquid-glass-active' : 'liquid-surface hover:opacity-90'
            }`}
          >
            All 100
          </button>
          {GAME_CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedCategory(cat.id)}
                className={`rounded-xl px-3 py-2 text-xs font-medium whitespace-nowrap transition-all ${
                  active ? 'liquid-glass-active' : 'liquid-surface hover:opacity-90'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <label htmlFor="games-search" className="sr-only">Search 100 games</label>
          <input
            id="games-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search #1–100 or topic..."
            className="w-full rounded-xl py-2 pr-3 pl-9 text-xs outline-none"
            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
          />
        </div>
      </div>

      {/* 100-Game Grid */}
      <div
        data-testid="smart-games-grid"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {filteredGames.map((game) => {
          const rec = progressMap[game.id];
          const solved = Boolean(rec?.completed);
          const catMeta = GAME_CATEGORIES.find((c) => c.id === game.category);
          return (
            <button
              key={game.id}
              type="button"
              onClick={() => setActiveGameId(game.id)}
              className={`group flex flex-col justify-between rounded-2xl p-4 text-left transition-all ${
                solved ? 'liquid-glass-active' : 'liquid-surface hover:opacity-95'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                  <span>#{String(game.id).padStart(2, '0')} · {catMeta?.label}</span>
                  <span>{game.difficulty}</span>
                </div>
                <div className="mt-2 text-sm font-semibold group-hover:underline">
                  {game.title}
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {game.prompt}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] font-mono-tabular">
                <span style={{ color: 'var(--text-muted)' }}>{catMeta?.skillFocus}</span>
                {solved ? (
                  <span className="inline-flex items-center gap-1 text-emerald-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {rec?.bestScore} pts
                  </span>
                ) : (
                  <span style={{ color: 'var(--accent)' }}>Play →</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// Interactive Multi-Engine Player for All 100 Smart Games
// ============================================================================
interface GamePlayerProps {
  game: SmartGame;
  record?: GameProgressRecord;
  onBack: () => void;
  onNext: () => void;
  onComplete: (score: number) => Promise<void>;
}

const GamePlayer: React.FC<GamePlayerProps> = ({
  game,
  record,
  onBack,
  onNext,
  onComplete,
}) => {
  const [showHint, setShowHint] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [won, setWon] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [earnedScore, setEarnedScore] = useState(0);

  // Engine-specific states
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [circuitGrid, setCircuitGrid] = useState<boolean[]>(
    game.engine === 'circuit' ? [...game.initialGrid] : []
  );
  const [circuitMoves, setCircuitMoves] = useState(0);

  const [textInput, setTextInput] = useState('');

  const [mazePos, setMazePos] = useState<[number, number]>(
    game.engine === 'spatial' ? [game.start[0], game.start[1]] : [0, 0]
  );
  const [mazeMoves, setMazeMoves] = useState(0);

  const [memPhase, setMemPhase] = useState<'ready' | 'showing' | 'input'>('ready');
  const [memLitIndex, setMemLitIndex] = useState<number | null>(null);
  const [memUserSeq, setMemUserSeq] = useState<number[]>([]);

  const [stroopRound, setStroopRound] = useState(0);
  const [stroopMistakes, setStroopMistakes] = useState(0);

  const [allocations, setAllocations] = useState<number[]>(
    game.engine === 'resource' ? game.channels.map(() => 0) : []
  );

  const markVictory = (baseScore: number, penalty = 0) => {
    if (won) return;
    const finalScore = scoreGameAttempt(baseScore, hintsUsed, penalty);
    setEarnedScore(finalScore);
    setWon(true);
    setFeedback('');
    void onComplete(finalScore);
  };

  const revealHint = () => {
    if (!showHint) {
      setShowHint(true);
      setHintsUsed((h) => h + 1);
    }
  };

  // Keyboard support for Spatial Maze games
  useEffect(() => {
    if (game.engine !== 'spatial' || won) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w') {
        e.preventDefault();
        moveMaze(-1, 0);
      } else if (e.key === 'ArrowDown' || e.key === 's') {
        e.preventDefault();
        moveMaze(1, 0);
      } else if (e.key === 'ArrowLeft' || e.key === 'a') {
        e.preventDefault();
        moveMaze(0, -1);
      } else if (e.key === 'ArrowRight' || e.key === 'd') {
        e.preventDefault();
        moveMaze(0, 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, mazePos, mazeMoves, won]);

  const moveMaze = (dr: number, dc: number) => {
    if (game.engine !== 'spatial' || won) return;
    if (mazeMoves >= game.maxMoves) {
      setFeedback('Move budget reached — reset to try a cleaner path.');
      return;
    }
    const next = stepSpatialMaze(game, mazePos, dr, dc);
    if (next[0] === mazePos[0] && next[1] === mazePos[1]) return;
    const nextMoves = mazeMoves + 1;
    setMazePos(next);
    setMazeMoves(nextMoves);
    setFeedback('');
    if (next[0] === game.goal[0] && next[1] === game.goal[1]) {
      markVictory(100, Math.max(0, nextMoves - game.maxMoves + 2) * 3);
    }
  };

  const startMemoryFlash = () => {
    if (game.engine !== 'memory') return;
    setMemPhase('showing');
    setMemUserSeq([]);
    setFeedback('');
    game.sequence.forEach((cellIdx, i) => {
      setTimeout(() => setMemLitIndex(cellIdx), i * game.flashMs);
      setTimeout(() => setMemLitIndex(null), i * game.flashMs + Math.floor(game.flashMs * 0.72));
    });
    setTimeout(() => {
      setMemLitIndex(null);
      setMemPhase('input');
    }, game.sequence.length * game.flashMs + 120);
  };

  const handleMemoryCellClick = (idx: number) => {
    if (game.engine !== 'memory' || memPhase !== 'input' || won) return;
    const next = [...memUserSeq, idx];
    const step = next.length - 1;
    if (game.sequence[step] !== idx) {
      setFeedback('Signal mismatch! Watch the pulse again and retry.');
      setMemUserSeq([]);
      setMemPhase('ready');
      return;
    }
    setMemUserSeq(next);
    if (next.length === game.sequence.length) {
      markVictory(100);
    }
  };

  // Stroop deterministic round generator
  const stroopPair = useMemo(() => {
    if (game.engine !== 'stroop') return null;
    const wordIdx = (game.seedOffset + stroopRound * 3) % STROOP_COLORS.length;
    const inkIdx = (wordIdx + 1 + ((stroopRound + game.seedOffset) % 3)) % STROOP_COLORS.length;
    return { word: STROOP_COLORS[wordIdx], ink: STROOP_COLORS[inkIdx] };
  }, [game, stroopRound]);

  const handleStroopPick = (colorName: string) => {
    if (game.engine !== 'stroop' || !stroopPair || won) return;
    let correct = false;
    if (game.rule === 'match_ink') correct = colorName === stroopPair.ink.name;
    if (game.rule === 'match_word') correct = colorName === stroopPair.word.name;
    if (game.rule === 'avoid_ink') {
      correct = colorName !== stroopPair.ink.name && colorName !== stroopPair.word.name;
    }

    if (!correct) {
      setStroopMistakes((m) => m + 1);
      setFeedback('Cognitive trap! Re-read the active rule carefully and try again.');
      return;
    }

    setFeedback('');
    const nextRound = stroopRound + 1;
    if (nextRound >= game.rounds) {
      markVictory(100, stroopMistakes * 10);
    } else {
      setStroopRound(nextRound);
    }
  };

  const resourceEval =
    game.engine === 'resource' ? evaluateResourceAllocation(game, allocations) : null;

  const ciphertext =
    game.engine === 'cipher' ? encodeCipher(game.plaintext, game.shift, game.mode) : '';

  const catMeta = GAME_CATEGORIES.find((c) => c.id === game.category);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium liquid-surface hover:opacity-90"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to All 100 Games
        </button>

        <div className="flex items-center gap-3 text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
          <span>Game #{String(game.id).padStart(2, '0')} / 100</span>
          <span aria-hidden="true">·</span>
          <span>{catMeta?.label}</span>
          <span aria-hidden="true">·</span>
          <span>{game.difficulty}</span>
          {record?.completed && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-500">Best {record.bestScore} pts</span>
            </>
          )}
        </div>
      </div>

      {/* Main Play Surface */}
      <div className="liquid-surface rounded-2xl p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{game.title}</h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {game.prompt}
          </p>
        </div>

        {/* ENGINE 1: Choice (Lateral Logic, Pattern Matrix, Probability Traps) */}
        {game.engine === 'choice' && (
          <div className="space-y-3">
            {game.options.map((opt, idx) => {
              const isSelected = selectedChoice === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={won}
                  onClick={() => {
                    setSelectedChoice(idx);
                    if (idx === game.correctIndex) {
                      markVictory(100);
                    } else {
                      setFeedback('Not quite — rethink the underlying assumption and try another option.');
                    }
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm transition-all ${
                    isSelected ? 'liquid-glass-active' : 'liquid-surface hover:opacity-95'
                  }`}
                >
                  <span className="font-mono-tabular text-xs font-semibold opacity-70">
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ENGINE 2: Circuit Toggle Grid */}
        {game.engine === 'circuit' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
              <span>Moves: {circuitMoves} (Par: {game.parMoves})</span>
              <button
                type="button"
                onClick={() => {
                  setCircuitGrid([...game.initialGrid]);
                  setCircuitMoves(0);
                  setFeedback('');
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 liquid-surface hover:opacity-90"
              >
                <RotateCcw className="h-3 w-3" />
                Reset Grid
              </button>
            </div>
            <div
              className="mx-auto grid gap-2.5"
              style={{
                gridTemplateColumns: `repeat(${game.size}, minmax(0, 1fr))`,
                maxWidth: `${game.size * 72}px`,
              }}
            >
              {circuitGrid.map((lit, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={won}
                  aria-label={`Circuit node ${idx + 1} ${lit ? 'on' : 'off'}`}
                  onClick={() => {
                    const next = toggleCircuitGrid(circuitGrid, game.size, idx);
                    const nextMoves = circuitMoves + 1;
                    setCircuitGrid(next);
                    setCircuitMoves(nextMoves);
                    if (isCircuitSolved(next)) {
                      markVictory(100, Math.max(0, nextMoves - game.parMoves) * 5);
                    }
                  }}
                  className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl font-mono-tabular text-xs font-bold transition-all disabled:opacity-100 ${
                    lit ? 'liquid-glass-active ring-1 ring-inset' : ''
                  }`}
                  style={
                    lit
                      ? { borderColor: 'var(--accent)', boxShadow: 'inset 0 1px 0 var(--glass-specular), 0 0 18px -4px var(--glass-active-border)' }
                      : { backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }
                  }
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: lit ? 'var(--accent)' : 'var(--border-strong)',
                    }}
                  />
                  <span>{lit ? 'ON' : 'OFF'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ENGINE 3: Word Alchemy Text Answer */}
        {game.engine === 'text' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (checkNormalizedAnswer(textInput, game.acceptedAnswers)) {
                markVictory(100);
              } else {
                setFeedback('That word doesn’t link all three clues — try thinking of a different semantic bridge.');
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-3 gap-3">
              {game.clues.map((clue) => (
                <div
                  key={clue}
                  className="rounded-xl py-4 text-center font-mono-tabular text-sm font-bold tracking-wider"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                >
                  {clue}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                disabled={won}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={game.placeholder}
                className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
              <button
                type="submit"
                disabled={won}
                className="rounded-xl px-5 py-3 text-sm font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                Verify
              </button>
            </div>
          </form>
        )}

        {/* ENGINE 4: Spatial Path & Portal Maze */}
        {game.engine === 'spatial' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
              <span>Moves: {mazeMoves} / {game.maxMoves}</span>
              <button
                type="button"
                onClick={() => {
                  setMazePos([game.start[0], game.start[1]]);
                  setMazeMoves(0);
                  setFeedback('');
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 liquid-surface"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            </div>

            <div
              className="mx-auto grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${game.cols}, minmax(0, 1fr))`,
                maxWidth: `${game.cols * 58}px`,
              }}
            >
              {Array.from({ length: game.rows * game.cols }).map((_, idx) => {
                const r = Math.floor(idx / game.cols);
                const c = idx % game.cols;
                const isPlayer = mazePos[0] === r && mazePos[1] === c;
                const isGoal = game.goal[0] === r && game.goal[1] === c;
                const isWall = game.walls.some(([wr, wc]) => wr === r && wc === c);
                const isPortal = game.portals?.some((p) => p.from[0] === r && p.from[1] === c);

                return (
                  <div
                    key={idx}
                    className={`flex aspect-square items-center justify-center rounded-lg font-mono-tabular text-xs font-bold ${
                      isPlayer ? 'liquid-glass-active' : ''
                    }`}
                    style={
                      isPlayer
                        ? undefined
                        : isWall
                          ? { backgroundColor: 'var(--border-strong)', opacity: 0.85 }
                          : isGoal
                            ? { backgroundColor: 'rgba(34,197,94,0.22)', border: '1px solid rgba(34,197,94,0.55)', color: '#22c55e' }
                            : isPortal
                              ? { backgroundColor: 'rgba(56,152,255,0.22)', border: '1px solid rgba(56,152,255,0.55)', color: '#3898ff' }
                              : { backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }
                    }
                  >
                    {isPlayer ? '●' : isGoal ? 'G' : isPortal ? 'P' : isWall ? '×' : ''}
                  </div>
                );
              })}
            </div>

            {/* On-screen D-Pad */}
            <div className="flex flex-col items-center gap-2 pt-2">
              <button
                type="button"
                aria-label="Move up"
                onClick={() => moveMaze(-1, 0)}
                className="flex h-10 w-10 items-center justify-center rounded-xl liquid-surface hover:opacity-90"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Move left"
                  onClick={() => moveMaze(0, -1)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl liquid-surface hover:opacity-90"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  onClick={() => moveMaze(1, 0)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl liquid-surface hover:opacity-90"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Move right"
                  onClick={() => moveMaze(0, 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl liquid-surface hover:opacity-90"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ENGINE 5: Memory Flash & Signal Recall */}
        {game.engine === 'memory' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                {memPhase === 'ready'
                  ? `Length: ${game.sequence.length} signals`
                  : memPhase === 'showing'
                    ? 'Watch closely...'
                    : `Progress: ${memUserSeq.length} / ${game.sequence.length}`}
              </span>
              <button
                type="button"
                onClick={startMemoryFlash}
                disabled={memPhase === 'showing' || won}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                <Eye className="h-3.5 w-3.5" />
                {memPhase === 'ready' ? 'Play Signal Sequence' : 'Replay Signal'}
              </button>
            </div>
            <div
              className="mx-auto grid gap-2.5"
              style={{
                gridTemplateColumns: `repeat(${game.gridSize}, minmax(0, 1fr))`,
                maxWidth: `${game.gridSize * 74}px`,
              }}
            >
              {Array.from({ length: game.gridSize * game.gridSize }).map((_, idx) => {
                const isLit = memLitIndex === idx;
                const alreadyTapped = memUserSeq.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={memPhase !== 'input' || won}
                    aria-label={`Memory tile ${idx + 1}`}
                    onClick={() => handleMemoryCellClick(idx)}
                    className={`aspect-square rounded-xl font-mono-tabular text-xs font-semibold transition-all ${
                      isLit || alreadyTapped ? 'liquid-glass-active scale-95' : ''
                    }`}
                    style={
                      isLit || alreadyTapped
                        ? undefined
                        : { backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }
                    }
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ENGINE 6: Stroop & Cognitive Shift Sprint */}
        {game.engine === 'stroop' && stroopPair && (
          <div className="space-y-5 text-center">
            <div className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
              Round {Math.min(stroopRound + 1, game.rounds)} of {game.rounds} · Mistakes: {stroopMistakes}
            </div>
            <div
              className="mx-auto max-w-sm rounded-2xl py-10 text-4xl font-extrabold tracking-widest"
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: stroopPair.ink.hex,
              }}
            >
              {stroopPair.word.name}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {STROOP_COLORS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  disabled={won}
                  onClick={() => handleStroopPick(c.name)}
                  className="rounded-xl px-4 py-3 text-sm font-semibold liquid-surface hover:opacity-90"
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ENGINE 7: Resource & Bottleneck Optimizer */}
        {game.engine === 'resource' && resourceEval && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Budget Used</div>
                <div className={`mt-1 text-lg font-bold font-mono-tabular ${resourceEval.valid ? '' : 'text-red-500'}`}>
                  {resourceEval.spent} / {game.budget}
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Current Output</div>
                <div className="mt-1 text-lg font-bold font-mono-tabular" style={{ color: 'var(--accent)' }}>
                  {resourceEval.output}
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Target Output</div>
                <div className="mt-1 text-lg font-bold font-mono-tabular text-emerald-500">
                  ≥ {game.targetOutput}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {game.channels.map((ch, idx) => (
                <div
                  key={ch.name}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-4"
                  style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                >
                  <div>
                    <div className="text-sm font-semibold">{ch.name}</div>
                    <div className="text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
                      Cost {ch.costPerUnit}/unit · Base yield +{ch.baseYield}
                      {ch.synergyBonusWithIndex !== undefined
                        ? ` · Synergy +${ch.synergyBonusAmount} paired with ${game.channels[ch.synergyBonusWithIndex].name}`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={won || (allocations[idx] ?? 0) <= 0}
                      onClick={() => {
                        const next = [...allocations];
                        next[idx] = Math.max(0, (next[idx] ?? 0) - 1);
                        setAllocations(next);
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-lg liquid-surface font-bold disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-6 text-center font-mono-tabular text-sm font-bold">
                      {allocations[idx] ?? 0}
                    </span>
                    <button
                      type="button"
                      disabled={won || (allocations[idx] ?? 0) >= ch.maxUnits}
                      onClick={() => {
                        const next = [...allocations];
                        next[idx] = Math.min(ch.maxUnits, (next[idx] ?? 0) + 1);
                        setAllocations(next);
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-lg liquid-surface font-bold disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={won}
                onClick={() => {
                  if (!resourceEval.valid) {
                    setFeedback('Over budget! Trim units so spend stays within the budget ceiling.');
                  } else if (resourceEval.won) {
                    markVictory(100);
                  } else {
                    setFeedback(`Output is ${resourceEval.output}, below target ${game.targetOutput}. Leverage channel synergy!`);
                  }
                }}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                Lock Allocation
              </button>
            </div>
          </div>
        )}

        {/* ENGINE 8: Cryptic Cipher Signal Decoder */}
        {game.engine === 'cipher' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (checkNormalizedAnswer(textInput, [game.plaintext])) {
                markVictory(100);
              } else {
                setFeedback('Decoded text does not match — verify your shift or mirror mapping.');
              }
            }}
            className="space-y-4"
          >
            <div
              className="rounded-2xl py-6 text-center font-mono-tabular text-3xl font-bold tracking-[0.28em]"
              style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
            >
              {ciphertext}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                disabled={won}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type the decoded plaintext word..."
                className="flex-1 rounded-xl px-4 py-3 text-sm uppercase tracking-widest outline-none"
                style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
              />
              <button
                type="submit"
                disabled={won}
                className="rounded-xl px-5 py-3 text-sm font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                Decode
              </button>
            </div>
          </form>
        )}

        {/* Feedback / Hint / Victory Insight */}
        {feedback && !won && (
          <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-500">
            {feedback}
          </div>
        )}

        {showHint && !won && (
          <div className="rounded-xl px-4 py-3 text-xs" style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
            <strong>Hint:</strong> {game.hint}
          </div>
        )}

        {won ? (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-emerald-500 font-semibold">
                <Trophy className="h-5 w-5" />
                Solved! +{earnedScore} points
              </div>
              <button
                type="button"
                onClick={onNext}
                className="rounded-xl px-4 py-2 text-xs font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' }}
              >
                Next Game (#{game.id < 100 ? game.id + 1 : 1}) →
              </button>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              <strong>Outside-the-Box Takeaway:</strong> {game.insight}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={revealHint}
              className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {showHint ? 'Hint shown' : 'Show Lateral Hint (-15 pts)'}
            </button>
            <span className="inline-flex items-center gap-1 text-xs font-mono-tabular" style={{ color: 'var(--text-muted)' }}>
              <Gamepad2 className="h-3.5 w-3.5" />
              {catMeta?.skillFocus}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
