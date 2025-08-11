// lib/mahjongEngine.ts

export type Tile = string;
export type PlayerHand = Tile[];
export type Wall = Tile[];

export interface GameRule {
  initialScore: number;
  maxRounds?: number;
  knockout?: boolean;
}

export interface PlayerState {
  ai: string;
  hand: PlayerHand;
  discards: Tile[];
  score: number;
  fan?: string[];
  lastWinScore?: number;
  isEliminated?: boolean;
}

export interface AiPlayResp {
  tile: Tile;
  reason?: string;
}

export const defaultRules: GameRule = {
  initialScore: 1000,
  maxRounds: 16,
  knockout: false
};

export const generateWall = (): Wall => {
  const tiles: Tile[] = [];
  for (const suit of ['W','B','T']) {
    for (let i = 1; i <= 9; i++) for (let j = 0; j < 4; j++) tiles.push(`${i}${suit}`);
  }
  for (let i = 1; i <= 7; i++) for (let j = 0; j < 4; j++) tiles.push(`${i}Z`);
  return shuffle(tiles);
};

export const shuffle = <T,>(arr: T[]): T[] => {
  const array = [...arr];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

export const dealHands = (wall: Wall, players: string[], handSize = 13): PlayerState[] => {
  return players.map(ai => ({
    ai,
    hand: wall.splice(0, handSize),
    discards: [],
    score: defaultRules.initialScore,
    isEliminated: false
  }));
};

export const drawTile = (wall: Wall): Tile | null => (wall.length > 0 ? wall.shift()! : null);

// changed: return {tile, reason}; accept apiKeys
export const discardTile = async (ai: string, hand: Tile[], apiKeys?: Record<string,string>): Promise<AiPlayResp> => {
  const res = await fetch(`/api/aiPlay?ai=${ai}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hand, apiKeys })
  });
  const data = await res.json();
  return { tile: data.tile as Tile, reason: data.reason as string | undefined };
};

export const checkWin = (hand: Tile[]): { win: boolean, fan: string[], score: number } => {
  if (hand.length !== 14) return { win: false, fan: [], score: 0 };
  const counts: Record<string, number> = {};
  for (const tile of hand) counts[tile] = (counts[tile] || 0) + 1;

  if (isThirteenOrphans(hand)) return { win: true, fan: ['国士无双'], score: 88 };
  if (isSevenPairs(counts))  return { win: true, fan: ['七对'],     score: 24 };

  const tiles = Object.keys(counts).sort();
  for (const pairTile of tiles) {
    if (counts[pairTile] < 2) continue;
    const newCounts = { ...counts };
    newCounts[pairTile] -= 2;
    if (canFormMelds(newCounts)) return { win: true, fan: ['平胡'], score: 8 };
  }
  return { win: false, fan: [], score: 0 };
};

export const updateScores = (players: PlayerState[], winnerIdx: number, baseScore: number): PlayerState[] => {
  const losers = players.filter((_, i) => i !== winnerIdx && !players[i].isEliminated);
  const winGain = baseScore * losers.length;
  const lossPerPlayer = baseScore;

  return players.map((p, idx) => {
    if (idx === winnerIdx) return { ...p, score: p.score + winGain, lastWinScore: winGain };
    if (!p.isEliminated) {
      const newScore = p.score - lossPerPlayer;
      return { ...p, score: newScore, isEliminated: newScore <= 0, lastWinScore: -lossPerPlayer };
    }
    return p;
  });
};

function canFormMelds(counts: Record<string, number>): boolean {
  const tiles = Object.keys(counts).filter(t => counts[t] > 0).sort();
  for (const tile of tiles) {
    while (counts[tile] > 0) {
      if (counts[tile] >= 3) { counts[tile] -= 3; continue; }
      const num = parseInt(tile[0]); const suit = tile[1];
      if (suit === 'Z') return false; // honors can't sequence
      const t2 = `${num+1}${suit}`, t3 = `${num+2}${suit}`;
      if ((counts[t2]||0) > 0 && (counts[t3]||0) > 0) { counts[tile]--; counts[t2]--; counts[t3]--; }
      else return false;
    }
  }
  return true;
}

function isSevenPairs(counts: Record<string, number>): boolean {
  return Object.values(counts).filter(v => v === 2).length === 7;
}

function isThirteenOrphans(hand: Tile[]): boolean {
  const required = ['1W','9W','1B','9B','1T','9T','1Z','2Z','3Z','4Z','5Z','6Z','7Z'];
  const unique = new Set(hand);
  return required.every(t => unique.has(t)) && hand.some(t => hand.filter(x => x === t).length === 2);
}

export const checkTing = (hand: Tile[]): Tile[] => {
  const all: Tile[] = [];
  for (const s of ['W','B','T']) for (let i=1;i<=9;i++) all.push(`${i}${s}`);
  for (let i=1;i<=7;i++) all.push(`${i}Z`);
  const ting: Tile[] = [];
  for (const t of all) { const { win } = checkWin([...hand, t]); if (win) ting.push(t); }
  return ting;
};
