export type Tile = string;
export type PlayerHand = Tile[];
export type Wall = Tile[];

export interface PlayerState {
  ai: string;
  hand: PlayerHand;
  discards: Tile[];
  score: number;
}

/** 136 tiles: 1-9W/B/T (×4), 字牌(东南西北中发白=1Z..7Z)(×4) */
export const generateWall = (): Wall => {
  const tiles: Tile[] = [];
  const suits = ['W', 'B', 'T']; // 万/饼/条
  for (const s of suits) {
    for (let n = 1; n <= 9; n++) {
      for (let k = 0; k < 4; k++) tiles.push(`${n}${s}`);
    }
  }
  for (let z = 1; z <= 7; z++) {
    for (let k = 0; k < 4; k++) tiles.push(`${z}Z`); // 东南西北中发白
  }
  return shuffle(tiles);
};

export const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const dealHands = (wall: Wall, players: string[], n = 13): PlayerState[] => {
  return players.map(ai => ({
    ai,
    hand: wall.splice(0, n),
    discards: [],
    score: 1000,
  }));
};

export const drawTile = (wall: Wall): Tile | null => (wall.length ? wall.shift()! : null);

function byRank(a: Tile, b: Tile) {
  const ra = parseInt(a[0], 10), rb = parseInt(b[0], 10);
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return ra - rb;
}

function cloneCounts(hand: Tile[]) {
  const c: Record<string, number> = {};
  for (const t of hand) c[t] = (c[t] || 0) + 1;
  return c;
}

function isSevenPairs(counts: Record<string, number>): boolean {
  return Object.values(counts).filter(v => v === 2).length === 7;
}

function isThirteenOrphans(hand: Tile[]): boolean {
  const req = new Set(['1W','9W','1B','9B','1T','9T','1Z','2Z','3Z','4Z','5Z','6Z','7Z']);
  const uniq = new Set(hand);
  if (![14, 1].includes(hand.length % 3 === 2 ? 14 : 0)) {} // noop, length guard elsewhere
  const hasAll = [...req].every(t => uniq.has(t));
  if (!hasAll) return false;
  // needs one duplicate among the required tiles
  const counts = cloneCounts(hand);
  return Object.entries(counts).some(([k, v]) => req.has(k) && v >= 2);
}

function canFormMeldsFromCounts(counts: Record<string, number>): boolean {
  // Try to greedily remove melds (刻子/顺子). Use recursion on the smallest tile present.
  // Copy to avoid mutating caller
  const c: Record<string, number> = { ...counts };
  const keys = Object.keys(c).filter(k => c[k] > 0).sort(byRank as any);
  if (keys.length === 0) return true;

  const t = keys[0];
  // remove pung (刻子)
  if (c[t] >= 3) {
    c[t] -= 3;
    if (canFormMeldsFromCounts(c)) return true;
    c[t] += 3;
  }

  // remove chow (顺子) only for suited tiles (W/B/T)
  const s = t[1];
  if (s === 'W' || s === 'B' || s === 'T') {
    const n = parseInt(t[0], 10);
    const t2 = `${n+1}${s}`;
    const t3 = `${n+2}${s}`;
    if (c[t2] > 0 && c[t3] > 0) {
      c[t]--; c[t2]--; c[t3]--;
      if (canFormMeldsFromCounts(c)) return true;
      c[t]++; c[t2]++; c[t3]++;
    }
  }

  return false;
}

/** Very simple Chinese-style checker: 4 melds + 1 pair OR 7 pairs OR 13 orphans */
export function checkWin(hand: Tile[]): { win: boolean; fan: string[]; score: number } {
  // Basic guard
  if (hand.length % 3 !== 2) return { win: false, fan: [], score: 0 };

  const counts = cloneCounts(hand);

  // 13 orphans
  if (isThirteenOrphans(hand)) return { win: true, fan: ['十三幺'], score: 16 };

  // 7 pairs
  if (isSevenPairs(counts)) return { win: true, fan: ['七对'], score: 12 };

  // Try each possible pair and test meld completion
  for (const [tile, cnt] of Object.entries(counts)) {
    if (cnt >= 2) {
      const c = { ...counts };
      c[tile] -= 2;
      if (canFormMeldsFromCounts(c)) {
        return { win: true, fan: ['平胡'], score: 8 };
      }
    }
  }
  return { win: false, fan: [], score: 0 };
}